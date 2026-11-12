use serde::Serialize;
use sha1::{Digest, Sha1};
use steamguard::token::Tokens;
use steamguard::transport::WebApiTransport;
use steamguard::{
    ConfirmationId, ConfirmationType, Confirmer, ConfirmerError, SecretString, SteamGuardAccount,
};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, with_session};

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
            .map(|confirmation| PendingConfirmation {
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
            })
            .collect())
    })
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
