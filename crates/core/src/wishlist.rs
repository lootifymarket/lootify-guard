//! Adding a few games to an account's wishlist, a different mix for each account.

use std::collections::HashSet;
use std::thread;
use std::time::Duration;

use reqwest::blocking::Client;
use serde::Deserialize;

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::random;
use crate::steam::{STORE_URL, SteamError, community_get, community_post, with_session};

/// A task can't list more games than this.
pub const MAX_APPS: usize = 500;
// Between two games added in one run, in seconds.
const PAUSE: (usize, usize) = (1, 4);

/// Well-known paid games on the store, by app ID: what a person might wish for.
/// One that's gone from the store is just passed over.
pub const POPULAR: &[u32] = &[
    1091500, 1245620, 1086940, 271590, 292030, 1174180, 413150, 105600, 427520, 367520, 1145360,
    1145350, 504230, 620, 400, 220, 546560, 252490, 892970, 553850, 1966720, 990080, 2050650,
    883710, 1196590, 418370, 374320, 814380, 489830, 377160, 1716740, 359550, 381210, 739630,
    108600, 251570, 346110, 2399830, 1326470, 242760, 264710, 848450, 526870, 294100, 457140,
    255710, 949230, 1158310, 394360, 281990, 289070, 813780, 1466860, 1142710, 1888160, 1593500,
    782330, 379720, 1364780, 1778820, 582010, 1446780, 2246340, 1551360, 1293830, 244210, 805550,
    1623730, 2358720, 2183900, 646570, 2379780, 1794680, 1942280, 588650, 250900, 1868140, 1426210,
    1057090, 976730, 1144200, 1693980, 2161700, 1687950, 524220, 1167630, 1328670, 1222140, 397540,
    49520, 359320, 1237970, 1517290, 1774580, 2215430, 1888930, 2124490,
];

#[derive(Deserialize)]
struct UserData {
    #[serde(default, rename = "rgWishlist")]
    wishlist: Vec<u32>,
    #[serde(default, rename = "rgOwnedApps")]
    owned: Vec<u32>,
}

#[derive(Deserialize)]
struct Added {
    #[serde(default)]
    success: bool,
}

/// What one run did for an account.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Wished {
    pub added: usize,
    /// Every game offered was owned or on the wishlist already.
    pub nothing_left: bool,
}

/// Adds up to `count` of the apps, picked at random among the ones the account
/// neither owns nor wishes for already.
pub fn add(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    apps: &[u32],
    count: usize,
) -> Result<(Session, Wished), SteamError> {
    with_session(account, proxy, |client, session, _| {
        let data: UserData = serde_json::from_str(&community_get(
            client,
            &format!("{STORE_URL}/dynamicstore/userdata/"),
        )?)
        .map_err(|_| SteamError::Steam("unreadable store data".to_owned()))?;
        let candidates = left(apps, &data);
        let mut done = Wished {
            nothing_left: candidates.is_empty(),
            ..Wished::default()
        };
        for app in random::shuffled(&candidates, &mut random::below) {
            if done.added >= count {
                break;
            }
            if done.added > 0 {
                thread::sleep(Duration::from_secs(random::between(PAUSE.0, PAUSE.1) as u64));
            }
            // A game the store turns down is passed over for the next one.
            if add_one(client, session, app)? {
                done.added += 1;
            }
        }
        Ok(done)
    })
}

fn left(apps: &[u32], data: &UserData) -> Vec<u32> {
    let taken: HashSet<u32> = data.wishlist.iter().chain(&data.owned).copied().collect();
    let mut seen = HashSet::new();
    apps.iter()
        .copied()
        .filter(|app| !taken.contains(app) && seen.insert(*app))
        .collect()
}

fn add_one(client: &Client, session: &Session, app: u32) -> Result<bool, SteamError> {
    let body = community_post(
        client,
        &format!("{STORE_URL}/api/addtowishlist"),
        session,
        &[("appid", &app.to_string())],
    )?;
    let answer: Added = serde_json::from_str(&body)
        .map_err(|_| SteamError::Steam("unreadable answer".to_owned()))?;
    Ok(answer.success)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owned_and_wished_games_are_left_out() {
        let data: UserData = serde_json::from_str(
            r#"{"rgWishlist": [620, 400], "rgOwnedApps": [220], "rgOwnedPackages": [1]}"#,
        )
        .unwrap();
        assert_eq!(
            left(&[620, 220, 1091500, 400, 1091500, 292030], &data),
            [1091500, 292030]
        );
    }

    #[test]
    fn an_account_with_nothing_has_every_game_left() {
        let data: UserData = serde_json::from_str("{}").unwrap();
        assert_eq!(left(POPULAR, &data).len(), POPULAR.len());
    }

    #[test]
    fn the_popular_games_are_listed_once() {
        let unique: HashSet<&u32> = POPULAR.iter().collect();
        assert_eq!(unique.len(), POPULAR.len());
    }
}
