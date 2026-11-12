use serde::Serialize;
use steamguard::approver::{ApproverError, Challenge, parse_challenge_url};
use steamguard::protobufs::enums::ESessionPersistence;
use steamguard::protobufs::steammessages_auth_steamclient::{
    EAuthSessionSecurityHistory, EAuthTokenPlatformType,
};
use steamguard::token::{Tokens, TwoFactorSecret};
use steamguard::transport::{TransportError, WebApiTransport};
use steamguard::{LoginApprover, SteamGuardAccount};

use crate::confirmations::guard_account;
use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, with_session};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SignInPlatform {
    SteamClient,
    WebBrowser,
    MobileApp,
    Unknown,
}

/// Someone signing in to the account and waiting for the mobile authenticator.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInRequest {
    /// A u64 as text, since JavaScript numbers can't hold it exactly.
    pub client_id: String,
    pub version: u16,
    pub ip: String,
    pub city: String,
    pub country: String,
    pub device_name: String,
    pub platform: SignInPlatform,
    /// Steam hasn't seen a successful sign-in from this IP before, or the request
    /// comes from somewhere other than where it says.
    pub unfamiliar: bool,
}

pub fn list(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, Vec<SignInRequest>), SteamError> {
    with_session(account, proxy, |client, session, _| {
        let tokens = tokens(session);
        let approver = LoginApprover::new(WebApiTransport::new(client.clone()), &tokens);
        approver
            .list_auth_sessions()
            .map_err(approver_error)?
            .into_iter()
            .map(|client_id| {
                let info = approver
                    .get_auth_session_info(client_id)
                    .map_err(approver_error)?;
                Ok(SignInRequest {
                    client_id: client_id.to_string(),
                    version: u16::try_from(info.version()).unwrap_or(1),
                    ip: info.ip().to_owned(),
                    city: info.city().to_owned(),
                    country: info.country().to_owned(),
                    device_name: info.device_friendly_name().to_owned(),
                    platform: match info.platform_type() {
                        EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient => {
                            SignInPlatform::SteamClient
                        }
                        EAuthTokenPlatformType::k_EAuthTokenPlatformType_WebBrowser => {
                            SignInPlatform::WebBrowser
                        }
                        EAuthTokenPlatformType::k_EAuthTokenPlatformType_MobileApp => {
                            SignInPlatform::MobileApp
                        }
                        _ => SignInPlatform::Unknown,
                    },
                    unfamiliar: info.login_history()
                        == EAuthSessionSecurityHistory::k_EAuthSessionSecurityHistory_NoPriorHistory
                        || info.requestor_location_mismatch(),
                })
            })
            .collect()
    })
}

/// Allows or denies a pending sign-in from [`list`].
pub fn answer(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    client_id: u64,
    version: u16,
    allow: bool,
) -> Result<Session, SteamError> {
    respond(account, proxy, Challenge::new(version, client_id), allow)
}

/// Allows the sign-in behind a QR code on a Steam sign-in page, given the link the
/// code holds.
pub fn allow_qr(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    link: &str,
) -> Result<Session, SteamError> {
    respond(account, proxy, qr_challenge(link)?, true)
}

fn qr_challenge(link: &str) -> Result<Challenge, SteamError> {
    parse_challenge_url(link.trim()).map_err(|_| SteamError::NotQrLink)
}

fn respond(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    challenge: Challenge,
    allow: bool,
) -> Result<Session, SteamError> {
    let (session, ()) = with_session(account, proxy, |client, session, steam_id| {
        let tokens = tokens(session);
        let mut approver = LoginApprover::new(WebApiTransport::new(client.clone()), &tokens);
        let guard_account = signing_account(account, session, steam_id)?;
        if allow {
            approver.approve(
                &guard_account,
                Challenge::new(challenge.version(), challenge.client_id()),
                ESessionPersistence::k_ESessionPersistence_Persistent,
            )
        } else {
            approver.deny(
                &guard_account,
                Challenge::new(challenge.version(), challenge.client_id()),
            )
        }
        .map_err(approver_error)
    })?;
    Ok(session)
}

fn tokens(session: &Session) -> Tokens {
    Tokens::new(
        session.access_token.expose().to_owned(),
        session.refresh_token.expose().to_owned(),
    )
}

/// Answering a sign-in is signed with the Guard secret, unlike confirmations.
fn signing_account(
    account: &Account,
    session: &Session,
    steam_id: u64,
) -> Result<SteamGuardAccount, SteamError> {
    let mut guard_account = guard_account(account, session, steam_id);
    guard_account.shared_secret = TwoFactorSecret::parse_shared_secret(
        account.authenticator.shared_secret.expose().to_owned(),
    )
    .map_err(|_| SteamError::Steam("the shared secret is damaged".to_owned()))?;
    Ok(guard_account)
}

fn approver_error(err: ApproverError) -> SteamError {
    match err {
        ApproverError::Unauthorized => SteamError::SessionExpired,
        ApproverError::DuplicateRequest => {
            SteamError::Steam("this sign-in was already answered".to_owned())
        }
        ApproverError::Expired => SteamError::Steam("this sign-in request has expired".to_owned()),
        ApproverError::TransportError(TransportError::NetworkFailure(_)) => SteamError::Network,
        ApproverError::UnknownEResult(result) => SteamError::Steam(format!("{result:?}")),
        _ => SteamError::Steam("unexpected response".to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_link_a_steam_qr_code_holds() {
        let challenge = qr_challenge(" https://s.team/q/1/2372462679780599330 ").unwrap();
        assert_eq!(challenge.version(), 1);
        assert_eq!(challenge.client_id(), 2372462679780599330);
    }

    #[test]
    fn rejects_other_links() {
        for link in ["", "https://steamcommunity.com/", "https://s.team/q/1/abc"] {
            assert!(
                matches!(qr_challenge(link), Err(SteamError::NotQrLink)),
                "{link}"
            );
        }
    }
}
