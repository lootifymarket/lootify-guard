use std::collections::HashMap;
use std::fmt;
use std::thread;
use std::time::Duration;

use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::Value;

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{STORE_URL, SteamError, community_get, community_post, with_session};

/// Steam stops adding free licenses for a while after about this many an hour.
pub const MAX_LICENSES: usize = 50;
const PAUSE: Duration = Duration::from_secs(1);

/// A free game or package to add to an account.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum License {
    App(u32),
    /// A package, which Steam's store links call a "sub".
    Package(u32),
}

impl fmt::Display for License {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::App(id) => write!(f, "app {id}"),
            Self::Package(id) => write!(f, "sub {id}"),
        }
    }
}

/// Reads store links like store.steampowered.com/app/440/, short forms like
/// `app/440` and `sub/12345`, and plain numbers, which are app IDs. They may be
/// split by spaces, commas or lines. On failure, says which one it couldn't read.
pub fn parse(text: &str) -> Result<Vec<License>, String> {
    let mut licenses = Vec::new();
    for word in text
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|word| !word.is_empty())
    {
        let license = parse_one(word).ok_or_else(|| word.to_owned())?;
        if !licenses.contains(&license) {
            licenses.push(license);
        }
    }
    Ok(licenses)
}

fn parse_one(word: &str) -> Option<License> {
    if let Ok(id) = word.parse() {
        return Some(License::App(id));
    }
    let parts: Vec<&str> = word.split('/').collect();
    parts.windows(2).find_map(|pair| {
        let id = pair[1].parse().ok()?;
        match pair[0] {
            "app" => Some(License::App(id)),
            "sub" => Some(License::Package(id)),
            _ => None,
        }
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Claimed {
    Added,
    AlreadyOwned,
}

pub type Claim = (License, Result<Claimed, SteamError>);

/// Adds each license to the account, one after another, and says how each went.
/// A failure that would hit the rest too, like a dead session, ends it early.
pub fn claim(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    licenses: &[License],
) -> Result<(Session, Vec<Claim>), SteamError> {
    with_session(account, proxy, |client, session, _| {
        let mut claims = Vec::new();
        for (i, &license) in licenses.iter().enumerate() {
            if i > 0 {
                thread::sleep(PAUSE);
            }
            match claim_one(client, session, license) {
                Err(
                    err @ (SteamError::SessionExpired
                    | SteamError::Network
                    | SteamError::Proxy
                    | SteamError::RateLimited),
                ) => return Err(err),
                result => claims.push((license, result)),
            }
        }
        Ok(claims)
    })
}

fn claim_one(client: &Client, session: &Session, license: License) -> Result<Claimed, SteamError> {
    let package = match license {
        License::Package(id) => id,
        License::App(id) => free_package(client, id)?,
    };
    let url = format!("{STORE_URL}/freelicense/addfreelicense/{package}");
    let body = community_post(client, &url, session, &[("ajax", "true")])?;
    added(&body)
}

#[derive(Deserialize)]
struct AppEntry {
    #[serde(default)]
    success: bool,
    data: Option<AppData>,
}

#[derive(Deserialize)]
struct AppData {
    #[serde(default)]
    package_groups: Vec<PackageGroup>,
}

#[derive(Deserialize)]
struct PackageGroup {
    #[serde(default)]
    subs: Vec<Sub>,
}

#[derive(Deserialize)]
struct Sub {
    packageid: u32,
    #[serde(default)]
    is_free_license: bool,
    price_in_cents_with_discount: Option<u64>,
}

/// The package the store hands out for free for the app.
fn free_package(client: &Client, app_id: u32) -> Result<u32, SteamError> {
    let url = format!("{STORE_URL}/api/appdetails?appids={app_id}");
    free_package_in(&community_get(client, &url)?, app_id)
}

fn free_package_in(body: &str, app_id: u32) -> Result<u32, SteamError> {
    let mut entries: HashMap<String, AppEntry> = serde_json::from_str(body)
        .map_err(|_| SteamError::Steam("unreadable store page".to_owned()))?;
    let entry = entries
        .remove(&app_id.to_string())
        .filter(|entry| entry.success)
        .ok_or_else(|| SteamError::Refused("the store has no such app".to_owned()))?;
    entry
        .data
        .into_iter()
        .flat_map(|data| data.package_groups)
        .flat_map(|group| group.subs)
        .find(|sub| sub.is_free_license || sub.price_in_cents_with_discount == Some(0))
        .map(|sub| sub.packageid)
        .ok_or_else(|| SteamError::Refused("it isn't free in the store".to_owned()))
}

/// The store answers an empty list when the license was added, or a purchase
/// result code saying why not.
fn added(body: &str) -> Result<Claimed, SteamError> {
    let answer: Value = serde_json::from_str(body)
        .map_err(|_| SteamError::Steam("unreadable answer".to_owned()))?;
    if answer.is_array() {
        return Ok(Claimed::Added);
    }
    match answer["purchaseresultdetail"].as_i64() {
        Some(9) => Ok(Claimed::AlreadyOwned),
        Some(code) => Err(SteamError::Refused(refusal(code))),
        None => Err(SteamError::Steam("the license wasn't added".to_owned())),
    }
}

fn refusal(code: i64) -> String {
    match code {
        5 => "it isn't a free package".to_owned(),
        13 | 19 => "not available in this account's region".to_owned(),
        24 => "it needs a game the account doesn't own".to_owned(),
        46 | 53 => "too many licenses lately, try again in an hour".to_owned(),
        code => format!("purchase error {code}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_and_ids_are_read() {
        assert_eq!(
            parse(
                "https://store.steampowered.com/app/440/Team_Fortress_2/, sub/12345\n730 \
                 store.steampowered.com/sub/999 app/730"
            ),
            Ok(vec![
                License::App(440),
                License::Package(12345),
                License::App(730),
                License::Package(999),
            ])
        );
        assert_eq!(parse("  "), Ok(Vec::new()));
        assert_eq!(parse("730, tf2"), Err("tf2".to_owned()));
        assert_eq!(parse("bundle/12"), Err("bundle/12".to_owned()));
    }

    #[test]
    fn the_free_package_is_found() {
        let body = r#"{"440": {"success": true, "data": {"package_groups": [{"subs": [
            {"packageid": 1, "price_in_cents_with_discount": 999},
            {"packageid": 2, "is_free_license": true},
            {"packageid": 3}
        ]}]}}}"#;
        assert_eq!(free_package_in(body, 440).ok(), Some(2));
        let paid = r#"{"10": {"success": true, "data": {"package_groups": [{"subs": [
            {"packageid": 7}
        ]}]}}}"#;
        assert!(free_package_in(paid, 10).is_err());
        assert!(free_package_in(r#"{"5": {"success": false}}"#, 5).is_err());
    }

    #[test]
    fn store_answers_are_read() {
        assert_eq!(added("[]").ok(), Some(Claimed::Added));
        assert_eq!(
            added(r#"{"purchaseresultdetail": 9}"#).ok(),
            Some(Claimed::AlreadyOwned)
        );
        assert!(matches!(
            added(r#"{"purchaseresultdetail": 24}"#),
            Err(SteamError::Refused(_))
        ));
        assert!(added("<html>").is_err());
    }
}
