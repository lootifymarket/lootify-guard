use std::collections::BTreeMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use lootify_guard_core::confirmations::{self, PendingConfirmation};
use lootify_guard_core::contents::{Account, AutoConfirmRule, Contents};
use lootify_guard_core::proxy::ProxyAddress;
use lootify_guard_core::steam::SteamError;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::accounts::store_session;
use crate::vault::{CommandError, VaultState};

const CHECK_EVERY: Duration = Duration::from_secs(60);
// Enough to see what happened lately; older entries are dropped.
const LOG_LEN: usize = 100;

/// What auto-confirm did since the vault was opened. It lives only in memory and
/// is wiped once the vault is found locked.
#[derive(Default)]
pub struct AutoConfirmLog(Mutex<Log>);

#[derive(Default)]
struct Log {
    /// Newest first.
    accepted: Vec<Accepted>,
    /// The last error of each account whose latest check failed.
    failures: BTreeMap<String, String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accepted {
    account_name: String,
    confirmation: PendingConfirmation,
    accepted_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    account_name: String,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogView {
    paused: bool,
    accepted: Vec<Accepted>,
    failures: Vec<Failure>,
}

impl AutoConfirmLog {
    fn lock(&self) -> MutexGuard<'_, Log> {
        // A panic elsewhere can't leave the log half-updated, so a poisoned lock is safe to reuse.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Checks every account with auto-confirm rules once a minute while the vault is
/// open. A locked vault has no secrets in memory, so nothing is confirmed then.
pub fn watch(app: AppHandle) {
    thread::spawn(move || {
        loop {
            thread::sleep(CHECK_EVERY);
            run(&app.state::<VaultState>(), &app.state::<AutoConfirmLog>());
        }
    });
}

struct Job {
    account: Account,
    proxy: Option<ProxyAddress>,
}

/// One pass over the accounts.
fn run(state: &VaultState, log: &AutoConfirmLog) {
    let Some((jobs, own_accounts)) = jobs(state, log) else {
        *log.lock() = Log::default();
        return;
    };
    for job in jobs {
        let name = job.account.account_name.clone();
        let outcome = confirmations::auto_confirm(&job.account, job.proxy.as_ref(), &own_accounts);
        let stored = match &outcome {
            Ok((session, _)) => store_session(state, &name, Some(session.clone())),
            Err(SteamError::SessionExpired) => store_session(state, &name, None),
            Err(_) => Ok(()),
        };
        let result = match (stored, outcome) {
            (Err(CommandError::Failed(reason)), _) => Err(reason),
            (Err(_), _) => {
                *log.lock() = Log::default();
                return;
            }
            (Ok(()), Ok((_, accepted))) => Ok(accepted),
            (Ok(()), Err(err)) => Err(err.to_string()),
        };
        let mut log = log.lock();
        match result {
            Ok(accepted) => {
                log.failures.remove(&name);
                let accepted_at = now();
                for confirmation in accepted {
                    log.accepted.insert(
                        0,
                        Accepted {
                            account_name: name.clone(),
                            confirmation,
                            accepted_at,
                        },
                    );
                }
                log.accepted.truncate(LOG_LEN);
            }
            Err(reason) => {
                log.failures.insert(name, reason);
            }
        }
    }
}

/// Copies of the accounts that have rules, with their proxies, and the Steam IDs of
/// every account in the vault. No accounts while paused, and `None` when the vault
/// is locked or can't be read.
fn jobs(state: &VaultState, log: &AutoConfirmLog) -> Option<(Vec<Job>, Vec<u64>)> {
    let unlocked = state.unlocked();
    let contents = Contents::from_bytes(unlocked.as_ref()?.data()).ok()?;
    if contents.auto_confirm_paused {
        log.lock().failures.clear();
        return Some((Vec::new(), Vec::new()));
    }
    let own_accounts = contents
        .accounts
        .iter()
        .filter_map(|account| account.steam_id)
        .collect();
    let mut log = log.lock();
    log.failures.retain(|name, _| {
        contents
            .account(name)
            .is_some_and(|account| account.auto_confirm.any())
    });
    let mut jobs = Vec::new();
    for account in contents
        .accounts
        .iter()
        .filter(|account| account.auto_confirm.any())
    {
        match contents.proxy_of(account) {
            Ok(proxy) => jobs.push(Job {
                account: account.clone(),
                proxy: proxy.map(|proxy| proxy.address.clone()),
            }),
            Err(err) => {
                log.failures
                    .insert(account.account_name.clone(), err.to_string());
            }
        }
    }
    Some((jobs, own_accounts))
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}

/// Turns one rule on or off for several accounts at once.
#[tauri::command]
pub fn set_auto_confirm_rule(
    state: State<'_, VaultState>,
    log: State<'_, AutoConfirmLog>,
    account_names: Vec<String>,
    rule: AutoConfirmRule,
    on: bool,
) -> Result<(), CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    for name in &account_names {
        contents
            .account_mut(name)
            .ok_or_else(|| {
                CommandError::Failed("the account is no longer in the vault".to_owned())
            })?
            .auto_confirm
            .set(rule, on);
    }
    vault.save_data(contents.to_bytes())?;
    // An old error would read as if the new rules had already been tried.
    let mut log = log.lock();
    for name in &account_names {
        log.failures.remove(name);
    }
    Ok(())
}

#[tauri::command]
pub fn set_auto_confirm_paused(
    state: State<'_, VaultState>,
    paused: bool,
) -> Result<(), CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    contents.auto_confirm_paused = paused;
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

#[tauri::command]
pub fn auto_confirm_log(
    state: State<'_, VaultState>,
    log: State<'_, AutoConfirmLog>,
) -> Result<LogView, CommandError> {
    let paused = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        Contents::from_bytes(vault.data())?.auto_confirm_paused
    };
    let log = log.lock();
    Ok(LogView {
        paused,
        accepted: log.accepted.clone(),
        failures: log
            .failures
            .iter()
            .map(|(account_name, reason)| Failure {
                account_name: account_name.clone(),
                reason: reason.clone(),
            })
            .collect(),
    })
}
