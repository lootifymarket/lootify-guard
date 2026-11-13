use reqwest::StatusCode;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, community_get, with_session};

const BANS_URL: &str = "https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/";
const MARKET_URL: &str = "https://api.steampowered.com/IEconMarketService/GetMarketEligibility/v1/";

/// What Steam holds against the account. Each part comes from its own source, and
/// one Steam won't answer is `None` instead of failing the rest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Standing {
    pub bans: Option<Bans>,
    /// Never spent $5, so it can't trade, use the market or add friends freely.
    pub limited: Option<bool>,
    pub market: Option<Market>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bans {
    pub vac_bans: u32,
    pub game_bans: u32,
    pub days_since_last: u32,
    pub community_banned: bool,
    pub trade_ban: TradeBan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TradeBan {
    None,
    Probation,
    Banned,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Market {
    pub allowed: bool,
    /// When a temporary restriction ends, as Unix time.
    pub allowed_at: Option<u64>,
}

#[derive(Deserialize)]
struct BansAnswer {
    players: Vec<PlayerBans>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PlayerBans {
    #[serde(rename = "NumberOfVACBans")]
    number_of_vac_bans: u32,
    number_of_game_bans: u32,
    days_since_last_ban: u32,
    community_banned: bool,
    economy_ban: String,
}

#[derive(Deserialize)]
struct MarketAnswer {
    response: MarketResponse,
}

#[derive(Deserialize)]
struct MarketResponse {
    allowed: bool,
    allowed_at_time: Option<u64>,
}

/// Asks Steam about bans, limits and the market. Returns the session too, since
/// it may have been renewed.
pub fn check(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, Standing), SteamError> {
    with_session(account, proxy, |client, session, steam_id| {
        let id = steam_id.to_string();
        let bans = optional_get(client, BANS_URL, session, &[("steamids", &id)])?
            .and_then(|body| parse_bans(&body));
        let market = optional_get(client, MARKET_URL, session, &[("steamid", &id)])?
            .and_then(|body| parse_market(&body));
        let profile = format!("https://steamcommunity.com/profiles/{id}/?xml=1");
        let limited = match community_get(client, &profile, session, steam_id) {
            Ok(page) => parse_limited(&page),
            Err(SteamError::Steam(_)) => None,
            Err(err) => return Err(err),
        };
        Ok(Standing {
            bans,
            limited,
            market,
        })
    })
}

/// Like `web_api_get`, but a refusal other than a dead session leaves the part out:
/// Steam answers 403 when a method wants a Web API key rather than the session, and
/// that must not sign the account out.
fn optional_get(
    client: &Client,
    url: &str,
    session: &Session,
    query: &[(&str, &str)],
) -> Result<Option<Vec<u8>>, SteamError> {
    let response = client
        .get(url)
        .query(&[("access_token", session.access_token.expose())])
        .query(query)
        .send()
        .map_err(|_| SteamError::Network)?;
    if response.status() == StatusCode::UNAUTHORIZED {
        return Err(SteamError::SessionExpired);
    }
    if !response.status().is_success() {
        return Ok(None);
    }
    Ok(response.bytes().ok().map(|body| body.to_vec()))
}

fn parse_bans(body: &[u8]) -> Option<Bans> {
    let player = serde_json::from_slice::<BansAnswer>(body)
        .ok()?
        .players
        .into_iter()
        .next()?;
    Some(Bans {
        vac_bans: player.number_of_vac_bans,
        game_bans: player.number_of_game_bans,
        days_since_last: player.days_since_last_ban,
        community_banned: player.community_banned,
        trade_ban: match player.economy_ban.as_str() {
            "none" => TradeBan::None,
            "probation" => TradeBan::Probation,
            _ => TradeBan::Banned,
        },
    })
}

fn parse_market(body: &[u8]) -> Option<Market> {
    let answer = serde_json::from_slice::<MarketAnswer>(body).ok()?.response;
    Some(Market {
        allowed: answer.allowed,
        allowed_at: answer.allowed_at_time.filter(|&time| time > 0),
    })
}

fn parse_limited(profile: &str) -> Option<bool> {
    let start = profile.find("<isLimitedAccount>")? + "<isLimitedAccount>".len();
    match profile[start..].split('<').next()?.trim() {
        "1" => Some(true),
        "0" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_bans() {
        let body = br#"{"players":[{"SteamId":"76561198000000001","CommunityBanned":false,
            "VACBanned":true,"NumberOfVACBans":1,"DaysSinceLastBan":120,
            "NumberOfGameBans":2,"EconomyBan":"probation"}]}"#;
        assert_eq!(
            parse_bans(body),
            Some(Bans {
                vac_bans: 1,
                game_bans: 2,
                days_since_last: 120,
                community_banned: false,
                trade_ban: TradeBan::Probation,
            })
        );
    }

    #[test]
    fn an_unknown_trade_ban_word_counts_as_a_ban() {
        let body = br#"{"players":[{"CommunityBanned":false,"NumberOfVACBans":0,
            "DaysSinceLastBan":0,"NumberOfGameBans":0,"EconomyBan":"suspended"}]}"#;
        assert_eq!(parse_bans(body).unwrap().trade_ban, TradeBan::Banned);
    }

    #[test]
    fn unreadable_answers_are_left_out() {
        assert_eq!(parse_bans(br#"{"players":[]}"#), None);
        assert_eq!(parse_market(b"<html>"), None);
        assert_eq!(
            parse_limited("<profile><steamID>x</steamID></profile>"),
            None
        );
    }

    #[test]
    fn reads_market_restrictions() {
        assert_eq!(
            parse_market(br#"{"response":{"allowed":false,"allowed_at_time":1700000000}}"#),
            Some(Market {
                allowed: false,
                allowed_at: Some(1700000000),
            })
        );
        assert_eq!(
            parse_market(br#"{"response":{"allowed":true,"allowed_at_time":0}}"#),
            Some(Market {
                allowed: true,
                allowed_at: None,
            })
        );
    }

    #[test]
    fn reads_the_limited_flag() {
        assert_eq!(
            parse_limited("<profile><isLimitedAccount>1</isLimitedAccount></profile>"),
            Some(true)
        );
        assert_eq!(
            parse_limited("<isLimitedAccount> 0 </isLimitedAccount>"),
            Some(false)
        );
    }
}
