use lootify_guard_core::api_key;
use lootify_guard_core::contents::Contents;
use lootify_guard_core::sessions::{self, Device};
use lootify_guard_core::standing::{self, Standing};
use serde::Serialize;
use tauri::State;
use tauri::async_runtime::spawn_blocking;

use crate::accounts::{account_and_proxy, no_such_account, settle, store_session};
use crate::vault::{CommandError, VaultState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyView {
    domain: String,
    /// The user said this very key is theirs.
    trusted: bool,
}

/// The account's Web API key, or `None` when it has none.
#[tauri::command]
pub async fn check_api_key(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<Option<ApiKeyView>, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let trusted = account.trusted_api_key.clone();
    let result = spawn_blocking(move || api_key::check(&account, proxy.as_ref())).await?;
    let (session, key) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(key.map(|key| ApiKeyView {
        trusted: trusted.as_deref() == Some(key.fingerprint.as_str()),
        domain: key.domain,
    }))
}

/// Remembers the key now on the account as the user's own. It is looked up again
/// rather than taken from the page, so a key swapped in meanwhile isn't trusted.
#[tauri::command]
pub async fn trust_api_key(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<(), CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || api_key::check(&account, proxy.as_ref())).await?;
    let (session, key) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    let key = key.ok_or_else(|| {
        CommandError::Failed("the account no longer has a Web API key".to_owned())
    })?;
    save_trusted(&state, &account_name, Some(key.fingerprint))
}

#[tauri::command]
pub async fn revoke_api_key(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<(), CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || api_key::revoke(&account, proxy.as_ref())).await?;
    let session = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    save_trusted(&state, &account_name, None)
}

/// The devices signed in to the account, this app first.
#[tauri::command]
pub async fn list_devices(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<Vec<Device>, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || sessions::list(&account, proxy.as_ref())).await?;
    let (session, devices) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(devices)
}

/// Signs every device but this app out of the account. Returns how many there were.
#[tauri::command]
pub async fn sign_out_other_devices(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<usize, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result =
        spawn_blocking(move || sessions::sign_out_others(&account, proxy.as_ref())).await?;
    let (session, count) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(count)
}

/// Bans, limits and market access, each `None` when Steam didn't say.
#[tauri::command]
pub async fn check_standing(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<Standing, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || standing::check(&account, proxy.as_ref())).await?;
    let (session, standing) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(standing)
}

fn save_trusted(
    state: &VaultState,
    account_name: &str,
    fingerprint: Option<String>,
) -> Result<(), CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    contents
        .account_mut(account_name)
        .ok_or_else(no_such_account)?
        .trusted_api_key = fingerprint;
    vault.save_data(contents.to_bytes())?;
    Ok(())
}
