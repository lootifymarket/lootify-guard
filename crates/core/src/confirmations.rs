use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use steamguard::token::Tokens;
use steamguard::transport::WebApiTransport;
use steamguard::{
    Confirmation, ConfirmationId, ConfirmationType, Confirmer, ConfirmerError, SecretString,
    SteamGuardAccount,
};

use crate::contents::{Account, AutoConfirm, Session};
use crate::mafile::USER_ID_HIGH;
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, web_api_get, with_session};

const TRADE_OFFER_URL: &str = "https://api.steampowered.com/IEconService/GetTradeOffer/v1/";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConfirmationKind {
    Trade,
    MarketListing,
    ApiKey,
    Other,
}

/// A trade, market listing or other action waiting for the mobile authenticator.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingConfirmation {
    pub id: String,
    /// Steam's key for answering this confirmation, not a secret on its own.
    pub nonce: String,
    pub kind: ConfirmationKind,
    pub type_name: String,
    pub headline: String,
    pub summary: Vec<String>,
    pub created_at: u64,
}

/// Lists what is waiting for confirmation. Returns the session too, since the
/// access token may have been renewed on the way and should be saved.
pub fn list(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, Vec<PendingConfirmation>), SteamError> {
    with_confirmer(account, proxy, |confirmer| {
        Ok(confirmer
            .get_confirmations()
            .map_err(confirmer_error)?
            .into_iter()
            .map(pending)
            .collect())
    })
}

/// Accepts what the account's auto-confirm rules allow and leaves the rest to the
/// user. `own_accounts` are the Steam IDs of every account in the vault. Returns the
/// session, which may have been renewed, and what was accepted.
pub fn auto_confirm(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    own_accounts: &[u64],
) -> Result<(Session, Vec<PendingConfirmation>), SteamError> {
    with_session(account, proxy, |client, session, steam_id| {
        let guard_account = guard_account(account, session, steam_id);
        let confirmer = Confirmer::new(WebApiTransport::new(client.clone()), &guard_account);
        let mut accepted = Vec::new();
        for confirmation in confirmer.get_confirmations().map_err(confirmer_error)? {
            let partner = || trade_partner(client, session, &confirmation.creator_id);
            if !allowed(
                account.auto_confirm,
                confirmation.conf_type,
                own_accounts,
                partner,
            )? {
                continue;
            }
            confirmer
                .accept_confirmation(ConfirmationId::new(&confirmation.id, &confirmation.nonce))
                .map_err(confirmer_error)?;
            accepted.push(pending(confirmation));
        }
        Ok(accepted)
    })
}

/// Whether the rules let a confirmation through. `partner` looks up the other side
/// of a trade, and is called only when the answer depends on it.
fn allowed(
    rules: AutoConfirm,
    kind: ConfirmationType,
    own_accounts: &[u64],
    partner: impl FnOnce() -> Result<Option<u64>, SteamError>,
) -> Result<bool, SteamError> {
    Ok(match kind {
        ConfirmationType::MarketSell => rules.any_market_listing,
        ConfirmationType::Trade if rules.trades_to_own_accounts => {
            partner()?.is_some_and(|partner| own_accounts.contains(&partner))
        }
        _ => false,
    })
}

#[derive(Deserialize)]
struct TradeOfferAnswer {
    response: TradeOfferResponse,
}

#[derive(Deserialize)]
struct TradeOfferResponse {
    offer: Option<TradeOffer>,
}

#[derive(Deserialize)]
struct TradeOffer {
    accountid_other: u32,
}

/// The Steam ID on the other side of a trade offer, asked of Steam rather than read
/// from the confirmation's text, which the other side partly writes.
fn trade_partner(
    client: &Client,
    session: &Session,
    offer_id: &str,
) -> Result<Option<u64>, SteamError> {
    let body = web_api_get(
        client,
        TRADE_OFFER_URL,
        session,
        &[("tradeofferid", offer_id)],
    )?;
    partner_of(&body)
}

fn partner_of(body: &[u8]) -> Result<Option<u64>, SteamError> {
    let answer: TradeOfferAnswer = serde_json::from_slice(body)
        .map_err(|_| SteamError::Steam("unreadable trade offer".to_owned()))?;
    Ok(answer
        .response
        .offer
        .map(|offer| USER_ID_HIGH << 32 | u64::from(offer.accountid_other)))
}

fn pending(confirmation: Confirmation) -> PendingConfirmation {
    PendingConfirmation {
        kind: match confirmation.conf_type {
            ConfirmationType::Trade => ConfirmationKind::Trade,
            ConfirmationType::MarketSell => ConfirmationKind::MarketListing,
            ConfirmationType::ApiKeyCreation => ConfirmationKind::ApiKey,
            _ => ConfirmationKind::Other,
        },
        id: confirmation.id,
        nonce: confirmation.nonce,
        type_name: confirmation.type_name,
        headline: confirmation.headline,
        summary: confirmation.summary,
        created_at: confirmation.creation_time,
    }
}

/// Accepts or declines confirmations given as `(id, nonce)` pairs. Each goes in its
/// own request: steamguard's bulk endpoint puts the base64 signature in the body
/// without escaping it, which breaks whenever the signature contains `+`.
pub fn respond(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    confirmations: &[(String, String)],
    accept: bool,
) -> Result<Session, SteamError> {
    let (session, ()) = with_confirmer(account, proxy, |confirmer| {
        for (id, nonce) in confirmations {
            let id = ConfirmationId::new(id, nonce);
            if accept {
                confirmer.accept_confirmation(id)
            } else {
                confirmer.deny_confirmation(id)
            }
            .map_err(confirmer_error)?;
        }
        Ok(())
    })?;
    Ok(session)
}

fn with_confirmer<T>(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    op: impl Fn(&Confirmer<WebApiTransport>) -> Result<T, SteamError>,
) -> Result<(Session, T), SteamError> {
    with_session(account, proxy, |client, session, steam_id| {
        let guard_account = guard_account(account, session, steam_id);
        op(&Confirmer::new(
            WebApiTransport::new(client.clone()),
            &guard_account,
        ))
    })
}

/// The account in the shape steamguard takes. Only what confirmations need is
/// filled in; the Guard code secret stays out.
pub(crate) fn guard_account(
    account: &Account,
    session: &Session,
    steam_id: u64,
) -> SteamGuardAccount {
    let mut guard_account = SteamGuardAccount::new();
    guard_account.account_name = account.account_name.clone();
    guard_account.steam_id = steam_id;
    guard_account.identity_secret =
        SecretString::new(account.authenticator.identity_secret.expose().to_owned());
    guard_account.device_id = device_id(account, steam_id);
    guard_account.tokens = Some(Tokens::new(
        session.access_token.expose().to_owned(),
        session.refresh_token.expose().to_owned(),
    ));
    guard_account
}

/// The device id from the .maFile, or one made up from the Steam ID for files that
/// came without it. Steam only needs it to look like the app's and stay the same.
fn device_id(account: &Account, steam_id: u64) -> String {
    if let Some(id) = account
        .authenticator
        .device_id
        .as_ref()
        .filter(|id| !id.is_empty())
    {
        return id.clone();
    }
    let hash: String = Sha1::digest(steam_id.to_string())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    format!(
        "android:{}-{}-{}-{}-{}",
        &hash[0..8],
        &hash[8..12],
        &hash[12..16],
        &hash[16..20],
        &hash[20..32]
    )
}

fn confirmer_error(err: ConfirmerError) -> SteamError {
    match err {
        ConfirmerError::InvalidTokens => SteamError::SessionExpired,
        ConfirmerError::NetworkFailure(_) => SteamError::Network,
        ConfirmerError::RemoteFailureWithMessage(message) => SteamError::Steam(message),
        ConfirmerError::RemoteFailure => SteamError::Steam("Steam refused, try again".to_owned()),
        _ => SteamError::Steam("unexpected response".to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mafile;

    fn account(device_id: Option<&str>) -> Account {
        let mut file = serde_json::json!({
            "account_name": "trader_one",
            "shared_secret": "zvIayp3JPvtvX/QGHqsqKBk/44s=",
            "identity_secret": "AAECAwQFBgcICQoLDA0ODxAREhM=",
        });
        if let Some(id) = device_id {
            file["device_id"] = id.into();
        }
        mafile::parse(file.to_string().as_bytes()).unwrap()
    }

    const OWN: u64 = 76561198000000001;
    const STRANGER: u64 = 76561198000000002;

    fn rules(any_market_listing: bool, trades_to_own_accounts: bool) -> AutoConfirm {
        AutoConfirm {
            trades_to_own_accounts,
            any_market_listing,
        }
    }

    fn check(rules: AutoConfirm, kind: ConfirmationType, partner: Option<u64>) -> bool {
        allowed(rules, kind, &[OWN], || Ok(partner)).unwrap()
    }

    #[test]
    fn market_rule_covers_only_market_listings() {
        let market = rules(true, false);
        assert!(check(market, ConfirmationType::MarketSell, None));
        assert!(!check(market, ConfirmationType::Trade, Some(OWN)));
        assert!(!check(market, ConfirmationType::ApiKeyCreation, None));
    }

    #[test]
    fn trade_rule_covers_only_trades_with_own_accounts() {
        let trades = rules(false, true);
        assert!(check(trades, ConfirmationType::Trade, Some(OWN)));
        assert!(!check(trades, ConfirmationType::Trade, Some(STRANGER)));
        assert!(!check(trades, ConfirmationType::Trade, None));
        assert!(!check(trades, ConfirmationType::MarketSell, None));
    }

    #[test]
    fn nothing_is_confirmed_without_rules() {
        for kind in [
            ConfirmationType::Trade,
            ConfirmationType::MarketSell,
            ConfirmationType::ApiKeyCreation,
            ConfirmationType::PhoneNumberChange,
            ConfirmationType::AccountRecovery,
        ] {
            assert!(!check(AutoConfirm::default(), kind, Some(OWN)), "{kind:?}");
        }
        assert!(!check(
            rules(true, true),
            ConfirmationType::ApiKeyCreation,
            None
        ));
        assert!(!check(
            rules(true, true),
            ConfirmationType::AccountRecovery,
            None
        ));
    }

    #[test]
    fn the_trade_partner_is_looked_up_only_when_it_decides() {
        let unreachable = || -> Result<Option<u64>, SteamError> { panic!("looked up") };
        assert!(
            !allowed(
                rules(true, false),
                ConfirmationType::Trade,
                &[OWN],
                unreachable
            )
            .unwrap()
        );
        assert!(
            allowed(
                rules(true, true),
                ConfirmationType::MarketSell,
                &[OWN],
                unreachable
            )
            .unwrap()
        );
    }

    #[test]
    fn trade_partner_comes_from_the_offer() {
        let body = br#"{"response":{"offer":{"tradeofferid":"7","accountid_other":39734273,"trade_offer_state":9}}}"#;
        assert_eq!(partner_of(body).unwrap(), Some(OWN));
        assert_eq!(partner_of(br#"{"response":{}}"#).unwrap(), None);
        assert!(partner_of(b"<html>").is_err());
    }

    #[test]
    fn keeps_the_device_id_from_the_mafile() {
        let id = "android:0b6c5d4e-1f2a-3b4c-5d6e-7f8091a2b3c4";
        assert_eq!(device_id(&account(Some(id)), 76561198000000001), id);
    }

    #[test]
    fn makes_up_a_stable_device_id_when_the_file_has_none() {
        for file_id in [None, Some("")] {
            let id = device_id(&account(file_id), 76561198000000001);
            assert_eq!(id, device_id(&account(file_id), 76561198000000001));
            assert!(id.starts_with("android:"));
            let parts: Vec<_> = id["android:".len()..].split('-').collect();
            assert_eq!(
                parts.iter().map(|part| part.len()).collect::<Vec<_>>(),
                [8, 4, 4, 4, 12]
            );
        }
        assert_ne!(
            device_id(&account(None), 76561198000000001),
            device_id(&account(None), 76561198000000002)
        );
    }
}
