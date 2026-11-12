use lootify_guard_core::confirmations::{self, PendingConfirmation};
use lootify_guard_core::steam::SteamError;
use serde::Deserialize;
use tauri::State;
use tauri::async_runtime::spawn_blocking;

use crate::accounts::{account_and_proxy, store_session};
use crate::vault::{CommandError, VaultState};

#[derive(Deserialize)]
pub struct ConfirmationRef {
    id: String,
    nonce: String,
}

#[tauri::command]
pub async fn list_confirmations(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<Vec<PendingConfirmation>, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || confirmations::list(&account, proxy.as_ref())).await?;
    let (session, pending) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(pending)
}

#[tauri::command]
pub async fn respond_to_confirmations(
    state: State<'_, VaultState>,
    account_name: String,
    confirmations: Vec<ConfirmationRef>,
    accept: bool,
) -> Result<(), CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let pairs: Vec<_> = confirmations
        .into_iter()
        .map(|confirmation| (confirmation.id, confirmation.nonce))
        .collect();
    let result =
        spawn_blocking(move || confirmations::respond(&account, proxy.as_ref(), &pairs, accept))
            .await?;
    let session = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))
}

/// Drops a session Steam no longer accepts, so the account page offers to sign in.
fn settle<T>(
    state: &VaultState,
    account_name: &str,
    result: Result<T, SteamError>,
) -> Result<T, CommandError> {
    if let Err(SteamError::SessionExpired) = result {
        store_session(state, account_name, None)?;
    }
    Ok(result?)
}
