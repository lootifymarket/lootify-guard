use std::time::{SystemTime, UNIX_EPOCH};

use lootify_guard_core::contents::{Account, Contents, Profile, StoredWallet};
use lootify_guard_core::profile::{self, Wallet};
use lootify_guard_core::profile_settings::{self, MAX_AVATAR_LEN, ProfileChanges, ProfileSettings};
use lootify_guard_core::steam;
use tauri::async_runtime::spawn_blocking;
use tauri::{State, Window};
use tauri_plugin_dialog::DialogExt;

use crate::accounts::{account_and_proxy, no_such_account, settle, store_session};
use crate::vault::{CommandError, VaultState};

#[tauri::command]
pub async fn trade_url(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<String, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || profile::trade_url(&account, proxy.as_ref())).await?;
    let (session, url) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(url)
}

/// Replaces the trade URL with a new one; the old one stops working.
#[tauri::command]
pub async fn new_trade_url(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<String, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || profile::new_trade_url(&account, proxy.as_ref())).await?;
    let (session, url) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(url)
}

/// `None` when the account has no Steam wallet yet.
#[tauri::command]
pub async fn wallet_balance(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<Option<Wallet>, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || profile::wallet(&account, proxy.as_ref())).await?;
    let (session, wallet) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    keep_wallet(&state, &account_name, wallet.as_ref())?;
    Ok(wallet)
}

/// Keeps the balance with the account, so the account list shows it without asking Steam.
fn keep_wallet(
    state: &VaultState,
    account_name: &str,
    wallet: Option<&Wallet>,
) -> Result<(), CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let account = contents
        .account_mut(account_name)
        .ok_or_else(no_such_account)?;
    account.wallet = wallet.map(|wallet| StoredWallet {
        currency: wallet.currency.map(str::to_owned),
        balance: wallet.balance,
        pending: wallet.pending,
        at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |since| since.as_secs()),
    });
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

#[tauri::command]
pub async fn profile_settings(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<ProfileSettings, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result =
        spawn_blocking(move || profile_settings::settings(&account, proxy.as_ref())).await?;
    let (session, settings) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(settings)
}

/// Saves the profile in Steam. A new nickname is kept in the vault too, so the
/// account list shows it without asking Steam again.
#[tauri::command]
pub async fn save_profile(
    state: State<'_, VaultState>,
    account_name: String,
    changes: ProfileChanges,
) -> Result<(), CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let persona_name = changes.persona_name.clone();
    let result =
        spawn_blocking(move || profile_settings::save(&account, proxy.as_ref(), &changes)).await?;
    let session = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;

    let Some(persona_name) = persona_name else {
        return Ok(());
    };
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let account = contents
        .account_mut(&account_name)
        .ok_or_else(no_such_account)?;
    match &mut account.profile {
        Some(profile) => profile.persona_name = persona_name,
        None => {
            account.profile = Some(Profile {
                persona_name,
                avatar: None,
            })
        }
    }
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

#[tauri::command]
pub async fn clear_name_history(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<(), CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result =
        spawn_blocking(move || profile_settings::clear_name_history(&account, proxy.as_ref()))
            .await?;
    let session = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))
}

/// Lets the user pick an image and makes it the account's avatar, then reads the
/// profile again so the vault has the new picture. The picker runs here so the
/// file's path never reaches the webview. Returns false when nothing was picked.
#[tauri::command]
pub async fn change_avatar(
    window: Window,
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<bool, CommandError> {
    let picker = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Images", &["jpg", "jpeg", "png", "gif"]);
    let Some(picked) = spawn_blocking(move || picker.blocking_pick_file()).await? else {
        return Ok(false);
    };
    let path = picked
        .into_path()
        .map_err(|err| CommandError::Failed(err.to_string()))?;
    let image = spawn_blocking(move || {
        if std::fs::metadata(&path)?.len() > MAX_AVATAR_LEN as u64 {
            return Ok(None);
        }
        std::fs::read(&path).map(Some)
    })
    .await?
    .map_err(|err| CommandError::Failed(err.to_string()))?
    .ok_or_else(|| CommandError::Failed("the image is over 1 MB".to_owned()))?;

    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || {
        let session = profile_settings::upload_avatar(&account, proxy.as_ref(), &image)?;
        // The fresh session is used, as the upload may have renewed it.
        let account = Account {
            session: Some(session),
            ..account
        };
        steam::fetch_profile(&account, proxy.as_ref())
    })
    .await?;
    let (session, profile) = settle(&state, &account_name, result)?;

    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let account = contents
        .account_mut(&account_name)
        .ok_or_else(no_such_account)?;
    account.session = Some(session);
    account.profile = Some(profile);
    vault.save_data(contents.to_bytes())?;
    Ok(true)
}
