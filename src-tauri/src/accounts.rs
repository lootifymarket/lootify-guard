use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use lootify_guard_core::contents::{
    Account, AutoConfirm, Contents, LastCheck, Session, StoredWallet,
};
use lootify_guard_core::guard;
use lootify_guard_core::mafile;
use lootify_guard_core::proxy::ProxyAddress;
use lootify_guard_core::steam::{self, SteamError};
use serde::Serialize;
use tauri::async_runtime::spawn_blocking;
use tauri::{State, Window};
use tauri_plugin_dialog::DialogExt;
use zeroize::Zeroizing;

use crate::biometrics;
use crate::browser::Browsers;
use crate::groups::{self, GroupView};
use crate::playing::Players;
use crate::vault::{CommandError, VaultState};

// Real .maFiles are a couple of kilobytes; this only stops a wrong pick from being read whole.
const MAX_MAFILE_LEN: u64 = 64 * 1024;
const MAFILE_FILTER: (&str, &[&str]) = ("Steam Guard files", &["maFile"]);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountList {
    codes_expire_at: u64,
    accounts: Vec<AccountSummary>,
    groups: Vec<GroupView>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    // A SteamID64 doesn't fit in a JavaScript number without losing digits.
    steam_id: Option<String>,
    account_name: String,
    code: String,
    device_id: Option<String>,
    has_revocation_code: bool,
    signed_in: bool,
    persona_name: Option<String>,
    /// A data URL, so the page can show it without fetching anything itself.
    avatar: Option<String>,
    proxy_id: Option<u32>,
    group_id: Option<u32>,
    auto_confirm: AutoConfirm,
    /// Whether the account has a game connection up or coming up.
    playing: bool,
    note: Option<String>,
    /// As Steam last showed it.
    wallet: Option<StoredWallet>,
    last_check: Option<LastCheck>,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    added: Vec<String>,
    already_added: Vec<String>,
    failed: Vec<FailedFile>,
}

#[derive(Serialize)]
pub struct FailedFile {
    file: String,
    reason: String,
}

#[tauri::command]
pub fn list_accounts(
    state: State<'_, VaultState>,
    players: State<'_, Players>,
) -> Result<AccountList, CommandError> {
    let unlocked = state.unlocked();
    let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
    let contents = Contents::from_bytes(vault.data())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| CommandError::Failed("the system clock is set before 1970".to_owned()))?
        .as_secs();
    let accounts = contents
        .accounts
        .iter()
        .map(|account| {
            Ok(AccountSummary {
                steam_id: account.steam_id.map(|id| id.to_string()),
                account_name: account.account_name.clone(),
                code: guard::code(&account.authenticator.shared_secret, now)?,
                device_id: account.authenticator.device_id.clone(),
                has_revocation_code: account.authenticator.revocation_code.is_some(),
                signed_in: account.session.is_some(),
                persona_name: account
                    .profile
                    .as_ref()
                    .map(|profile| profile.persona_name.clone()),
                avatar: account
                    .profile
                    .as_ref()
                    .and_then(|profile| profile.avatar.as_ref())
                    .map(|avatar| format!("data:image/jpeg;base64,{avatar}")),
                proxy_id: account.proxy,
                group_id: account.group,
                auto_confirm: account.auto_confirm,
                playing: players.is_playing(&account.account_name),
                note: account.note.clone(),
                wallet: account.wallet.clone(),
                last_check: account.last_check.clone(),
            })
        })
        .collect::<Result<_, CommandError>>()?;
    Ok(AccountList {
        codes_expire_at: guard::code_expires_at(now),
        accounts,
        groups: groups::views(&contents),
    })
}

/// Lets the user pick `.maFile`s and adds their accounts. The picker runs here rather
/// than in the UI so that file paths and secrets never pass through the webview.
/// Returns `None` when the picker is closed without choosing anything.
#[tauri::command]
pub async fn import_mafiles(
    window: Window,
    state: State<'_, VaultState>,
) -> Result<Option<ImportReport>, CommandError> {
    if state.unlocked().is_none() {
        return Err(CommandError::Locked);
    }
    let picker = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter(MAFILE_FILTER.0, MAFILE_FILTER.1);
    let Some(picked) = spawn_blocking(move || picker.blocking_pick_files()).await? else {
        return Ok(None);
    };
    let files = spawn_blocking(move || {
        picked
            .into_iter()
            .map(|file| {
                let name = file.as_path().map_or_else(|| file.to_string(), file_name);
                let account = file
                    .into_path()
                    .map_err(|err| err.to_string())
                    .and_then(|path| read_mafile(&path));
                (name, account)
            })
            .collect::<Vec<_>>()
    })
    .await?;

    // The vault may have been locked while the picker was open.
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let mut report = ImportReport::default();
    for (file, account) in files {
        match account {
            Ok(account) => {
                let name = account.account_name.clone();
                if contents.add_account(account) {
                    report.added.push(name);
                } else {
                    report.already_added.push(name);
                }
            }
            Err(reason) => report.failed.push(FailedFile { file, reason }),
        }
    }
    if !report.added.is_empty() {
        vault.save_data(contents.to_bytes())?;
    }
    Ok(Some(report))
}

#[tauri::command]
pub async fn reveal_revocation_code(
    state: State<'_, VaultState>,
    account_name: String,
    password: Option<String>,
) -> Result<String, CommandError> {
    confirm_owner(&state, password, "show a revocation code").await?;
    let unlocked = state.unlocked();
    let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
    let contents = Contents::from_bytes(vault.data())?;
    let code = find(&contents, &account_name)?
        .authenticator
        .revocation_code
        .as_ref()
        .ok_or_else(|| CommandError::Failed("this account has no revocation code".to_owned()))?;
    Ok(code.expose().to_owned())
}

/// Saves the account as a `.maFile` where the user picks. Returns the file name, or
/// `None` when the picker is closed without saving.
#[tauri::command]
pub async fn export_mafile(
    window: Window,
    state: State<'_, VaultState>,
    account_name: String,
    password: Option<String>,
) -> Result<Option<String>, CommandError> {
    confirm_owner(&state, password, "export a .maFile").await?;
    let suggested_name = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        let contents = Contents::from_bytes(vault.data())?;
        mafile::file_name(find(&contents, &account_name)?)
    };
    let picker = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(suggested_name)
        .add_filter(MAFILE_FILTER.0, MAFILE_FILTER.1);
    let Some(target) = spawn_blocking(move || picker.blocking_save_file()).await? else {
        return Ok(None);
    };
    let path = target
        .into_path()
        .map_err(|err| CommandError::Failed(err.to_string()))?;

    let file = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        let contents = Contents::from_bytes(vault.data())?;
        mafile::export(find(&contents, &account_name)?)
    };
    let name = file_name(&path);
    spawn_blocking(move || write_private(&path, &file))
        .await?
        .map_err(|err| CommandError::Failed(err.to_string()))?;
    Ok(Some(name))
}

/// Saves the account as a folder where the user picks: its `.maFile`, and
/// `account_details.json` with the login, password and revocation code. Returns
/// the folder's name, or `None` when the picker is closed without saving.
#[tauri::command]
pub async fn export_account(
    window: Window,
    state: State<'_, VaultState>,
    account_name: String,
    password: Option<String>,
) -> Result<Option<String>, CommandError> {
    confirm_owner(&state, password, "export an account with its details").await?;
    {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        find(&Contents::from_bytes(vault.data())?, &account_name)?;
    }
    let picker = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(&account_name);
    let Some(target) = spawn_blocking(move || picker.blocking_save_file()).await? else {
        return Ok(None);
    };
    let folder = target
        .into_path()
        .map_err(|err| CommandError::Failed(err.to_string()))?;

    let (mafile_name, mafile, details) = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        let contents = Contents::from_bytes(vault.data())?;
        let account = find(&contents, &account_name)?;
        (
            mafile::file_name(account),
            mafile::export(account),
            mafile::export_details(account),
        )
    };
    let name = file_name(&folder);
    spawn_blocking(move || {
        create_private_dir(&folder)?;
        write_private(&folder.join(mafile_name), &mafile)?;
        write_private(&folder.join("account_details.json"), &details)
    })
    .await?
    .map_err(|err| CommandError::Failed(err.to_string()))?;
    Ok(Some(name))
}

#[tauri::command]
pub fn remove_account(
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
    account_name: String,
) -> Result<(), CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    if !contents.remove_account(&account_name) {
        return Err(no_such_account());
    }
    vault.save_data(contents.to_bytes())?;
    browsers.close(&account_name);
    Ok(())
}

/// Signs in to Steam as the account. The password is kept in the vault only when
/// `remember_password` is set; otherwise any saved one is dropped.
#[tauri::command]
pub async fn sign_in(
    state: State<'_, VaultState>,
    account_name: String,
    password: String,
    remember_password: bool,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let signed_in = spawn_blocking({
        let password = password.clone();
        move || steam::sign_in(&account, proxy.as_ref(), &password)
    })
    .await??;

    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let account = contents
        .account_mut(&account_name)
        .ok_or_else(no_such_account)?;
    account.steam_id = Some(signed_in.steam_id);
    account.session = Some(signed_in.session);
    account.password = remember_password.then(|| password.to_string().into());
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

/// Checks the account's Steam session and updates its nickname and avatar. A session
/// Steam no longer accepts is dropped, so the page offers to sign in again.
#[tauri::command]
pub async fn refresh_profile(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<(), CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let fetched = spawn_blocking(move || steam::fetch_profile(&account, proxy.as_ref())).await?;

    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let account = contents
        .account_mut(&account_name)
        .ok_or_else(no_such_account)?;
    let result = match fetched {
        Ok((session, profile)) => {
            account.session = Some(session);
            account.profile = Some(profile);
            Ok(())
        }
        Err(SteamError::SessionExpired) => {
            account.session = None;
            Err(SteamError::SessionExpired.into())
        }
        Err(err) => return Err(err.into()),
    };
    vault.save_data(contents.to_bytes())?;
    result
}

/// Asks for the master password again, or for biometrics when there is no password,
/// before secrets leave the vault. An unlocked vault alone isn't enough: anyone can
/// walk up to an unattended computer.
pub(crate) async fn confirm_owner(
    state: &VaultState,
    password: Option<String>,
    reason: &'static str,
) -> Result<(), CommandError> {
    match password {
        Some(password) => {
            let password = Zeroizing::new(password);
            let check = state
                .unlocked()
                .as_ref()
                .ok_or(CommandError::Locked)?
                .password_check();
            if !spawn_blocking(move || check.matches(&password)).await?? {
                return Err(CommandError::WrongPassword);
            }
        }
        None => {
            let key = state
                .unlocked()
                .as_ref()
                .map(|vault| Zeroizing::new(*vault.key()))
                .ok_or(CommandError::Locked)?;
            let released = spawn_blocking(move || biometrics::release_key(reason)).await??;
            if *released != *key {
                biometrics::forget()?;
                return Err(CommandError::BiometricsOutdated);
            }
        }
    }
    Ok(())
}

/// A copy of the account and its proxy, to take off to a blocking thread.
pub(crate) fn account_and_proxy(
    state: &VaultState,
    account_name: &str,
) -> Result<(Account, Option<ProxyAddress>), CommandError> {
    let unlocked = state.unlocked();
    let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
    let contents = Contents::from_bytes(vault.data())?;
    let account = find(&contents, account_name)?;
    let proxy = contents
        .proxy_of(account)?
        .map(|proxy| proxy.address.clone());
    Ok((account.clone(), proxy))
}

/// Notes are for the list, so they're kept short.
const MAX_NOTE: usize = 120;

/// An empty note removes it.
#[tauri::command]
pub fn set_account_note(
    state: State<'_, VaultState>,
    account_name: String,
    note: String,
) -> Result<(), CommandError> {
    let note = note.trim();
    if note.chars().count() > MAX_NOTE {
        return Err(CommandError::Failed(format!(
            "keep the note under {MAX_NOTE} characters"
        )));
    }
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    contents
        .account_mut(&account_name)
        .ok_or_else(no_such_account)?
        .note = (!note.is_empty()).then(|| note.to_owned());
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

#[tauri::command]
pub fn set_account_proxy(
    state: State<'_, VaultState>,
    account_name: String,
    proxy_id: Option<u32>,
) -> Result<(), CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    if let Some(id) = proxy_id
        && contents.proxy(id).is_none()
    {
        return Err(CommandError::Failed(
            "the proxy is no longer in the vault".to_owned(),
        ));
    }
    contents
        .account_mut(&account_name)
        .ok_or_else(no_such_account)?
        .proxy = proxy_id;
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

pub(crate) fn find<'a>(
    contents: &'a Contents,
    account_name: &str,
) -> Result<&'a Account, CommandError> {
    contents.account(account_name).ok_or_else(no_such_account)
}

/// Saves what a Steam call did to the session: a renewed access token, or `None`
/// when Steam no longer accepts it. Writes only when something changed.
pub(crate) fn store_session(
    state: &VaultState,
    account_name: &str,
    session: Option<Session>,
) -> Result<(), CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let account = contents
        .account_mut(account_name)
        .ok_or_else(no_such_account)?;
    let token = |session: &Option<Session>| {
        session
            .as_ref()
            .map(|session| session.access_token.expose().to_owned())
    };
    if token(&account.session) != token(&session) {
        account.session = session;
        vault.save_data(contents.to_bytes())?;
    }
    Ok(())
}

/// Drops a session Steam no longer accepts, so the account page offers to sign in.
pub(crate) fn settle<T>(
    state: &VaultState,
    account_name: &str,
    result: Result<T, SteamError>,
) -> Result<T, CommandError> {
    if let Err(SteamError::SessionExpired) = result {
        store_session(state, account_name, None)?;
    }
    Ok(result?)
}

pub(crate) fn no_such_account() -> CommandError {
    CommandError::Failed("the account is no longer in the vault".to_owned())
}

// The file holds every secret of the account, so only the user may read it.
/// A folder only the user can open, for files with secrets in them.
fn create_private_dir(path: &Path) -> io::Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(path)
}

pub(crate) fn write_private(path: &Path, contents: &[u8]) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut file = options.open(path)?;
    file.write_all(contents)?;
    file.sync_all()
}

fn read_mafile(path: &Path) -> Result<Account, String> {
    if fs::metadata(path).map_err(|err| err.to_string())?.len() > MAX_MAFILE_LEN {
        return Err("the file is too large to be a .maFile".to_owned());
    }
    let file = Zeroizing::new(fs::read(path).map_err(|err| err.to_string())?);
    mafile::parse(&file).map_err(|err| err.to_string())
}

pub(crate) fn file_name(path: &Path) -> String {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned()
}
