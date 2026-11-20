use std::collections::hash_map::RandomState;
use std::collections::{HashMap, VecDeque};
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use lootify_guard_core::cm::MAX_GAMES;
use lootify_guard_core::contents::{Account, Contents, DamagedContents};
use lootify_guard_core::descriptions::{self, DescriptionSource};
use lootify_guard_core::events::MAX_QUEUES;
use lootify_guard_core::games::PlayingList;
use lootify_guard_core::inventory::Game;
use lootify_guard_core::licenses::{self, License, MAX_LICENSES};
use lootify_guard_core::moves::{self, Side};
use lootify_guard_core::profile_settings::{AvatarImage, MAX_AVATAR_LEN};
use lootify_guard_core::proxy::ProxyAddress;
use lootify_guard_core::steam::SteamError;
use lootify_guard_core::steam_groups::{self, MAX_GROUPS};
use lootify_guard_core::tasks::{
    self, MAX_PERSONA_NAME, Outcome, PrivacyChanges, ProfileTask, Task, longest_persona_name,
};
use lootify_guard_core::vault::VaultError;
use lootify_guard_core::wishlist::{self, MAX_APPS};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::accounts::{account_and_proxy, no_such_account};
use crate::farming::Farms;
use crate::inventory::InventoryCache;
use crate::plans::Plans;
use crate::playing::{self, Players};
use crate::settings::SettingsState;
use crate::vault::{CommandError, VaultState};

// A failed account goes to the back of the line, up to this many tries in all.
const MAX_TRIES: u8 = 3;
const MAX_AT_ONCE: u8 = 10;
// Finished jobs are dropped past this many, oldest first.
const KEEP_FINISHED: usize = 20;

/// Bulk tasks, running and finished. Kept in memory only; they hold logins and
/// short notes, and, when the user asks, the web sessions of the accounts jobs
/// run on, never their passwords or Guard secrets.
#[derive(Default)]
pub struct Tasks(Mutex<Book>);

#[derive(Default)]
struct Book {
    last_id: u32,
    jobs: Vec<Job>,
    /// By login: copies that let jobs go on while the vault is locked.
    held: HashMap<String, Held>,
}

/// An account as a job on the web needs it, from `Account::for_web_tasks`.
struct Held {
    account: Account,
    proxy: Option<ProxyAddress>,
    /// Jobs still running on it.
    jobs: usize,
    /// It changed while the vault was locked, so the vault still has to get it.
    unsaved: bool,
}

impl Book {
    fn hold(&mut self, copies: Vec<(Account, Option<ProxyAddress>)>) {
        for (account, proxy) in copies {
            self.held
                .entry(account.account_name.clone())
                .and_modify(|held| held.jobs += 1)
                .or_insert(Held {
                    account,
                    proxy,
                    jobs: 1,
                    unsaved: false,
                });
        }
    }

    /// Lets go of the copies a finished job held, except ones the vault still needs.
    fn release(&mut self, account_names: &[String]) {
        for name in account_names {
            if let Some(held) = self.held.get_mut(name) {
                held.jobs = held.jobs.saturating_sub(1);
            }
        }
        self.held.retain(|_, held| held.jobs > 0 || held.unsaved);
    }
}

struct Job {
    id: u32,
    /// The task's kind as the page names it, to tell which tasks are running.
    kind: &'static str,
    title: String,
    /// What it runs on, like a group's name.
    target: String,
    runs: Vec<Run>,
    started_at: u64,
    finished_at: Option<u64>,
    cancelled: Arc<AtomicBool>,
    /// Its accounts are held so it can go on while the vault is locked.
    holds: bool,
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
    kind: &'static str,
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
        description: Option<DescriptionSource>,
        privacy: PrivacyChanges,
        avatar: Option<Vec<u8>>,
    },
    /// Store links or IDs, as the user typed them.
    FreeGames {
        licenses: String,
    },
    /// Games as typed, or nothing for each account's own list.
    HourBoost {
        games: String,
    },
    GoOffline,
    CardFarming,
    #[serde(rename_all = "camelCase")]
    Events {
        queues: u8,
        claim_item: bool,
    },
    #[serde(rename_all = "camelCase")]
    MoveToStorage {
        storage: String,
        game: Game,
    },
    /// Group links as typed, and the most to join in one run.
    #[serde(rename_all = "camelCase")]
    JoinGroups {
        groups: String,
        per_run: usize,
    },
    /// Games as typed, or nothing for the built-in popular ones.
    Wishlist {
        games: String,
        size: WishlistSize,
    },
}

/// How many games one Wishlist run adds to each account.
#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WishlistSize {
    Small,
    Medium,
    Large,
}

impl WishlistSize {
    pub(crate) fn range(self) -> (usize, usize) {
        match self {
            Self::Small => (2, 4),
            Self::Medium => (3, 8),
            Self::Large => (5, 12),
        }
    }
}

impl TaskInput {
    fn kind(&self) -> &'static str {
        match self {
            Self::Check => "check",
            Self::AcceptGifts { .. } => "acceptGifts",
            Self::Profile { .. } => "profile",
            Self::FreeGames { .. } => "freeGames",
            Self::HourBoost { .. } => "hourBoost",
            Self::GoOffline => "goOffline",
            Self::CardFarming => "cardFarming",
            Self::Events { .. } => "events",
            Self::MoveToStorage { .. } => "moveToStorage",
            Self::JoinGroups { .. } => "joinGroups",
            Self::Wishlist { .. } => "wishlist",
        }
    }
}

/// What each account of a job does.
enum Work {
    Each(Task),
    /// Takes two accounts, so it's done here rather than as a core task.
    MoveTo {
        storage: String,
        game: Game,
    },
    /// Plays these games, or each account's own list, on a connection that stays up.
    Play(Option<Vec<u32>>),
    GoOffline,
    /// Plays the games with card drops left until they run out.
    Farm,
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

    fn held(&self, account_name: &str) -> Option<(Account, Option<ProxyAddress>)> {
        self.book()
            .held
            .get(account_name)
            .map(|held| (held.account.clone(), held.proxy.clone()))
    }

    /// Holds copies of the accounts, for a plan, the way a job holds its own.
    pub(crate) fn hold(&self, copies: Vec<(Account, Option<ProxyAddress>)>) {
        self.book().hold(copies);
    }

    pub(crate) fn release(&self, account_names: &[String]) {
        self.book().release(account_names);
    }

    /// Keeps the copy up to date with what a run brought back. Returns whether
    /// the account is held at all.
    fn keep(&self, account: &Account, unsaved: bool) -> bool {
        let mut book = self.book();
        let Some(held) = book.held.get_mut(&account.account_name) else {
            return false;
        };
        held.account = account.for_web_tasks();
        held.unsaved |= unsaved;
        true
    }

    /// Gives the vault what changed while it was locked. Called once it opens.
    pub(crate) fn save_held(&self, state: &VaultState) {
        let mut book = self.book();
        if !book.held.values().any(|held| held.unsaved) {
            return;
        }
        let mut unlocked = state.unlocked();
        let Some(vault) = unlocked.as_mut() else {
            return;
        };
        let Ok(mut contents) = Contents::from_bytes(vault.data()) else {
            return;
        };
        for held in book.held.values().filter(|held| held.unsaved) {
            // One removed meanwhile has nowhere to go.
            if let Some(stored) = contents.account_mut(&held.account.account_name) {
                copy_back(stored, &held.account);
            }
        }
        if vault.save_data(contents.to_bytes()).is_ok() {
            for held in book.held.values_mut() {
                held.unsaved = false;
            }
            book.held.retain(|_, held| held.jobs > 0);
        }
    }

    /// For when the user turns holding off: what's held goes, the vault getting
    /// what it still needs first.
    pub(crate) fn drop_held(&self, state: &VaultState) {
        self.save_held(state);
        self.book().held.clear();
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
    let kind = task.kind();
    let keep_going = app.state::<SettingsState>().get().tasks_while_locked;
    let (work, copies) = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        let contents = Contents::from_bytes(vault.data())?;
        for name in &account_names {
            contents.account(name).ok_or_else(no_such_account)?;
        }
        let work = match task {
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
                description,
                privacy,
                avatar,
            } => Work::Each(Task::Profile(profile_task(
                name_template,
                description.as_ref(),
                privacy,
                avatar,
                account_names.len(),
            )?)),
            TaskInput::FreeGames { licenses } => {
                let licenses = licenses::parse(&licenses).map_err(|word| {
                    CommandError::Failed(format!(
                        "can't read \"{word}\": use store links, app/440 or sub/12345"
                    ))
                })?;
                if licenses.is_empty() {
                    return Err(CommandError::Failed("add a game".to_owned()));
                }
                if licenses.len() > MAX_LICENSES {
                    return Err(CommandError::Failed(format!(
                        "Steam takes about {MAX_LICENSES} free games an hour, add fewer"
                    )));
                }
                Work::Each(Task::FreeGames(licenses))
            }
            TaskInput::HourBoost { games } => Work::Play(boost_games(&games)?),
            TaskInput::GoOffline => Work::GoOffline,
            TaskInput::CardFarming => Work::Farm,
            TaskInput::Events { queues, claim_item } => {
                if queues > MAX_QUEUES {
                    return Err(CommandError::Failed(format!(
                        "sales reward at most {MAX_QUEUES} queues a day"
                    )));
                }
                if queues == 0 && !claim_item {
                    return Err(CommandError::Failed("pick something to do".to_owned()));
                }
                Work::Each(Task::Events { queues, claim_item })
            }
            TaskInput::JoinGroups { groups, per_run } => {
                let groups = steam_groups::parse(&groups).map_err(|word| {
                    CommandError::Failed(format!(
                        "can't read \"{word}\": use links like steamcommunity.com/groups/name"
                    ))
                })?;
                if groups.is_empty() {
                    return Err(CommandError::Failed("add a group".to_owned()));
                }
                if groups.len() > MAX_GROUPS {
                    return Err(CommandError::Failed(format!(
                        "list at most {MAX_GROUPS} groups"
                    )));
                }
                Work::Each(Task::JoinGroups {
                    groups,
                    per_run: (1, per_run.clamp(1, 3)),
                })
            }
            TaskInput::Wishlist { games, size } => {
                let apps = match app_ids(&games)? {
                    Some(apps) if apps.len() > MAX_APPS => {
                        return Err(CommandError::Failed(format!(
                            "list at most {MAX_APPS} games"
                        )));
                    }
                    Some(apps) => apps,
                    None => wishlist::POPULAR.to_vec(),
                };
                Work::Each(Task::Wishlist {
                    apps,
                    per_run: size.range(),
                })
            }
            TaskInput::MoveToStorage { storage, game } => {
                contents.account(&storage).ok_or_else(no_such_account)?;
                // The storage account has nothing to send to itself.
                account_names.retain(|name| *name != storage);
                Work::MoveTo { storage, game }
            }
        };
        // Only tasks on the web can do with a session alone.
        let copies = if keep_going && matches!(work, Work::Each(_)) {
            web_copies(&contents, &account_names)?
        } else {
            Vec::new()
        };
        (work, copies)
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
            kind,
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
            holds: !copies.is_empty(),
        });
        book.hold(copies);
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
            if job.holds {
                book.release(&account_names);
            }
        }
        drop(book);
        tasks.save_held(&app.state());
    });
    Ok(id)
}

/// The accounts as tasks on the web need them, to hold while the vault is locked.
pub(crate) fn web_copies(
    contents: &Contents,
    account_names: &[String],
) -> Result<Vec<(Account, Option<ProxyAddress>)>, CommandError> {
    account_names
        .iter()
        .map(|name| {
            let account = contents.account(name).ok_or_else(no_such_account)?;
            let proxy = contents
                .proxy_of(account)?
                .map(|proxy| proxy.address.clone());
            Ok((account.for_web_tasks(), proxy))
        })
        .collect()
}

/// How one step of a plan went.
pub(crate) enum StepRun {
    Done(Outcome),
    /// `for_good` when trying again can't help, like when the session ended.
    Failed {
        reason: String,
        for_good: bool,
    },
    /// The vault is locked and nothing holds the account: the step waits.
    Locked,
}

/// Runs one task on one account for a plan, as a job's worker would.
pub(crate) fn run_step(app: &AppHandle, task: Task, account_name: &str) -> StepRun {
    let state = app.state::<VaultState>();
    match run_one(app, &state, &Work::Each(task), account_name, 1) {
        Ok(outcome) => StepRun::Done(outcome),
        Err(Failed::Vault(CommandError::Locked)) => StepRun::Locked,
        Err(Failed::Steam(err) | Failed::Storage(_, err)) => StepRun::Failed {
            for_good: matches!(err, SteamError::SessionExpired),
            reason: err.to_string(),
        },
        // Like an account taken out of the vault.
        Err(Failed::Vault(CommandError::Failed(reason))) => StepRun::Failed {
            reason,
            for_good: true,
        },
        Err(Failed::Vault(_)) => StepRun::Failed {
            reason: "the vault couldn't be read".to_owned(),
            for_good: false,
        },
    }
}

fn boost_games(text: &str) -> Result<Option<Vec<u32>>, CommandError> {
    let games = app_ids(text)?;
    if games.as_ref().is_some_and(|games| games.len() > MAX_GAMES) {
        return Err(CommandError::Failed(format!(
            "Steam plays at most {MAX_GAMES} games at once"
        )));
    }
    Ok(games)
}

/// App IDs as typed, or `None` when nothing was.
pub(crate) fn app_ids(text: &str) -> Result<Option<Vec<u32>>, CommandError> {
    let licenses = licenses::parse(text).map_err(|word| {
        CommandError::Failed(format!("can't read \"{word}\": use app IDs or store links"))
    })?;
    if licenses.is_empty() {
        return Ok(None);
    }
    licenses
        .into_iter()
        .map(|license| match license {
            License::App(id) => Ok(id),
            License::Package(id) => Err(CommandError::Failed(format!(
                "sub {id} is a package, use its app ID"
            ))),
        })
        .collect::<Result<_, _>>()
        .map(Some)
}

fn profile_task(
    name_template: Option<String>,
    description: Option<&DescriptionSource>,
    privacy: PrivacyChanges,
    avatar: Option<Vec<u8>>,
    count: usize,
) -> Result<ProfileTask, CommandError> {
    let fail = |reason: &str| Err(CommandError::Failed(reason.to_owned()));
    let name_template = name_template.filter(|template| !template.trim().is_empty());
    if name_template.is_none()
        && description.is_none()
        && privacy == PrivacyChanges::default()
        && avatar.is_none()
    {
        return fail("pick something to change");
    }
    let descriptions = description
        .map(|source| descriptions::for_accounts(source, count))
        .transpose()
        .map_err(|err| CommandError::Failed(err.to_string()))?;
    if let Some(template) = &name_template
        && longest_persona_name(template, count) > MAX_PERSONA_NAME
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
        descriptions,
        privacy,
        avatar,
    })
}

/// A few descriptions as a Profile task would make them, to show before it runs.
#[tauri::command]
pub fn description_samples(description: DescriptionSource) -> Result<Vec<String>, CommandError> {
    descriptions::for_accounts(&description, 2).map_err(|err| CommandError::Failed(err.to_string()))
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
    let tasks = app.state::<Tasks>();
    // What changed while the vault was locked goes in first, once it's open again.
    tasks.save_held(state);
    let (mut account, proxy) = match account_and_proxy(state, account_name) {
        Err(CommandError::Locked) if matches!(work, Work::Each(_)) => {
            tasks.held(account_name).ok_or(CommandError::Locked)?
        }
        found => found?,
    };
    match work {
        Work::Each(task) => {
            let result = tasks::run(task, &mut account, proxy.as_ref(), now(), number);
            if let Err(SteamError::SessionExpired) = result {
                account.session = None;
            }
            match save(state, &[&account]) {
                Ok(()) => {
                    tasks.keep(&account, false);
                }
                Err(Failed::Vault(CommandError::Locked)) if tasks.keep(&account, true) => {}
                Err(err) => return Err(err),
            }
            result.map_err(Failed::Steam)
        }
        Work::Play(games) => {
            let list = match games {
                Some(games) => PlayingList {
                    games: games.clone(),
                    ..account.playing.clone()
                },
                None => account.playing.clone(),
            };
            let count = list.games.len();
            playing::start(app, state, account_name, list)?;
            app.state::<Players>()
                .wait_started(account_name)
                .map_err(|reason| Failed::Vault(CommandError::Failed(reason)))?;
            Ok(Outcome::Done(match count {
                1 => "Playing 1 game".to_owned(),
                n => format!("Playing {n} games"),
            }))
        }
        Work::Farm => {
            let farms = app.state::<Farms>();
            farms.start(app, account_name);
            farms
                .wait_started(account_name)
                .map(Outcome::Done)
                .map_err(|reason| Failed::Vault(CommandError::Failed(reason)))
        }
        Work::GoOffline => Ok(Outcome::Done(
            if playing::stop(app, account_name) {
                "Offline"
            } else {
                "Wasn't playing"
            }
            .to_owned(),
        )),
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
        copy_back(stored, account);
    }
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

/// What a run may change on an account: its session, profile and last check.
fn copy_back(stored: &mut Account, account: &Account) {
    stored.session = account.session.clone();
    if account.profile.is_some() {
        stored.profile = account.profile.clone();
    }
    if account.last_check.is_some() {
        stored.last_check = account.last_check.clone();
    }
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
            kind: job.kind,
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
pub fn clear_finished_tasks(
    state: State<'_, VaultState>,
    tasks: State<'_, Tasks>,
    plans: State<'_, Plans>,
) {
    tasks.book().jobs.retain(|job| job.finished_at.is_none());
    crate::plans::clear_finished(&state, &plans);
}

/// A number from `min` to `max`, both included. The standard library seeds each
/// `RandomState` afresh, which is plenty to keep pauses from looking regular.
pub(crate) fn random_between(min: u32, max: u32) -> u64 {
    if max <= min {
        return u64::from(min);
    }
    let spread = u64::from(max - min) + 1;
    u64::from(min) + RandomState::new().build_hasher().finish() % spread
}

pub(crate) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boosts_take_app_ids_or_each_account_s_own_list() {
        assert_eq!(boost_games("  ").ok(), Some(None));
        assert_eq!(
            boost_games("730, store.steampowered.com/app/570/Dota_2/").ok(),
            Some(Some(vec![730, 570]))
        );
        assert!(boost_games("sub/12345").is_err());
        let too_many: Vec<String> = (1..=33).map(|id| id.to_string()).collect();
        assert!(boost_games(&too_many.join(" ")).is_err());
    }

    #[test]
    fn pauses_stay_in_range_and_vary() {
        let pauses: Vec<u64> = (0..200).map(|_| random_between(5, 20)).collect();
        assert!(pauses.iter().all(|pause| (5..=20).contains(pause)));
        assert!(pauses.iter().any(|&pause| pause != pauses[0]));
        assert_eq!(random_between(3, 3), 3);
        assert_eq!(random_between(0, 0), 0);
    }
}
