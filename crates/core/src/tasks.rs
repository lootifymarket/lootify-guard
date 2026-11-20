use serde::Deserialize;

use crate::api_key::{self, ApiKey};
use crate::contents::{Account, LastCheck};
use crate::events::{self, SaleItem};
use crate::inventory::{self, Game};
use crate::licenses::{self, Claim, Claimed, License};
use crate::moves::{self, Moved, Side};
use crate::nicknames;
use crate::profile_settings::{self, Privacy, ProfileChanges, Visibility};
use crate::proxy::ProxyAddress;
use crate::random;
use crate::standing::{self, Standing, TradeBan};
use crate::steam::{self, SteamError};
use crate::steam_groups::{self, GroupLink};
use crate::trades::{self, Asset, OfferState, TradeOffer};
use crate::wishlist;

/// Steam cuts nicknames off past this many characters.
pub const MAX_PERSONA_NAME: usize = 32;

/// Something done to each account of a bulk task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Task {
    /// The session, profile, Web API key, bans and limits.
    Check,
    /// Accepts open offers where the account gives nothing. With `only_from`, only
    /// offers from those Steam IDs, like the user's own accounts.
    AcceptGifts {
        only_from: Option<Vec<u64>>,
    },
    Profile(ProfileTask),
    /// Adds free games and packages to the account.
    FreeGames(Vec<License>),
    /// What a running sale gives out: cards for looking through the discovery
    /// queue, and the free daily item.
    Events {
        queues: u8,
        claim_item: bool,
    },
    /// Joins a few of the groups each run: from `per_run.0` to `per_run.1`.
    JoinGroups {
        groups: Vec<GroupLink>,
        per_run: (usize, usize),
    },
    /// Adds a few of the apps to the wishlist each run, as many as for groups.
    Wishlist {
        apps: Vec<u32>,
        per_run: (usize, usize),
    },
}

/// What to change on each profile; what's left out stays as it is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileTask {
    /// `{n}` in it becomes the account's place in the task, from 1, and
    /// `{random}` a random nickname, a new one for each account.
    pub name_template: Option<String>,
    /// One for each account, by its place in the task, from 1: made when the task
    /// starts, so no two accounts get the same.
    pub descriptions: Option<Vec<String>>,
    pub privacy: PrivacyChanges,
    /// A JPEG, PNG or GIF for every account.
    pub avatar: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyChanges {
    pub profile: Option<Visibility>,
    pub inventory: Option<Visibility>,
    pub games: Option<Visibility>,
}

impl PrivacyChanges {
    fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    fn over(self, current: Privacy) -> Privacy {
        Privacy {
            profile: self.profile.unwrap_or(current.profile),
            inventory: self.inventory.unwrap_or(current.inventory),
            games: self.games.unwrap_or(current.games),
        }
    }
}

const RANDOM: &str = "{random}";

/// The nickname for the account at `number` in the task.
pub fn persona_name(template: &str, number: usize) -> String {
    let mut name = template.trim().replace("{n}", &number.to_string());
    while name.contains(RANDOM) {
        name = name.replacen(RANDOM, &nicknames::random(), 1);
    }
    name
}

/// The longest nickname the template can give within a task of `count` accounts.
pub fn longest_persona_name(template: &str, count: usize) -> usize {
    template
        .trim()
        .replace("{n}", &count.to_string())
        .replace(RANDOM, &"x".repeat(nicknames::MAX_LEN))
        .chars()
        .count()
}

/// How it went for one account, in a few words for the queue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Done(String),
    /// Done, but it found something the user should look at.
    Warning(String),
}

/// Runs the task for the account at `number` in it, counted from 1. Its session
/// and profile are updated in place as Steam renews them, so the caller can save
/// them afterwards.
pub fn run(
    task: &Task,
    account: &mut Account,
    proxy: Option<&ProxyAddress>,
    now: u64,
    number: usize,
) -> Result<Outcome, SteamError> {
    match task {
        Task::Check => check(account, proxy, now),
        Task::AcceptGifts { only_from } => accept_gifts(account, proxy, now, only_from.as_deref()),
        Task::Profile(task) => profile(task, account, proxy, number),
        Task::Events { queues, claim_item } => {
            let mut parts = Vec::new();
            if *queues > 0 {
                let (session, seen) = events::view_queues(account, proxy, *queues)?;
                account.session = Some(session);
                parts.push(match seen {
                    0 => "the discovery queue was empty".to_owned(),
                    n => format!("viewed {n} games in the discovery queue"),
                });
            }
            if *claim_item {
                let (session, item) = events::claim_sale_item(account, proxy)?;
                account.session = Some(session);
                parts.push(sale_item_note(item, now));
            }
            Ok(Outcome::Done(capitalize(&parts.join(", "))))
        }
        Task::JoinGroups { groups, per_run } => {
            let count = random::between(per_run.0, per_run.1);
            let (session, done) = steam_groups::join(account, proxy, groups, count)?;
            account.session = Some(session);
            Ok(joined_outcome(&done, groups.len()))
        }
        Task::Wishlist { apps, per_run } => {
            let count = random::between(per_run.0, per_run.1);
            let (session, done) = wishlist::add(account, proxy, apps, count)?;
            account.session = Some(session);
            Ok(wished_outcome(&done))
        }
        Task::FreeGames(licenses) => {
            let (session, claims) = licenses::claim(account, proxy, licenses)?;
            account.session = Some(session);
            Ok(claims_summary(&claims))
        }
    }
}

fn check(
    account: &mut Account,
    proxy: Option<&ProxyAddress>,
    now: u64,
) -> Result<Outcome, SteamError> {
    let (session, profile) = steam::fetch_profile(account, proxy)?;
    account.session = Some(session);
    account.profile = Some(profile);
    let (session, key) = api_key::check(account, proxy)?;
    account.session = Some(session);
    let (session, standing) = standing::check(account, proxy)?;
    account.session = Some(session);
    let problems = problems(key.as_ref(), account.trusted_api_key.as_deref(), &standing);
    let outcome = check_outcome(&problems);
    account.last_check = Some(LastCheck { at: now, problems });
    Ok(outcome)
}

fn problems(key: Option<&ApiKey>, trusted: Option<&str>, standing: &Standing) -> Vec<String> {
    let mut problems = Vec::new();
    if let Some(key) = key.filter(|key| trusted != Some(key.fingerprint.as_str())) {
        problems.push(format!("Web API key for {}", key.domain));
    }
    if let Some(bans) = &standing.bans {
        if bans.vac_banned {
            problems.push("VAC banned".to_owned());
        }
        if bans.game_bans.is_some_and(|count| count > 0) {
            problems.push("game banned".to_owned());
        }
        match bans.trade_ban {
            TradeBan::Banned => problems.push("trade banned".to_owned()),
            TradeBan::Probation => problems.push("on trade probation".to_owned()),
            TradeBan::None => {}
        }
    }
    if standing
        .market
        .as_ref()
        .is_some_and(|market| !market.allowed)
    {
        problems.push("market restricted".to_owned());
    }
    if standing.limited == Some(true) {
        problems.push("limited".to_owned());
    }
    problems
}

fn check_outcome(problems: &[String]) -> Outcome {
    if problems.is_empty() {
        Outcome::Done("All clear".to_owned())
    } else {
        Outcome::Warning(problems.join(", "))
    }
}

fn accept_gifts(
    account: &mut Account,
    proxy: Option<&ProxyAddress>,
    now: u64,
    only_from: Option<&[u64]>,
) -> Result<Outcome, SteamError> {
    let (session, offers) = trades::list(account, proxy, now)?;
    account.session = Some(session);
    let mut accepted = 0;
    let mut failed = Vec::new();
    for offer in gifts(&offers, only_from) {
        match trades::accept(account, proxy, &offer.id, &offer.partner_id) {
            Ok((session, _)) => {
                account.session = Some(session);
                accepted += 1;
            }
            Err(err @ SteamError::SessionExpired) => return Err(err),
            Err(err) => failed.push(err.to_string()),
        }
    }
    let done = match accepted {
        0 => "No gifts waiting".to_owned(),
        1 => "Accepted 1 gift".to_owned(),
        n => format!("Accepted {n} gifts"),
    };
    Ok(match failed.first() {
        None => Outcome::Done(done),
        Some(reason) => Outcome::Warning(format!("{done}, {} failed: {reason}", failed.len())),
    })
}

fn profile(
    task: &ProfileTask,
    account: &mut Account,
    proxy: Option<&ProxyAddress>,
    number: usize,
) -> Result<Outcome, SteamError> {
    let mut changed = Vec::new();
    let mut changes = ProfileChanges {
        persona_name: task
            .name_template
            .as_deref()
            .map(|template| persona_name(template, number)),
        ..ProfileChanges::default()
    };
    if let Some(name) = &changes.persona_name {
        changed.push(format!("nickname to {name}"));
    }
    if let Some(descriptions) = task.descriptions.as_ref().filter(|all| !all.is_empty()) {
        changes.summary = Some(descriptions[number.saturating_sub(1) % descriptions.len()].clone());
        changed.push("description".to_owned());
    }
    if !task.privacy.is_empty() {
        // Settings left alone keep what each account has, which differs.
        let (session, current) = profile_settings::settings(account, proxy)?;
        account.session = Some(session);
        changes.privacy = Some(task.privacy.over(current.privacy));
        changed.push("privacy".to_owned());
    }
    if changes.persona_name.is_some() || changes.summary.is_some() || changes.privacy.is_some() {
        account.session = Some(profile_settings::save(account, proxy, &changes)?);
    }
    if let Some(image) = &task.avatar {
        account.session = Some(profile_settings::upload_avatar(account, proxy, image)?);
        changed.push("avatar".to_owned());
    }
    // The account list shows the new nickname and avatar right away.
    let (session, profile) = steam::fetch_profile(account, proxy)?;
    account.session = Some(session);
    account.profile = Some(profile);
    Ok(Outcome::Done(format!("Changed {}", changed.join(", "))))
}

fn joined_outcome(done: &steam_groups::Joined, listed: usize) -> Outcome {
    if !done.joined.is_empty() {
        Outcome::Done(format!("Joined {}", done.joined.join(", ")))
    } else if done.missing == listed {
        Outcome::Warning("none of the links lead to a group".to_owned())
    } else {
        Outcome::Done("Already in every group it can join".to_owned())
    }
}

fn wished_outcome(done: &wishlist::Wished) -> Outcome {
    if done.added > 0 {
        Outcome::Done(format!("Added to the wishlist: {}", done.added))
    } else if done.nothing_left {
        Outcome::Done("Every game is owned or on the wishlist already".to_owned())
    } else {
        Outcome::Warning("the store didn't take any of the games".to_owned())
    }
}

fn sale_item_note(item: SaleItem, now: u64) -> String {
    match item {
        SaleItem::Claimed => "claimed the free sale item".to_owned(),
        SaleItem::NextAt(at) => {
            let hours = at.saturating_sub(now).div_ceil(3600).max(1);
            format!("sale item already claimed, next in {hours} h")
        }
        SaleItem::Nothing => "no sale item to claim".to_owned(),
    }
}

fn capitalize(text: &str) -> String {
    let mut chars = text.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().chain(chars).collect())
        .unwrap_or_default()
}

fn claims_summary(claims: &[Claim]) -> Outcome {
    let count = |wanted: Claimed| {
        claims
            .iter()
            .filter(|(_, result)| result.as_ref().ok() == Some(&wanted))
            .count()
    };
    let mut parts = Vec::new();
    match count(Claimed::Added) {
        0 => {}
        added => parts.push(format!("Added {added}")),
    }
    match count(Claimed::AlreadyOwned) {
        0 => {}
        owned => parts.push(format!("{owned} already owned")),
    }
    let failed: Vec<String> = claims
        .iter()
        .filter_map(|(license, result)| {
            result.as_ref().err().map(|err| format!("{license}: {err}"))
        })
        .collect();
    if failed.is_empty() {
        Outcome::Done(parts.join(", "))
    } else {
        parts.extend(failed);
        Outcome::Warning(parts.join("; "))
    }
}

/// Sends every tradable item the account has in the game to the storage
/// account, which takes them there.
pub fn move_to_storage(from: Side, to: Side, game: Game) -> Result<Outcome, moves::Failed> {
    let (session, items) =
        inventory::items(from.account, from.proxy, game).map_err(moves::Failed::From)?;
    from.account.session = Some(session);
    let assets: Vec<Asset> = items
        .into_iter()
        .filter(|item| item.tradable)
        .map(|item| Asset {
            app_id: item.app_id,
            context_id: item.context_id,
            asset_id: item.asset_id,
            amount: item.amount,
        })
        .collect();
    if assets.is_empty() {
        return Ok(Outcome::Done("Nothing to move".to_owned()));
    }
    let count = match assets.len() {
        1 => "1 item".to_owned(),
        n => format!("{n} items"),
    };
    Ok(match moves::move_items(from, to, &assets)? {
        Moved::Done => Outcome::Done(format!("Moved {count}")),
        Moved::Sent { reason } => Outcome::Warning(format!(
            "Sent {count}, but the storage account didn't take them: {reason}"
        )),
    })
}

/// Open offers someone else sent where this account gives nothing.
fn gifts<'a>(offers: &'a [TradeOffer], only_from: Option<&[u64]>) -> Vec<&'a TradeOffer> {
    offers
        .iter()
        .filter(|offer| !offer.sent && offer.state == OfferState::Active && offer.give.is_empty())
        .filter(|offer| {
            only_from.is_none_or(|ids| {
                offer
                    .partner_id
                    .parse()
                    .is_ok_and(|id: u64| ids.contains(&id))
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::standing::{Bans, Market};
    use crate::trades::Item;

    fn standing() -> Standing {
        Standing {
            bans: Some(Bans {
                vac_banned: false,
                vac_bans: Some(0),
                game_bans: Some(0),
                days_since_last: Some(0),
                community_banned: Some(false),
                trade_ban: TradeBan::None,
            }),
            limited: Some(false),
            market: Some(Market {
                allowed: true,
                allowed_at: None,
            }),
        }
    }

    #[test]
    fn nicknames_are_numbered() {
        assert_eq!(persona_name(" farm {n} ", 7), "farm 7");
        assert_eq!(persona_name("{n}-{n}", 12), "12-12");
        assert_eq!(persona_name("storage", 3), "storage");
    }

    #[test]
    fn random_nicknames_differ_and_fit() {
        let first = persona_name("{random}", 1);
        assert!(!first.contains('{'));
        assert_eq!(longest_persona_name("{random} {n}", 120), 24);
    }

    #[test]
    fn privacy_left_alone_keeps_the_account_s_own() {
        let current = Privacy {
            profile: Visibility::Private,
            inventory: Visibility::FriendsOnly,
            games: Visibility::Private,
        };
        let changes = PrivacyChanges {
            inventory: Some(Visibility::Public),
            ..PrivacyChanges::default()
        };
        assert_eq!(
            changes.over(current),
            Privacy {
                inventory: Visibility::Public,
                ..current
            }
        );
        assert!(PrivacyChanges::default().is_empty());
        assert!(!changes.is_empty());
    }

    #[test]
    fn sale_items_are_put_in_words() {
        assert_eq!(
            sale_item_note(SaleItem::NextAt(10_000 + 2 * 3600 + 1), 10_000),
            "sale item already claimed, next in 3 h"
        );
        assert_eq!(
            sale_item_note(SaleItem::NextAt(5), 10_000),
            "sale item already claimed, next in 1 h"
        );
        assert_eq!(capitalize("viewed 12 games"), "Viewed 12 games");
    }

    #[test]
    fn claims_are_summed_up() {
        assert_eq!(
            claims_summary(&[
                (License::App(440), Ok(Claimed::Added)),
                (License::Package(1), Ok(Claimed::Added)),
                (License::App(730), Ok(Claimed::AlreadyOwned)),
            ]),
            Outcome::Done("Added 2, 1 already owned".to_owned())
        );
        assert_eq!(
            claims_summary(&[
                (License::Package(7), Ok(Claimed::Added)),
                (
                    License::App(10),
                    Err(SteamError::Refused("it isn't free in the store".to_owned()))
                ),
            ]),
            Outcome::Warning("Added 1; app 10: Steam said: it isn't free in the store".to_owned())
        );
    }

    #[test]
    fn a_clean_account_is_all_clear() {
        assert_eq!(
            check_outcome(&problems(None, None, &standing())),
            Outcome::Done("All clear".to_owned())
        );
    }

    #[test]
    fn problems_are_listed_and_a_trusted_key_is_not_one() {
        let key = ApiKey {
            domain: "steam-trade-gift.com".to_owned(),
            fingerprint: "abc".to_owned(),
        };
        let mut standing = standing();
        standing.limited = Some(true);
        if let Some(bans) = &mut standing.bans {
            bans.vac_banned = true;
            bans.trade_ban = TradeBan::Probation;
        }
        assert_eq!(
            check_outcome(&problems(Some(&key), None, &standing)),
            Outcome::Warning(
                "Web API key for steam-trade-gift.com, VAC banned, on trade probation, limited"
                    .to_owned()
            )
        );
        assert_eq!(
            check_outcome(&problems(Some(&key), Some("abc"), &self::standing())),
            Outcome::Done("All clear".to_owned())
        );
    }

    fn offer(id: &str, partner: u64, sent: bool, state: OfferState, gives: bool) -> TradeOffer {
        let item = Item {
            name: "Revolution Case".to_owned(),
            color: None,
            amount: 1,
        };
        TradeOffer {
            id: id.to_owned(),
            partner_id: partner.to_string(),
            partner_name: None,
            sent,
            state,
            message: String::new(),
            give: if gives {
                vec![item.clone()]
            } else {
                Vec::new()
            },
            get: vec![item],
            created_at: 0,
            expires_at: 0,
            held_until: None,
        }
    }

    #[test]
    fn only_open_incoming_offers_that_take_nothing_are_gifts() {
        let offers = [
            offer("gift", 1, false, OfferState::Active, false),
            offer("swap", 1, false, OfferState::Active, true),
            offer("mine", 1, true, OfferState::Active, false),
            offer("old", 1, false, OfferState::Accepted, false),
            offer("stranger", 2, false, OfferState::Active, false),
        ];
        let ids = |list: Vec<&TradeOffer>| {
            list.iter()
                .map(|offer| offer.id.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(ids(gifts(&offers, None)), ["gift", "stranger"]);
        assert_eq!(ids(gifts(&offers, Some(&[1]))), ["gift"]);
    }
}
