use lootify_guard_core::sign_ins::{self, SignInRequest};
use tauri::State;
use tauri::async_runtime::spawn_blocking;
use zeroize::Zeroizing;

use crate::accounts::{account_and_proxy, settle, store_session};
use crate::vault::{CommandError, VaultState};

#[tauri::command]
pub async fn list_sign_in_requests(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<Vec<SignInRequest>, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || sign_ins::list(&account, proxy.as_ref())).await?;
    let (session, requests) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(requests)
}

/// `client_id` is a u64 sent as text, since JavaScript numbers can't hold it exactly.
#[tauri::command]
pub async fn answer_sign_in(
    state: State<'_, VaultState>,
    account_name: String,
    client_id: String,
    version: u16,
    allow: bool,
) -> Result<(), CommandError> {
    let client_id = client_id
        .parse()
        .map_err(|_| CommandError::Failed("unknown sign-in request".to_owned()))?;
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || {
        sign_ins::answer(&account, proxy.as_ref(), client_id, version, allow)
    })
    .await?;
    let session = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))
}

#[tauri::command]
pub async fn allow_qr_sign_in(
    state: State<'_, VaultState>,
    account_name: String,
    link: String,
) -> Result<(), CommandError> {
    let link = Zeroizing::new(link);
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result =
        spawn_blocking(move || sign_ins::allow_qr(&account, proxy.as_ref(), &link)).await?;
    let session = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))
}
