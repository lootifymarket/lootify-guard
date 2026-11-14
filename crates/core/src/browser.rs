//! What an account's browser tab needs from the vault: the cookies that sign it
//! in to Steam, the pages it links to and the way back and forth through them.

use reqwest::Url;
use serde::Deserialize;

use crate::contents::Session;
use crate::steam::session_id;

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

/// The Steam pages the tab links to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Page {
    Profile,
    Inventory,
    TradeOffers,
    Market,
    Store,
    Wallet,
    Account,
}

impl Page {
    pub fn url(self, steam_id: u64) -> Url {
        let url = match self {
            Self::Profile => format!("https://steamcommunity.com/profiles/{steam_id}/"),
            Self::Inventory => format!("https://steamcommunity.com/profiles/{steam_id}/inventory/"),
            Self::TradeOffers => {
                format!("https://steamcommunity.com/profiles/{steam_id}/tradeoffers/")
            }
            Self::Market => "https://steamcommunity.com/market/".to_owned(),
            Self::Store => "https://store.steampowered.com/".to_owned(),
            Self::Wallet => "https://store.steampowered.com/account/history/".to_owned(),
            Self::Account => "https://store.steampowered.com/account/".to_owned(),
        };
        url.parse().expect("a valid URL")
    }
}

/// Whether the tab may load `url`. Only web pages: nothing on this computer and
/// no links that hand off to other apps, such as `steam://`.
pub fn may_open(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "http" | "about" | "blob" | "data")
}

/// The pages the tab went through, as far as it can be told from the pages that
/// finished loading. Redirects leave nothing behind, as in the page's own history.
#[derive(Debug, Default)]
pub struct History {
    pages: Vec<Url>,
    at: usize,
    // Set by going back or forward: the next page to load is that one, maybe
    // under a new address, and not a new step.
    travelling: bool,
}

impl History {
    /// Records a page that finished loading.
    pub fn arrived(&mut self, url: &Url) {
        if !matches!(url.scheme(), "https" | "http") {
            return;
        }
        if self.travelling {
            self.travelling = false;
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
        self.at -= 1;
        self.travelling = true;
        true
    }

    /// Steps forward; false when there's nothing to go forward to.
    pub fn forward(&mut self) -> bool {
        if !self.can_go_forward() {
            return false;
        }
        self.at += 1;
        self.travelling = true;
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
