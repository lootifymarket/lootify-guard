use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use lootify_guard_core::contents::{Account, Contents};
use lootify_guard_core::partner::{self, Known, PartnerCheck};
use lootify_guard_core::proxy::ProxyAddress;
use lootify_guard_core::steam::SteamError;
use lootify_guard_core::trades::{self, Accepted, TradeOffer};
use serde::Serialize;
use tauri::State;
use tauri::async_runtime::spawn_blocking;

use crate::accounts::{account_and_proxy, settle, store_session};
use crate::vault::{CommandError, VaultState};

// Enough to list many accounts quickly without looking like a flood to Steam.
const AT_ONCE: usize = 8;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferView {
    account_name: String,
    #[serde(flatten)]
    offer: TradeOffer,
    /// The other side is an account in this vault, by its login.
    partner_account: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    account_name: String,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradesView {
    /// Newest first, across every account.
    offers: Vec<OfferView>,
    failures: Vec<Failure>,
    /// Accounts that aren't signed in to Steam, so they have no list.
    signed_out: Vec<String>,
}

/// Trade offers of every signed-in account, asked of Steam a few accounts at a time,
/// each through its own proxy.
#[tauri::command]
pub async fn list_trade_offers(state: State<'_, VaultState>) -> Result<TradesView, CommandError> {
    let (jobs, own, signed_out, mut failures) = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        let contents = Contents::from_bytes(vault.data())?;
        let own: Vec<(u64, String)> = contents
            .accounts
            .iter()
            .filter_map(|account| Some((account.steam_id?, account.account_name.clone())))
            .collect();
        let mut jobs: Vec<(Account, Option<ProxyAddress>)> = Vec::new();
        let mut signed_out = Vec::new();
        let mut failures = Vec::new();
        for account in &contents.accounts {
            if account.session.is_none() || account.steam_id.is_none() {
                signed_out.push(account.account_name.clone());
                continue;
            }
            match contents.proxy_of(account) {
                Ok(proxy) => jobs.push((account.clone(), proxy.map(|proxy| proxy.address.clone()))),
                Err(err) => failures.push(Failure {
                    account_name: account.account_name.clone(),
                    reason: err.to_string(),
                }),
            }
        }
        (jobs, own, signed_out, failures)
    };

    let now = unix_now()?;
    let results = spawn_blocking(move || {
        let mut results = Vec::new();
        for batch in jobs.chunks(AT_ONCE) {
            thread::scope(|scope| {
                let running: Vec<_> = batch
                    .iter()
                    .map(|(account, proxy)| {
                        scope.spawn(move || {
                            (
                                account.account_name.clone(),
                                trades::list(account, proxy.as_ref(), now),
                            )
                        })
                    })
                    .collect();
                for handle in running {
                    results.push(handle.join().expect("listing trade offers never panics"));
                }
            });
        }
        results
    })
    .await?;

    let mut offers = Vec::new();
    for (account_name, result) in results {
        match result {
            Ok((session, listed)) => {
                store_session(&state, &account_name, Some(session))?;
                offers.extend(listed.into_iter().map(|offer| {
                    OfferView {
                        partner_account: own
                            .iter()
                            .find(|(id, _)| id.to_string() == offer.partner_id)
                            .map(|(_, name)| name.clone()),
                        account_name: account_name.clone(),
                        offer,
                    }
                }));
            }
            Err(err) => {
                if let SteamError::SessionExpired = err {
                    store_session(&state, &account_name, None)?;
                }
                failures.push(Failure {
                    account_name,
                    reason: err.to_string(),
                });
            }
        }
    }
    offers.sort_by_key(|view| std::cmp::Reverse(view.offer.created_at));
    Ok(TradesView {
        offers,
        failures,
        signed_out,
    })
}

/// Accepts an offer someone sent, confirming it in Guard when Steam asks.
#[tauri::command]
pub async fn accept_trade_offer(
    state: State<'_, VaultState>,
    account_name: String,
    offer_id: String,
    partner_id: String,
) -> Result<Accepted, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result =
        spawn_blocking(move || trades::accept(&account, proxy.as_ref(), &offer_id, &partner_id))
            .await?;
    let (session, accepted) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(accepted)
}

#[tauri::command]
pub async fn decline_trade_offer(
    state: State<'_, VaultState>,
    account_name: String,
    offer_id: String,
) -> Result<(), CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result =
        spawn_blocking(move || trades::decline(&account, proxy.as_ref(), &offer_id)).await?;
    let session = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))
}

#[tauri::command]
pub async fn cancel_trade_offer(
    state: State<'_, VaultState>,
    account_name: String,
    offer_id: String,
) -> Result<(), CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result =
        spawn_blocking(move || trades::cancel(&account, proxy.as_ref(), &offer_id)).await?;
    let session = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))
}

/// Confirms in Guard an offer this account sent.
#[tauri::command]
pub async fn confirm_trade_offer(
    state: State<'_, VaultState>,
    account_name: String,
    offer_id: String,
) -> Result<(), CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result =
        spawn_blocking(move || trades::confirm(&account, proxy.as_ref(), &offer_id)).await?;
    let session = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))
}

/// Looks up the other side of an offer and weighs it against `known`: the user's
/// other partners and own accounts, which a scammer may be copying.
#[tauri::command]
pub async fn check_trade_partner(
    state: State<'_, VaultState>,
    account_name: String,
    partner_id: String,
    known: Vec<Known>,
) -> Result<PartnerCheck, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let now = unix_now()?;
    let result =
        spawn_blocking(move || partner::check(&account, proxy.as_ref(), &partner_id, &known, now))
            .await?;
    let (session, check) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(check)
}

fn unix_now() -> Result<u64, CommandError> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| CommandError::Failed("the system clock is set before 1970".to_owned()))?
        .as_secs())
}
