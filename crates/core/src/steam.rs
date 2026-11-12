use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::StatusCode;
use reqwest::blocking::Client;
use serde::Deserialize;
use steamguard::protobufs::steammessages_auth_steamclient::{
    EAuthSessionGuardType, EAuthTokenPlatformType,
};
use steamguard::refresher::TokenRefresher;
use steamguard::steamapi::{AuthenticationClient, get_server_time};
use steamguard::token::Tokens;
use steamguard::transport::{TransportError, WebApiTransport};
use steamguard::userlogin::UpdateAuthSessionError;
use steamguard::{DeviceDetails, LoginError, UserLogin};

use crate::contents::{Account, Profile, Secret, Session};
use crate::guard;

// What the Steam mobile app reports for itself. Signing in as it is what makes the
// tokens good for trade confirmations later.
const ANDROID_OS_TYPE: i32 = -500;
const PHONE_DEVICE_TYPE: u32 = 528;

const LINK_DETAILS_URL: &str =
    "https://api.steampowered.com/IPlayerService/GetPlayerLinkDetails/v1/";
const AVATAR_URL: &str = "https://avatars.steamstatic.com";
// A 64×64 JPEG is a few kilobytes; anything far bigger isn't an avatar.
const MAX_AVATAR_LEN: usize = 256 * 1024;

/// Errors from steamguard and reqwest print their requests, URLs and access tokens
/// included, so none of their text is passed on.
#[derive(Debug, thiserror::Error)]
pub enum SteamError {
    #[error("wrong login or password")]
    BadCredentials,
    #[error("too many sign-in attempts, try again later")]
    TooManyAttempts,
    #[error(
        "Steam rejected the Guard code; this account's authenticator may have been removed or moved"
    )]
    GuardCodeRejected,
    #[error("Steam wants a confirmation this app can't give, such as an email code")]
    UnsupportedConfirmation,
    #[error("the Steam session has ended, sign in again")]
    SessionExpired,
    #[error("couldn't reach Steam, check the connection")]
    Network,
    #[error("Steam answered with something unexpected ({0})")]
    Steam(String),
}

pub struct SignedIn {
    pub steam_id: u64,
    pub session: Session,
}

/// Signs in with the account's password, confirming with its own Guard code. Like
/// everything here, it blocks on the network, so call it off the async runtime.
pub fn sign_in(account: &Account, password: &str) -> Result<SignedIn, SteamError> {
    let transport = WebApiTransport::new(client()?);
    // Steam checks the code against its own clock, which the computer's may be off from.
    let server_time = get_server_time(transport.clone())
        .map_err(|_| SteamError::Network)?
        .server_time();

    let mut login = UserLogin::new(
        transport,
        DeviceDetails {
            friendly_name: "Lootify Guard".to_owned(),
            platform_type: EAuthTokenPlatformType::k_EAuthTokenPlatformType_MobileApp,
            os_type: ANDROID_OS_TYPE,
            gaming_device_type: PHONE_DEVICE_TYPE,
        },
    );
    let confirmations = login
        .begin_auth_via_credentials(&account.account_name, password)
        .map_err(login_error)?;

    let wants = |kind| {
        confirmations
            .iter()
            .any(|confirmation| confirmation.confirmation_type == kind)
    };
    if wants(EAuthSessionGuardType::k_EAuthSessionGuardType_DeviceCode) {
        let code = guard::code(&account.authenticator.shared_secret, server_time)
            .map_err(|err| SteamError::Steam(err.to_string()))?;
        login
            .submit_steam_guard_code(
                EAuthSessionGuardType::k_EAuthSessionGuardType_DeviceCode,
                code,
            )
            .map_err(guard_code_error)?;
    } else if !wants(EAuthSessionGuardType::k_EAuthSessionGuardType_None) {
        return Err(SteamError::UnsupportedConfirmation);
    }

    let tokens = login
        .poll_until_tokens()
        .map_err(|_| SteamError::Steam("no session was issued".to_owned()))?;
    let steam_id = tokens
        .refresh_token()
        .decode()
        .map_err(|_| SteamError::Steam("unreadable session token".to_owned()))?
        .steam_id();
    Ok(SignedIn {
        steam_id,
        session: Session {
            access_token: tokens.access_token().expose_secret().to_owned().into(),
            refresh_token: tokens.refresh_token().expose_secret().to_owned().into(),
        },
    })
}

/// Asks Steam for the account's nickname and avatar. That only works with a live
/// session, so it doubles as a check of one. Access tokens last about a day; when
/// the stored one has run out, a new one is made from the refresh token and
/// returned alongside the profile so it can be saved.
pub fn fetch_profile(account: &Account) -> Result<(Session, Profile), SteamError> {
    let (Some(session), Some(steam_id)) = (&account.session, account.steam_id) else {
        return Err(SteamError::SessionExpired);
    };
    let client = client()?;
    let mut session = session.clone();
    let details = match link_details(&client, &session, steam_id) {
        Err(SteamError::SessionExpired) => {
            session.access_token = refresh_access_token(&client, &session, steam_id)?;
            link_details(&client, &session, steam_id)?
        }
        details => details?,
    };
    let avatar = details
        .sha_digest_avatar
        .map(|digest| download_avatar(&client, &digest))
        .transpose()?;
    Ok((
        session,
        Profile {
            persona_name: details.persona_name.unwrap_or_default(),
            avatar,
        },
    ))
}

#[derive(Deserialize)]
struct LinkDetails {
    response: LinkDetailsResponse,
}

#[derive(Deserialize)]
struct LinkDetailsResponse {
    #[serde(default)]
    accounts: Vec<LinkedAccount>,
}

#[derive(Deserialize)]
struct LinkedAccount {
    public_data: PublicData,
}

#[derive(Deserialize)]
struct PublicData {
    persona_name: Option<String>,
    /// SHA-1 of the avatar image, base64 in JSON. Steam names avatar files by its hex.
    sha_digest_avatar: Option<String>,
}

fn client() -> Result<Client, SteamError> {
    Client::builder().build().map_err(|_| SteamError::Network)
}

fn link_details(
    client: &Client,
    session: &Session,
    steam_id: u64,
) -> Result<PublicData, SteamError> {
    let response = client
        .get(LINK_DETAILS_URL)
        .query(&[
            ("access_token", session.access_token.expose()),
            ("steamids[0]", &steam_id.to_string()),
        ])
        .send()
        .map_err(|_| SteamError::Network)?;
    if matches!(
        response.status(),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
    ) {
        return Err(SteamError::SessionExpired);
    }
    if !response.status().is_success() {
        return Err(SteamError::Steam(response.status().to_string()));
    }
    let body = response.bytes().map_err(|_| SteamError::Network)?;
    let details: LinkDetails = serde_json::from_slice(&body)
        .map_err(|_| SteamError::Steam("unreadable profile".to_owned()))?;
    details
        .response
        .accounts
        .into_iter()
        .next()
        .map(|account| account.public_data)
        .ok_or_else(|| SteamError::Steam("no profile in the answer".to_owned()))
}

fn refresh_access_token(
    client: &Client,
    session: &Session,
    steam_id: u64,
) -> Result<Secret, SteamError> {
    let transport = WebApiTransport::new(client.clone());
    let tokens = Tokens::new(
        session.access_token.expose().to_owned(),
        session.refresh_token.expose().to_owned(),
    );
    let access_token = TokenRefresher::new(AuthenticationClient::new(transport))
        .refresh(steam_id, &tokens)
        .map_err(|err| {
            let network = err.downcast_ref::<reqwest::Error>().is_some()
                || matches!(
                    err.downcast_ref::<TransportError>(),
                    Some(TransportError::NetworkFailure(_))
                );
            if network {
                SteamError::Network
            } else {
                SteamError::SessionExpired
            }
        })?;
    Ok(access_token.expose_secret().to_owned().into())
}

/// Returns the image as base64, the form the vault keeps it in.
fn download_avatar(client: &Client, digest: &str) -> Result<String, SteamError> {
    let response = client
        .get(avatar_url(digest)?)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|_| SteamError::Network)?;
    let image = response.bytes().map_err(|_| SteamError::Network)?;
    if image.len() > MAX_AVATAR_LEN {
        return Err(SteamError::Steam("avatar too large".to_owned()));
    }
    Ok(STANDARD.encode(image))
}

fn avatar_url(digest: &str) -> Result<String, SteamError> {
    let digest = STANDARD
        .decode(digest)
        .map_err(|_| SteamError::Steam("unreadable avatar digest".to_owned()))?;
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    Ok(format!("{AVATAR_URL}/{hex}_medium.jpg"))
}

fn login_error(err: LoginError) -> SteamError {
    match err {
        LoginError::BadCredentials => SteamError::BadCredentials,
        LoginError::TooManyAttempts => SteamError::TooManyAttempts,
        LoginError::NetworkFailure(_)
        | LoginError::TransportError(TransportError::NetworkFailure(_)) => SteamError::Network,
        LoginError::UnknownEResult(result) => SteamError::Steam(format!("{result:?}")),
        _ => SteamError::Steam("unexpected response".to_owned()),
    }
}

fn guard_code_error(err: UpdateAuthSessionError) -> SteamError {
    match err {
        UpdateAuthSessionError::IncorrectSteamGuardCode => SteamError::GuardCodeRejected,
        UpdateAuthSessionError::TooManyAttempts => SteamError::TooManyAttempts,
        UpdateAuthSessionError::NetworkFailure(_)
        | UpdateAuthSessionError::TransportError(TransportError::NetworkFailure(_)) => {
            SteamError::Network
        }
        UpdateAuthSessionError::UnknownEResult(result) => SteamError::Steam(format!("{result:?}")),
        _ => SteamError::Steam("unexpected response".to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn avatar_url_uses_the_hex_digest() {
        // Steam's default avatar.
        assert_eq!(
            avatar_url("/vSef6fhmXMQ1wWyphWP+Nwc3+s=").unwrap(),
            "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg"
        );
    }
}
