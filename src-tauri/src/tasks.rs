use std::collections::VecDeque;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use lootify_guard_core::contents::{Account, Contents, DamagedContents};
use lootify_guard_core::inventory::Game;
use lootify_guard_core::moves::{self, Side};
use lootify_guard_core::profile_settings::{AvatarImage, MAX_AVATAR_LEN};
use lootify_guard_core::steam::SteamError;
use lootify_guard_core::tasks::{
    self, MAX_PERSONA_NAME, Outcome, PrivacyChanges, ProfileTask, Task, persona_name,
};
use lootify_guard_core::vault::VaultError;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::accounts::{account_and_proxy, no_such_account};
use crate::inventory::InventoryCache;
use crate::vault::{CommandError, VaultState};

// A failed account goes to the back of the line, up to this many tries in all.
const MAX_TRIES: u8 = 3;
const MAX_AT_ONCE: u8 = 10;
// Finished jobs are dropped past this many, oldest first.
const KEEP_FINISHED: usize = 20;

/// Bulk tasks, running and finished. Kept in memory only; they hold logins and
/// short notes, no secrets.
#[derive(Default)]
pub struct Tasks(Mutex<Book>);

#[derive(Default)]
struct Book {
    last_id: u32,
    jobs: Vec<Job>,
}

struct Job {
    id: u32,
    title: String,
    /// What it runs on, like a group's name.
    target: String,
    runs: Vec<Run>,
    started_at: u64,
    finished_at: Option<u64>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Run {
    account_name: String,
    tries: u8,
    #[serde(flatten)]
    state: RunState,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
enum RunState {
    Waiting,
    Running,
    Done {
        note: String,
    },
    Warning {
        note: String,
    },
    Failed {
        reason: String,
    },
    /// The job was stopped before this account's turn.
    Skipped,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobView {
    id: u32,
    title: String,
    target: String,
    runs: Vec<Run>,
    started_at: u64,
    finished_at: Option<u64>,
}

/// A task as the page asks for it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum TaskInput {
    Check,
    #[serde(rename_all = "camelCase")]
    AcceptGifts {
        only_own: bool,
    },
    #[serde(rename_all = "camelCase")]
    Profile {
        name_template: Option<String>,
        privacy: PrivacyChanges,
        avatar: Option<Vec<u8>>,
    },
    #[serde(rename_all = "camelCase")]
    MoveToStorage {
        storage: String,
        game: Game,
    },
}

/// What each account of a job does.
enum Work {
    Each(Task),
    /// Takes two accounts, so it's done here rather than as a core task.
    MoveTo {
        storage: String,
        game: Game,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pacing {
    /// How many accounts run at the same time.
    at_once: u8,
    /// A random pause between one account and the next, in seconds.
    pause_min: u32,
    pause_max: u32,
    /// Failed accounts go to the back of the line, up to three tries in all.
    retry: bool,
}

impl Tasks {
    fn book(&self) -> MutexGuard<'_, Book> {
        // A panic elsewhere can't leave the book half-updated, so a poisoned lock is safe to reuse.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn set(&self, job: u32, run: usize, state: RunState, tries: Option<u8>) {
        let mut book = self.book();
        if let Some(job) = book.jobs.iter_mut().find(|known| known.id == job) {
            job.runs[run].state = state;
            if let Some(tries) = tries {
                job.runs[run].tries = tries;
            }
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRequest {
    task: TaskInput,
    title: String,
    /// What it runs on, like a group's name, to tell jobs apart in the queue.
    target: String,
    account_names: Vec<String>,
    pacing: Pacing,
}

/// Starts the task on the accounts in the background and returns the job's id.
#[tauri::command]
pub fn start_task(
    app: AppHandle,
    state: State<'_, VaultState>,
    tasks: State<'_, Tasks>,
    request: TaskRequest,
) -> Result<u32, CommandError> {
    let TaskRequest {
        task,
        title,
        target,
        mut account_names,
        pacing,
    } = request;
    let work = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        let contents = Contents::from_bytes(vault.data())?;
        for name in &account_names {
            contents.account(name).ok_or_else(no_such_account)?;
        }
        match task {
            TaskInput::Check => Work::Each(Task::Check),
            TaskInput::AcceptGifts { only_own } => Work::Each(Task::AcceptGifts {
                only_from: only_own.then(|| {
                    contents
                        .accounts
                        .iter()
                        .filter_map(|account| account.steam_id)
                        .collect()
                }),
            }),
            TaskInput::Profile {
                name_template,
                privacy,
                avatar,
            } => Work::Each(Task::Profile(profile_task(
                name_template,
                privacy,
                avatar,
                account_names.len(),
            )?)),
            TaskInput::MoveToStorage { storage, game } => {
                contents.account(&storage).ok_or_else(no_such_account)?;
                // The storage account has nothing to send to itself.
                account_names.retain(|name| *name != storage);
                Work::MoveTo { storage, game }
            }
        }
    };
    if account_names.is_empty() {
        return Err(CommandError::Failed("pick at least one account".to_owned()));
    }

    let cancelled = Arc::new(AtomicBool::new(false));
    let id = {
        let mut book = tasks.book();
        book.last_id += 1;
        let id = book.last_id;
        book.jobs.push(Job {
            id,
            title,
            target,
            runs: account_names
                .iter()
                .map(|account_name| Run {
                    account_name: account_name.clone(),
                    tries: 0,
                    state: RunState::Waiting,
                })
                .collect(),
            started_at: now(),
            finished_at: None,
            cancelled: cancelled.clone(),
        });
        let finished = book
            .jobs
            .iter()
            .filter(|job| job.finished_at.is_some())
            .count();
        if finished > KEEP_FINISHED {
            let mut extra = finished - KEEP_FINISHED;
            book.jobs.retain(|job| {
                let drop = extra > 0 && job.finished_at.is_some();
                extra -= usize::from(drop);
                !drop
            });
        }
        id
    };

    let at_once = pacing.at_once.clamp(1, MAX_AT_ONCE);
    thread::spawn(move || {
        let line: Mutex<VecDeque<usize>> = Mutex::new((0..account_names.len()).collect());
        thread::scope(|scope| {
            for _ in 0..at_once {
                scope.spawn(|| worker(&app, id, &work, &account_names, &line, &pacing, &cancelled));
            }
        });
        let tasks = app.state::<Tasks>();
        let mut book = tasks.book();
        if let Some(job) = book.jobs.iter_mut().find(|job| job.id == id) {
            for run in &mut job.runs {
                if matches!(run.state, RunState::Waiting) {
                    run.state = RunState::Skipped;
                }
            }
            job.finished_at = Some(now());
        }
    });
    Ok(id)
}

fn profile_task(
    name_template: Option<String>,
    privacy: PrivacyChanges,
    avatar: Option<Vec<u8>>,
    count: usize,
) -> Result<ProfileTask, CommandError> {
    let fail = |reason: &str| Err(CommandError::Failed(reason.to_owned()));
    let name_template = name_template.filter(|template| !template.trim().is_empty());
    if name_template.is_none() && privacy == PrivacyChanges::default() && avatar.is_none() {
        return fail("pick something to change");
    }
    // `{n}` is longest for the last account.
    if let Some(template) = &name_template
        && persona_name(template, count).chars().count() > MAX_PERSONA_NAME
    {
        return fail("the nickname would be over 32 characters");
    }
    if let Some(image) = &avatar {
        if image.len() > MAX_AVATAR_LEN {
            return fail("the image is over 1 MB");
        }
        if AvatarImage::of(image).is_none() {
            return fail("the image isn't a JPEG, PNG or GIF");
        }
    }
    Ok(ProfileTask {
        name_template,
        privacy,
        avatar,
    })
}

/// One worker: takes accounts off the line until it's empty or the job stops.
fn worker(
    app: &AppHandle,
    job: u32,
    work: &Work,
    account_names: &[String],
    line: &Mutex<VecDeque<usize>>,
    pacing: &Pacing,
    cancelled: &AtomicBool,
) {
    let tasks = app.state::<Tasks>();
    let state = app.state::<VaultState>();
    let mut first = true;
    loop {
        if cancelled.load(Ordering::Relaxed) {
            return;
        }
        let Some(run) = line
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .pop_front()
        else {
            return;
        };
        if !first {
            thread::sleep(Duration::from_secs(random_between(
                pacing.pause_min,
                pacing.pause_max,
            )));
            if cancelled.load(Ordering::Relaxed) {
                return;
            }
        }
        first = false;

        let tries = tasks
            .book()
            .jobs
            .iter()
            .find(|known| known.id == job)
            .map_or(0, |job| job.runs[run].tries)
            + 1;
        tasks.set(job, run, RunState::Running, Some(tries));
        let next = match run_one(app, &state, work, &account_names[run], run + 1) {
            Ok(Outcome::Done(note)) => RunState::Done { note },
            Ok(Outcome::Warning(note)) => RunState::Warning { note },
            Err(Failed::Vault(CommandError::Locked)) => {
                // Nothing more can run without the vault's secrets.
                cancelled.store(true, Ordering::Relaxed);
                RunState::Failed {
                    reason: "the vault was locked".to_owned(),
                }
            }
            // A dead session won't come back by trying again; anything else from Steam may.
            Err(failed)
                if pacing.retry
                    && tries < MAX_TRIES
                    && failed
                        .steam()
                        .is_some_and(|err| !matches!(err, SteamError::SessionExpired)) =>
            {
                line.lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .push_back(run);
                RunState::Waiting
            }
            Err(Failed::Steam(err)) => RunState::Failed {
                reason: err.to_string(),
            },
            Err(Failed::Storage(name, err)) => RunState::Failed {
                reason: format!("{name}: {err}"),
            },
            Err(Failed::Vault(err)) => RunState::Failed {
                reason: match err {
                    CommandError::Failed(reason) => reason,
                    _ => "the vault couldn't be read".to_owned(),
                },
            },
        };
        tasks.set(job, run, next, None);
    }
}

enum Failed {
    Steam(SteamError),
    /// From the storage account a move goes to, by its name.
    Storage(String, SteamError),
    Vault(CommandError),
}

impl Failed {
    fn steam(&self) -> Option<&SteamError> {
        match self {
            Self::Steam(err) | Self::Storage(_, err) => Some(err),
            Self::Vault(_) => None,
        }
    }
}

impl From<CommandError> for Failed {
    fn from(err: CommandError) -> Self {
        Self::Vault(err)
    }
}

impl From<DamagedContents> for Failed {
    fn from(err: DamagedContents) -> Self {
        Self::Vault(err.into())
    }
}

impl From<VaultError> for Failed {
    fn from(err: VaultError) -> Self {
        Self::Vault(err.into())
    }
}

/// Runs the work for the account at `number` in the job, from 1, and saves what
/// changed on the accounts it took.
fn run_one(
    app: &AppHandle,
    state: &VaultState,
    work: &Work,
    account_name: &str,
    number: usize,
) -> Result<Outcome, Failed> {
    let (mut account, proxy) = account_and_proxy(state, account_name)?;
    match work {
        Work::Each(task) => {
            let result = tasks::run(task, &mut account, proxy.as_ref(), now(), number);
            if let Err(SteamError::SessionExpired) = result {
                account.session = None;
            }
            save(state, &[&account])?;
            result.map_err(Failed::Steam)
        }
        Work::MoveTo { storage, game } => {
            let (mut to, to_proxy) = account_and_proxy(state, storage)?;
            let result = tasks::move_to_storage(
                Side {
                    account: &mut account,
                    proxy: proxy.as_ref(),
                },
                Side {
                    account: &mut to,
                    proxy: to_proxy.as_ref(),
                },
                *game,
            );
            match result {
                Err(moves::Failed::From(SteamError::SessionExpired)) => account.session = None,
                Err(moves::Failed::To(SteamError::SessionExpired)) => to.session = None,
                _ => {}
            }
            save(state, &[&account, &to])?;
            // What moved is no longer where the inventory screen last saw it.
            app.state::<InventoryCache>()
                .forget_blocking(&[account_name, storage]);
            result.map_err(|failed| match failed {
                moves::Failed::From(err) => Failed::Steam(err),
                moves::Failed::To(err) => Failed::Storage(storage.clone(), err),
            })
        }
    }
}

/// Saves the sessions and profiles the accounts came back with.
fn save(state: &VaultState, accounts: &[&Account]) -> Result<(), Failed> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    for account in accounts {
        let stored = contents
            .account_mut(&account.account_name)
            .ok_or_else(no_such_account)?;
        stored.session = account.session.clone();
        if account.profile.is_some() {
            stored.profile = account.profile.clone();
        }
    }
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

/// Jobs newest first.
#[tauri::command]
pub fn task_queue(tasks: State<'_, Tasks>) -> Vec<JobView> {
    tasks
        .book()
        .jobs
        .iter()
        .rev()
        .map(|job| JobView {
            id: job.id,
            title: job.title.clone(),
            target: job.target.clone(),
            runs: job.runs.clone(),
            started_at: job.started_at,
            finished_at: job.finished_at,
        })
        .collect()
}

/// Stops the job after the accounts already running; the rest are skipped.
#[tauri::command]
pub fn cancel_task(tasks: State<'_, Tasks>, id: u32) {
    if let Some(job) = tasks.book().jobs.iter().find(|job| job.id == id) {
        job.cancelled.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn clear_finished_tasks(tasks: State<'_, Tasks>) {
    tasks.book().jobs.retain(|job| job.finished_at.is_none());
}

/// A number from `min` to `max`, both included. The standard library seeds each
/// `RandomState` afresh, which is plenty to keep pauses from looking regular.
fn random_between(min: u32, max: u32) -> u64 {
    if max <= min {
        return u64::from(min);
    }
    let spread = u64::from(max - min) + 1;
    u64::from(min) + RandomState::new().build_hasher().finish() % spread
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pauses_stay_in_range_and_vary() {
        let pauses: Vec<u64> = (0..200).map(|_| random_between(5, 20)).collect();
        assert!(pauses.iter().all(|pause| (5..=20).contains(pause)));
        assert!(pauses.iter().any(|&pause| pause != pauses[0]));
        assert_eq!(random_between(3, 3), 3);
        assert_eq!(random_between(0, 0), 0);
    }
}
