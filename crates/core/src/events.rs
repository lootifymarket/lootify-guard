//! What Steam hands out during its sales and festivals: a card or badge
//! progress for looking through the discovery queue, and a free item, like a
//! sticker, once a day.

use reqwest::blocking::Client;
use serde::Deserialize;

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, web_api_get, web_api_post, with_session};

const QUEUE_URL: &str = "https://api.steampowered.com/IStoreService/GetDiscoveryQueue/v1/";
const SKIP_URL: &str = "https://api.steampowered.com/IStoreService/SkipDiscoveryQueueItem/v1/";
const CAN_CLAIM_URL: &str = "https://api.steampowered.com/ISaleItemRewardsService/CanClaimItem/v1/";
const CLAIM_URL: &str = "https://api.steampowered.com/ISaleItemRewardsService/ClaimItem/v1/";
/// Steam's queue of new releases, the one sales reward.
const NEW_RELEASES: &str = "0";
/// A sale has given cards for up to three queues a day.
pub const MAX_QUEUES: u8 = 3;

#[derive(Deserialize)]
struct Queue {
    response: QueueResponse,
}

#[derive(Deserialize)]
struct QueueResponse {
    #[serde(default)]
    appids: Vec<u32>,
}

/// Builds the discovery queue afresh `queues` times and marks every game in it
/// as seen. Returns how many games that was.
pub fn view_queues(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    queues: u8,
) -> Result<(Session, usize), SteamError> {
    with_session(account, proxy, |client, session, _| {
        let mut seen = 0;
        for _ in 0..queues.min(MAX_QUEUES) {
            let body = web_api_get(
                client,
                QUEUE_URL,
                session,
                &[
                    ("rebuild_queue", "1"),
                    ("queue_type", NEW_RELEASES),
                    ("ignore_user_preferences", "1"),
                ],
            )?;
            let queue: Queue = serde_json::from_slice(&body)
                .map_err(|_| SteamError::Steam("unreadable discovery queue".to_owned()))?;
            for app_id in queue.response.appids {
                skip(client, session, app_id)?;
                seen += 1;
            }
        }
        Ok(seen)
    })
}

fn skip(client: &Client, session: &Session, app_id: u32) -> Result<(), SteamError> {
    let url = format!("{SKIP_URL}?appid={app_id}&queue_type={NEW_RELEASES}");
    web_api_post(client, &url, session).map(drop)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaleItem {
    Claimed,
    /// Already claimed; the next one can be had at this Unix time.
    NextAt(u64),
    /// No sale is giving anything out.
    Nothing,
}

#[derive(Deserialize)]
struct CanClaim {
    #[serde(default)]
    response: CanClaimResponse,
}

#[derive(Default, Deserialize)]
struct CanClaimResponse {
    #[serde(default)]
    can_claim: bool,
    next_claim_time: Option<u64>,
}

/// Claims the free item a running sale gives, when there is one to claim.
pub fn claim_sale_item(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, SaleItem), SteamError> {
    with_session(account, proxy, |client, session, _| {
        let body = web_api_get(client, CAN_CLAIM_URL, session, &[("language", "english")])?;
        match can_claim(&body)? {
            SaleItem::Claimed => {
                web_api_post(client, CLAIM_URL, session)?;
                Ok(SaleItem::Claimed)
            }
            other => Ok(other),
        }
    })
}

/// What the check says: `Claimed` here means there is one to claim.
fn can_claim(body: &[u8]) -> Result<SaleItem, SteamError> {
    let answer: CanClaim = serde_json::from_slice(body)
        .map_err(|_| SteamError::Steam("unreadable sale item answer".to_owned()))?;
    Ok(match answer.response {
        CanClaimResponse {
            can_claim: true, ..
        } => SaleItem::Claimed,
        CanClaimResponse {
            next_claim_time: Some(at),
            ..
        } if at > 0 => SaleItem::NextAt(at),
        _ => SaleItem::Nothing,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_claim_check_is_read() {
        assert_eq!(
            can_claim(br#"{"response": {"can_claim": true}}"#).ok(),
            Some(SaleItem::Claimed)
        );
        assert_eq!(
            can_claim(br#"{"response": {"can_claim": false, "next_claim_time": 1763053200}}"#).ok(),
            Some(SaleItem::NextAt(1_763_053_200))
        );
        assert_eq!(
            can_claim(br#"{"response": {}}"#).ok(),
            Some(SaleItem::Nothing)
        );
        assert!(can_claim(b"<html>").is_err());
    }
}
