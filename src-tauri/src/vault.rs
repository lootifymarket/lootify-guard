use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use lootify_guard_core::contents::{Account, Contents, DamagedContents};
use lootify_guard_core::guard::{self, InvalidSharedSecret};
use lootify_guard_core::mafile;
use lootify_guard_core::vault::{KdfParams, Vault, VaultError};
use serde::Serialize;
use tauri::async_runtime::spawn_blocking;
use tauri::{State, Window};
use tauri_plugin_dialog::DialogExt;
use zeroize::Zeroizing;

use crate::biometrics::{self, BiometricError};

const UNLOCK_REASON: &str = "unlock your vault";
// Real .maFiles are a couple of kilobytes; this only stops a wrong pick from being read whole.
const MAX_MAFILE_LEN: u64 = 64 * 1024;

pub struct VaultState {
    path: PathBuf,
    unlocked: Mutex<Option<Vault>>,
}

impl VaultState {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            unlocked: Mutex::new(None),
        }
    }

    // A panic elsewhere can't leave `Option<Vault>` half-updated, so a poisoned lock is safe to reuse.
    fn unlocked(&self) -> MutexGuard<'_, Option<Vault>> {
        self.unlocked.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VaultStatus {
    Missing,
    Locked,
    Unlocked,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiometricStatus {
    method: Option<biometrics::Method>,
    enrolled: bool,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum CommandError {
    WrongPassword,
    Locked,
    Cancelled,
    BiometricsOutdated,
    Failed(String),
}

impl From<VaultError> for CommandError {
    fn from(err: VaultError) -> Self {
        match err {
            VaultError::WrongPassword => Self::WrongPassword,
            err => Self::Failed(err.to_string()),
        }
    }
}

impl From<BiometricError> for CommandError {
    fn from(err: BiometricError) -> Self {
        match err {
            BiometricError::Cancelled => Self::Cancelled,
            BiometricError::NotEnrolled => Self::BiometricsOutdated,
            err => Self::Failed(err.to_string()),
        }
    }
}

impl From<tauri::Error> for CommandError {
    fn from(err: tauri::Error) -> Self {
        Self::Failed(err.to_string())
    }
}

impl From<DamagedContents> for CommandError {
    fn from(err: DamagedContents) -> Self {
        Self::Failed(err.to_string())
    }
}

impl From<InvalidSharedSecret> for CommandError {
    fn from(err: InvalidSharedSecret) -> Self {
        Self::Failed(err.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountList {
    codes_expire_at: u64,
    accounts: Vec<AccountSummary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    // A SteamID64 doesn't fit in a JavaScript number without losing digits.
    steam_id: String,
    account_name: String,
    code: String,
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
pub fn vault_status(state: State<'_, VaultState>) -> VaultStatus {
    if state.unlocked().is_some() {
        VaultStatus::Unlocked
    } else if state.path.exists() {
        VaultStatus::Locked
    } else {
        VaultStatus::Missing
    }
}

#[tauri::command]
pub fn biometric_status() -> BiometricStatus {
    let method = biometrics::method();
    BiometricStatus {
        method,
        enrolled: method.is_some() && biometrics::is_enrolled(),
    }
}

// Argon2 and the biometric prompt run on a blocking thread so the window stays responsive.
#[tauri::command]
pub async fn create_vault(
    state: State<'_, VaultState>,
    password: String,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    // A key left over from a vault that was deleted by hand would never open this one.
    biometrics::forget()?;
    let path = state.path.clone();
    let vault =
        spawn_blocking(move || Vault::create(&path, &password, KdfParams::DEFAULT)).await??;
    *state.unlocked() = Some(vault);
    Ok(())
}

#[tauri::command]
pub async fn unlock_vault(
    state: State<'_, VaultState>,
    password: String,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    let path = state.path.clone();
    let vault = spawn_blocking(move || Vault::open(&path, &password)).await??;
    *state.unlocked() = Some(vault);
    Ok(())
}

#[tauri::command]
pub async fn unlock_with_biometrics(state: State<'_, VaultState>) -> Result<(), CommandError> {
    let path = state.path.clone();
    let vault = spawn_blocking(move || {
        let key = biometrics::release_key(UNLOCK_REASON)?;
        Vault::open_with_key(&path, &key).map_err(|err| match err {
            VaultError::WrongPassword => {
                // The stored key belongs to an older password. Drop it so the
                // biometric button stops offering an unlock that can't work.
                biometrics::forget()
                    .map_or_else(CommandError::from, |()| CommandError::BiometricsOutdated)
            }
            err => err.into(),
        })
    })
    .await??;
    *state.unlocked() = Some(vault);
    Ok(())
}

#[tauri::command]
pub async fn enable_biometrics(state: State<'_, VaultState>) -> Result<(), CommandError> {
    let key = state
        .unlocked()
        .as_ref()
        .map(|vault| Zeroizing::new(*vault.key()))
        .ok_or(CommandError::Locked)?;
    spawn_blocking(move || biometrics::enroll(&key)).await??;
    Ok(())
}

#[tauri::command]
pub async fn change_password(
    state: State<'_, VaultState>,
    password: String,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    let mut vault = state.unlocked().take().ok_or(CommandError::Locked)?;
    let (vault, changed) = spawn_blocking(move || {
        let changed = vault.change_password(&password);
        (vault, changed)
    })
    .await?;
    let key = Zeroizing::new(*vault.key());
    *state.unlocked() = Some(vault);
    changed?;
    if biometrics::is_enrolled() {
        spawn_blocking(move || biometrics::enroll(&key)).await??;
    }
    Ok(())
}

#[tauri::command]
pub fn lock_vault(state: State<'_, VaultState>) {
    *state.unlocked() = None;
}

#[tauri::command]
pub fn erase_vault(state: State<'_, VaultState>) -> Result<(), CommandError> {
    *state.unlocked() = None;
    biometrics::forget()?;
    match fs::remove_file(&state.path) {
        Err(err) if err.kind() != io::ErrorKind::NotFound => {
            Err(CommandError::Failed(err.to_string()))
        }
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn list_accounts(state: State<'_, VaultState>) -> Result<AccountList, CommandError> {
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
                steam_id: account.steam_id.to_string(),
                account_name: account.account_name.clone(),
                code: guard::code(&account.authenticator.shared_secret, now)?,
            })
        })
        .collect::<Result<_, CommandError>>()?;
    Ok(AccountList {
        codes_expire_at: guard::code_expires_at(now),
        accounts,
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
        .add_filter("Steam Guard files", &["maFile"]);
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

fn read_mafile(path: &Path) -> Result<Account, String> {
    if fs::metadata(path).map_err(|err| err.to_string())?.len() > MAX_MAFILE_LEN {
        return Err("the file is too large to be a .maFile".to_owned());
    }
    let file = Zeroizing::new(fs::read(path).map_err(|err| err.to_string())?);
    mafile::parse(&file).map_err(|err| err.to_string())
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned()
}
