use serde::{Deserialize, Serialize};

use crate::cm::Presence;
use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, web_api_get, with_session};

const OWNED_GAMES_URL: &str = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const RECENT_GAMES_URL: &str =
    "https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/";

/// What the account plays on its client connection, kept so it can be started again.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayingList {
    pub games: Vec<u32>,
    /// Shown on the profile instead of a game's name.
    pub status: Option<String>,
    #[serde(default)]
    pub presence: Presence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedGame {
    #[serde(rename(deserialize = "appid"))]
    pub app_id: u32,
    #[serde(default)]
    pub name: String,
    /// Playtime in all, in minutes.
    #[serde(default, rename(deserialize = "playtime_forever"))]
    pub minutes: u64,
}

#[derive(Deserialize)]
struct Owned {
    response: OwnedResponse,
}

#[derive(Deserialize)]
struct OwnedResponse {
    #[serde(default)]
    games: Vec<OwnedGame>,
}

/// The games on the account, free ones it has played included, most played first.
pub fn owned(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, Vec<OwnedGame>), SteamError> {
    with_session(account, proxy, |client, session, steam_id| {
        let body = web_api_get(
            client,
            OWNED_GAMES_URL,
            session,
            &[
                ("steamid", &steam_id.to_string()),
                ("include_appinfo", "true"),
                ("include_played_free_games", "true"),
            ],
        )?;
        let mut games = read_owned(&body)?;
        // Some free games the account plays, like Dota 2 and Team Fortress 2,
        // never show among the owned ones, but do among those played lately.
        // Only fills gaps, so the owned games still come when it fails.
        let recent = web_api_get(
            client,
            RECENT_GAMES_URL,
            session,
            &[("steamid", &steam_id.to_string()), ("count", "0")],
        )
        .and_then(|body| read_owned(&body));
        if let Ok(recent) = recent {
            add_recent(&mut games, recent);
        }
        Ok(games)
    })
}

/// Adds the games played lately that the owned ones lack, most played first.
fn add_recent(games: &mut Vec<OwnedGame>, recent: Vec<OwnedGame>) {
    for game in recent {
        if !games.iter().any(|known| known.app_id == game.app_id) {
            games.push(game);
        }
    }
    sort(games);
}

fn sort(games: &mut [OwnedGame]) {
    games.sort_by(|a, b| b.minutes.cmp(&a.minutes).then_with(|| a.name.cmp(&b.name)));
}

fn read_owned(body: &[u8]) -> Result<Vec<OwnedGame>, SteamError> {
    let owned: Owned = serde_json::from_slice(body)
        .map_err(|_| SteamError::Steam("unreadable list of games".to_owned()))?;
    let mut games = owned.response.games;
    sort(&mut games);
    Ok(games)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owned_games_come_most_played_first() {
        let body = br#"{"response": {"game_count": 3, "games": [
            {"appid": 440, "name": "Team Fortress 2", "playtime_forever": 12},
            {"appid": 730, "name": "Counter-Strike 2", "playtime_forever": 5400},
            {"appid": 570, "name": "Dota 2", "playtime_forever": 12}
        ]}}"#;
        let ids: Vec<u32> = read_owned(body)
            .unwrap()
            .iter()
            .map(|game| game.app_id)
            .collect();
        assert_eq!(ids, [730, 570, 440]);
        // A private games list answers with an empty response.
        assert_eq!(read_owned(br#"{"response": {}}"#).unwrap(), []);
    }

    #[test]
    fn games_played_lately_fill_in_the_owned_ones() {
        let owned = read_owned(
            br#"{"response": {"games": [
                {"appid": 1172470, "name": "Apex Legends", "playtime_forever": 0}
            ]}}"#,
        )
        .unwrap();
        let recent = read_owned(
            br#"{"response": {"total_count": 2, "games": [
                {"appid": 570, "name": "Dota 2", "playtime_2weeks": 60, "playtime_forever": 3600},
                {"appid": 1172470, "name": "Apex Legends", "playtime_forever": 0}
            ]}}"#,
        )
        .unwrap();
        let mut games = owned;
        add_recent(&mut games, recent);
        let ids: Vec<u32> = games.iter().map(|game| game.app_id).collect();
        assert_eq!(ids, [570, 1172470]);
    }
}
