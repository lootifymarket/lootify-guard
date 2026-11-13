use std::collections::HashMap;
use std::thread;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::blocking::Client;
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{self, SteamError, community_get, with_session};

// Steam's inventory pages hold at most this many items.
const PAGE_SIZE: u32 = 2000;
// Big storage accounts hold tens of thousands; past this the rest is left out.
const MAX_PAGES: usize = 10;
// Pauses before asking again when Steam says it's busy, longer each time.
const ICON_URL: &str = "https://community.akamai.steamstatic.com/economy/image";
// About twice the width cards show them at, for sharp pictures on high-density screens.
const ICON_SIZE: &str = "360fx360f";
const MAX_ICON_LEN: usize = 256 * 1024;
const RETRY_AFTER: [Duration; 2] = [Duration::from_secs(2), Duration::from_secs(4)];

/// The games whose items the app trades, with Steam's ids for their inventories.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Game {
    Cs2,
    Dota2,
}

impl Game {
    pub fn app_id(self) -> u32 {
        match self {
            Self::Cs2 => 730,
            Self::Dota2 => 570,
        }
    }

    pub fn context_id(self) -> &'static str {
        "2"
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryItem {
    pub app_id: u32,
    pub context_id: String,
    pub asset_id: String,
    pub name: String,
    /// What Steam calls it, like "Classified Rifle".
    pub kind: String,
    /// Steam's name for the picture, for `icon`.
    pub icon: Option<String>,
    /// Steam's hex color for the item's name, which marks StatTrak and the like.
    pub color: Option<String>,
    /// Steam's hex color for the item's rarity, without the `#`.
    pub rarity_color: Option<String>,
    /// Like "Classified" or "Base Grade".
    pub rarity: Option<String>,
    /// Like "Minimal Wear", for weapons and gloves.
    pub exterior: Option<String>,
    /// Like "M4A4", for weapons.
    pub weapon: Option<String>,
    pub amount: u32,
    /// Can go into a trade now; false under a trade hold or for good.
    pub tradable: bool,
    /// Can be listed on the Steam market now.
    pub marketable: bool,
}

#[derive(Deserialize)]
struct Page {
    #[serde(default)]
    assets: Vec<RawAsset>,
    #[serde(default)]
    descriptions: Vec<Description>,
    #[serde(default)]
    more_items: u8,
    last_assetid: Option<String>,
}

#[derive(Deserialize)]
struct RawAsset {
    assetid: String,
    classid: String,
    #[serde(default)]
    instanceid: String,
    #[serde(default)]
    amount: String,
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
    #[serde(default)]
    tradable: u8,
    #[serde(default)]
    marketable: u8,
    #[serde(default, rename = "type")]
    kind: String,
    icon_url: Option<String>,
    #[serde(default)]
    tags: Vec<Tag>,
}

#[derive(Deserialize)]
struct Tag {
    category: String,
    #[serde(default)]
    localized_tag_name: String,
    color: Option<String>,
}

impl Description {
    fn tag(&self, category: &str) -> Option<&Tag> {
        self.tags.iter().find(|tag| tag.category == category)
    }

    fn tag_name(&self, category: &str) -> Option<String> {
        self.tag(category)
            .map(|tag| tag.localized_tag_name.clone())
            .filter(|name| !name.is_empty())
    }
}

/// Everything in the account's inventory for the game, sorted by name.
pub fn items(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    game: Game,
) -> Result<(Session, Vec<InventoryItem>), SteamError> {
    with_session(account, proxy, |client, _, steam_id| {
        let mut items = Vec::new();
        let mut start: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut url = format!(
                "https://steamcommunity.com/inventory/{steam_id}/{}/{}?l=english&count={PAGE_SIZE}",
                game.app_id(),
                game.context_id()
            );
            if let Some(start) = &start {
                url.push_str(&format!("&start_assetid={start}"));
            }
            let page = page_with_retries(client, &url)?;
            let (more, next) = read_page(&page, game, &mut items)?;
            match (more, next) {
                (true, Some(next)) => start = Some(next),
                _ => break,
            }
        }
        items.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(items)
    })
}

/// Downloads an item's picture through the account's proxy, as a data URL the
/// page can show without fetching anything itself.
pub fn icon(proxy: Option<&ProxyAddress>, icon: &str) -> Result<String, SteamError> {
    if icon.is_empty()
        || !icon
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(SteamError::Steam("unknown item picture".to_owned()));
    }
    let response = steam::client(proxy)?
        .get(format!("{ICON_URL}/{icon}/{ICON_SIZE}"))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|_| SteamError::Network)?;
    let mime = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .filter(|mime| mime.starts_with("image/"))
        .unwrap_or("image/png")
        .to_owned();
    let image = response.bytes().map_err(|_| SteamError::Network)?;
    if image.len() > MAX_ICON_LEN {
        return Err(SteamError::Steam("item picture too large".to_owned()));
    }
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(image)))
}

/// Steam often answers an inventory page with a 500 that is gone a little later.
fn page_with_retries(client: &Client, url: &str) -> Result<String, SteamError> {
    for pause in RETRY_AFTER {
        match community_get(client, url) {
            Err(SteamError::Busy) => thread::sleep(pause),
            page => return page,
        }
    }
    community_get(client, url)
}

/// Adds one page to `items`, and says whether there's another and where it starts.
fn read_page(
    page: &str,
    game: Game,
    items: &mut Vec<InventoryItem>,
) -> Result<(bool, Option<String>), SteamError> {
    // An empty inventory comes back as `null` fields or no body at all.
    if page.trim().is_empty() || page.trim() == "null" {
        return Ok((false, None));
    }
    let page: Page = serde_json::from_str(page)
        .map_err(|_| SteamError::Steam("unreadable inventory".to_owned()))?;
    let descriptions: HashMap<(&str, &str), &Description> = page
        .descriptions
        .iter()
        .map(|description| {
            (
                (
                    description.classid.as_str(),
                    description.instanceid.as_str(),
                ),
                description,
            )
        })
        .collect();
    for asset in &page.assets {
        let Some(description) =
            descriptions.get(&(asset.classid.as_str(), asset.instanceid.as_str()))
        else {
            continue;
        };
        let name = if description.market_hash_name.is_empty() {
            description.name.clone()
        } else {
            description.market_hash_name.clone()
        };
        items.push(InventoryItem {
            app_id: game.app_id(),
            context_id: game.context_id().to_owned(),
            asset_id: asset.assetid.clone(),
            name,
            kind: description.kind.clone(),
            icon: description.icon_url.clone().filter(|icon| !icon.is_empty()),
            color: description.name_color.clone(),
            rarity_color: description.tag("Rarity").and_then(|tag| tag.color.clone()),
            rarity: description.tag_name("Rarity"),
            exterior: description.tag_name("Exterior"),
            weapon: description.tag_name("Weapon"),
            amount: asset.amount.parse().unwrap_or(1),
            tradable: description.tradable == 1,
            marketable: description.marketable == 1,
        });
    }
    Ok((page.more_items == 1, page.last_assetid))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn items_say_whether_they_can_be_traded() {
        let page = r#"{"assets":[
            {"appid":730,"contextid":"2","assetid":"1","classid":"10","instanceid":"0","amount":"1"},
            {"appid":730,"contextid":"2","assetid":"2","classid":"20","instanceid":"0","amount":"5"},
            {"appid":730,"contextid":"2","assetid":"3","classid":"99","instanceid":"0","amount":"1"}],
          "descriptions":[
            {"classid":"10","instanceid":"0","market_hash_name":"AK-47 | Redline (Field-Tested)","name":"AK-47 | Redline","name_color":"D2D2D2","tradable":1,
             "marketable":1,"type":"Classified Rifle","icon_url":"abc-_1","tags":[
                {"category":"Weapon","internal_name":"weapon_ak47","localized_tag_name":"AK-47"},
                {"category":"Rarity","internal_name":"Rarity_Legendary_Weapon","localized_tag_name":"Classified","color":"d32ce6"},
                {"category":"Exterior","internal_name":"WearCategory2","localized_tag_name":"Field-Tested"}]},
            {"classid":"20","instanceid":"0","market_hash_name":"Revolution Case","name":"Revolution Case","tradable":0}],
          "more_items":1,"last_assetid":"3","total_inventory_count":3,"success":1}"#;
        let mut items = Vec::new();
        let (more, next) = read_page(page, Game::Cs2, &mut items).unwrap();
        assert!(more);
        assert_eq!(next.as_deref(), Some("3"));
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].name, "AK-47 | Redline (Field-Tested)");
        assert_eq!(items[0].app_id, 730);
        assert_eq!(items[0].kind, "Classified Rifle");
        assert_eq!(items[0].icon.as_deref(), Some("abc-_1"));
        assert_eq!(items[0].rarity_color.as_deref(), Some("d32ce6"));
        assert_eq!(items[0].rarity.as_deref(), Some("Classified"));
        assert_eq!(items[0].exterior.as_deref(), Some("Field-Tested"));
        assert_eq!(items[0].weapon.as_deref(), Some("AK-47"));
        assert!(items[0].tradable);
        assert!(items[0].marketable);
        assert_eq!(items[1].name, "Revolution Case");
        assert!(!items[1].tradable);
        assert_eq!(items[1].amount, 5);
    }

    #[test]
    fn odd_picture_names_are_not_fetched() {
        assert!(icon(None, "../../etc").is_err());
        assert!(icon(None, "").is_err());
    }

    #[test]
    fn an_empty_inventory_is_no_items() {
        let mut items = Vec::new();
        assert_eq!(
            read_page("null", Game::Dota2, &mut items).unwrap(),
            (false, None)
        );
        assert_eq!(
            read_page(
                r#"{"total_inventory_count":0,"success":1}"#,
                Game::Dota2,
                &mut items
            )
            .unwrap(),
            (false, None)
        );
        assert!(items.is_empty());
    }
}
