use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use lootify_guard_core::cards::{self, CardGame};
use lootify_guard_core::free_games;
use lootify_guard_core::games::PlayingList;
use lootify_guard_core::steam::SteamError;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::accounts::{account_and_proxy, store_session};
use crate::playing::{Players, add_free_games};
use crate::vault::{CommandError, VaultState};

// Steam updates the badges page with some delay, so checking more often gains nothing.
const CHECK_EVERY: Duration = Duration::from_secs(10 * 60);
const STARTED_WITHIN: Duration = Duration::from_secs(60);

/// Accounts farming trading cards: each has a thread that reads its badges
/// and has the account play the games that still drop cards. Held in memory only.
#[derive(Default)]
pub struct Farms(Mutex<HashMap<String, Farm>>);

struct Farm {
    cancelled: Arc<AtomicBool>,
    view: Arc<Mutex<FarmView>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FarmView {
    account_name: String,
    #[serde(flatten)]
    state: FarmState,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
enum FarmState {
    Checking,
    Farming {
        /// Games with drops left.
        games: Vec<CardGame>,
        /// The ones being played now.
        playing: Vec<u32>,
        /// When the badges are read again, in Unix seconds.
        next_check: u64,
        /// Why the last check failed, when it did; farming goes on meanwhile.
        problem: Option<String>,
    },
    /// Every card has dropped.
    Done,
    Stopped {
        reason: String,
    },
}

impl Farms {
    fn map(&self) -> MutexGuard<'_, HashMap<String, Farm>> {
        // Nothing here is left half-updated by a panic, so a poisoned lock is safe to reuse.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn start(&self, app: &AppHandle, account_name: &str) {
        self.stop(account_name);
        let cancelled = Arc::new(AtomicBool::new(false));
        let view = Arc::new(Mutex::new(FarmView {
            account_name: account_name.to_owned(),
            state: FarmState::Checking,
        }));
        let (app, name, stop, shared) = (
            app.clone(),
            account_name.to_owned(),
            cancelled.clone(),
            view.clone(),
        );
        thread::spawn(move || farm(&app, &name, &stop, &shared));
        self.map()
            .insert(account_name.to_owned(), Farm { cancelled, view });
    }

    /// Ends the farming; the games already playing are the caller's to stop.
    pub fn stop(&self, account_name: &str) {
        if let Some(farm) = self.map().remove(account_name) {
            farm.cancelled.store(true, Ordering::Relaxed);
        }
    }

    /// Waits for the first look at the badges, and says what it found.
    pub fn wait_started(&self, account_name: &str) -> Result<String, String> {
        let deadline = Instant::now() + STARTED_WITHIN;
        while Instant::now() < deadline {
            let state = self
                .map()
                .get(account_name)
                .map(|farm| lock(&farm.view).state.clone());
            match state {
                Some(FarmState::Checking) => thread::sleep(Duration::from_millis(500)),
                Some(FarmState::Farming { games, .. }) => {
                    let drops: u32 = games.iter().map(|game| game.drops).sum();
                    return Ok(format!(
                        "{} with {drops} card drops left",
                        plural(games.len(), "game")
                    ));
                }
                Some(FarmState::Done) => return Ok("No card drops left".to_owned()),
                Some(FarmState::Stopped { reason }) => return Err(reason),
                None => return Err("stopped".to_owned()),
            }
        }
        Err("Steam took too long to answer, still trying".to_owned())
    }
}

fn plural(count: usize, word: &str) -> String {
    match count {
        1 => format!("1 {word}"),
        n => format!("{n} {word}s"),
    }
}

fn lock(view: &Mutex<FarmView>) -> MutexGuard<'_, FarmView> {
    view.lock().unwrap_or_else(PoisonError::into_inner)
}

fn set(view: &Mutex<FarmView>, state: FarmState) {
    lock(view).state = state;
}

fn farm(app: &AppHandle, account_name: &str, cancelled: &AtomicBool, view: &Mutex<FarmView>) {
    let players = app.state::<Players>();
    // Free games that drop cards on their own go on the account first, so its
    // badges show them. One that can't be added is just not farmed.
    let card_games: Vec<u32> = free_games::card_games().collect();
    let _ = add_free_games(app, account_name, &card_games);
    let mut last: Option<(Vec<CardGame>, Vec<u32>)> = None;
    loop {
        if cancelled.load(Ordering::Relaxed) {
            return;
        }
        let problem = match check(app, account_name) {
            Ok((_, games)) if games.is_empty() => {
                players.stop(account_name);
                set(view, FarmState::Done);
                return;
            }
            Ok((presence_list, games)) => {
                let playing = cards::next_to_play(&games);
                if last.as_ref().map(|(_, played)| played) != Some(&playing) {
                    players.start(
                        app,
                        account_name,
                        PlayingList {
                            games: playing.clone(),
                            ..presence_list
                        },
                    );
                }
                last = Some((games, playing));
                None
            }
            Err(Checked::Fatal(reason)) => {
                players.stop(account_name);
                set(view, FarmState::Stopped { reason });
                return;
            }
            // What was found last keeps playing until the next try.
            Err(Checked::Retry(reason)) => Some(reason),
        };
        let (games, playing) = last.clone().unwrap_or_default();
        set(
            view,
            FarmState::Farming {
                games,
                playing,
                next_check: now() + CHECK_EVERY.as_secs(),
                problem,
            },
        );
        let deadline = Instant::now() + CHECK_EVERY;
        while Instant::now() < deadline {
            if cancelled.load(Ordering::Relaxed) {
                return;
            }
            thread::sleep(Duration::from_secs(1));
        }
    }
}

enum Checked {
    Fatal(String),
    Retry(String),
}

/// The games with drops left, and the account's saved list for how it shows to
/// friends while it plays them.
fn check(app: &AppHandle, account_name: &str) -> Result<(PlayingList, Vec<CardGame>), Checked> {
    let state = app.state::<VaultState>();
    let (account, proxy) = account_and_proxy(&state, account_name).map_err(|err| match err {
        CommandError::Locked => Checked::Retry("waiting for the vault to be unlocked".to_owned()),
        CommandError::Failed(reason) => Checked::Fatal(reason),
        _ => Checked::Fatal("the vault couldn't be read".to_owned()),
    })?;
    let saved = PlayingList {
        games: Vec::new(),
        status: None,
        presence: account.playing.presence,
    };
    match cards::games_with_drops(&account, proxy.as_ref()) {
        Ok((session, games)) => {
            store_session(&state, account_name, Some(session))
                .map_err(|_| Checked::Retry("waiting for the vault to be unlocked".to_owned()))?;
            Ok((saved, games))
        }
        Err(err @ SteamError::SessionExpired) => {
            let _ = store_session(&state, account_name, None);
            Err(Checked::Fatal(err.to_string()))
        }
        Err(err) => Err(Checked::Retry(err.to_string())),
    }
}

#[tauri::command]
pub fn start_farming(app: AppHandle, farms: State<'_, Farms>, account_name: String) {
    farms.start(&app, &account_name);
}

#[tauri::command]
pub fn farming_now(farms: State<'_, Farms>) -> Vec<FarmView> {
    let mut views: Vec<FarmView> = farms
        .map()
        .values()
        .map(|farm| lock(&farm.view).clone())
        .collect();
    views.sort_by(|a, b| a.account_name.cmp(&b.account_name));
    views
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}
