//! What an account's browser tab needs from the vault: the cookies that sign it
//! in to Steam, where it starts and the way back and forth through its pages.

use std::io::Read;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::Url;
use reqwest::blocking::{Client, Response};
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};

use crate::contents::Session;
use crate::proxy::ProxyAddress;
use crate::steam::{builder, session_id};

// Every site that takes the account's web session. The token works on all of
// them, but each keeps its own cookies.
const SIGNED_IN_SITES: [&str; 4] = [
    "steamcommunity.com",
    "store.steampowered.com",
    "help.steampowered.com",
    "checkout.steampowered.com",
];

/// A cookie for one Steam site. It holds the access token, so it's handed to the
/// tab and dropped, never printed.
pub struct SessionCookie {
    pub domain: &'static str,
    pub name: &'static str,
    pub value: String,
    /// Kept from the page's scripts, as Steam sets it itself.
    pub http_only: bool,
}

/// The cookies that make every Steam site see the tab as signed in.
pub fn session_cookies(session: &Session, steam_id: u64) -> Vec<SessionCookie> {
    let login = format!("{steam_id}%7C%7C{}", session.access_token.expose());
    let session_id = session_id(session);
    SIGNED_IN_SITES
        .into_iter()
        .flat_map(|domain| {
            [
                SessionCookie {
                    domain,
                    name: "steamLoginSecure",
                    value: login.clone(),
                    http_only: true,
                },
                SessionCookie {
                    domain,
                    name: "sessionid",
                    value: session_id.clone(),
                    http_only: false,
                },
            ]
        })
        .collect()
}

/// The account's profile, where a tab starts.
pub fn profile_url(steam_id: u64) -> Url {
    format!("https://steamcommunity.com/profiles/{steam_id}/")
        .parse()
        .expect("a valid URL")
}

/// Whether the tab may load `url`. Only web pages: nothing on this computer and
/// no links that hand off to other apps, such as `steam://`.
pub fn may_open(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "http" | "about" | "blob" | "data")
}

/// The page someone typed into the address bar. A bare `steamcommunity.com/market`
/// gets `https://` in front; anything that isn't a web address is turned away.
pub fn typed_url(text: &str) -> Option<Url> {
    let text = text.trim();
    if text.is_empty() || text.contains(char::is_whitespace) {
        return None;
    }
    let url = match text.parse::<Url>() {
        Ok(url) if url.has_host() => url,
        // A host with a port, like `example.com:8080`, parses as a scheme.
        _ if !text.contains("://") && text.contains('.') => {
            format!("https://{text}").parse().ok()?
        }
        _ => return None,
    };
    matches!(url.scheme(), "https" | "http").then_some(url)
}

/// A page saved to the bar under the address. The same for every account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bookmark {
    pub url: String,
    pub title: String,
    /// The site's icon as a data URL, when it had one to give.
    #[serde(default)]
    pub icon: Option<String>,
}

// A bar fits a dozen or so; past this it's a list, which the bar isn't.
pub const MAX_BOOKMARKS: usize = 50;
// Page titles run long, like "Steam Community :: Kernel R1 :: Inventory".
const MAX_TITLE: usize = 40;

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
#[error("there are already {MAX_BOOKMARKS} bookmarks, remove one first")]
pub struct TooManyBookmarks;

/// Saves the page under its title, or its host when it has none. A page saved
/// already keeps its place and gets the new title and icon.
pub fn add_bookmark(
    bookmarks: &mut Vec<Bookmark>,
    url: &Url,
    title: &str,
    icon: Option<String>,
) -> Result<(), TooManyBookmarks> {
    let title = match title.trim() {
        "" => url.host_str().unwrap_or_default().to_owned(),
        title if title.chars().count() > MAX_TITLE => {
            let cut: String = title.chars().take(MAX_TITLE - 1).collect();
            format!("{}…", cut.trim_end())
        }
        title => title.to_owned(),
    };
    if let Some(saved) = bookmarks.iter_mut().find(|saved| saved.url == url.as_str()) {
        saved.title = title;
        saved.icon = icon;
        return Ok(());
    }
    if bookmarks.len() >= MAX_BOOKMARKS {
        return Err(TooManyBookmarks);
    }
    bookmarks.push(Bookmark {
        url: url.to_string(),
        title,
        icon,
    });
    Ok(())
}

// The icon is named in the page's head, well before this.
const MAX_PAGE_LEN: u64 = 512 * 1024;
// Site icons are a few kilobytes; anything far bigger isn't one.
const MAX_ICON_LEN: u64 = 64 * 1024;

/// The icon of the site `page` is on, as a data URL: the one the page names, or
/// else `/favicon.ico`. Fetched through the account's proxy, without its cookies.
pub fn site_icon(page: &Url, proxy: Option<&ProxyAddress>) -> Option<String> {
    let client = builder(proxy).ok()?.build().ok()?;
    let named = client
        .get(page.clone())
        .send()
        .ok()
        .filter(|response| response.status().is_success())
        .and_then(|response| read_up_to(response, MAX_PAGE_LEN))
        .and_then(|html| icon_link(&String::from_utf8_lossy(&html), page));
    let fallback = page.join("/favicon.ico").ok();
    named
        .into_iter()
        .chain(fallback)
        .find_map(|icon| download_icon(&client, icon))
}

fn download_icon(client: &Client, url: Url) -> Option<String> {
    let response = client.get(url).send().ok()?.error_for_status().ok()?;
    let kind = response.headers().get(CONTENT_TYPE)?.to_str().ok()?;
    let kind = kind.split(';').next()?.trim().to_ascii_lowercase();
    // Sites that answer every path with their app send a page here, not an icon.
    if !kind.starts_with("image/") {
        return None;
    }
    let image = read_up_to(response, MAX_ICON_LEN + 1)?;
    if image.is_empty() || image.len() as u64 > MAX_ICON_LEN {
        return None;
    }
    Some(format!("data:{kind};base64,{}", STANDARD.encode(image)))
}

fn read_up_to(response: Response, limit: u64) -> Option<Vec<u8>> {
    let mut body = Vec::new();
    response.take(limit).read_to_end(&mut body).ok()?;
    Some(body)
}

/// Where the first `<link rel="icon">` in the page points.
fn icon_link(html: &str, page: &Url) -> Option<Url> {
    // Lowercasing ASCII keeps every byte where it was, so positions carry over.
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(start) = lower[from..].find("<link") {
        let start = from + start;
        let end = start + lower[start..].find('>')?;
        from = end;
        let tag = &html[start..end];
        let is_icon = attribute(tag, "rel").is_some_and(|rel| {
            rel.split_whitespace()
                .any(|word| word.eq_ignore_ascii_case("icon"))
        });
        if is_icon && let Some(href) = attribute(tag, "href") {
            return page.join(&href).ok();
        }
    }
    None
}

fn attribute(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    loop {
        let found = from + lower[from..].find(name)?;
        from = found + name.len();
        let preceded = lower[..found].ends_with(char::is_whitespace);
        let rest = lower[from..].trim_start();
        if !preceded || !rest.starts_with('=') {
            continue;
        }
        let value = tag[tag.len() - rest.len() + 1..].trim_start();
        return Some(match value.chars().next()? {
            quote @ ('"' | '\'') => value[1..].split(quote).next()?.to_owned(),
            _ => value
                .split(|c: char| c.is_whitespace() || c == '/')
                .next()?
                .to_owned(),
        });
    }
}

/// The pages the tab went through, as far as it can be told from the pages that
/// finished loading and the addresses pages gave themselves. Redirects leave
/// nothing behind, as in the page's own history.
#[derive(Debug, Default)]
pub struct History {
    pages: Vec<Url>,
    at: usize,
    // The page being left by going back or forward. The next new address is the
    // page gone to, maybe under a new address, and not a new step.
    leaving: Option<Url>,
}

impl History {
    /// Records the page the tab is on: one that finished loading, or an address
    /// a page changed to without loading, as single-page sites do.
    pub fn arrived(&mut self, url: &Url) {
        if !matches!(url.scheme(), "https" | "http") {
            return;
        }
        if let Some(leaving) = &self.leaving {
            // Still on the page being left: the step hasn't happened yet.
            if leaving == url {
                return;
            }
            self.leaving = None;
            if let Some(page) = self.pages.get_mut(self.at) {
                *page = url.clone();
                return;
            }
        }
        if self.pages.get(self.at) == Some(url) {
            return;
        }
        if !self.pages.is_empty() {
            self.pages.truncate(self.at + 1);
        }
        self.pages.push(url.clone());
        self.at = self.pages.len() - 1;
    }

    /// Steps back; false when there's nothing to go back to.
    pub fn back(&mut self) -> bool {
        if !self.can_go_back() {
            return false;
        }
        self.leaving = self.pages.get(self.at).cloned();
        self.at -= 1;
        true
    }

    /// Steps forward; false when there's nothing to go forward to.
    pub fn forward(&mut self) -> bool {
        if !self.can_go_forward() {
            return false;
        }
        self.leaving = self.pages.get(self.at).cloned();
        self.at += 1;
        true
    }

    pub fn can_go_back(&self) -> bool {
        self.at > 0
    }

    pub fn can_go_forward(&self) -> bool {
        self.at + 1 < self.pages.len()
    }

    pub fn current(&self) -> Option<&Url> {
        self.pages.get(self.at)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(path: &str) -> Url {
        format!("https://steamcommunity.com{path}").parse().unwrap()
    }

    #[test]
    fn every_signed_in_site_gets_both_cookies() {
        let session = Session {
            access_token: "token".to_owned().into(),
            refresh_token: "refresh".to_owned().into(),
        };
        let cookies = session_cookies(&session, 76561197960287930);
        assert_eq!(cookies.len(), SIGNED_IN_SITES.len() * 2);
        let login = cookies
            .iter()
            .find(|cookie| {
                cookie.domain == "steamcommunity.com" && cookie.name == "steamLoginSecure"
            })
            .unwrap();
        assert_eq!(login.value, "76561197960287930%7C%7Ctoken");
        assert!(login.http_only);
        let form_cookie = cookies
            .iter()
            .find(|cookie| cookie.domain == "store.steampowered.com" && cookie.name == "sessionid")
            .unwrap();
        // Forms on the page send the same value back, so scripts must read it.
        assert!(!form_cookie.http_only);
        assert_eq!(form_cookie.value, session_id(&session));
    }

    #[test]
    fn only_web_pages_open() {
        assert!(may_open(&url("/market/")));
        assert!(may_open(&"about:blank".parse().unwrap()));
        assert!(!may_open(&"steam://rungameid/730".parse().unwrap()));
        assert!(!may_open(&"file:///etc/passwd".parse().unwrap()));
    }

    #[test]
    fn typed_addresses_become_web_pages() {
        let page = |text: &str| typed_url(text).map(|url| url.to_string());
        assert_eq!(
            page("steamcommunity.com/market"),
            Some("https://steamcommunity.com/market".to_owned())
        );
        assert_eq!(
            page("  https://store.steampowered.com/account/ "),
            Some("https://store.steampowered.com/account/".to_owned())
        );
        assert_eq!(
            page("localhost.test:8080/x"),
            Some("https://localhost.test:8080/x".to_owned())
        );
        assert_eq!(page("steam://rungameid/730"), None);
        assert_eq!(page("file:///etc/passwd"), None);
        assert_eq!(page("javascript:alert(1)"), None);
        assert_eq!(page("cs2 skins"), None);
        assert_eq!(page("market"), None);
        assert_eq!(page(""), None);
    }

    #[test]
    fn bookmarks_are_saved_once_with_a_short_title() {
        let mut bookmarks = Vec::new();
        add_bookmark(
            &mut bookmarks,
            &url("/market/"),
            "  Steam Community Market  ",
            None,
        )
        .unwrap();
        add_bookmark(&mut bookmarks, &url("/a"), "", None).unwrap();
        add_bookmark(&mut bookmarks, &url("/market/"), "Market", None).unwrap();
        let long = "Steam Community :: Kernel R1 :: Inventory :: Counter-Strike 2";
        add_bookmark(&mut bookmarks, &url("/b"), long, None).unwrap();
        let titles: Vec<&str> = bookmarks.iter().map(|saved| saved.title.as_str()).collect();
        assert_eq!(
            titles,
            [
                "Market",
                "steamcommunity.com",
                "Steam Community :: Kernel R1 :: Invento…"
            ]
        );
        assert_eq!(titles[2].chars().count(), MAX_TITLE);
        assert_eq!(bookmarks[0].url, "https://steamcommunity.com/market/");
    }

    #[test]
    fn the_bar_has_room_for_so_many() {
        let mut bookmarks = Vec::new();
        for n in 0..MAX_BOOKMARKS {
            add_bookmark(&mut bookmarks, &url(&format!("/{n}")), "page", None).unwrap();
        }
        assert_eq!(
            add_bookmark(&mut bookmarks, &url("/one-more"), "page", None),
            Err(TooManyBookmarks)
        );
        // Saving one again only renames it, so a full bar still allows it.
        add_bookmark(&mut bookmarks, &url("/0"), "first", None).unwrap();
    }

    #[test]
    fn the_icon_a_page_names_is_found() {
        let page: Url = "https://lootify.market/giveaways".parse().unwrap();
        let icon = |html: &str| icon_link(html, &page).map(|url| url.to_string());
        assert_eq!(
            icon(
                r#"<head><link rel="stylesheet" href="/a.css"><LINK REL="icon" type="image/png" href="/favicon.png"></head>"#
            ),
            Some("https://lootify.market/favicon.png".to_owned())
        );
        assert_eq!(
            icon("<link href='https://cdn.example/i.ico' rel='shortcut icon'>"),
            Some("https://cdn.example/i.ico".to_owned())
        );
        assert_eq!(
            icon("<link rel=icon href=icon.svg />"),
            Some("https://lootify.market/icon.svg".to_owned())
        );
        // A touch icon is for home screens, and `data-rel` isn't `rel`.
        assert_eq!(
            icon(
                r#"<link rel="apple-touch-icon" href="/t.png"><link data-rel="icon" href="/d.png">"#
            ),
            None
        );
        assert_eq!(icon("<p>no head</p>"), None);
    }

    #[test]
    fn new_pages_drop_the_way_forward() {
        let mut history = History::default();
        history.arrived(&"about:blank".parse().unwrap());
        assert_eq!(history.current(), None);
        history.arrived(&url("/a"));
        history.arrived(&url("/b"));
        history.arrived(&url("/c"));
        assert!(history.back());
        history.arrived(&url("/b"));
        assert!(history.can_go_forward());
        history.arrived(&url("/d"));
        assert!(!history.can_go_forward());
        assert_eq!(history.current(), Some(&url("/d")));
        assert!(history.back());
        history.arrived(&url("/b"));
        assert!(history.back());
        history.arrived(&url("/a"));
        assert!(!history.can_go_back());
        assert!(!history.back());
    }

    #[test]
    fn the_page_being_left_is_not_where_it_went() {
        let mut history = History::default();
        history.arrived(&url("/a"));
        history.arrived(&url("/b"));
        assert!(history.back());
        // Looked at before the page went back.
        history.arrived(&url("/b"));
        assert_eq!(history.current(), Some(&url("/a")));
        assert!(history.can_go_forward());
        history.arrived(&url("/a"));
        history.arrived(&url("/c"));
        assert_eq!(history.current(), Some(&url("/c")));
        assert!(!history.can_go_forward());
    }

    #[test]
    fn reloads_and_redirected_steps_are_not_new_pages() {
        let mut history = History::default();
        history.arrived(&url("/a"));
        history.arrived(&url("/a"));
        assert!(!history.can_go_back());
        history.arrived(&url("/b"));
        assert!(history.back());
        // The page it went back to sent it on elsewhere.
        history.arrived(&url("/a/home"));
        assert_eq!(history.current(), Some(&url("/a/home")));
        assert!(history.forward());
        history.arrived(&url("/b"));
        assert!(!history.can_go_forward());
        assert!(history.can_go_back());
    }
}
