use std::collections::{BTreeMap, HashMap};

use reqwest::blocking::Client;
use reqwest::header::REFERER;
use serde::{Deserialize, Serialize};

use crate::confirmations::confirm_offer;
use crate::contents::{Account, Session};
use crate::mafile::USER_ID_HIGH;
use crate::proxy::ProxyAddress;
use crate::steam::{
    SteamError, community_get, request_error, session_id, web_api_get, with_session,
};

const OFFERS_URL: &str = "https://api.steampowered.com/IEconService/GetTradeOffers/v1/";
/// How far back finished offers are listed.
const HISTORY_SECS: u64 = 7 * 24 * 60 * 60;
// Each name is a request of its own; past this many partners the rest go unnamed.
const MAX_NAME_LOOKUPS: usize = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OfferState {
    /// Waiting for the other side.
    Active,
    /// Sent, but waits for this account's mobile confirmation before it goes out.
    NeedsConfirmation,
    Accepted,
    /// Accepted, with the items held by Steam until the trade hold ends.
    OnHold,
    Countered,
    Expired,
    Canceled,
    Declined,
    /// Some items are gone, so the offer can't go through.
    InvalidItems,
    Invalid,
}

impl OfferState {
    fn from_steam(state: u32) -> Self {
        match state {
            2 => Self::Active,
            3 => Self::Accepted,
            4 => Self::Countered,
            5 => Self::Expired,
            6 | 10 => Self::Canceled,
            7 => Self::Declined,
            8 => Self::InvalidItems,
            9 => Self::NeedsConfirmation,
            11 => Self::OnHold,
            _ => Self::Invalid,
        }
    }

    /// Still something the user may act on.
    pub fn is_open(self) -> bool {
        matches!(self, Self::Active | Self::NeedsConfirmation)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub name: String,
    /// Steam's hex color for the item's rarity, without the `#`.
    pub color: Option<String>,
    /// More than one of a stackable item, like cases.
    pub amount: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeOffer {
    /// Steam's id, a u64 as text.
    pub id: String,
    /// The SteamID64 of the other side, as text.
    pub partner_id: String,
    pub partner_name: Option<String>,
    /// This account made the offer.
    pub sent: bool,
    pub state: OfferState,
    pub message: String,
    pub give: Vec<Item>,
    pub get: Vec<Item>,
    pub created_at: u64,
    pub expires_at: u64,
    /// When held items arrive, for offers on hold.
    pub held_until: Option<u64>,
}

#[derive(Deserialize)]
struct Answer {
    response: Response,
}

#[derive(Deserialize)]
struct Response {
    #[serde(default)]
    trade_offers_sent: Vec<RawOffer>,
    #[serde(default)]
    trade_offers_received: Vec<RawOffer>,
    #[serde(default)]
    descriptions: Vec<Description>,
}

#[derive(Deserialize)]
struct RawOffer {
    tradeofferid: String,
    accountid_other: u32,
    #[serde(default)]
    message: String,
    trade_offer_state: u32,
    #[serde(default)]
    items_to_give: Vec<RawItem>,
    #[serde(default)]
    items_to_receive: Vec<RawItem>,
    #[serde(default)]
    time_created: u64,
    #[serde(default)]
    expiration_time: u64,
    #[serde(default)]
    escrow_end_date: u64,
}

#[derive(Deserialize)]
struct RawItem {
    classid: String,
    #[serde(default)]
    instanceid: String,
    #[serde(default)]
    amount: Option<String>,
}

#[derive(Deserialize)]
struct Description {
    classid: String,
    #[serde(default)]
    instanceid: String,
    #[serde(default)]
    market_hash_name: String,
    #[serde(default)]
    name: String,
    name_color: Option<String>,
}

#[derive(Deserialize)]
struct MiniProfile {
    persona_name: Option<String>,
}

/// The account's offers that are open or finished in the last week, newest first.
/// Returns the session too, since it may have been renewed.
pub fn list(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    now: u64,
) -> Result<(Session, Vec<TradeOffer>), SteamError> {
    with_session(account, proxy, |client, session, _| {
        let cutoff = now.saturating_sub(HISTORY_SECS).to_string();
        let body = web_api_get(
            client,
            OFFERS_URL,
            session,
            &[
                ("get_sent_offers", "1"),
                ("get_received_offers", "1"),
                ("get_descriptions", "1"),
                ("language", "english"),
                ("active_only", "1"),
                ("time_historical_cutoff", &cutoff),
            ],
        )?;
        let mut offers = parse(&body)?;
        name_partners(client, &mut offers);
        Ok(offers)
    })
}

fn parse(body: &[u8]) -> Result<Vec<TradeOffer>, SteamError> {
    let response = serde_json::from_slice::<Answer>(body)
        .map_err(|_| SteamError::Steam("unreadable trade offers".to_owned()))?
        .response;
    let descriptions: HashMap<(String, String), Description> = response
        .descriptions
        .into_iter()
        .map(|description| {
            (
                (description.classid.clone(), description.instanceid.clone()),
                description,
            )
        })
        .collect();
    let items = |raw: Vec<RawItem>| -> Vec<Item> {
        raw.into_iter()
            .map(|item| {
                let description = descriptions.get(&(item.classid, item.instanceid));
                Item {
                    name: description
                        .map(|description| {
                            if description.market_hash_name.is_empty() {
                                description.name.clone()
                            } else {
                                description.market_hash_name.clone()
                            }
                        })
                        .filter(|name| !name.is_empty())
                        .unwrap_or_else(|| "Unknown item".to_owned()),
                    color: description.and_then(|description| description.name_color.clone()),
                    amount: item
                        .amount
                        .and_then(|amount| amount.parse().ok())
                        .unwrap_or(1),
                }
            })
            .collect()
    };
    let sent = response
        .trade_offers_sent
        .into_iter()
        .map(|offer| (true, offer));
    let received = response
        .trade_offers_received
        .into_iter()
        .map(|offer| (false, offer));
    let mut offers: Vec<TradeOffer> = sent
        .chain(received)
        .map(|(sent, offer)| TradeOffer {
            id: offer.tradeofferid,
            partner_id: ((USER_ID_HIGH << 32) | u64::from(offer.accountid_other)).to_string(),
            partner_name: None,
            sent,
            state: OfferState::from_steam(offer.trade_offer_state),
            message: offer.message,
            give: items(offer.items_to_give),
            get: items(offer.items_to_receive),
            created_at: offer.time_created,
            expires_at: offer.expiration_time,
            held_until: Some(offer.escrow_end_date).filter(|&date| date > 0),
        })
        .collect();
    offers.sort_by_key(|offer| std::cmp::Reverse(offer.created_at));
    Ok(offers)
}

/// What came of accepting an offer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Accepted {
    /// The trade went through.
    Done,
    /// Steam took it, and the confirmation it asked for was given here.
    Confirmed,
    /// Steam wants the email confirmation it sent, which this app can't give.
    NeedsEmail,
}

#[derive(Deserialize)]
struct AcceptAnswer {
    #[serde(default)]
    needs_mobile_confirmation: bool,
    #[serde(default)]
    needs_email_confirmation: bool,
}

/// Accepts an offer someone sent, and confirms it in Guard when Steam asks to, as
/// accepting is what the user asked for.
pub fn accept(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    offer_id: &str,
    partner_id: &str,
) -> Result<(Session, Accepted), SteamError> {
    with_session(account, proxy, |client, session, steam_id| {
        let body = offer_action(
            client,
            session,
            offer_id,
            "accept",
            &[
                ("serverid", "1"),
                ("tradeofferid", offer_id),
                ("partner", partner_id),
                ("captcha", ""),
            ],
        )?;
        let answer: AcceptAnswer = serde_json::from_str(&body)
            .map_err(|_| SteamError::Steam("unreadable answer".to_owned()))?;
        if answer.needs_mobile_confirmation {
            if !confirm_offer(client, session, account, steam_id, offer_id)? {
                return Err(SteamError::Steam(
                    "Steam asked for a confirmation that isn't there yet; look on the Steam Guard screen"
                        .to_owned(),
                ));
            }
            return Ok(Accepted::Confirmed);
        }
        if answer.needs_email_confirmation {
            return Ok(Accepted::NeedsEmail);
        }
        Ok(Accepted::Done)
    })
}

/// Turns down an offer someone sent.
pub fn decline(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    offer_id: &str,
) -> Result<Session, SteamError> {
    let (session, _) = with_session(account, proxy, |client, session, _| {
        offer_action(client, session, offer_id, "decline", &[])
    })?;
    Ok(session)
}

/// Takes back an offer this account sent.
pub fn cancel(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    offer_id: &str,
) -> Result<Session, SteamError> {
    let (session, _) = with_session(account, proxy, |client, session, _| {
        offer_action(client, session, offer_id, "cancel", &[])
    })?;
    Ok(session)
}

/// Gives the Guard confirmation an offer this account sent is waiting for.
pub fn confirm(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    offer_id: &str,
) -> Result<Session, SteamError> {
    let (session, ()) = with_session(account, proxy, |client, session, steam_id| {
        if confirm_offer(client, session, account, steam_id, offer_id)? {
            Ok(())
        } else {
            Err(SteamError::Steam(
                "there's nothing to confirm for this offer".to_owned(),
            ))
        }
    })?;
    Ok(session)
}

/// A form on an offer's page. Steam only takes these with the page as the referrer,
/// and says why it refused in the body of an error answer.
fn offer_action(
    client: &Client,
    session: &Session,
    offer_id: &str,
    action: &str,
    form: &[(&str, &str)],
) -> Result<String, SteamError> {
    if offer_id.is_empty() || !offer_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(SteamError::Steam("unknown trade offer".to_owned()));
    }
    let page = format!("https://steamcommunity.com/tradeoffer/{offer_id}/");
    let session_id = session_id(session);
    let mut fields = vec![("sessionid", session_id.as_str())];
    fields.extend_from_slice(form);
    let response = client
        .post(format!("{page}{action}"))
        .header(REFERER, &page)
        .form(&fields)
        .send()
        .map_err(request_error)?;
    let status = response.status();
    let body = response.text().map_err(request_error)?;
    if status.is_success() {
        return Ok(body);
    }
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(SteamError::SessionExpired);
    }
    Err(refusal(&body).unwrap_or_else(|| SteamError::Steam(status.to_string())))
}

#[derive(Deserialize)]
struct ErrorAnswer {
    #[serde(rename = "strError")]
    message: String,
}

fn refusal(body: &str) -> Option<SteamError> {
    let message = serde_json::from_str::<ErrorAnswer>(body).ok()?.message;
    Some(SteamError::Refused(message.trim().to_owned()))
}

/// Looks up the nickname of everyone on the other side, once each. A name Steam
/// won't give is left out; the list works without it.
fn name_partners(client: &Client, offers: &mut [TradeOffer]) {
    let mut names: BTreeMap<String, Option<String>> = BTreeMap::new();
    for offer in offers.iter() {
        names.entry(offer.partner_id.clone()).or_insert(None);
    }
    for (partner_id, name) in names.iter_mut().take(MAX_NAME_LOOKUPS) {
        let Ok(id) = partner_id.parse::<u64>() else {
            continue;
        };
        let url = format!(
            "https://steamcommunity.com/miniprofile/{}/json",
            id & 0xFFFF_FFFF
        );
        *name = community_get(client, &url)
            .ok()
            .and_then(|body| serde_json::from_str::<MiniProfile>(&body).ok())
            .and_then(|profile| profile.persona_name)
            .filter(|name| !name.is_empty());
    }
    for offer in offers {
        offer.partner_name = names.get(&offer.partner_id).cloned().flatten();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANSWER: &str = r#"{"response":{
        "trade_offers_sent":[{"tradeofferid":"11","accountid_other":40095734,"message":"",
            "trade_offer_state":9,"items_to_give":[{"appid":730,"contextid":"2","assetid":"1",
            "classid":"100","instanceid":"0","amount":"1"}],"time_created":1700000100,
            "expiration_time":1701209700,"escrow_end_date":0}],
        "trade_offers_received":[{"tradeofferid":"12","accountid_other":1,"message":"hi",
            "trade_offer_state":11,"items_to_receive":[{"classid":"200","instanceid":"5","amount":"3"},
            {"classid":"999","instanceid":"0","amount":"1"}],"time_created":1700000200,
            "expiration_time":1701209800,"escrow_end_date":1700600000}],
        "descriptions":[
            {"classid":"100","instanceid":"0","market_hash_name":"AK-47 | Redline (Field-Tested)",
             "name":"AK-47 | Redline","name_color":"D2D2D2"},
            {"classid":"200","instanceid":"5","market_hash_name":"","name":"Revolution Case"}]}}"#;

    #[test]
    fn offers_come_newest_first_with_item_names() {
        let offers = parse(ANSWER.as_bytes()).unwrap();
        assert_eq!(offers[0].id, "12");
        assert!(!offers[0].sent);
        assert_eq!(offers[0].message, "hi");
        assert_eq!(offers[0].get[0].name, "Revolution Case");
        assert_eq!(offers[0].get[0].amount, 3);
        assert_eq!(offers[0].get[1].name, "Unknown item");
        assert_eq!(offers[1].give[0].name, "AK-47 | Redline (Field-Tested)");
        assert_eq!(offers[1].give[0].color.as_deref(), Some("D2D2D2"));
    }

    #[test]
    fn states_and_partners_are_read() {
        let offers = parse(ANSWER.as_bytes()).unwrap();
        assert_eq!(offers[1].state, OfferState::NeedsConfirmation);
        assert!(offers[1].state.is_open());
        assert_eq!(offers[1].partner_id, "76561198000361462");
        assert_eq!(offers[1].held_until, None);
        assert_eq!(offers[0].state, OfferState::OnHold);
        assert!(!offers[0].state.is_open());
        assert_eq!(offers[0].held_until, Some(1700600000));
    }

    #[test]
    fn steam_refusals_keep_their_words() {
        let err = refusal(
            r#"{"strError":"There was an error accepting this trade offer. Please try again later. (28)"}"#,
        )
        .unwrap();
        assert_eq!(
            err.to_string(),
            "Steam said: There was an error accepting this trade offer. Please try again later. (28)"
        );
        assert!(refusal("<html>").is_none());
    }

    #[test]
    fn no_offers_is_an_empty_list() {
        assert!(parse(br#"{"response":{}}"#).unwrap().is_empty());
    }
}
