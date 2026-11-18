use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use lootify_guard_core::browser::{
    Bookmark, History, SavedCookie, add_bookmark, cookies_to_keep, is_steam_cookie, may_open,
    profile_url, same_cookies, session_cookies, site_icon, typed_url,
};
use lootify_guard_core::browser_profiles::ProfileError;
use lootify_guard_core::browser_region::{self, Region, RegionChoice};
use lootify_guard_core::contents::Contents;
use lootify_guard_core::forward::Forwarder;
use lootify_guard_core::proxy::ProxyAddress;
use lootify_guard_core::steam::{self, SteamError};
use serde::{Deserialize, Serialize};
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Response;
use tauri::webview::cookie::SameSite;
use tauri::webview::cookie::time::OffsetDateTime;
use tauri::webview::{
    Cookie, NewWindowResponse, PageLoadEvent, PermissionResponse, WebviewBuilder,
};
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Rect, State, Url, Webview, WebviewUrl, Window,
};

use crate::accounts::{account_and_proxy, no_such_account, settle, store_session};
use crate::vault::{CommandError, VaultState};

// A page could otherwise ask for a direct connection and reveal the computer's
// own address past the proxy.
const NO_WEBRTC: &str = "for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) { try { delete window[name] } catch {} try { Object.defineProperty(window, name, { value: undefined }) } catch {} }";

// Steam logins are letters, digits and underscores, so no account's tab is named so.
const PRIVATE_PREFIX: &str = "private:";
const PROFILE_PREFIX: &str = "profile:";
// Where a tab signed in to nothing starts: the first of the sites on the bar.
const UNSIGNED_START: &str = "https://store.steampowered.com/";
// How often open tabs' sign-ins go to the vault. An idle lock drops the vault
// before anything can save, so this is the most a lock can lose.
const SAVE_COOKIES_EVERY: Duration = Duration::from_secs(30);

/// The browser tabs that are open: one per account at most, named after it; one
/// per browser profile, named `profile:<id>`; and private ones signed in to
/// nothing, named `private:1`, `private:2` and on.
#[derive(Default)]
pub struct Browsers {
    tabs: Mutex<HashMap<String, Tab>>,
    next_label: AtomicU32,
}

struct Tab {
    webview: Webview,
    owner: Owner,
    page: Arc<Mutex<PageState>>,
    /// What the tab's traffic goes through, so what it fetches besides goes the same way.
    proxy: Option<ProxyAddress>,
    /// Unix seconds.
    opened_at: u64,
    // Stops tunnelling once the tab is gone.
    _forwarder: Option<Forwarder>,
}

/// Whose sign-ins the tab keeps.
#[derive(Clone)]
enum Owner {
    Account(String),
    Profile(u32),
    /// A private tab, which keeps nothing.
    Nobody,
}

#[derive(Default)]
struct PageState {
    loading: bool,
    history: History,
    /// What the page calls itself, for a bookmark of it.
    title: String,
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

    pub(crate) fn close(&self, tab: &str) {
        if let Some(tab) = self.tabs().remove(tab) {
            let _ = tab.webview.close();
        }
    }

    fn next_label(&self) -> String {
        format!(
            "browser-{}",
            self.next_label.fetch_add(1, Ordering::Relaxed)
        )
    }

    fn with_tab<T>(
        &self,
        tab: &str,
        op: impl FnOnce(&Tab) -> Result<T, CommandError>,
    ) -> Result<T, CommandError> {
        let tabs = self.tabs();
        let tab = tabs
            .get(tab)
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
    let saved = cookies_to_keep(account.saved_cookies.clone(), unix_now_signed(), true);
    let region = account
        .browser_region
        .resolve(proxy_country(&state, account.proxy)?.as_deref());
    let session = {
        let proxy = proxy.clone();
        spawn_blocking(move || steam::check_session(&account, proxy.as_ref())).await?
    };
    let session = settle(&state, &account_name, session)?;
    store_session(&state, &account_name, Some(session.clone()))?;
    // A session that checked out has its account's SteamID.
    let steam_id = steam_id.ok_or(SteamError::SessionExpired)?;

    let forwarder = start_forwarder(proxy.as_ref())?;
    let label = browsers.next_label();
    let page = Arc::new(Mutex::new(PageState::default()));
    let builder = tab_builder(
        window.app_handle(),
        &label,
        &account_name,
        forwarder.as_ref(),
        region,
        page.clone(),
    )?;
    let rect = bounds.in_window(&window);
    let webview = window.add_child(builder, rect.position, rect.size)?;
    // Steam's own sign-in goes on last, over anything older for its sites.
    for cookie in &saved {
        webview.set_cookie(restored(cookie))?;
    }
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
                owner: Owner::Account(account_name.clone()),
                page,
                proxy,
                opened_at: unix_now(),
                _forwarder: forwarder,
            },
        );
    }
    drop(tabs);
    show(&browsers, &account_name, rect)
}

/// Opens a tab signed in to nothing, through the proxy with `proxy_id` or straight
/// out. It starts hidden; `place_browser` shows it. Returns the tab's name.
#[tauri::command]
pub async fn open_private_browser(
    window: Window,
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
    proxy_id: Option<u32>,
) -> Result<String, CommandError> {
    let (proxy, country) = match proxy_id {
        Some(id) => {
            let unlocked = state.unlocked();
            let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
            let contents = Contents::from_bytes(vault.data())?;
            let proxy = contents
                .proxy(id)
                .ok_or_else(|| CommandError::Failed("the proxy is no longer there".to_owned()))?;
            (Some(proxy.address.clone()), proxy.country.clone())
        }
        None => (None, None),
    };
    let region = RegionChoice::MatchProxy.resolve(country.as_deref());
    // The lowest free number, so tab names, and on Windows their folders, get reused.
    let name = {
        let tabs = browsers.tabs();
        (1..)
            .map(|n| format!("{PRIVATE_PREFIX}{n}"))
            .find(|name| !tabs.contains_key(name))
            .expect("fewer tabs than numbers")
    };
    let start = UNSIGNED_START.parse().expect("a valid URL");
    open_unsigned(
        &window,
        &browsers,
        &name,
        Owner::Nobody,
        proxy,
        region,
        &[],
        start,
    )?;
    Ok(name)
}

/// Opens the browser profile's tab, with its sign-ins back, where it was last. It
/// starts hidden; `place_browser` shows it. Returns the tab's name.
#[tauri::command]
pub async fn open_profile_browser(
    window: Window,
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
    profile_id: u32,
) -> Result<String, CommandError> {
    let name = format!("{PROFILE_PREFIX}{profile_id}");
    if browsers.tabs().contains_key(&name) {
        return Ok(name);
    }
    let (proxy, region, saved, start) = {
        let mut unlocked = state.unlocked();
        let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
        let mut contents = Contents::from_bytes(vault.data())?;
        let profile = contents.profile(profile_id).ok_or(ProfileError::Missing)?;
        let proxy = contents
            .proxy_of_profile(profile)
            .map_err(|_| ProfileError::MissingProxy)?;
        let region = profile
            .region
            .resolve(proxy.and_then(|proxy| proxy.country.as_deref()));
        let proxy = proxy.map(|proxy| proxy.address.clone());
        let saved = cookies_to_keep(profile.saved_cookies.clone(), unix_now_signed(), false);
        let start = profile
            .last_url
            .as_deref()
            .and_then(|url| url.parse::<Url>().ok())
            .filter(|url| matches!(url.scheme(), "https" | "http"))
            .unwrap_or_else(|| UNSIGNED_START.parse().expect("a valid URL"));
        if let Some(profile) = contents.profile_mut(profile_id) {
            profile.last_opened = Some(unix_now());
        }
        vault.save_data(contents.to_bytes())?;
        (proxy, region, saved, start)
    };
    open_unsigned(
        &window,
        &browsers,
        &name,
        Owner::Profile(profile_id),
        proxy,
        region,
        &saved,
        start,
    )?;
    Ok(name)
}

/// Adds a hidden tab signed in to no Steam account, with `saved` cookies put back.
#[allow(clippy::too_many_arguments)]
fn open_unsigned(
    window: &Window,
    browsers: &Browsers,
    name: &str,
    owner: Owner,
    proxy: Option<ProxyAddress>,
    region: Option<Region>,
    saved: &[SavedCookie],
    start: Url,
) -> Result<(), CommandError> {
    let forwarder = start_forwarder(proxy.as_ref())?;
    let page = Arc::new(Mutex::new(PageState::default()));
    let builder = tab_builder(
        window.app_handle(),
        &browsers.next_label(),
        &name.replace(':', "-"),
        forwarder.as_ref(),
        region,
        page.clone(),
    )?;
    let webview = window.add_child(
        builder,
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(0.0, 0.0),
    )?;
    webview.hide()?;
    for cookie in saved {
        webview.set_cookie(restored(cookie))?;
    }
    webview.navigate(start)?;
    let mut tabs = browsers.tabs();
    // Opened twice at once: the first one stays.
    if tabs.contains_key(name) {
        let _ = webview.close();
        return Ok(());
    }
    tabs.insert(
        name.to_owned(),
        Tab {
            webview,
            owner,
            page,
            proxy,
            opened_at: unix_now(),
            _forwarder: forwarder,
        },
    );
    Ok(())
}

/// Where the proxy with this id comes out, as its last check found.
fn proxy_country(
    state: &VaultState,
    proxy_id: Option<u32>,
) -> Result<Option<String>, CommandError> {
    let Some(id) = proxy_id else {
        return Ok(None);
    };
    let unlocked = state.unlocked();
    let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
    let contents = Contents::from_bytes(vault.data())?;
    Ok(contents.proxy(id).and_then(|proxy| proxy.country.clone()))
}

/// Every time zone a tab can show pages, with its language.
#[tauri::command]
pub fn browser_regions() -> &'static [Region] {
    browser_region::regions()
}

/// Sets the time zone and language the account's tab shows pages, from the next
/// time it opens.
#[tauri::command]
pub fn set_browser_region(
    state: State<'_, VaultState>,
    account_name: String,
    region: RegionChoice,
) -> Result<(), CommandError> {
    if !region.is_known() {
        return Err(ProfileError::UnknownRegion.into());
    }
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    contents
        .account_mut(&account_name)
        .ok_or_else(no_such_account)?
        .browser_region = region;
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

fn start_forwarder(proxy: Option<&ProxyAddress>) -> Result<Option<Forwarder>, CommandError> {
    proxy
        .map(|proxy| Forwarder::start(Some(proxy.clone())))
        .transpose()
        .map_err(|_| CommandError::Failed("could not start the tab's proxy".to_owned()))
}

/// `folder` names the tab's data folder on Windows. `region` is the time zone and
/// language its pages see; `None` leaves them the computer's.
fn tab_builder(
    app: &AppHandle,
    label: &str,
    folder: &str,
    forwarder: Option<&Forwarder>,
    region: Option<Region>,
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
        .on_document_title_changed({
            let page = page.clone();
            move |_, title| page_state(&page).title = title
        })
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
    if let Some(region) = &region {
        builder = builder.initialization_script_for_all_frames(browser_region::script(region));
    }
    if let Some(forwarder) = forwarder {
        let proxy = format!("http://127.0.0.1:{}", forwarder.port());
        builder = builder.proxy_url(proxy.parse().expect("a valid URL"));
    }
    #[cfg(windows)]
    {
        // WebView2 sets the proxy per data folder, so each tab needs its own.
        let mut args = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                        --force-webrtc-ip-handling-policy=disable_non_proxied_udp"
            .to_owned();
        // Chromium can also send the language with every request, which WebKit can't.
        if let Some(region) = &region {
            let base = region.language.split('-').next().unwrap_or(region.language);
            args.push_str(&format!(
                " --lang={0} --accept-lang={0},{base}",
                region.language
            ));
        }
        builder = builder
            .data_directory(
                app.path()
                    .app_local_data_dir()?
                    .join("browser")
                    .join(folder),
            )
            .additional_browser_args(&args);
    }
    #[cfg(not(windows))]
    let _ = folder;
    Ok(builder)
}

fn show(browsers: &Browsers, shown: &str, rect: Rect) -> Result<(), CommandError> {
    for (name, tab) in browsers.tabs().iter() {
        if name == shown {
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
    tab: String,
    bounds: Bounds,
) -> Result<(), CommandError> {
    show(&browsers, &tab, bounds.in_window(&window))
}

/// Hides the tab, for the app's own screens or anything drawn over the page.
#[tauri::command]
pub fn hide_browser(browsers: State<'_, Browsers>, tab: String) -> Result<(), CommandError> {
    if let Some(tab) = browsers.tabs().get(&tab) {
        tab.webview.hide()?;
    }
    Ok(())
}

/// Closes the tab, keeping its sign-ins in the vault first.
#[tauri::command]
pub async fn close_browser(
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
    tab: String,
) -> Result<(), CommandError> {
    let open = browsers.tabs().get(&tab).map(Kept::of);
    if let Some(kept) = open {
        save_tab(&state, &kept);
    }
    browsers.close(&tab);
    Ok(())
}

/// Keeps every open tab's sign-ins in the vault, every half minute while it's unlocked.
pub fn watch_cookies(app: AppHandle) {
    thread::spawn(move || {
        loop {
            thread::sleep(SAVE_COOKIES_EVERY);
            save_cookies(&app.state::<VaultState>(), &app.state::<Browsers>());
        }
    });
}

/// Puts each open tab's cookies in the vault, where they changed. Never on the
/// main thread: WebView2 hands cookies over through it.
pub(crate) fn save_cookies(state: &VaultState, browsers: &Browsers) {
    let open: Vec<Kept> = browsers.tabs().values().map(Kept::of).collect();
    for kept in open {
        save_tab(state, &kept);
    }
}

/// What saving a tab needs, taken out so the tabs aren't locked meanwhile.
struct Kept {
    owner: Owner,
    webview: Webview,
    page: Arc<Mutex<PageState>>,
}

impl Kept {
    fn of(tab: &Tab) -> Self {
        Self {
            owner: tab.owner.clone(),
            webview: tab.webview.clone(),
            page: tab.page.clone(),
        }
    }
}

fn save_tab(state: &VaultState, kept: &Kept) {
    if matches!(kept.owner, Owner::Nobody) {
        return;
    }
    let Ok(cookies) = kept.webview.cookies() else {
        return;
    };
    let cookies = cookies_to_keep(
        cookies.into_iter().filter_map(saved).collect(),
        unix_now_signed(),
        matches!(kept.owner, Owner::Account(_)),
    );
    let url = page_state(&kept.page)
        .history
        .current()
        .filter(|url| matches!(url.scheme(), "https" | "http"))
        .map(ToString::to_string);
    let mut unlocked = state.unlocked();
    let Some(vault) = unlocked.as_mut() else {
        return;
    };
    let Ok(mut contents) = Contents::from_bytes(vault.data()) else {
        return;
    };
    let changed = match &kept.owner {
        Owner::Account(account_name) => contents
            .account_mut(account_name)
            .is_some_and(|account| keep(&mut account.saved_cookies, cookies)),
        Owner::Profile(id) => contents.profile_mut(*id).is_some_and(|profile| {
            let moved = url.is_some() && profile.last_url != url;
            if moved {
                profile.last_url = url;
            }
            keep(&mut profile.saved_cookies, cookies) || moved
        }),
        Owner::Nobody => false,
    };
    if changed {
        let _ = vault.save_data(contents.to_bytes());
    }
}

/// Replaces the kept cookies when they changed, and says whether they did.
fn keep(kept: &mut Vec<SavedCookie>, cookies: Vec<SavedCookie>) -> bool {
    if same_cookies(kept, &cookies) {
        return false;
    }
    *kept = cookies;
    true
}

/// Forgets the sign-ins the tab named `tab` keeps, in the vault and in the tab if
/// it's open. An account's tab keeps Steam's, as it needs them.
#[tauri::command]
pub async fn clear_saved_cookies(
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
    tab: String,
) -> Result<(), CommandError> {
    let profile = tab
        .strip_prefix(PROFILE_PREFIX)
        .map(|id| id.parse::<u32>().map_err(|_| ProfileError::Missing))
        .transpose()?;
    let webview = browsers.tabs().get(&tab).map(|open| open.webview.clone());
    if let Some(webview) = webview {
        for cookie in webview.cookies()? {
            if profile.is_some() || !cookie.domain().is_some_and(is_steam_cookie) {
                webview.delete_cookie(cookie)?;
            }
        }
    }
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let kept = match profile {
        Some(id) => {
            &mut contents
                .profile_mut(id)
                .ok_or(ProfileError::Missing)?
                .saved_cookies
        }
        None => {
            &mut contents
                .account_mut(&tab)
                .ok_or_else(no_such_account)?
                .saved_cookies
        }
    };
    kept.clear();
    vault.save_data(contents.to_bytes())?;
    Ok(())
}

/// A cookie from the tab as the vault keeps it. One with no domain can't be put
/// back anywhere, so it's left out.
fn saved(cookie: Cookie<'static>) -> Option<SavedCookie> {
    Some(SavedCookie {
        domain: cookie.domain()?.to_owned(),
        path: cookie.path().unwrap_or("/").to_owned(),
        secure: cookie.secure().unwrap_or(false),
        http_only: cookie.http_only().unwrap_or(false),
        expires: cookie
            .expires_datetime()
            .map(OffsetDateTime::unix_timestamp),
        same_site: cookie.same_site().map(|same_site| match same_site {
            SameSite::Strict => "strict".to_owned(),
            SameSite::Lax => "lax".to_owned(),
            SameSite::None => "none".to_owned(),
        }),
        name: cookie.name().to_owned(),
        value: cookie.value().to_owned().into(),
    })
}

fn restored(cookie: &SavedCookie) -> Cookie<'static> {
    let mut built = Cookie::build((cookie.name.clone(), cookie.value.expose().to_owned()))
        .domain(cookie.domain.clone())
        .path(cookie.path.clone())
        .secure(cookie.secure)
        .http_only(cookie.http_only);
    if let Some(expires) = cookie
        .expires
        .and_then(|expires| OffsetDateTime::from_unix_timestamp(expires).ok())
    {
        built = built.expires(expires);
    }
    if let Some(same_site) = match cookie.same_site.as_deref() {
        Some("strict") => Some(SameSite::Strict),
        Some("lax") => Some(SameSite::Lax),
        Some("none") => Some(SameSite::None),
        _ => None,
    } {
        built = built.same_site(same_site);
    }
    built.build()
}

/// Opens the address typed into the tab's address bar.
#[tauri::command]
pub fn browser_navigate(
    browsers: State<'_, Browsers>,
    tab: String,
    address: String,
) -> Result<(), CommandError> {
    let url =
        typed_url(&address).ok_or_else(|| CommandError::Failed("not a web address".to_owned()))?;
    browsers.with_tab(&tab, |tab| Ok(tab.webview.navigate(url)?))
}

/// The page as it is on screen, as a JPEG, to show in its place while the app
/// draws over it. Empty where it can't be taken; the tab is just hidden then.
#[tauri::command]
pub async fn browser_snapshot(
    browsers: State<'_, Browsers>,
    tab: String,
) -> Result<Response, CommandError> {
    let webview = browsers.with_tab(&tab, |tab| Ok(tab.webview.clone()))?;
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
pub fn browser_back(browsers: State<'_, Browsers>, tab: String) -> Result<(), CommandError> {
    browsers.with_tab(&tab, |tab| {
        if page_state(&tab.page).history.back() {
            tab.webview.eval("history.back()")?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn browser_forward(browsers: State<'_, Browsers>, tab: String) -> Result<(), CommandError> {
    browsers.with_tab(&tab, |tab| {
        if page_state(&tab.page).history.forward() {
            tab.webview.eval("history.forward()")?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn browser_reload(browsers: State<'_, Browsers>, tab: String) -> Result<(), CommandError> {
    browsers.with_tab(&tab, |tab| Ok(tab.webview.reload()?))
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
pub async fn browser_state(
    browsers: State<'_, Browsers>,
    tab: String,
) -> Result<Option<BrowserState>, CommandError> {
    let Some((webview, page, opened_at)) = browsers
        .tabs()
        .get(&tab)
        .map(|tab| (tab.webview.clone(), tab.page.clone(), tab.opened_at))
    else {
        return Ok(None);
    };
    // Asked of the page itself: single-page sites change the address without
    // loading anything, so no load ever tells of it.
    let shown = webview.url().ok();
    let mut page = page_state(&page);
    if !page.loading
        && let Some(url) = &shown
    {
        page.history.arrived(url);
    }
    Ok(Some(BrowserState {
        url: page.history.current().map(ToString::to_string),
        loading: page.loading,
        can_go_back: page.history.can_go_back(),
        can_go_forward: page.history.can_go_forward(),
        opened_at,
    }))
}

fn unix_now_signed() -> i64 {
    i64::try_from(unix_now()).unwrap_or(i64::MAX)
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}

#[tauri::command]
pub fn list_bookmarks(state: State<'_, VaultState>) -> Result<Vec<Bookmark>, CommandError> {
    let unlocked = state.unlocked();
    let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
    Ok(Contents::from_bytes(vault.data())?.bookmarks)
}

/// Saves the page the tab is on, with its site's icon. Returns every bookmark.
#[tauri::command]
pub async fn bookmark_page(
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
    tab: String,
) -> Result<Vec<Bookmark>, CommandError> {
    let (url, title, proxy) = browsers.with_tab(&tab, |tab| {
        let page = page_state(&tab.page);
        let url = page
            .history
            .current()
            .cloned()
            .ok_or_else(|| CommandError::Failed("the page hasn't loaded yet".to_owned()))?;
        Ok((url, page.title.clone(), tab.proxy.clone()))
    })?;
    let icon = {
        let url = url.clone();
        spawn_blocking(move || site_icon(&url, proxy.as_ref())).await?
    };
    change_bookmarks(&state, |bookmarks| {
        add_bookmark(bookmarks, &url, &title, icon)
            .map_err(|err| CommandError::Failed(err.to_string()))
    })
}

/// Returns every bookmark left.
#[tauri::command]
pub fn remove_bookmark(
    state: State<'_, VaultState>,
    url: String,
) -> Result<Vec<Bookmark>, CommandError> {
    change_bookmarks(&state, |bookmarks| {
        bookmarks.retain(|saved| saved.url != url);
        Ok(())
    })
}

fn change_bookmarks(
    state: &VaultState,
    change: impl FnOnce(&mut Vec<Bookmark>) -> Result<(), CommandError>,
) -> Result<Vec<Bookmark>, CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    change(&mut contents.bookmarks)?;
    vault.save_data(contents.to_bytes())?;
    Ok(contents.bookmarks)
}
