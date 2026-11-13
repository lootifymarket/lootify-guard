use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, community_get, with_session};

// Steam's inventory pages hold at most this many items.
const PAGE_SIZE: u32 = 2000;
// Big storage accounts hold tens of thousands; past this the rest is left out.
const MAX_PAGES: usize = 10;

/// The games whose items the app trades, with Steam's ids for their inventories.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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
    /// Steam's hex color for the item's rarity, without the `#`.
    pub color: Option<String>,
    pub amount: u32,
}

/// The items that can go into a trade now. Items still under a trade hold are
/// counted but not listed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tradable {
    pub items: Vec<InventoryItem>,
    pub held: u32,
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
}

pub fn tradable(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    game: Game,
) -> Result<(Session, Tradable), SteamError> {
    with_session(account, proxy, |client, _, steam_id| {
        let mut result = Tradable {
            items: Vec::new(),
            held: 0,
        };
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
            let page = community_get(client, &url)?;
            let (more, next) = read_page(&page, game, &mut result)?;
            match (more, next) {
                (true, Some(next)) => start = Some(next),
                _ => break,
            }
        }
        result.items.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(result)
    })
}

/// Adds one page to `result`, and says whether there's another and where it starts.
fn read_page(
    page: &str,
    game: Game,
    result: &mut Tradable,
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
        if description.tradable != 1 {
            result.held += 1;
            continue;
        }
        let name = if description.market_hash_name.is_empty() {
            description.name.clone()
        } else {
            description.market_hash_name.clone()
        };
        result.items.push(InventoryItem {
            app_id: game.app_id(),
            context_id: game.context_id().to_owned(),
            asset_id: asset.assetid.clone(),
            name,
            color: description.name_color.clone(),
            amount: asset.amount.parse().unwrap_or(1),
        });
    }
    Ok((page.more_items == 1, page.last_assetid))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_tradable_items_are_listed() {
        let page = r#"{"assets":[
            {"appid":730,"contextid":"2","assetid":"1","classid":"10","instanceid":"0","amount":"1"},
            {"appid":730,"contextid":"2","assetid":"2","classid":"20","instanceid":"0","amount":"5"},
            {"appid":730,"contextid":"2","assetid":"3","classid":"99","instanceid":"0","amount":"1"}],
          "descriptions":[
            {"classid":"10","instanceid":"0","market_hash_name":"AK-47 | Redline (Field-Tested)","name":"AK-47 | Redline","name_color":"D2D2D2","tradable":1},
            {"classid":"20","instanceid":"0","market_hash_name":"Revolution Case","name":"Revolution Case","tradable":0}],
          "more_items":1,"last_assetid":"3","total_inventory_count":3,"success":1}"#;
        let mut result = Tradable {
            items: Vec::new(),
            held: 0,
        };
        let (more, next) = read_page(page, Game::Cs2, &mut result).unwrap();
        assert!(more);
        assert_eq!(next.as_deref(), Some("3"));
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].name, "AK-47 | Redline (Field-Tested)");
        assert_eq!(result.items[0].app_id, 730);
        assert_eq!(result.held, 1);
    }

    #[test]
    fn an_empty_inventory_is_no_items() {
        let mut result = Tradable {
            items: Vec::new(),
            held: 0,
        };
        assert_eq!(
            read_page("null", Game::Dota2, &mut result).unwrap(),
            (false, None)
        );
        assert_eq!(
            read_page(
                r#"{"total_inventory_count":0,"success":1}"#,
                Game::Dota2,
                &mut result
            )
            .unwrap(),
            (false, None)
        );
        assert!(result.items.is_empty());
    }
}
