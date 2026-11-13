use crate::api_key::{self, ApiKey};
use crate::contents::Account;
use crate::proxy::ProxyAddress;
use crate::standing::{self, Standing, TradeBan};
use crate::steam::{self, SteamError};
use crate::trades::{self, OfferState, TradeOffer};

/// Something done to each account of a bulk task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Task {
    /// The session, profile, Web API key, bans and limits.
    Check,
    /// Accepts open offers where the account gives nothing. With `only_from`, only
    /// offers from those Steam IDs, like the user's own accounts.
    AcceptGifts { only_from: Option<Vec<u64>> },
}

/// How it went for one account, in a few words for the queue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Done(String),
    /// Done, but it found something the user should look at.
    Warning(String),
}

/// Runs the task for the account. Its session and profile are updated in place
/// as Steam renews them, so the caller can save them afterwards.
pub fn run(
    task: &Task,
    account: &mut Account,
    proxy: Option<&ProxyAddress>,
    now: u64,
) -> Result<Outcome, SteamError> {
    match task {
        Task::Check => check(account, proxy),
        Task::AcceptGifts { only_from } => accept_gifts(account, proxy, now, only_from.as_deref()),
    }
}

fn check(account: &mut Account, proxy: Option<&ProxyAddress>) -> Result<Outcome, SteamError> {
    let (session, profile) = steam::fetch_profile(account, proxy)?;
    account.session = Some(session);
    account.profile = Some(profile);
    let (session, key) = api_key::check(account, proxy)?;
    account.session = Some(session);
    let (session, standing) = standing::check(account, proxy)?;
    account.session = Some(session);
    Ok(check_summary(
        key.as_ref(),
        account.trusted_api_key.as_deref(),
        &standing,
    ))
}

fn check_summary(key: Option<&ApiKey>, trusted: Option<&str>, standing: &Standing) -> Outcome {
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
    fn a_clean_account_is_all_clear() {
        assert_eq!(
            check_summary(None, None, &standing()),
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
            check_summary(Some(&key), None, &standing),
            Outcome::Warning(
                "Web API key for steam-trade-gift.com, VAC banned, on trade probation, limited"
                    .to_owned()
            )
        );
        assert_eq!(
            check_summary(Some(&key), Some("abc"), &self::standing()),
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
