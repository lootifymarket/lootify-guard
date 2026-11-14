use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use lootify_guard_core::browser::{History, Page, may_open, session_cookies};
use lootify_guard_core::forward::Forwarder;
use lootify_guard_core::steam::{self, SteamError};
use serde::{Deserialize, Serialize};
use tauri::async_runtime::spawn_blocking;
use tauri::webview::{
    Cookie, NewWindowResponse, PageLoadEvent, PermissionResponse, WebviewBuilder,
};
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Rect, State, Webview, WebviewUrl, Window,
};

use crate::accounts::{account_and_proxy, settle, store_session};
use crate::vault::{CommandError, VaultState};

// A page could otherwise ask for a direct connection and reveal the computer's
// own address past the proxy.
const NO_WEBRTC: &str = "for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) { try { delete window[name] } catch {} try { Object.defineProperty(window, name, { value: undefined }) } catch {} }";

/// The browser tabs that are open, one per account at most.
#[derive(Default)]
pub struct Browsers {
    tabs: Mutex<HashMap<String, Tab>>,
    next_label: AtomicU32,
}

struct Tab {
    webview: Webview,
    steam_id: u64,
    page: Arc<Mutex<PageState>>,
    /// Unix seconds.
    opened_at: u64,
    // Stops tunnelling once the tab is gone.
    _forwarder: Option<Forwarder>,
}

#[derive(Default)]
struct PageState {
    loading: bool,
    history: History,
}

impl Browsers {
    fn tabs(&self) -> MutexGuard<'_, HashMap<String, Tab>> {
        // A panic elsewhere can't leave the map half-updated, so a poisoned lock is safe to reuse.
        self.tabs.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Ends every tab's session. Nothing signed in stays on screen once the vault locks.
    pub(crate) fn close_all(&self) {
        for (_, tab) in self.tabs().drain() {
            let _ = tab.webview.close();
        }
    }

    pub(crate) fn close(&self, account_name: &str) {
        if let Some(tab) = self.tabs().remove(account_name) {
            let _ = tab.webview.close();
        }
    }

    fn with_tab<T>(
        &self,
        account_name: &str,
        op: impl FnOnce(&Tab) -> Result<T, CommandError>,
    ) -> Result<T, CommandError> {
        let tabs = self.tabs();
        let tab = tabs
            .get(account_name)
            .ok_or_else(|| CommandError::Failed("the browser tab is closed".to_owned()))?;
        op(tab)
    }
}

fn page_state(page: &Mutex<PageState>) -> MutexGuard<'_, PageState> {
    page.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Where the page goes in the window, in CSS pixels from its top left corner.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl From<Bounds> for Rect {
    fn from(bounds: Bounds) -> Self {
        Rect {
            position: LogicalPosition::new(bounds.x, bounds.y).into(),
            size: LogicalSize::new(bounds.width, bounds.height).into(),
        }
    }
}

/// Shows the account's tab at `bounds`, signing it in first if it isn't open yet.
/// Every other tab is hidden.
#[tauri::command]
pub async fn open_browser(
    window: Window,
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
    account_name: String,
    bounds: Bounds,
) -> Result<(), CommandError> {
    if browsers.tabs().contains_key(&account_name) {
        return show(&browsers, &account_name, bounds);
    }
    let (account, proxy) = account_and_proxy(&state, &account_name)?;
    let steam_id = account.steam_id;
    let session = {
        let proxy = proxy.clone();
        spawn_blocking(move || steam::check_session(&account, proxy.as_ref())).await?
    };
    let session = settle(&state, &account_name, session)?;
    store_session(&state, &account_name, Some(session.clone()))?;
    // A session that checked out has its account's SteamID.
    let steam_id = steam_id.ok_or(SteamError::SessionExpired)?;

    let forwarder = proxy
        .map(|proxy| Forwarder::start(Some(proxy)))
        .transpose()
        .map_err(|_| CommandError::Failed("could not start the tab's proxy".to_owned()))?;
    let label = format!(
        "browser-{}",
        browsers.next_label.fetch_add(1, Ordering::Relaxed)
    );
    let page = Arc::new(Mutex::new(PageState::default()));
    let builder = tab_builder(
        window.app_handle(),
        &label,
        &account_name,
        forwarder.as_ref(),
        page.clone(),
    )?;
    let webview = window.add_child(
        builder,
        LogicalPosition::new(bounds.x, bounds.y),
        LogicalSize::new(bounds.width, bounds.height),
    )?;
    for cookie in session_cookies(&session, steam_id) {
        webview.set_cookie(
            Cookie::build((cookie.name, cookie.value))
                .domain(cookie.domain)
                .path("/")
                .secure(true)
                .http_only(cookie.http_only)
                .build(),
        )?;
    }
    webview.navigate(Page::Profile.url(steam_id))?;

    let mut tabs = browsers.tabs();
    // Opened twice at once: the first one stays.
    if tabs.contains_key(&account_name) {
        let _ = webview.close();
    } else {
        tabs.insert(
            account_name.clone(),
            Tab {
                webview,
                steam_id,
                page,
                opened_at: unix_now(),
                _forwarder: forwarder,
            },
        );
    }
    drop(tabs);
    show(&browsers, &account_name, bounds)
}

fn tab_builder(
    app: &AppHandle,
    label: &str,
    account_name: &str,
    forwarder: Option<&Forwarder>,
    page: Arc<Mutex<PageState>>,
) -> Result<WebviewBuilder<tauri::Wry>, CommandError> {
    let blank = "about:blank".parse().expect("a valid URL");
    let new_window_app = app.clone();
    let new_window_label = label.to_owned();
    // Cookies stay with this tab alone and are gone once it closes.
    let mut builder = WebviewBuilder::new(label, WebviewUrl::External(blank))
        .incognito(true)
        .initialization_script_for_all_frames(NO_WEBRTC)
        .on_navigation(may_open)
        // Links that would open a window open in the tab instead.
        .on_new_window(move |url, _| {
            if may_open(&url)
                && let Some(webview) = new_window_app.get_webview(&new_window_label)
            {
                let _ = webview.navigate(url);
            }
            NewWindowResponse::Deny
        })
        .on_permission_request(|_, _| PermissionResponse::Deny)
        .on_page_load(move |webview, payload| {
            let mut page = page_state(&page);
            match payload.event() {
                PageLoadEvent::Started => page.loading = true,
                PageLoadEvent::Finished => {
                    page.loading = false;
                    page.history.arrived(payload.url());
                }
            }
            drop(page);
            // Browsing Steam is using the app, as far as locking it goes.
            webview.state::<VaultState>().touch();
        });
    if let Some(forwarder) = forwarder {
        let proxy = format!("http://127.0.0.1:{}", forwarder.port());
        builder = builder.proxy_url(proxy.parse().expect("a valid URL"));
    }
    #[cfg(windows)]
    {
        // WebView2 sets the proxy per data folder, so each account needs its own.
        builder = builder
            .data_directory(
                app.path()
                    .app_local_data_dir()?
                    .join("browser")
                    .join(account_name),
            )
            .additional_browser_args(
                "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                 --force-webrtc-ip-handling-policy=disable_non_proxied_udp",
            );
    }
    #[cfg(not(windows))]
    let _ = account_name;
    Ok(builder)
}

fn show(browsers: &Browsers, account_name: &str, bounds: Bounds) -> Result<(), CommandError> {
    for (name, tab) in browsers.tabs().iter() {
        if name == account_name {
            tab.webview.set_bounds(bounds.into())?;
            tab.webview.show()?;
        } else {
            tab.webview.hide()?;
        }
    }
    Ok(())
}

/// Moves the shown tab, as when the window is resized.
#[tauri::command]
pub fn place_browser(
    browsers: State<'_, Browsers>,
    account_name: String,
    bounds: Bounds,
) -> Result<(), CommandError> {
    show(&browsers, &account_name, bounds)
}

/// Hides the tab, for the app's own screens or anything drawn over the page.
#[tauri::command]
pub fn hide_browser(
    browsers: State<'_, Browsers>,
    account_name: String,
) -> Result<(), CommandError> {
    if let Some(tab) = browsers.tabs().get(&account_name) {
        tab.webview.hide()?;
    }
    Ok(())
}

#[tauri::command]
pub fn close_browser(browsers: State<'_, Browsers>, account_name: String) {
    browsers.close(&account_name);
}

#[tauri::command]
pub fn browser_open_page(
    browsers: State<'_, Browsers>,
    account_name: String,
    page: Page,
) -> Result<(), CommandError> {
    browsers.with_tab(&account_name, |tab| {
        Ok(tab.webview.navigate(page.url(tab.steam_id))?)
    })
}

#[tauri::command]
pub fn browser_back(
    browsers: State<'_, Browsers>,
    account_name: String,
) -> Result<(), CommandError> {
    browsers.with_tab(&account_name, |tab| {
        if page_state(&tab.page).history.back() {
            tab.webview.eval("history.back()")?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn browser_forward(
    browsers: State<'_, Browsers>,
    account_name: String,
) -> Result<(), CommandError> {
    browsers.with_tab(&account_name, |tab| {
        if page_state(&tab.page).history.forward() {
            tab.webview.eval("history.forward()")?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn browser_reload(
    browsers: State<'_, Browsers>,
    account_name: String,
) -> Result<(), CommandError> {
    browsers.with_tab(&account_name, |tab| Ok(tab.webview.reload()?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserState {
    /// `None` until the first page has loaded.
    url: Option<String>,
    loading: bool,
    can_go_back: bool,
    can_go_forward: bool,
    /// Unix seconds.
    opened_at: u64,
}

/// `None` once the tab is closed, as when the vault locked.
#[tauri::command]
pub fn browser_state(browsers: State<'_, Browsers>, account_name: String) -> Option<BrowserState> {
    let tabs = browsers.tabs();
    let tab = tabs.get(&account_name)?;
    let page = page_state(&tab.page);
    Some(BrowserState {
        url: page.history.current().map(ToString::to_string),
        loading: page.loading,
        can_go_back: page.history.can_go_back(),
        can_go_forward: page.history.can_go_forward(),
        opened_at: tab.opened_at,
    })
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}
