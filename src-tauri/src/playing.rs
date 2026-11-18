use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use lootify_guard_core::cm::{self, Connection, Event, MAX_GAMES};
use lootify_guard_core::contents::{Account, Contents};
use lootify_guard_core::free_games::{self, FreeGame};
use lootify_guard_core::games::{self, OwnedGame, PlayingList};
use lootify_guard_core::steam::SteamError;
use serde::Serialize;
use tauri::async_runtime::spawn_blocking;
use tauri::{AppHandle, Manager, State};

use crate::accounts::{account_and_proxy, no_such_account, settle, store_session};
use crate::farming::Farms;
use crate::vault::{CommandError, VaultState};

const MAX_STATUS: usize = 64;
// How long a dropped connection waits before trying again, doubling up to the cap.
const FIRST_RETRY: Duration = Duration::from_secs(30);
const LONGEST_RETRY: Duration = Duration::from_secs(10 * 60);
const STARTED_WITHIN: Duration = Duration::from_secs(60);

/// Accounts playing on their own Steam client connection, each kept by a thread
/// that reconnects when the connection drops. Held in memory only.
#[derive(Default)]
pub struct Players(Mutex<HashMap<String, Player>>);

struct Player {
    commands: Sender<Command>,
    view: Arc<Mutex<PlayerView>>,
}

enum Command {
    Play(PlayingList),
    Stop,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerView {
    account_name: String,
    #[serde(flatten)]
    list: PlayingList,
    #[serde(flatten)]
    state: PlayState,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
enum PlayState {
    Connecting,
    /// Since when, in Unix seconds.
    Playing {
        since: u64,
    },
    /// Another device is playing on the account, so these games don't count until it stops.
    Blocked,
    /// The connection dropped; it's tried again at `at`, in Unix seconds.
    Reconnecting {
        reason: String,
        at: u64,
    },
    /// Gave up, for a reason no retry would fix.
    Stopped {
        reason: String,
    },
}

impl Players {
    fn map(&self) -> MutexGuard<'_, HashMap<String, Player>> {
        // Nothing here is left half-updated by a panic, so a poisoned lock is safe to reuse.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Plays the list on the account, connecting first when it isn't already.
    pub fn start(&self, app: &AppHandle, account_name: &str, list: PlayingList) {
        let mut map = self.map();
        if let Some(player) = map.get(account_name)
            && player.commands.send(Command::Play(list.clone())).is_ok()
        {
            lock(&player.view).list = list;
            return;
        }
        let (commands, inbox) = mpsc::channel();
        let view = Arc::new(Mutex::new(PlayerView {
            account_name: account_name.to_owned(),
            list: list.clone(),
            state: PlayState::Connecting,
        }));
        let (app, name, shared) = (app.clone(), account_name.to_owned(), view.clone());
        thread::spawn(move || keep_playing(&app, &name, list, &inbox, &shared));
        map.insert(account_name.to_owned(), Player { commands, view });
    }

    /// Signs the account's connection out. Whether it was playing.
    pub fn stop(&self, account_name: &str) -> bool {
        self.map()
            .remove(account_name)
            .is_some_and(|player| player.commands.send(Command::Stop).is_ok())
    }

    pub fn is_playing(&self, account_name: &str) -> bool {
        self.map()
            .get(account_name)
            .is_some_and(|player| !matches!(lock(&player.view).state, PlayState::Stopped { .. }))
    }

    /// Waits for the account's connection to come up, or says why it didn't.
    pub fn wait_started(&self, account_name: &str) -> Result<(), String> {
        let deadline = Instant::now() + STARTED_WITHIN;
        while Instant::now() < deadline {
            let state = self
                .map()
                .get(account_name)
                .map(|player| lock(&player.view).state.clone());
            match state {
                Some(PlayState::Playing { .. } | PlayState::Blocked) => return Ok(()),
                Some(PlayState::Stopped { reason } | PlayState::Reconnecting { reason, .. }) => {
                    return Err(reason);
                }
                Some(PlayState::Connecting) => thread::sleep(Duration::from_millis(500)),
                None => return Err("stopped".to_owned()),
            }
        }
        Err("Steam took too long to answer, still trying".to_owned())
    }
}

fn lock(view: &Mutex<PlayerView>) -> MutexGuard<'_, PlayerView> {
    view.lock().unwrap_or_else(PoisonError::into_inner)
}

fn set(view: &Mutex<PlayerView>, state: PlayState) {
    lock(view).state = state;
}

/// How a connection came to an end.
enum Ended {
    /// The user stopped it.
    Stopped,
    /// For good, like a Steam session that ended.
    Failed(String),
    /// Worth trying again.
    Dropped(String),
}

fn keep_playing(
    app: &AppHandle,
    account_name: &str,
    mut list: PlayingList,
    inbox: &Receiver<Command>,
    view: &Mutex<PlayerView>,
) {
    let mut retry = FIRST_RETRY;
    loop {
        set(view, PlayState::Connecting);
        let reason = match play(app, account_name, &mut list, inbox, view, &mut retry) {
            Ended::Stopped => return,
            Ended::Failed(reason) => {
                set(view, PlayState::Stopped { reason });
                return;
            }
            Ended::Dropped(reason) => reason,
        };
        set(
            view,
            PlayState::Reconnecting {
                reason,
                at: now() + retry.as_secs(),
            },
        );
        // A new list may come in meanwhile; a stop ends it at once.
        let deadline = Instant::now() + retry;
        loop {
            match inbox.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(Command::Play(new)) => list = new,
                Ok(Command::Stop) | Err(RecvTimeoutError::Disconnected) => return,
                Err(RecvTimeoutError::Timeout) => break,
            }
        }
        retry = (retry * 2).min(LONGEST_RETRY);
    }
}

/// Connects and plays until the connection ends.
fn play(
    app: &AppHandle,
    account_name: &str,
    list: &mut PlayingList,
    inbox: &Receiver<Command>,
    view: &Mutex<PlayerView>,
    retry: &mut Duration,
) -> Ended {
    let mut connection = match connect(app, account_name) {
        Ok(connection) => connection,
        Err(ended) => return ended,
    };
    let send = |connection: &mut Connection, list: &PlayingList| {
        // A free game the account doesn't have yet is added first, as the
        // client does, or Steam wouldn't count it as played.
        let free: Vec<u32> = list
            .games
            .iter()
            .copied()
            .filter(|&game| free_games::is_free(game))
            .collect();
        connection.request_free_licenses(&free)?;
        connection.show_as(list.presence)?;
        connection.play(&list.games, list.status.as_deref())
    };
    if let Err(err) = send(&mut connection, list) {
        return Ended::Dropped(err.to_string());
    }
    set(view, PlayState::Playing { since: now() });
    *retry = FIRST_RETRY;
    loop {
        match inbox.try_recv() {
            Ok(Command::Play(new)) => {
                *list = new;
                if let Err(err) = send(&mut connection, list) {
                    return Ended::Dropped(err.to_string());
                }
            }
            Ok(Command::Stop) | Err(TryRecvError::Disconnected) => {
                connection.close();
                return Ended::Stopped;
            }
            Err(TryRecvError::Empty) => {}
        }
        match connection.wait(Duration::from_secs(1)) {
            Ok(None) => {}
            Ok(Some(Event::PlayingBlocked(true))) => set(view, PlayState::Blocked),
            Ok(Some(Event::PlayingBlocked(false))) => {
                // Steam forgets what this connection played while it was blocked.
                if let Err(err) = send(&mut connection, list) {
                    return Ended::Dropped(err.to_string());
                }
                set(view, PlayState::Playing { since: now() });
            }
            Ok(Some(Event::LoggedOff(code))) => {
                return Ended::Dropped(format!("Steam signed the connection out (code {code})"));
            }
            Err(err) => return Ended::Dropped(err.to_string()),
        }
    }
}

fn connect(app: &AppHandle, account_name: &str) -> Result<Connection, Ended> {
    let state = app.state::<VaultState>();
    let (mut account, proxy) =
        account_and_proxy(&state, account_name).map_err(|err| match err {
            // It picks up again once the vault is open.
            CommandError::Locked => {
                Ended::Dropped("waiting for the vault to be unlocked".to_owned())
            }
            CommandError::Failed(reason) => Ended::Failed(reason),
            _ => Ended::Failed("the vault couldn't be read".to_owned()),
        })?;
    let result = cm::connect(&mut account, proxy.as_ref());
    if let Err(SteamError::SessionExpired) = result {
        account.session = None;
    }
    save_sign_ins(&state, &account)
        .map_err(|_| Ended::Dropped("waiting for the vault to be unlocked".to_owned()))?;
    result.map_err(|err| match err {
        SteamError::SessionExpired => Ended::Failed(err.to_string()),
        err => Ended::Dropped(err.to_string()),
    })
}

/// The free games the account can play without owning them yet.
#[tauri::command]
pub fn free_games() -> &'static [FreeGame] {
    free_games::free_games()
}

/// Saves the mobile session and the client sign-in the connection came back with.
fn save_sign_ins(state: &VaultState, account: &Account) -> Result<(), CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let stored = contents
        .account_mut(&account.account_name)
        .ok_or_else(no_such_account)?;
    stored.session = account.session.clone();
    stored.client_token = account.client_token.clone();
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

/// Checks the list, keeps it with the account and starts playing it.
pub fn start(
    app: &AppHandle,
    state: &VaultState,
    account_name: &str,
    list: PlayingList,
) -> Result<(), CommandError> {
    let fail = |reason: &str| Err(CommandError::Failed(reason.to_owned()));
    let status = list
        .status
        .as_deref()
        .map(str::trim)
        .filter(|status| !status.is_empty());
    if status.is_some_and(|status| status.chars().count() > MAX_STATUS) {
        return fail("the status is over 64 characters");
    }
    if list.games.is_empty() && status.is_none() {
        return fail("add a game or a status");
    }
    if list.games.len() + usize::from(status.is_some()) > MAX_GAMES {
        return fail("Steam plays at most 32 games at once, the status counts as one");
    }
    let list = PlayingList {
        games: list.games,
        status: status.map(str::to_owned),
        presence: list.presence,
    };
    {
        let mut unlocked = state.unlocked();
        let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
        let mut contents = Contents::from_bytes(vault.data())?;
        contents
            .account_mut(account_name)
            .ok_or_else(no_such_account)?
            .playing = list.clone();
        vault.save_data(contents.to_bytes())?;
    }
    // Games picked by hand take over from card farming.
    app.state::<Farms>().stop(account_name);
    app.state::<Players>().start(app, account_name, list);
    Ok(())
}

/// Ends card farming and playing on the account. Whether it was playing.
pub fn stop(app: &AppHandle, account_name: &str) -> bool {
    app.state::<Farms>().stop(account_name);
    app.state::<Players>().stop(account_name)
}

#[tauri::command]
pub fn start_playing(
    app: AppHandle,
    state: State<'_, VaultState>,
    account_name: String,
    list: PlayingList,
) -> Result<(), CommandError> {
    start(&app, &state, &account_name, list)
}

#[tauri::command]
pub fn stop_playing(app: AppHandle, account_name: String) {
    stop(&app, &account_name);
}

/// Every account with a connection, playing or trying to.
#[tauri::command]
pub fn playing_now(players: State<'_, Players>) -> Vec<PlayerView> {
    let mut views: Vec<PlayerView> = players
        .map()
        .values()
        .map(|player| lock(&player.view).clone())
        .collect();
    views.sort_by(|a, b| a.account_name.cmp(&b.account_name));
    views
}

/// What the account would play, as saved with it.
#[tauri::command]
pub fn playing_list(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<PlayingList, CommandError> {
    let (account, _) = account_and_proxy(&state, &account_name)?;
    Ok(account.playing)
}

#[tauri::command]
pub async fn owned_games(
    state: State<'_, VaultState>,
    account_name: String,
) -> Result<Vec<OwnedGame>, CommandError> {
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || games::owned(&account, proxy.as_ref())).await?;
    let (session, games) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    Ok(games)
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}
