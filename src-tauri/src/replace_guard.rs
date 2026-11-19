use std::sync::{Mutex, MutexGuard, PoisonError};

use lootify_guard_core::contents::Contents;
use lootify_guard_core::link::{self, ConfirmBy, NewGuard};
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::async_runtime::spawn_blocking;

use crate::accounts::{account_and_proxy, confirm_owner, find, no_such_account, settle};
use crate::vault::{CommandError, VaultState};

/// The account whose Steam Guard is being replaced, one at a time. It lives only in
/// memory, and a command that finds the vault locked drops it.
#[derive(Default)]
pub struct ReplaceGuardState(Mutex<Option<Replacing>>);

struct Replacing {
    account_name: String,
    guard: NewGuard,
    /// The old authenticator is already off the account, so the only way on is to
    /// add the new one.
    removed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReplaceMethod {
    /// Steam moves Guard here with an SMS to the account's phone.
    Sms,
    /// The revocation code takes the old Guard off, then a new one is added.
    RevocationCode,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Replaced {
    revocation_code: Option<String>,
}

impl ReplaceGuardState {
    fn lock(&self) -> MutexGuard<'_, Option<Replacing>> {
        // A panic elsewhere can't leave the flow half-updated, so a poisoned lock is safe to reuse.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Takes the flow out for a network call, which must not hold the lock.
    fn take(&self, vault: &VaultState) -> Result<Replacing, CommandError> {
        let mut flow = self.lock();
        if vault.unlocked().is_none() {
            *flow = None;
            return Err(CommandError::Locked);
        }
        flow.take().ok_or_else(start_again)
    }

    fn put(&self, flow: Replacing) {
        *self.lock() = Some(flow);
    }
}

/// Checks that it's the owner, since the old Guard can be taken off from here, and
/// gets a live session for the account.
#[tauri::command]
pub async fn replace_guard_begin(
    state: State<'_, VaultState>,
    flow: State<'_, ReplaceGuardState>,
    account_name: String,
    password: Option<String>,
) -> Result<(), CommandError> {
    confirm_owner(&state, password, "replace Steam Guard").await?;
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || link::begin_replace(&account, proxy.as_ref())).await?;
    let guard = settle(&state, &account_name, result)?;
    flow.put(Replacing {
        account_name,
        guard,
        removed: false,
    });
    Ok(())
}

/// Asks Steam for the new authenticator. Either way Steam sends a code that
/// `replace_guard_confirm` takes. Once the old Guard is off, any method just tries
/// adding the new one again.
#[tauri::command]
pub async fn replace_guard_start(
    state: State<'_, VaultState>,
    flow: State<'_, ReplaceGuardState>,
    method: ReplaceMethod,
) -> Result<ConfirmBy, CommandError> {
    let mut current = flow.take(&state)?;
    let revocation_code = match method {
        ReplaceMethod::RevocationCode if !current.removed => {
            let unlocked = state.unlocked();
            let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
            let contents = Contents::from_bytes(vault.data())?;
            let code = find(&contents, &current.account_name)?
                .authenticator
                .revocation_code
                .as_ref()
                .ok_or_else(|| {
                    CommandError::Failed("this account has no revocation code".to_owned())
                })?
                .expose()
                .to_owned();
            Some(code)
        }
        _ => None,
    };

    let (current, result) = spawn_blocking(move || {
        let result = if current.removed {
            current.guard.add()
        } else if let Some(code) = revocation_code {
            current.guard.remove(&code).and_then(|()| {
                current.removed = true;
                current.guard.add()
            })
        } else {
            current.guard.start_move()
        };
        (current, result)
    })
    .await?;
    let removed = current.removed;
    flow.put(current);
    result.map_err(|err| {
        if removed {
            CommandError::Failed(format!(
                "the old Steam Guard is off the account, but the new one isn't on yet: {err}"
            ))
        } else {
            err.into()
        }
    })
}

/// Confirms the new authenticator and saves its secrets over the old ones at once:
/// from here on they are the only way to get Guard codes.
#[tauri::command]
pub async fn replace_guard_confirm(
    state: State<'_, VaultState>,
    flow: State<'_, ReplaceGuardState>,
    code: String,
) -> Result<Replaced, CommandError> {
    let mut current = flow.take(&state)?;
    let (current, result) = spawn_blocking(move || {
        let result = current.guard.confirm(code.trim());
        (current, result)
    })
    .await?;
    let new = match result {
        Ok(new) => new,
        Err(err) => {
            flow.put(current);
            return Err(err.into());
        }
    };

    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let account = contents
        .account_mut(&current.account_name)
        .ok_or_else(no_such_account)?;
    account.authenticator = new.authenticator;
    account.session = new.session;
    let replaced = Replaced {
        revocation_code: account
            .authenticator
            .revocation_code
            .as_ref()
            .map(|code| code.expose().to_owned()),
    };
    vault.save_data(contents.to_bytes())?;
    Ok(replaced)
}

#[tauri::command]
pub fn replace_guard_cancel(flow: State<'_, ReplaceGuardState>) {
    *flow.lock() = None;
}

fn start_again() -> CommandError {
    CommandError::Failed("this replacement has ended, start it again".to_owned())
}
