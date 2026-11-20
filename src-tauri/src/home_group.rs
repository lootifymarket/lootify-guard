//! Keeps every account in the app in Lootify Market's Steam group, and joins it
//! again when the account has left. Runs in the background while the vault is
//! open, one account at a time, each through its own proxy.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use lootify_guard_core::contents::Contents;
use lootify_guard_core::steam_groups::{self, LOOTIFY};
use tauri::{AppHandle, Manager};

use crate::accounts::{account_and_proxy, store_session};
use crate::tasks::{now, random_between};
use crate::vault::VaultState;

// How often an account is looked at again, in seconds.
const EVERY: u64 = 6 * 60 * 60;
// After a failure, like a network that's down.
const RETRY: u64 = 60 * 60;
// With nothing to do, how long until the accounts are looked at again.
const IDLE: Duration = Duration::from_secs(60);
// Between two accounts, in seconds.
const PAUSE: (u32, u32) = (20, 40);

/// When each account is next looked at, by login, in Unix seconds. In memory only:
/// after a restart every account is looked at once more.
#[derive(Default)]
pub struct HomeGroup(Mutex<HashMap<String, u64>>);

impl HomeGroup {
    fn next(&self) -> MutexGuard<'_, HashMap<String, u64>> {
        // Only times are kept, so a poisoned lock is safe to reuse.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

pub fn watch(app: AppHandle) {
    thread::spawn(move || {
        loop {
            let Some(account_name) = due(&app) else {
                thread::sleep(IDLE);
                continue;
            };
            let checked = check(&app, &account_name);
            app.state::<HomeGroup>()
                .next()
                .insert(account_name, now() + if checked { EVERY } else { RETRY });
            thread::sleep(Duration::from_secs(random_between(PAUSE.0, PAUSE.1)));
        }
    });
}

/// An account with a session that's due a look, while the vault is open.
fn due(app: &AppHandle) -> Option<String> {
    let state = app.state::<VaultState>();
    let unlocked = state.unlocked();
    let contents = Contents::from_bytes(unlocked.as_ref()?.data()).ok()?;
    let next = app.state::<HomeGroup>();
    let next = next.next();
    let now = now();
    contents
        .accounts
        .iter()
        .filter(|account| account.session.is_some())
        .find(|account| next.get(&account.account_name).is_none_or(|at| *at <= now))
        .map(|account| account.account_name.clone())
}

/// Whether the look went through; a session Steam no longer takes is left for the
/// account page to deal with.
fn check(app: &AppHandle, account_name: &str) -> bool {
    let state = app.state::<VaultState>();
    let Ok((account, proxy)) = account_and_proxy(&state, account_name) else {
        return false;
    };
    match steam_groups::keep_in(&account, proxy.as_ref(), LOOTIFY) {
        Ok((session, _)) => {
            // Steam may have renewed it on the way.
            let _ = store_session(&state, account_name, Some(session));
            true
        }
        Err(_) => false,
    }
}
