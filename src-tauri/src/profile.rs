use lootify_guard_core::profile::{self, Wallet};
use tauri::State;
use tauri::async_runtime::spawn_blocking;

use crate::accounts::{account_and_proxy, settle, store_session};
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
