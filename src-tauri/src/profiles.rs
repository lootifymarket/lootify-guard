use std::thread;
use std::time::{Duration, Instant};

use lootify_guard_core::contents::Contents;
use lootify_guard_core::steam;
use tauri::{AppHandle, Manager};

use crate::accounts::{account_and_proxy, store_profile};
use crate::vault::{CommandError, VaultState};

const TICK: Duration = Duration::from_secs(60);
const REFRESH_EVERY: Duration = Duration::from_secs(30 * 60);
// Spaces the requests out, so accounts sharing a proxy don't all ask Steam at once.
const BETWEEN_ACCOUNTS: Duration = Duration::from_secs(2);

/// Brings nicknames and avatars changed outside the app into the vault: soon after
/// it's unlocked, then every half hour while it stays open.
pub fn watch(app: AppHandle) {
    thread::spawn(move || {
        let mut last_pass: Option<Instant> = None;
        loop {
            thread::sleep(TICK);
            let state = app.state::<VaultState>();
            if state.unlocked().is_none() {
                last_pass = None;
                continue;
            }
            if last_pass.is_some_and(|at| at.elapsed() < REFRESH_EVERY) {
                continue;
            }
            last_pass = Some(Instant::now());
            refresh_all(&state);
        }
    });
}

fn refresh_all(state: &VaultState) {
    let names: Vec<String> = {
        let unlocked = state.unlocked();
        let Some(vault) = unlocked.as_ref() else {
            return;
        };
        let Ok(contents) = Contents::from_bytes(vault.data()) else {
            return;
        };
        contents
            .accounts
            .iter()
            .filter(|account| account.session.is_some())
            .map(|account| account.account_name.clone())
            .collect()
    };
    for name in names {
        // Read again each time, as the account may have changed or gone meanwhile.
        let Ok((account, proxy)) = account_and_proxy(state, &name) else {
            continue;
        };
        if account.session.is_none() {
            continue;
        }
        let fetched = steam::fetch_profile(&account, proxy.as_ref());
        if let Err(CommandError::Locked) = store_profile(state, &name, fetched) {
            return;
        }
        thread::sleep(BETWEEN_ACCOUNTS);
    }
}
