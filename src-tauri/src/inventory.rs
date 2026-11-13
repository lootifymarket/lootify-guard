use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use lootify_guard_core::inventory::{self, Game, InventoryItem};
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
