use std::collections::{BTreeMap, HashSet};
use std::thread;
use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::REFERER;
use serde::{Deserialize, Serialize};

use crate::confirmations::{accept_listings, market_listings};
use crate::contents::{Account, Session};
use crate::inventory::Game;
use crate::profile::{currency_code, wallet_currency};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, community_get, request_error, session_id, with_session};

// Steam's own cut, and the game publisher's, of what the buyer pays.
const STEAM_FEE: f64 = 0.05;
const GAME_FEE: f64 = 0.10;
// The price lookup is limited hard; past this many names the rest go unpriced.
const MAX_PRICED: usize = 20;
const PRICE_PAUSE: Duration = Duration::from_millis(400);

/// What a buyer pays when the seller asks to get `receive`, in hundredths of
/// the wallet currency. Each fee is rounded down but is never under one.
pub fn buyer_pays(receive: u64) -> u64 {
    let fee = |rate: f64| ((receive as f64 * rate).floor() as u64).max(1);
    receive + fee(STEAM_FEE) + fee(GAME_FEE)
}

/// The most the seller can get while the buyer pays no more than `price`.
pub fn seller_gets(price: u64) -> u64 {
    // Fees take about 15%, so the answer is close to price / 1.15; the search
    // around it settles the rounding.
    let guess = (price as f64 / (1.0 + STEAM_FEE + GAME_FEE)) as u64;
    (guess.saturating_sub(2)..=guess + 2)
        .rev()
        .find(|&receive| receive > 0 && buyer_pays(receive) <= price)
        .unwrap_or(0)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Price {
    /// In hundredths of the wallet currency, as the buyer pays.
    pub lowest: Option<u64>,
    pub median: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prices {
    /// ISO 4217, or `None` when the wallet's currency isn't one the app knows.
    pub currency: Option<&'static str>,
    /// By the item's market name; names Steam had no price for are left out.
    pub prices: BTreeMap<String, Price>,
}

#[derive(Deserialize)]
struct Overview {
    #[serde(default)]
    success: bool,
    lowest_price: Option<String>,
    median_price: Option<String>,
}

/// Current market prices for the items, in the account's wallet currency.
pub fn prices(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    game: Game,
    names: &[String],
) -> Result<(Session, Prices), SteamError> {
    with_session(account, proxy, |client, _, _| {
        let currency = wallet_currency(client)?;
        let mut prices = BTreeMap::new();
        for (i, name) in names.iter().take(MAX_PRICED).enumerate() {
            if i > 0 {
                thread::sleep(PRICE_PAUSE);
            }
            let url = reqwest::Url::parse_with_params(
                "https://steamcommunity.com/market/priceoverview/",
                &[
                    ("appid", game.app_id().to_string()),
                    ("currency", currency.unwrap_or(1).to_string()),
                    ("market_hash_name", name.clone()),
                ],
            )
            .map_err(|_| SteamError::Steam("unreadable item name".to_owned()))?;
            let overview = match community_get(client, url.as_str()) {
                Ok(body) => serde_json::from_str::<Overview>(&body).ok(),
                // Steam stops answering for a while; what's priced so far is kept.
                Err(SteamError::RateLimited) => break,
                Err(SteamError::Steam(_) | SteamError::Busy) => None,
                Err(err) => return Err(err),
            };
            if let Some(overview) = overview.filter(|overview| overview.success) {
                prices.insert(
                    name.clone(),
                    Price {
                        lowest: overview.lowest_price.as_deref().and_then(cents),
                        median: overview.median_price.as_deref().and_then(cents),
                    },
                );
            }
        }
        Ok(Prices {
            currency: currency.and_then(currency_code),
            prices,
        })
    })
}

/// Reads a price the way Steam writes it for the wallet's country, like "$1.23",
/// "1,23€", "1 234,50 pуб." or "¥ 1,234", into hundredths.
fn cents(text: &str) -> Option<u64> {
    let digits: String = text
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',')
        .collect();
    let digits = digits.trim_matches(|c| c == '.' || c == ',');
    if digits.is_empty() {
        return None;
    }
    // A separator with one or two digits after it is the decimal point; any
    // other separator groups thousands.
    let (whole, fraction) = match digits.rfind(['.', ',']) {
        Some(at) if (1..=2).contains(&(digits.len() - at - 1)) => {
            (&digits[..at], &digits[at + 1..])
        }
        _ => (digits, ""),
    };
    let whole: u64 = whole.replace(['.', ','], "").parse().ok()?;
    let fraction: u64 = format!("{fraction:0<2}").parse().ok()?;
    Some(whole * 100 + fraction)
}

/// An item to list, with what the seller gets for each one.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub app_id: u32,
    pub context_id: String,
    pub asset_id: String,
    pub amount: u32,
    /// The market name, to find the listing's confirmation by.
    pub name: String,
    /// What the buyer pays, in hundredths of the wallet currency.
    pub price: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "outcome")]
pub enum Listed {
    /// On the market.
    Done,
    /// Listed, but waiting for a confirmation this app didn't find; it's on the
    /// Steam Guard screen.
    Unconfirmed,
    /// Steam wants the email confirmation it sent.
    NeedsEmail,
    Failed {
        reason: String,
    },
}

#[derive(Deserialize)]
struct SellAnswer {
    #[serde(default)]
    success: bool,
    message: Option<String>,
    #[serde(default)]
    needs_mobile_confirmation: bool,
    #[serde(default)]
    needs_email_confirmation: bool,
}

/// Lists the items and confirms in Guard the listings this made. Confirmations
/// that were already waiting, or that name other items, are left alone: they
/// may be someone else's work in the account.
///
/// Prices are in `currency`, which must be the wallet's: a price meant in one
/// currency would be wildly off in another.
pub fn list(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    currency: &str,
    listings: &[Listing],
) -> Result<(Session, Vec<Listed>), SteamError> {
    with_session(account, proxy, |client, session, steam_id| {
        let wallet = wallet_currency(client)?.and_then(currency_code);
        if wallet != Some(currency) {
            return Err(SteamError::Steam(format!(
                "this account's wallet is in {}, not {currency}",
                wallet.unwrap_or("another currency")
            )));
        }
        let before: HashSet<String> = market_listings(client, session, account, steam_id)?
            .into_iter()
            .map(|listing| listing.id)
            .collect();
        let mut outcomes = Vec::new();
        let mut to_confirm = Vec::new();
        for (i, listing) in listings.iter().enumerate() {
            match sell(client, session, steam_id, listing) {
                Ok(answer) if answer.needs_mobile_confirmation => {
                    to_confirm.push(i);
                    outcomes.push(Listed::Unconfirmed);
                }
                Ok(answer) if answer.needs_email_confirmation => outcomes.push(Listed::NeedsEmail),
                Ok(_) => outcomes.push(Listed::Done),
                Err(err @ SteamError::SessionExpired) => return Err(err),
                Err(err) => outcomes.push(Listed::Failed {
                    reason: err.to_string(),
                }),
            }
        }
        if to_confirm.is_empty() {
            return Ok(outcomes);
        }
        let names: Vec<&str> = to_confirm
            .iter()
            .map(|&i| listings[i].name.as_str())
            .collect();
        let new: Vec<_> = market_listings(client, session, account, steam_id)?
            .into_iter()
            .filter(|listing| {
                !before.contains(&listing.id)
                    && names
                        .iter()
                        .any(|name| headline_names(&listing.headline, name))
            })
            .collect();
        accept_listings(client, session, account, steam_id, &new)?;
        // Each confirmation names one item; the first listing still waiting on
        // that name is marked confirmed.
        for confirmed in &new {
            if let Some(&i) = to_confirm.iter().find(|&&i| {
                outcomes[i] == Listed::Unconfirmed
                    && headline_names(&confirmed.headline, &listings[i].name)
            }) {
                outcomes[i] = Listed::Done;
            }
        }
        Ok(outcomes)
    })
}

/// Whether a confirmation's headline is about the item. Steam writes the plain
/// name there, which the market name starts with or equals.
fn headline_names(headline: &str, market_name: &str) -> bool {
    !headline.is_empty() && (market_name == headline || market_name.starts_with(headline))
}

fn sell(
    client: &Client,
    session: &Session,
    steam_id: u64,
    listing: &Listing,
) -> Result<SellAnswer, SteamError> {
    let receive = seller_gets(listing.price);
    if receive == 0 {
        return Err(SteamError::Steam("the price is too low".to_owned()));
    }
    let session_id = session_id(session);
    let response = client
        .post("https://steamcommunity.com/market/sellitem/")
        .header(
            REFERER,
            format!("https://steamcommunity.com/profiles/{steam_id}/inventory/"),
        )
        .form(&[
            ("sessionid", session_id.as_str()),
            ("appid", &listing.app_id.to_string()),
            ("contextid", &listing.context_id),
            ("assetid", &listing.asset_id),
            ("amount", &listing.amount.to_string()),
            // Steam takes what the seller gets, and adds its fees on top.
            ("price", &receive.to_string()),
        ])
        .send()
        .map_err(request_error)?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(SteamError::SessionExpired);
    }
    let body = response.text().map_err(request_error)?;
    let answer: SellAnswer = serde_json::from_str(&body)
        .map_err(|_| SteamError::Steam("unreadable answer".to_owned()))?;
    if !answer.success {
        return Err(match answer.message.filter(|message| !message.is_empty()) {
            Some(message) => SteamError::Refused(message),
            None => SteamError::Steam("the item wasn't listed".to_owned()),
        });
    }
    Ok(answer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fees_match_steam() {
        // Both fees round down, but each is at least a cent.
        assert_eq!(buyer_pays(1), 3);
        assert_eq!(buyer_pays(100), 115);
        assert_eq!(buyer_pays(1000), 1150);
        assert_eq!(buyer_pays(19), 21);
    }

    #[test]
    fn the_seller_gets_the_most_the_price_allows() {
        for price in 3..5000 {
            let receive = seller_gets(price);
            assert!(buyer_pays(receive) <= price, "{price}");
            assert!(buyer_pays(receive + 1) > price, "{price}");
        }
        assert_eq!(seller_gets(2), 0);
    }

    #[test]
    fn prices_are_read_in_any_format() {
        assert_eq!(cents("$1.23"), Some(123));
        assert_eq!(cents("1,23€"), Some(123));
        assert_eq!(cents("1 234,50 pуб."), Some(123_450));
        assert_eq!(cents("$1,234.5"), Some(123_450));
        assert_eq!(cents("¥ 1,234"), Some(123_400));
        assert_eq!(cents("12 ₸"), Some(1200));
        assert_eq!(cents("--"), None);
    }

    #[test]
    fn confirmations_are_matched_by_name() {
        assert!(headline_names("Revolution Case", "Revolution Case"));
        assert!(headline_names(
            "AK-47 | Redline",
            "AK-47 | Redline (Field-Tested)"
        ));
        assert!(!headline_names(
            "AK-47 | Slate",
            "AK-47 | Redline (Field-Tested)"
        ));
        assert!(!headline_names("", "Revolution Case"));
    }
}
