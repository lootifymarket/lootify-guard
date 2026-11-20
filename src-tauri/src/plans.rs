use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use lootify_guard_core::contents::Contents;
use lootify_guard_core::descriptions::{self, DescriptionSource};
use lootify_guard_core::plans::{
    self, MAX_DAYS, Plan, PlanAccount, Step, Window, record_done, record_failed,
};
use lootify_guard_core::tasks::{Outcome, Task};
use lootify_guard_core::wishlist::{self, MAX_APPS};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::settings::SettingsState;
use crate::tasks::{
    self, StepRun, Tasks, WishlistSize, app_ids, group_links, random_between, web_copies,
};
use crate::vault::{CommandError, VaultState};

// How often the plans are looked at for a step that's due.
const CHECK_EVERY: Duration = Duration::from_secs(30);
// After a step, before the next account's, in seconds: plans never rush.
const PAUSE: (u32, u32) = (20, 90);

/// Warm-up plans as the vault had them at the last unlock, with what changed since.
/// They hold logins and steps, no secrets.
#[derive(Default)]
pub struct Plans(Mutex<Book>);

#[derive(Default)]
struct Book {
    /// Read from the vault at the first unlock; `None` until then.
    plans: Option<Vec<Plan>>,
    /// Changed while the vault was locked, so the vault still has to get them.
    unsaved: bool,
    /// Plans whose accounts `Tasks` holds, so they go on while the vault is locked.
    holding: HashSet<u32>,
}

impl Book {
    /// Writes the plans to the vault, or remembers to once it opens.
    fn persist(&mut self, state: &VaultState) {
        let Some(plans) = &self.plans else {
            return;
        };
        let mut unlocked = state.unlocked();
        let saved = unlocked.as_mut().is_some_and(|vault| {
            Contents::from_bytes(vault.data()).is_ok_and(|mut contents| {
                contents.plans = plans.clone();
                vault.save_data(contents.to_bytes()).is_ok()
            })
        });
        self.unsaved = !saved;
    }
}

impl Plans {
    fn book(&self) -> MutexGuard<'_, Book> {
        // A panic elsewhere can't leave the book half-updated, so a poisoned lock is safe to reuse.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Called whenever the vault opens: reads the plans the first time, and after
    /// that gives the vault what changed while it was locked. When the user asks,
    /// holds the accounts so the plans go on through the next lock.
    pub(crate) fn opened(&self, app: &AppHandle) {
        let state = app.state::<VaultState>();
        let mut book = self.book();
        if book.plans.is_none() {
            let unlocked = state.unlocked();
            let Some(vault) = unlocked.as_ref() else {
                return;
            };
            let Ok(contents) = Contents::from_bytes(vault.data()) else {
                return;
            };
            book.plans = Some(contents.plans);
        } else if book.unsaved {
            book.persist(&state);
        }
        if app.state::<SettingsState>().get().tasks_while_locked {
            hold_all(app, &mut book);
        }
    }

    /// For when the user turns holding off; `Tasks` has dropped the copies already.
    pub(crate) fn forget_held(&self) {
        self.book().holding.clear();
    }

    /// The step due next, if any, with whom it's for. A plan whose steps moved
    /// along for missed days is saved so.
    fn next_due(&self, state: &VaultState, now: u64) -> Option<(u32, String, Step)> {
        let mut book = self.book();
        let mut due = Vec::new();
        let mut moved = false;
        for plan in book.plans.iter_mut().flatten() {
            let window = plan.window;
            for account in &mut plan.accounts {
                let before = account.next().map(|scheduled| scheduled.at);
                let step = plans::due(account, window, now);
                moved |= account.next().map(|scheduled| scheduled.at) != before;
                if let Some(step) = step {
                    due.push((plan.id, account.account_name.clone(), step));
                }
            }
        }
        if moved {
            book.persist(state);
        }
        // Not in the order they were added, or the first accounts would always go first.
        (!due.is_empty()).then(|| due.swap_remove(random_between(0, due.len() as u32 - 1) as usize))
    }

    fn task(&self, plan_id: u32, account_name: &str, step: Step) -> Option<Task> {
        let book = self.book();
        let plan = book
            .plans
            .iter()
            .flatten()
            .find(|plan| plan.id == plan_id)?;
        let account = plan
            .accounts
            .iter()
            .find(|account| account.account_name == account_name)?;
        Some(plan.task(account, step))
    }

    fn record(&self, app: &AppHandle, plan_id: u32, account_name: &str, run: StepRun) {
        let mut guard = self.book();
        let book = &mut *guard;
        let Some(plan) = book
            .plans
            .iter_mut()
            .flatten()
            .find(|plan| plan.id == plan_id)
        else {
            return;
        };
        let Some(account) = plan
            .accounts
            .iter_mut()
            .find(|account| account.account_name == account_name)
        else {
            return;
        };
        match run {
            StepRun::Done(Outcome::Done(note) | Outcome::Warning(note)) => {
                record_done(account, note)
            }
            StepRun::Failed { reason, for_good } => record_failed(account, reason, for_good),
            StepRun::Locked => return,
        }
        let finished = plan.finished().then(|| names(plan));
        if let Some(names) = finished
            && book.holding.remove(&plan_id)
        {
            app.state::<Tasks>().release(&names);
        }
        book.persist(&app.state());
    }
}

/// Holds the accounts of every running plan that doesn't hold them yet.
fn hold_all(app: &AppHandle, book: &mut Book) {
    let state = app.state::<VaultState>();
    let mut copies = Vec::new();
    let mut now_holding = Vec::new();
    {
        let unlocked = state.unlocked();
        let Some(vault) = unlocked.as_ref() else {
            return;
        };
        let Ok(contents) = Contents::from_bytes(vault.data()) else {
            return;
        };
        for plan in book.plans.iter().flatten() {
            if plan.finished() || book.holding.contains(&plan.id) {
                continue;
            }
            // Accounts taken out of the vault since are left to fail on their own.
            let present: Vec<String> = names(plan)
                .into_iter()
                .filter(|name| contents.account(name).is_some())
                .collect();
            if let Ok(found) = web_copies(&contents, &present) {
                copies.extend(found);
                now_holding.push(plan.id);
            }
        }
    }
    // The vault's lock is let go first: `Tasks` takes it the other way round.
    app.state::<Tasks>().hold(copies);
    book.holding.extend(now_holding);
}

fn names(plan: &Plan) -> Vec<String> {
    plan.accounts
        .iter()
        .map(|account| account.account_name.clone())
        .collect()
}

/// Does the steps that come due, one account at a time, for as long as the app runs.
pub fn watch(app: AppHandle) {
    thread::spawn(move || {
        loop {
            thread::sleep(CHECK_EVERY);
            let plans = app.state::<Plans>();
            let Some((plan_id, account_name, step)) = plans.next_due(&app.state(), tasks::now())
            else {
                continue;
            };
            let Some(task) = plans.task(plan_id, &account_name, step) else {
                continue;
            };
            let run = tasks::run_step(&app, task, &account_name);
            let ran = !matches!(run, StepRun::Locked);
            plans.record(&app, plan_id, &account_name, run);
            if ran {
                thread::sleep(Duration::from_secs(random_between(PAUSE.0, PAUSE.1)));
            }
        }
    });
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WishlistInput {
    /// As typed, or nothing for the built-in popular games.
    games: String,
    size: WishlistSize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanRequest {
    /// What it runs on, like a group's name.
    target: String,
    account_names: Vec<String>,
    days: u32,
    window: Window,
    description: Option<DescriptionSource>,
    /// Group links as typed.
    groups: Option<String>,
    wishlist: Option<WishlistInput>,
    queue: bool,
}

#[tauri::command]
pub fn start_plan(
    app: AppHandle,
    state: State<'_, VaultState>,
    plans: State<'_, Plans>,
    request: PlanRequest,
) -> Result<u32, CommandError> {
    let fail = |reason: &str| Err(CommandError::Failed(reason.to_owned()));
    let PlanRequest {
        target,
        account_names,
        days,
        window,
        description,
        groups,
        wishlist,
        queue,
    } = request;
    if account_names.is_empty() {
        return fail("pick at least one account");
    }
    if !(1..=MAX_DAYS).contains(&days) {
        return fail("a plan lasts from 1 to 30 days");
    }
    if window.from_hour >= window.to_hour || window.to_hour > 24 {
        return fail("the hours have to end later than they start");
    }
    let groups = match groups.as_deref() {
        Some(text) => group_links(text)?,
        None => Vec::new(),
    };
    let (apps, wishlist_size) = match &wishlist {
        Some(WishlistInput { games, size }) => {
            let apps = app_ids(games)?.unwrap_or_else(|| wishlist::POPULAR.to_vec());
            if apps.len() > MAX_APPS {
                return Err(CommandError::Failed(format!(
                    "list at most {MAX_APPS} games"
                )));
            }
            (apps, size.range())
        }
        None => (Vec::new(), (1, 1)),
    };
    let steps: Vec<Step> = [
        description.is_some().then_some(Step::Description),
        (!groups.is_empty()).then_some(Step::Groups),
        wishlist.is_some().then_some(Step::Wishlist),
        queue.then_some(Step::Queue),
    ]
    .into_iter()
    .flatten()
    .collect();
    if steps.is_empty() {
        return fail("pick at least one step");
    }
    let texts = description
        .map(|source| descriptions::for_accounts(&source, account_names.len()))
        .transpose()
        .map_err(|err| CommandError::Failed(err.to_string()))?;

    let now = tasks::now();
    let mut book = plans.book();
    let plan = {
        let mut unlocked = state.unlocked();
        let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
        let mut contents = Contents::from_bytes(vault.data())?;
        for name in &account_names {
            if contents.account(name).is_none() {
                return fail("the account is no longer in the vault");
            }
        }
        contents.last_plan_id += 1;
        let plan = Plan {
            id: contents.last_plan_id,
            target,
            started_at: now,
            days,
            window,
            groups,
            apps,
            wishlist_size,
            accounts: account_names
                .into_iter()
                .enumerate()
                .map(|(index, account_name)| PlanAccount {
                    account_name,
                    steps: plans::schedule(&steps, days, window, now),
                    description: texts.as_ref().map(|texts| texts[index].clone()),
                    note: None,
                    stopped: false,
                })
                .collect(),
        };
        // What's in memory is the newest; the vault has caught up with it by now.
        let mut all = book.plans.take().unwrap_or_else(|| contents.plans.clone());
        all.push(plan.clone());
        contents.plans = all.clone();
        vault.save_data(contents.to_bytes())?;
        book.plans = Some(all);
        book.unsaved = false;
        plan
    };
    if app.state::<SettingsState>().get().tasks_while_locked {
        hold_all(&app, &mut book);
    }
    Ok(plan.id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanView {
    id: u32,
    target: String,
    started_at: u64,
    /// The day it's on, from 1.
    day: u32,
    days: u32,
    /// Steps of today, by its window's clock, and how many of them are done.
    today: usize,
    done_today: usize,
    /// When the next step is due, in Unix seconds; `None` once it's finished.
    next_at: Option<u64>,
    finished: bool,
    accounts: Vec<PlanAccountView>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanAccountView {
    account_name: String,
    note: Option<String>,
    /// `waiting`, `done` or `stopped`.
    state: &'static str,
    next_at: Option<u64>,
}

/// Plans for the queue, newest first.
#[tauri::command]
pub fn plan_queue(plans: State<'_, Plans>) -> Vec<PlanView> {
    let now = tasks::now();
    let book = plans.book();
    book.plans
        .iter()
        .flatten()
        .rev()
        .map(|plan| {
            let today: Vec<_> = plan
                .accounts
                .iter()
                .flat_map(|account| &account.steps)
                .filter(|scheduled| same_day(plan.window, scheduled.at, now))
                .collect();
            PlanView {
                id: plan.id,
                target: plan.target.clone(),
                started_at: plan.started_at,
                day: plan.day(now),
                days: plan.days,
                done_today: today.iter().filter(|scheduled| scheduled.done).count(),
                today: today.len(),
                next_at: plan
                    .accounts
                    .iter()
                    .filter_map(|account| account.next().map(|scheduled| scheduled.at))
                    .min(),
                finished: plan.finished(),
                accounts: plan
                    .accounts
                    .iter()
                    .map(|account| PlanAccountView {
                        account_name: account.account_name.clone(),
                        note: account.note.clone(),
                        state: if account.stopped {
                            "stopped"
                        } else if account.finished() {
                            "done"
                        } else {
                            "waiting"
                        },
                        next_at: account.next().map(|scheduled| scheduled.at),
                    })
                    .collect(),
            }
        })
        .collect()
}

fn same_day(window: Window, at: u64, now: u64) -> bool {
    // Whole days apart, by the window's clock.
    let start = |at: u64| at as i64 + i64::from(window.utc_offset_minutes) * 60;
    start(at).div_euclid(86_400) == start(now).div_euclid(86_400)
}

/// Stops the plan and forgets it; what its steps did stays done.
#[tauri::command]
pub fn cancel_plan(
    state: State<'_, VaultState>,
    tasks: State<'_, Tasks>,
    plans: State<'_, Plans>,
    id: u32,
) -> Result<(), CommandError> {
    let mut guard = plans.book();
    let book = &mut *guard;
    let Some(all) = book.plans.as_mut() else {
        return Ok(());
    };
    let Some(at) = all.iter().position(|plan| plan.id == id) else {
        return Ok(());
    };
    let plan = all.remove(at);
    if book.holding.remove(&id) {
        tasks.release(&names(&plan));
    }
    book.persist(&state);
    Ok(())
}

/// Takes finished plans off the queue, with the jobs `clear_finished_tasks` takes.
pub(crate) fn clear_finished(state: &VaultState, plans: &Plans) {
    let mut book = plans.book();
    let Some(all) = book.plans.as_mut() else {
        return;
    };
    let before = all.len();
    all.retain(|plan| !plan.finished());
    if all.len() != before {
        book.persist(state);
    }
}
