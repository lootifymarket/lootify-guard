use std::sync::{Mutex, MutexGuard, PoisonError};

use lootify_guard_core::contents::Contents;
use lootify_guard_core::link::{self, NewGuard};
use lootify_guard_core::steam::SteamError;
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::async_runtime::spawn_blocking;
use zeroize::Zeroizing;

use crate::accounts::{account_and_proxy, confirm_owner, find, no_such_account, settle};
use crate::add_account::GuardStart;
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
pub struct Begun {
    /// Steam shows no authenticator on the account, so a new one is just added.
    guard_on: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Replaced {
    revocation_code: Option<String>,
    /// Steam may accept the code and still not turn the authenticator on.
    guard_on: bool,
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

/// Checks that it's the owner, since the old Guard can be taken off from here, gets a
/// live session for the account, and asks Steam whether Guard is on it at all.
#[tauri::command]
pub async fn replace_guard_begin(
    state: State<'_, VaultState>,
    flow: State<'_, ReplaceGuardState>,
    account_name: String,
    password: Option<String>,
) -> Result<Begun, CommandError> {
    confirm_owner(&state, password, "replace Steam Guard").await?;
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || {
        let guard = link::begin_replace(&account, proxy.as_ref())?;
        let on = guard.guard_is_on()?;
        Ok::<_, SteamError>((guard, on))
    })
    .await?;
    let (guard, guard_on) = settle(&state, &account_name, result)?;
    flow.put(Replacing {
        account_name,
        guard,
        removed: !guard_on,
    });
    Ok(Begun { guard_on })
}

/// Asks Steam for the new authenticator. Either way Steam sends a code that
/// `replace_guard_confirm` takes. Once the old Guard is off, any method just tries
/// adding the new one again. `revocation_code` is the one the user typed, for an
/// account whose code isn't in the vault.
#[tauri::command]
pub async fn replace_guard_start(
    state: State<'_, VaultState>,
    flow: State<'_, ReplaceGuardState>,
    method: ReplaceMethod,
    revocation_code: Option<String>,
) -> Result<GuardStart, CommandError> {
    let typed = revocation_code.map(Zeroizing::new);
    let mut current = flow.take(&state)?;
    let revocation_code = match method {
        ReplaceMethod::RevocationCode if !current.removed => {
            let stored = {
                let unlocked = state.unlocked();
                let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
                let contents = Contents::from_bytes(vault.data())?;
                find(&contents, &current.account_name)?
                    .authenticator
                    .revocation_code
                    .as_ref()
                    .map(|code| Zeroizing::new(code.expose().to_owned()))
            };
            let code = stored
                .or_else(|| typed.filter(|code| !code.trim().is_empty()))
                .ok_or_else(|| {
                    CommandError::Failed("this account has no revocation code".to_owned())
                })?;
            Some(code)
        }
        _ => None,
    };

    let (current, result) = spawn_blocking(move || {
        let result = if current.removed {
            current.guard.add()
        } else if let Some(code) = revocation_code {
            current.guard.remove(code.trim()).and_then(|()| {
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
    match result {
        Ok(confirm_by) => Ok(GuardStart::Sent { confirm_by }),
        Err(SteamError::MoveNeedsPhone) => Ok(GuardStart::NoPhone),
        Err(err) if removed => Err(CommandError::Failed(format!(
            "the old Steam Guard is off the account, but the new one isn't on yet: {err}"
        ))),
        Err(err) => Err(err.into()),
    }
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
        let result = current.guard.confirm(code.trim()).map(|new| {
            // The secrets are saved either way: if the check can't be made, Steam
            // took the code, so they're the ones it knows.
            let on = current.guard.guard_is_on().unwrap_or(true);
            (new, on)
        });
        (current, result)
    })
    .await?;
    let (new, guard_on) = match result {
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
        guard_on,
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
