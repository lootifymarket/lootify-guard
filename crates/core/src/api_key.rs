use sha1::{Digest, Sha1};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, community_get, community_post, with_session};

const API_KEY_URL: &str = "https://steamcommunity.com/dev/apikey?l=english";
const REVOKE_URL: &str = "https://steamcommunity.com/dev/revokekey";

/// A Web API key registered on the account. Whoever holds one can read and cancel
/// the account's trade offers and send fake ones in their place, which is how
/// most skin thefts work.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiKey {
    pub domain: String,
    /// Tells this key from one registered after it, without keeping the key itself.
    pub fingerprint: String,
}

/// Looks for a Web API key on the account. Returns the session too, since the
/// access token may have been renewed on the way and should be saved.
pub fn check(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, Option<ApiKey>), SteamError> {
    with_session(account, proxy, |client, _, _| {
        parse(&community_get(client, API_KEY_URL)?)
    })
}

/// Deletes the account's Web API key, then looks again to be sure it's gone.
pub fn revoke(account: &Account, proxy: Option<&ProxyAddress>) -> Result<Session, SteamError> {
    let (session, key) = with_session(account, proxy, |client, session, _| {
        community_post(client, REVOKE_URL, session, &[("Revoke", "Revoke")])?;
        parse(&community_get(client, API_KEY_URL)?)
    })?;
    match key {
        None => Ok(session),
        Some(_) => Err(SteamError::Steam("the key is still there".to_owned())),
    }
}

// The page says which of these it is only in its text, so that is what's read.
fn parse(page: &str) -> Result<Option<ApiKey>, SteamError> {
    if let (Some(key), Some(domain)) = (
        text_after(page, ">Key: "),
        text_after(page, "Domain Name: "),
    ) {
        return Ok(Some(ApiKey {
            domain: unescape(domain),
            fingerprint: Sha1::digest(key)
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect(),
        }));
    }
    // Accounts that never spent $5 or have no verified email can't have a key at all.
    let without_key = [
        "Registering for a Steam Web API Key",
        "Access Denied",
        "Validated email address required",
    ];
    if without_key.iter().any(|text| page.contains(text)) {
        return Ok(None);
    }
    Err(SteamError::Steam("unreadable API key page".to_owned()))
}

fn text_after<'a>(page: &'a str, label: &str) -> Option<&'a str> {
    let start = page.find(label)? + label.len();
    let rest = &page[start..];
    let text = rest[..rest.find('<').unwrap_or(rest.len())].trim();
    (!text.is_empty()).then_some(text)
}

fn unescape(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    const WITH_KEY: &str = r#"<div id="bodyContents_ex">
        <h2>Your Steam Web API Key</h2>
        <p>Key: 0123456789ABCDEF0123456789ABCDEF</p>
        <p>Domain Name: steam-trade-gift.com</p>
        <form action="https://steamcommunity.com/dev/revokekey" method="POST">"#;

    #[test]
    fn reads_the_domain_and_keeps_only_a_fingerprint() {
        let key = parse(WITH_KEY).unwrap().unwrap();
        assert_eq!(key.domain, "steam-trade-gift.com");
        assert_eq!(key.fingerprint.len(), 40);
        assert!(!key.fingerprint.contains("0123456789ABCDEF"));
    }

    #[test]
    fn another_key_has_another_fingerprint() {
        let other = WITH_KEY.replace("0123456789ABCDEF0123", "FFFFFFFFFFFFFFFF0123");
        assert_ne!(
            parse(WITH_KEY).unwrap().unwrap().fingerprint,
            parse(&other).unwrap().unwrap().fingerprint
        );
    }

    #[test]
    fn no_key_pages_mean_no_key() {
        for page in [
            "<h2>Register for a new Steam Web API Key</h2><p>Registering for a Steam Web API Key will enable you</p>",
            "<h2>Access Denied</h2><p>You must spend $5 or more</p>",
        ] {
            assert_eq!(parse(page).unwrap(), None);
        }
    }

    #[test]
    fn an_unknown_page_is_an_error_not_a_missing_key() {
        assert!(parse("<html><body>Something went wrong</body></html>").is_err());
    }

    #[test]
    fn the_domain_is_unescaped() {
        let page = WITH_KEY.replace("steam-trade-gift.com", "a&amp;b.com");
        assert_eq!(parse(&page).unwrap().unwrap().domain, "a&b.com");
    }
}
