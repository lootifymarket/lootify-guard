use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, community_get, community_post, with_session};

const MARKET_URL: &str = "https://steamcommunity.com/market/";
const WALLET_MARK: &str = "g_rgWalletInfo = ";
// The market page sets this to false for a visitor who isn't signed in.
const SIGNED_OUT_MARK: &str = "g_steamID = false";

/// The money in the account's Steam wallet, in hundredths of its currency.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wallet {
    /// ISO 4217, or `None` for a currency this app doesn't know.
    pub currency: Option<&'static str>,
    pub balance: u64,
    /// Money that arrives once a market sale or a deposit clears.
    pub pending: u64,
}

/// The link others use to send the account trade offers without being friends.
pub fn trade_url(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, String), SteamError> {
    with_session(account, proxy, |client, _, steam_id| {
        let page = community_get(client, &privacy_url(steam_id))?;
        let token = trade_token(&page)
            .ok_or_else(|| SteamError::Steam("no trade URL on the page".to_owned()))?;
        Ok(link(steam_id, token))
    })
}

/// Makes a new trade URL. The old one stops working, and offers sent to it are lost.
pub fn new_trade_url(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, String), SteamError> {
    with_session(account, proxy, |client, session, steam_id| {
        let url = format!("https://steamcommunity.com/profiles/{steam_id}/tradeoffers/newtradeurl");
        let answer = community_post(client, &url, session, &[])?;
        // Steam answers with the new token alone, as a JSON string.
        let token: String = serde_json::from_str(&answer)
            .map_err(|_| SteamError::Steam("unreadable trade token".to_owned()))?;
        if token.is_empty() {
            return Err(SteamError::Steam("Steam made no new trade URL".to_owned()));
        }
        Ok(link(steam_id, &token))
    })
}

/// The wallet balance, or `None` when the account has no wallet yet.
pub fn wallet(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, Option<Wallet>), SteamError> {
    with_session(account, proxy, |client, _, _| {
        parse_wallet(&community_get(client, MARKET_URL)?)
    })
}

fn privacy_url(steam_id: u64) -> String {
    format!("https://steamcommunity.com/profiles/{steam_id}/tradeoffers/privacy")
}

fn link(steam_id: u64, token: &str) -> String {
    // The partner is the lower half of the SteamID64.
    let partner = steam_id & 0xFFFF_FFFF;
    format!("https://steamcommunity.com/tradeoffer/new/?partner={partner}&token={token}")
}

fn trade_token(page: &str) -> Option<&str> {
    let field = &page[page.find("trade_offer_access_url")?..];
    let start = field.find("token=")? + "token=".len();
    let token = &field[start..];
    let token =
        &token[..token.find(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_')?];
    (!token.is_empty()).then_some(token)
}

#[derive(Deserialize)]
struct WalletInfo {
    wallet_currency: Option<u32>,
    wallet_balance: Option<Amount>,
    wallet_delayed_balance: Option<Amount>,
}

// The page writes amounts as numbers or as text, depending on the account.
#[derive(Deserialize)]
#[serde(untagged)]
enum Amount {
    Number(u64),
    Text(String),
}

impl Amount {
    fn cents(&self) -> Option<u64> {
        match self {
            Amount::Number(cents) => Some(*cents),
            Amount::Text(cents) => cents.parse().ok(),
        }
    }
}

/// The wallet's currency, as Steam numbers it, or `None` when there's no wallet.
pub(crate) fn wallet_currency(client: &Client) -> Result<Option<u32>, SteamError> {
    Ok(read_wallet(&community_get(client, MARKET_URL)?)?.and_then(|info| info.wallet_currency))
}

fn parse_wallet(page: &str) -> Result<Option<Wallet>, SteamError> {
    let Some(info) = read_wallet(page)? else {
        return Ok(None);
    };
    let cents = |amount: &Option<Amount>| amount.as_ref().and_then(Amount::cents).unwrap_or(0);
    Ok(Some(Wallet {
        currency: info.wallet_currency.and_then(currency_code),
        balance: cents(&info.wallet_balance),
        pending: cents(&info.wallet_delayed_balance),
    }))
}

/// The wallet as the market page has it, or `None` when the account has none.
fn read_wallet(page: &str) -> Result<Option<WalletInfo>, SteamError> {
    if page.contains(SIGNED_OUT_MARK) {
        return Err(SteamError::SessionExpired);
    }
    let start = page
        .find(WALLET_MARK)
        .ok_or_else(|| SteamError::Steam("no wallet on the market page".to_owned()))?
        + WALLET_MARK.len();
    // Only the object is read; the script after it is left alone.
    let info = serde_json::Deserializer::from_str(&page[start..])
        .into_iter::<WalletInfo>()
        .next()
        .and_then(Result::ok)
        .ok_or_else(|| SteamError::Steam("unreadable wallet".to_owned()))?;
    Ok(info
        .wallet_currency
        .is_some_and(|id| id != 0)
        .then_some(info))
}

/// Steam numbers its currencies itself; this maps them to ISO codes.
pub(crate) fn currency_code(id: u32) -> Option<&'static str> {
    const CODES: [&str; 41] = [
        "USD", "GBP", "EUR", "CHF", "RUB", "PLN", "BRL", "JPY", "NOK", "IDR", "MYR", "PHP", "SGD",
        "THB", "VND", "KRW", "TRY", "UAH", "MXN", "CAD", "AUD", "NZD", "CNY", "INR", "CLP", "PEN",
        "COP", "ZAR", "HKD", "TWD", "SAR", "AED", "", "ARS", "ILS", "", "KZT", "KWD", "QAR", "CRC",
        "UYU",
    ];
    let code = *CODES.get(usize::try_from(id).ok()?.checked_sub(1)?)?;
    (!code.is_empty()).then_some(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_trade_url_is_built_from_the_page_token() {
        let page = r#"<input type="text" id="trade_offer_access_url" readonly
            value="https://steamcommunity.com/tradeoffer/new/?partner=40095174&amp;token=Qm81z-x_">"#;
        let token = trade_token(page).unwrap();
        assert_eq!(token, "Qm81z-x_");
        assert_eq!(
            link(76561198000361462, token),
            "https://steamcommunity.com/tradeoffer/new/?partner=40095734&token=Qm81z-x_"
        );
    }

    #[test]
    fn a_page_without_the_field_has_no_token() {
        assert_eq!(trade_token("<p>token=abc</p>"), None);
    }

    #[test]
    fn reads_the_wallet_from_the_market_page() {
        let page = r#"<script>g_steamID = "76561198000000001";
            var g_rgWalletInfo = {"wallet_currency":1,"wallet_country":"US","wallet_balance":"41280","wallet_delayed_balance":250,"wallet_max_balance":"200000"};
            g_rgCurrencyData = {};</script>"#;
        assert_eq!(
            parse_wallet(page).unwrap(),
            Some(Wallet {
                currency: Some("USD"),
                balance: 41280,
                pending: 250,
            })
        );
    }

    #[test]
    fn an_account_without_a_wallet_has_none() {
        let page = r#"g_steamID = "1"; g_rgWalletInfo = {"wallet_currency":0,"success":true};"#;
        assert_eq!(parse_wallet(page).unwrap(), None);
    }

    #[test]
    fn a_signed_out_page_means_the_session_ended() {
        let page = r#"g_steamID = false; g_rgWalletInfo = {"success":false};"#;
        assert!(matches!(
            parse_wallet(page),
            Err(SteamError::SessionExpired)
        ));
    }

    #[test]
    fn known_currencies_get_iso_codes() {
        assert_eq!(currency_code(1), Some("USD"));
        assert_eq!(currency_code(5), Some("RUB"));
        assert_eq!(currency_code(37), Some("KZT"));
        assert_eq!(currency_code(33), None);
        assert_eq!(currency_code(0), None);
        assert_eq!(currency_code(999), None);
    }
}
