//! Warm-up plans: a few steps for each account, one a day at a random time,
//! spread over days, so a group of accounts fills in its profiles the way people
//! do, not all at once.

use serde::{Deserialize, Serialize};

use crate::random::{self, shuffled};
use crate::steam_groups::GroupLink;
use crate::tasks::{PrivacyChanges, ProfileTask, Task};

const DAY: u64 = 24 * 60 * 60;
/// A plan can't last longer than this many days.
pub const MAX_DAYS: u32 = 30;
/// A step that keeps failing is given up after this many tries.
pub const MAX_TRIES: u8 = 3;
// A failed step tries again this much later, if the window is still open.
const RETRY_AFTER: u64 = 2 * 60 * 60;

/// What a plan does to each of its accounts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Step {
    Description,
    /// One group from the plan's list.
    Groups,
    Wishlist,
    /// One discovery queue, like a visit to the store.
    Queue,
}

/// When the steps may run: local hours, from `from` up to `to`, by the clock of
/// the computer that made the plan.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    pub from_hour: u8,
    pub to_hour: u8,
    /// Local time minus UTC, in minutes.
    pub utc_offset_minutes: i32,
}

impl Window {
    fn offset(self) -> i64 {
        i64::from(self.utc_offset_minutes) * 60
    }

    /// The UTC time a local day starts at, for the day `at` falls on.
    fn day_start(self, at: u64) -> u64 {
        let local = at as i64 + self.offset();
        (local - local.rem_euclid(DAY as i64) - self.offset()).max(0) as u64
    }

    fn opens(self, day_start: u64) -> u64 {
        day_start + u64::from(self.from_hour) * 3600
    }

    fn closes(self, day_start: u64) -> u64 {
        day_start + u64::from(self.to_hour) * 3600
    }
}

/// A step and when it's due, in Unix seconds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scheduled {
    pub step: Step,
    pub at: u64,
    pub done: bool,
    #[serde(default)]
    pub tries: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanAccount {
    pub account_name: String,
    pub steps: Vec<Scheduled>,
    /// Made when the plan starts, so no two of its accounts get the same.
    pub description: Option<String>,
    /// How the last step went, for the queue.
    pub note: Option<String>,
    /// The last step failed and the account was left out of the rest.
    pub stopped: bool,
}

impl PlanAccount {
    pub fn finished(&self) -> bool {
        self.stopped || self.steps.iter().all(|scheduled| scheduled.done)
    }

    /// The first step not done yet.
    pub fn next(&self) -> Option<&Scheduled> {
        if self.stopped {
            return None;
        }
        self.steps.iter().find(|scheduled| !scheduled.done)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: u32,
    /// What it runs on, like a group's name.
    pub target: String,
    pub started_at: u64,
    pub days: u32,
    pub window: Window,
    pub groups: Vec<GroupLink>,
    pub apps: Vec<u32>,
    /// How many games a Wishlist step adds, from the first to the second.
    pub wishlist_size: (usize, usize),
    pub accounts: Vec<PlanAccount>,
}

impl Plan {
    /// The task that does the step for the account.
    pub fn task(&self, account: &PlanAccount, step: Step) -> Task {
        match step {
            Step::Description => Task::Profile(ProfileTask {
                name_template: None,
                descriptions: account.description.clone().map(|text| vec![text]),
                privacy: PrivacyChanges::default(),
                avatar: None,
            }),
            Step::Groups => Task::JoinGroups {
                groups: self.groups.clone(),
                per_run: (1, 1),
            },
            Step::Wishlist => Task::Wishlist {
                apps: self.apps.clone(),
                per_run: self.wishlist_size,
            },
            Step::Queue => Task::Events {
                queues: 1,
                claim_item: false,
            },
        }
    }

    pub fn finished(&self) -> bool {
        self.accounts.iter().all(PlanAccount::finished)
    }

    /// The day the plan is on, from 1, as its window's clock counts them.
    pub fn day(&self, now: u64) -> u32 {
        let first = self.window.day_start(self.started_at);
        let today = self.window.day_start(now);
        (((today.saturating_sub(first)) / DAY) as u32 + 1).min(self.days.max(1))
    }
}

/// When each step runs for one account: its own order of the steps, one a day on
/// days picked at random, at a random time in the window. Days left over go to
/// more groups and wishlist games, when the plan has them. Starts today if the
/// window is still open, else tomorrow.
pub fn schedule(steps: &[Step], days: u32, window: Window, now: u64) -> Vec<Scheduled> {
    schedule_with(steps, days, window, now, &mut random::below)
}

fn schedule_with(
    steps: &[Step],
    days: u32,
    window: Window,
    now: u64,
    pick: &mut impl FnMut(usize) -> usize,
) -> Vec<Scheduled> {
    let days = days.clamp(1, MAX_DAYS) as usize;
    let mut order = shuffled(steps, pick);
    order.truncate(days);
    let repeats: Vec<Step> = [Step::Groups, Step::Wishlist]
        .into_iter()
        .filter(|step| steps.contains(step))
        .collect();
    while !repeats.is_empty() && order.len() < days {
        order.push(repeats[pick(repeats.len())]);
    }

    let today = window.day_start(now);
    // Too late today: the first day is tomorrow.
    let first = if now + 60 >= window.closes(today) {
        today + DAY
    } else {
        today
    };
    // Which days get a step, in order.
    let mut chosen: Vec<usize> = shuffled(&(0..days).collect::<Vec<_>>(), pick);
    chosen.truncate(order.len());
    chosen.sort_unstable();

    order
        .into_iter()
        .zip(chosen)
        .map(|(step, day)| {
            let start = first + day as u64 * DAY;
            let opens = window.opens(start).max(now + 60);
            let closes = window.closes(start).max(opens + 60);
            Scheduled {
                step,
                at: opens + pick((closes - opens) as usize) as u64,
                done: false,
                tries: 0,
            }
        })
        .collect()
}

/// Marks the account's next step done, with how it went.
pub fn record_done(account: &mut PlanAccount, note: String) {
    if let Some(scheduled) = account.steps.iter_mut().find(|scheduled| !scheduled.done) {
        scheduled.done = true;
    }
    account.note = Some(note);
}

/// A step that failed tries again a little later, up to `MAX_TRIES` times, then
/// is passed over. One that can never work, like a session that ended, stops the
/// account's part in the plan.
pub fn record_failed(account: &mut PlanAccount, reason: String, for_good: bool) {
    if for_good {
        account.stopped = true;
    } else if let Some(scheduled) = account.steps.iter_mut().find(|scheduled| !scheduled.done) {
        scheduled.tries += 1;
        if scheduled.tries >= MAX_TRIES {
            scheduled.done = true;
        } else {
            scheduled.at += RETRY_AFTER;
        }
    }
    account.note = Some(reason);
}

/// The account's step due now, if any. A step whose day went by unrun moves the
/// rest along by the days missed, so they never pile up on one day.
pub fn due(account: &mut PlanAccount, window: Window, now: u64) -> Option<Step> {
    let next = account.steps.iter().position(|scheduled| !scheduled.done)?;
    if account.stopped {
        return None;
    }
    let today = window.day_start(now);
    let day = window.day_start(account.steps[next].at);
    let mut shift = today.saturating_sub(day) / DAY;
    // Its time has gone by and today's window is shut: tomorrow's, then.
    if account.steps[next].at + shift * DAY <= now && now >= window.closes(today) {
        shift += 1;
    }
    for scheduled in &mut account.steps[next..] {
        scheduled.at += shift * DAY;
    }
    let scheduled = &account.steps[next];
    (scheduled.at <= now).then_some(scheduled.step)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-11-20 00:00 UTC, a Friday.
    const MIDNIGHT: u64 = 1_795_132_800;
    const WINDOW: Window = Window {
        from_hour: 10,
        to_hour: 22,
        utc_offset_minutes: 0,
    };
    const ALL: [Step; 4] = [Step::Description, Step::Groups, Step::Wishlist, Step::Queue];

    fn local_hour(at: u64, window: Window) -> u64 {
        ((at as i64 + window.offset()).rem_euclid(DAY as i64) / 3600) as u64
    }

    #[test]
    fn days_start_at_local_midnight() {
        let kyiv = Window {
            utc_offset_minutes: 120,
            ..WINDOW
        };
        // 23:30 UTC is already the next day in Kyiv.
        assert_eq!(
            kyiv.day_start(MIDNIGHT + 23 * 3600 + 1800),
            MIDNIGHT + DAY - 7200
        );
        assert_eq!(WINDOW.day_start(MIDNIGHT + 3600), MIDNIGHT);
    }

    #[test]
    fn each_step_gets_its_own_day_in_the_window() {
        for _ in 0..200 {
            let steps = schedule(&ALL, 5, WINDOW, MIDNIGHT + 9 * 3600);
            assert_eq!(steps.len(), 5, "a day left over goes to groups or wishlist");
            let mut days: Vec<u64> = steps.iter().map(|s| WINDOW.day_start(s.at)).collect();
            assert!(
                days.windows(2).all(|pair| pair[0] < pair[1]),
                "one step a day, in order"
            );
            days.dedup();
            assert_eq!(days.len(), 5);
            for scheduled in &steps {
                let hour = local_hour(scheduled.at, WINDOW);
                assert!((10..22).contains(&hour), "{hour}");
                assert!(scheduled.at < MIDNIGHT + 5 * DAY);
            }
            for step in ALL {
                assert!(steps.iter().any(|s| s.step == step));
            }
        }
    }

    #[test]
    fn fewer_days_than_steps_leave_some_out() {
        let steps = schedule(&ALL, 2, WINDOW, MIDNIGHT);
        assert_eq!(steps.len(), 2);
    }

    #[test]
    fn without_groups_or_wishlist_spare_days_rest() {
        let steps = schedule(&[Step::Description, Step::Queue], 7, WINDOW, MIDNIGHT);
        assert_eq!(steps.len(), 2);
    }

    #[test]
    fn a_late_start_begins_tomorrow() {
        let late = MIDNIGHT + 23 * 3600;
        for scheduled in schedule(&ALL, 4, WINDOW, late) {
            assert!(scheduled.at >= MIDNIGHT + DAY + 10 * 3600);
        }
        // Mid-window, nothing is due in the past.
        let noon = MIDNIGHT + 12 * 3600;
        for scheduled in schedule(&ALL, 4, WINDOW, noon) {
            assert!(scheduled.at > noon);
        }
    }

    fn account(steps: Vec<Scheduled>) -> PlanAccount {
        PlanAccount {
            account_name: "farm_1".to_owned(),
            steps,
            description: None,
            note: None,
            stopped: false,
        }
    }

    fn at(step: Step, at: u64) -> Scheduled {
        Scheduled {
            step,
            at,
            done: false,
            tries: 0,
        }
    }

    #[test]
    fn a_step_is_due_once_its_time_comes() {
        let mut one = account(vec![at(Step::Groups, MIDNIGHT + 12 * 3600)]);
        assert_eq!(due(&mut one, WINDOW, MIDNIGHT + 11 * 3600), None);
        assert_eq!(
            due(&mut one, WINDOW, MIDNIGHT + 12 * 3600),
            Some(Step::Groups)
        );
        one.steps[0].done = true;
        assert_eq!(due(&mut one, WINDOW, MIDNIGHT + 13 * 3600), None);
        assert!(one.finished());
    }

    #[test]
    fn missed_days_move_the_rest_along() {
        let mut one = account(vec![
            at(Step::Groups, MIDNIGHT + 12 * 3600),
            at(Step::Wishlist, MIDNIGHT + DAY + 15 * 3600),
        ]);
        // The computer was off for two days; it's 11:00 on the third.
        let now = MIDNIGHT + 2 * DAY + 11 * 3600;
        assert_eq!(due(&mut one, WINDOW, now), None);
        assert_eq!(one.steps[0].at, MIDNIGHT + 2 * DAY + 12 * 3600);
        assert_eq!(one.steps[1].at, MIDNIGHT + 3 * DAY + 15 * 3600);
        assert_eq!(due(&mut one, WINDOW, now + 3600), Some(Step::Groups));
    }

    #[test]
    fn a_missed_step_after_the_window_waits_for_tomorrow() {
        let mut one = account(vec![at(Step::Groups, MIDNIGHT + 12 * 3600)]);
        let night = MIDNIGHT + DAY + 23 * 3600;
        assert_eq!(due(&mut one, WINDOW, night), None);
        assert_eq!(one.steps[0].at, MIDNIGHT + 2 * DAY + 12 * 3600);
    }

    #[test]
    fn a_step_found_after_its_window_shut_waits_for_tomorrow() {
        let mut one = account(vec![at(Step::Groups, MIDNIGHT + 12 * 3600)]);
        assert_eq!(due(&mut one, WINDOW, MIDNIGHT + 23 * 3600), None);
        assert_eq!(one.steps[0].at, MIDNIGHT + DAY + 12 * 3600);
    }

    #[test]
    fn a_stopped_account_does_nothing_more() {
        let mut one = account(vec![at(Step::Groups, MIDNIGHT)]);
        one.stopped = true;
        assert_eq!(due(&mut one, WINDOW, MIDNIGHT + DAY), None);
        assert!(one.finished());
    }

    #[test]
    fn a_failing_step_is_tried_three_times() {
        let mut one = account(vec![at(Step::Groups, MIDNIGHT + 12 * 3600)]);
        record_failed(&mut one, "busy".to_owned(), false);
        assert_eq!(one.steps[0].at, MIDNIGHT + 14 * 3600);
        assert!(!one.finished());
        record_failed(&mut one, "busy".to_owned(), false);
        record_failed(&mut one, "busy".to_owned(), false);
        assert!(one.finished());
        assert_eq!(one.note.as_deref(), Some("busy"));
    }

    #[test]
    fn an_ended_session_stops_the_account() {
        let mut one = account(vec![
            at(Step::Groups, MIDNIGHT),
            at(Step::Queue, MIDNIGHT + DAY),
        ]);
        record_failed(&mut one, "signed out".to_owned(), true);
        assert!(one.finished());
        assert!(one.next().is_none());
    }

    #[test]
    fn the_plan_counts_its_days() {
        let plan = Plan {
            id: 1,
            target: "Farm".to_owned(),
            started_at: MIDNIGHT + 20 * 3600,
            days: 5,
            window: WINDOW,
            groups: Vec::new(),
            apps: Vec::new(),
            wishlist_size: (1, 1),
            accounts: Vec::new(),
        };
        assert_eq!(plan.day(MIDNIGHT + 21 * 3600), 1);
        assert_eq!(plan.day(MIDNIGHT + 2 * DAY + 3600), 3);
        assert_eq!(plan.day(MIDNIGHT + 40 * DAY), 5);
    }
}
