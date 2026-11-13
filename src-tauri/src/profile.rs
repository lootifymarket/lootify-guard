use lootify_guard_core::contents::{Contents, Profile};
use lootify_guard_core::profile::{self, Wallet};
use lootify_guard_core::profile_settings::{self, ProfileChanges, ProfileSettings};
use tauri::State;
use tauri::async_runtime::spawn_blocking;

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
    Ok(wallet)
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
