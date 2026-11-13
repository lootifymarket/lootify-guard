use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use lootify_guard_core::inventory::{self, Game, InventoryItem};
use lootify_guard_core::moves::{self, Failed, Moved, Side};
use lootify_guard_core::steam::SteamError;
use lootify_guard_core::trades::Asset;
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::async_runtime::{Mutex as AsyncMutex, spawn_blocking};

use crate::accounts::{account_and_proxy, settle, store_session};
use crate::vault::{CommandError, VaultState};

// Pictures are small, so a few download at once.
const AT_ONCE: usize = 8;

type Fetched = (Instant, Vec<InventoryItem>);

/// Inventories asked of Steam lately. Steam answers 500 to an inventory asked for
/// again too soon or twice at once, so requests go one at a time and a fresh
/// answer is reused. It lives in memory only and holds no secrets.
#[derive(Default)]
pub struct InventoryCache {
    one_at_a_time: AsyncMutex<HashMap<(String, Game), Fetched>>,
}

/// Item pictures already downloaded, by Steam's name for them. They are the same
/// for everyone, so they are kept for as long as the app runs, up to a limit.
#[derive(Default)]
pub struct IconCache(Mutex<HashMap<String, String>>);

const MAX_CACHED_ICONS: usize = 5000;

const INVENTORY_FRESH_FOR: Duration = Duration::from_secs(60);

/// Everything in the account's inventory for the game.
#[tauri::command]
pub async fn inventory_items(
    state: State<'_, VaultState>,
    cache: State<'_, InventoryCache>,
    account_name: String,
    game: Game,
) -> Result<Vec<InventoryItem>, CommandError> {
    let mut cached = cache.one_at_a_time.lock().await;
    let key = (account_name.clone(), game);
    if let Some((fetched_at, items)) = cached.get(&key)
        && fetched_at.elapsed() < INVENTORY_FRESH_FOR
    {
        return Ok(items.clone());
    }
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let result = spawn_blocking(move || inventory::items(&account, proxy.as_ref(), game)).await?;
    let (session, items) = settle(&state, &account_name, result)?;
    store_session(&state, &account_name, Some(session))?;
    cached.insert(key, (Instant::now(), items.clone()));
    Ok(items)
}

/// Pictures for the items in `icons`, through the account's proxy. A picture that
/// fails to download is left out; the card shows without it.
#[tauri::command]
pub async fn item_icons(
    state: State<'_, VaultState>,
    cache: State<'_, IconCache>,
    account_name: String,
    icons: Vec<String>,
) -> Result<HashMap<String, String>, CommandError> {
    let mut found = HashMap::new();
    let mut missing = Vec::new();
    {
        let cached = cache.0.lock().unwrap_or_else(PoisonError::into_inner);
        for icon in icons {
            match cached.get(&icon) {
                Some(url) => {
                    found.insert(icon, url.clone());
                }
                None => missing.push(icon),
            }
        }
    }
    if missing.is_empty() {
        return Ok(found);
    }
    let (_, proxy) = account_and_proxy(&state, &account_name)?;
    let downloaded = spawn_blocking(move || {
        let mut downloaded = Vec::new();
        for batch in missing.chunks(AT_ONCE) {
            thread::scope(|scope| {
                let running: Vec<_> = batch
                    .iter()
                    .map(|icon| {
                        let proxy = proxy.as_ref();
                        scope.spawn(move || (icon.clone(), inventory::icon(proxy, icon)))
                    })
                    .collect();
                for handle in running {
                    downloaded.push(handle.join().expect("downloading a picture never panics"));
                }
            });
        }
        downloaded
    })
    .await?;
    let mut cached = cache.0.lock().unwrap_or_else(PoisonError::into_inner);
    for (icon, result) in downloaded {
        if let Ok(url) = result {
            if cached.len() < MAX_CACHED_ICONS {
                cached.insert(icon.clone(), url.clone());
            }
            found.insert(icon, url);
        }
    }
    Ok(found)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveGroup {
    account_name: String,
    assets: Vec<Asset>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveReport {
    account_name: String,
    count: usize,
    #[serde(flatten)]
    result: MoveResult,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", untagged)]
enum MoveResult {
    Moved(Moved),
    Failed {
        outcome: &'static str,
        reason: String,
    },
}

/// Moves each account's items to `target`, one account after another, and says
/// how it went for each. Items already on the target are left where they are.
#[tauri::command]
pub async fn move_items(
    state: State<'_, VaultState>,
    cache: State<'_, InventoryCache>,
    target: String,
    groups: Vec<MoveGroup>,
) -> Result<Vec<MoveReport>, CommandError> {
    let (mut to, to_proxy) = account_and_proxy(&state, &target)?;
    let mut sources = Vec::new();
    for group in groups {
        if group.account_name == target || group.assets.is_empty() {
            continue;
        }
        let (account, proxy) = account_and_proxy(&state, &group.account_name)?;
        sources.push((account, proxy, group.assets));
    }

    let (to, done) = spawn_blocking(move || {
        let mut done = Vec::new();
        for (mut from, from_proxy, assets) in sources {
            let result = moves::move_items(
                Side {
                    account: &mut from,
                    proxy: from_proxy.as_ref(),
                },
                Side {
                    account: &mut to,
                    proxy: to_proxy.as_ref(),
                },
                &assets,
            );
            if let Err(Failed::To(SteamError::SessionExpired)) = result {
                to.session = None;
            }
            if let Err(Failed::From(SteamError::SessionExpired)) = result {
                from.session = None;
            }
            done.push((from, assets.len(), result));
        }
        (to, done)
    })
    .await?;

    store_session(&state, &target, to.session.clone())?;
    let mut reports = Vec::new();
    for (from, count, result) in done {
        store_session(&state, &from.account_name, from.session.clone())?;
        reports.push(MoveReport {
            count,
            result: match result {
                Ok(moved) => MoveResult::Moved(moved),
                Err(Failed::From(err)) => MoveResult::Failed {
                    outcome: "failed",
                    reason: err.to_string(),
                },
                Err(Failed::To(err)) => MoveResult::Failed {
                    outcome: "failed",
                    reason: format!("{target}: {err}"),
                },
            },
            account_name: from.account_name,
        });
    }

    // What moved is no longer where the cache says.
    let mut cached = cache.one_at_a_time.lock().await;
    cached.retain(|(account, _), _| {
        *account != target && !reports.iter().any(|report| &report.account_name == account)
    });
    Ok(reports)
}
