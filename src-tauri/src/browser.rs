use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use lootify_guard_core::browser::{History, may_open, profile_url, session_cookies, typed_url};
use lootify_guard_core::forward::Forwarder;
use lootify_guard_core::steam::{self, SteamError};
use serde::{Deserialize, Serialize};
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Response;
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

impl Bounds {
    /// The same place, measured from the window's top edge as tabs are placed.
    fn in_window(self, window: &Window) -> Rect {
        Rect {
            position: LogicalPosition::new(self.x, self.y + title_bar_height(window)).into(),
            size: LogicalSize::new(self.width, self.height).into(),
        }
    }
}

/// How far the title bar reaches over the window's content. Tauri runs the
/// content under it on macOS, and the app's page starts below it.
#[cfg(target_os = "macos")]
fn title_bar_height(window: &Window) -> f64 {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use objc2_foundation::NSRect;

    // Must not be called on the main thread, which it waits for.
    let (tx, rx) = std::sync::mpsc::channel();
    let measured = window.clone();
    let asked = window.run_on_main_thread(move || {
        let Ok(ns_window) = measured.ns_window() else {
            return;
        };
        // SAFETY: an NSWindow that lives as long as `measured`, read on the main thread.
        let (frame, layout): (NSRect, NSRect) = unsafe {
            let ns_window = &*ns_window.cast::<AnyObject>();
            (
                msg_send![ns_window, frame],
                msg_send![ns_window, contentLayoutRect],
            )
        };
        let _ = tx.send((frame.size.height - layout.size.height).max(0.0));
    });
    asked.ok().and_then(|()| rx.recv().ok()).unwrap_or(0.0)
}

#[cfg(not(target_os = "macos"))]
fn title_bar_height(_: &Window) -> f64 {
    0.0
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
        return show(&browsers, &account_name, bounds.in_window(&window));
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
    let rect = bounds.in_window(&window);
    let webview = window.add_child(builder, rect.position, rect.size)?;
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
    webview.navigate(profile_url(steam_id))?;

    let mut tabs = browsers.tabs();
    // Opened twice at once: the first one stays.
    if tabs.contains_key(&account_name) {
        let _ = webview.close();
    } else {
        tabs.insert(
            account_name.clone(),
            Tab {
                webview,
                page,
                opened_at: unix_now(),
                _forwarder: forwarder,
            },
        );
    }
    drop(tabs);
    show(&browsers, &account_name, rect)
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

fn show(browsers: &Browsers, account_name: &str, rect: Rect) -> Result<(), CommandError> {
    for (name, tab) in browsers.tabs().iter() {
        if name == account_name {
            tab.webview.set_bounds(rect)?;
            tab.webview.show()?;
        } else {
            tab.webview.hide()?;
        }
    }
    Ok(())
}

/// Moves the shown tab, as when the window is resized.
#[tauri::command]
pub async fn place_browser(
    window: Window,
    browsers: State<'_, Browsers>,
    account_name: String,
    bounds: Bounds,
) -> Result<(), CommandError> {
    show(&browsers, &account_name, bounds.in_window(&window))
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

/// Opens the address typed into the tab's address bar.
#[tauri::command]
pub fn browser_navigate(
    browsers: State<'_, Browsers>,
    account_name: String,
    address: String,
) -> Result<(), CommandError> {
    let url =
        typed_url(&address).ok_or_else(|| CommandError::Failed("not a web address".to_owned()))?;
    browsers.with_tab(&account_name, |tab| Ok(tab.webview.navigate(url)?))
}

/// The page as it is on screen, as a JPEG, to show in its place while the app
/// draws over it. Empty where it can't be taken; the tab is just hidden then.
#[tauri::command]
pub async fn browser_snapshot(
    browsers: State<'_, Browsers>,
    account_name: String,
) -> Result<Response, CommandError> {
    let webview = browsers.with_tab(&account_name, |tab| Ok(tab.webview.clone()))?;
    Ok(Response::new(snapshot(&webview).unwrap_or_default()))
}

// WebKit hands the picture over on the main thread; past this, it's not coming.
#[cfg(target_os = "macos")]
const SNAPSHOT_WAIT: std::time::Duration = std::time::Duration::from_secs(2);

#[cfg(target_os = "macos")]
fn snapshot(webview: &Webview) -> Option<Vec<u8>> {
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    let (tx, rx) = std::sync::mpsc::channel();
    webview
        .with_webview(move |platform| {
            let done = RcBlock::new(move |image: *mut AnyObject, _error: *mut AnyObject| {
                // SAFETY: an NSImage or nil from WebKit, on the main thread.
                let _ = tx.send(unsafe { image.as_ref() }.and_then(|image| unsafe { jpeg(image) }));
            });
            // SAFETY: the tab's WKWebView, on the main thread.
            unsafe {
                let webview = &*platform.inner().cast::<AnyObject>();
                let _: () = msg_send![
                    webview,
                    takeSnapshotWithConfiguration: std::ptr::null_mut::<AnyObject>(),
                    completionHandler: &*done
                ];
            }
        })
        .ok()?;
    rx.recv_timeout(SNAPSHOT_WAIT).ok().flatten()
}

/// # Safety
/// `image` is an NSImage, used on the main thread.
#[cfg(target_os = "macos")]
unsafe fn jpeg(image: &objc2::runtime::AnyObject) -> Option<Vec<u8>> {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};

    // NSBitmapImageFileTypeJPEG.
    const JPEG: usize = 3;
    unsafe {
        let tiff: *mut AnyObject = msg_send![image, TIFFRepresentation];
        let rep: *mut AnyObject =
            msg_send![class!(NSBitmapImageRep), imageRepWithData: tiff.as_ref()?];
        let properties: *mut AnyObject = msg_send![class!(NSDictionary), dictionary];
        let data: *mut AnyObject =
            msg_send![rep.as_ref()?, representationUsingType: JPEG, properties: properties];
        let data = data.as_ref()?;
        let length: usize = msg_send![data, length];
        let bytes: *const std::ffi::c_void = msg_send![data, bytes];
        Some(std::slice::from_raw_parts(bytes.cast::<u8>(), length).to_vec())
    }
}

#[cfg(not(target_os = "macos"))]
fn snapshot(_: &Webview) -> Option<Vec<u8>> {
    None
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
