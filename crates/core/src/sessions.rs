use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use hmac::{Hmac, KeyInit, Mac};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use steamguard::protobufs::steammessages_auth_steamclient::{
    CAuthentication_RefreshToken_Revoke_Request, CAuthentication_RefreshToken_Revoke_Response,
    EAuthTokenRevokeAction,
};
use steamguard::steamapi::{ApiRequest, EResult};
use steamguard::token::Jwt;
use steamguard::transport::{Transport, TransportError, WebApiTransport};
use zeroize::Zeroizing;

use crate::contents::{Account, Secret, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, web_api_post, with_session};

const ENUMERATE_URL: &str =
    "https://api.steampowered.com/IAuthenticationService/EnumerateTokens/v1/";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceKind {
    SteamClient,
    Browser,
    MobileApp,
    Unknown,
}

/// A device signed in to the account, as Steam lists them under authorized devices.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// Steam's id for the device's session, a u64 as text. Not a secret on its own.
    pub id: String,
    pub name: String,
    pub kind: DeviceKind,
    /// The session this app itself uses.
    pub this_app: bool,
    pub last_seen_at: Option<u64>,
    /// City and country Steam guesses from the last IP, when it does.
    pub place: Option<String>,
}

#[derive(Deserialize)]
struct Enumerated {
    response: Tokens,
}

#[derive(Deserialize)]
struct Tokens {
    #[serde(default)]
    refresh_tokens: Vec<Token>,
    requesting_token: Option<String>,
}

#[derive(Deserialize)]
struct Token {
    // u64s come as text in Steam's JSON.
    token_id: String,
    #[serde(default)]
    token_description: String,
    platform_type: Option<i32>,
    time_updated: Option<u64>,
    last_seen: Option<Seen>,
}

#[derive(Deserialize)]
struct Seen {
    time: Option<u64>,
    city: Option<String>,
    country: Option<String>,
}

/// Lists the devices signed in to the account, this app first, then the most
/// recently seen. Returns the session too, since it may have been renewed.
pub fn list(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, Vec<Device>), SteamError> {
    with_session(account, proxy, |client, session, _| {
        Ok(devices(enumerate(client, session)?))
    })
}

/// Signs every other device out of the account for good: their sessions can't be
/// renewed any more. Returns how many there were.
pub fn sign_out_others(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, usize), SteamError> {
    let shared_secret = &account.authenticator.shared_secret;
    with_session(account, proxy, |client, session, steam_id| {
        let tokens = enumerate(client, session)?;
        let others: Vec<u64> = tokens
            .refresh_tokens
            .iter()
            .filter(|token| Some(&token.token_id) != tokens.requesting_token.as_ref())
            .map(|token| parse_id(&token.token_id))
            .collect::<Result<_, _>>()?;
        for &token_id in &others {
            revoke(client, session, steam_id, shared_secret, token_id)?;
        }
        Ok(others.len())
    })
}

/// Signs one device out of the account for good. This app's own session is refused,
/// since ending it would leave the account signed out here.
pub fn sign_out(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    device_id: &str,
) -> Result<Session, SteamError> {
    let token_id = parse_id(device_id)?;
    let shared_secret = &account.authenticator.shared_secret;
    let (session, ()) = with_session(account, proxy, |client, session, steam_id| {
        if enumerate(client, session)?.requesting_token.as_deref() == Some(device_id) {
            return Err(SteamError::Steam(
                "that is this app's own session".to_owned(),
            ));
        }
        revoke(client, session, steam_id, shared_secret, token_id)
    })?;
    Ok(session)
}

fn enumerate(client: &Client, session: &Session) -> Result<Tokens, SteamError> {
    let body = web_api_post(client, ENUMERATE_URL, session)?;
    serde_json::from_slice::<Enumerated>(&body)
        .map(|enumerated| enumerated.response)
        .map_err(|_| SteamError::Steam("unreadable device list".to_owned()))
}

fn devices(tokens: Tokens) -> Vec<Device> {
    let mut devices: Vec<Device> = tokens
        .refresh_tokens
        .into_iter()
        .map(|token| {
            let seen = token.last_seen.as_ref();
            Device {
                id: token.token_id.clone(),
                this_app: Some(&token.token_id) == tokens.requesting_token.as_ref(),
                kind: match token.platform_type {
                    Some(1) => DeviceKind::SteamClient,
                    Some(2) => DeviceKind::Browser,
                    Some(3) => DeviceKind::MobileApp,
                    _ => DeviceKind::Unknown,
                },
                last_seen_at: seen.and_then(|seen| seen.time).or(token.time_updated),
                place: seen.and_then(place),
                name: token.token_description,
            }
        })
        .collect();
    devices.sort_by_key(|device| (!device.this_app, std::cmp::Reverse(device.last_seen_at)));
    devices
}

fn place(seen: &Seen) -> Option<String> {
    let parts: Vec<&str> = [&seen.city, &seen.country]
        .into_iter()
        .flatten()
        .map(|part| part.as_str())
        .filter(|part| !part.is_empty())
        .collect();
    (!parts.is_empty()).then(|| parts.join(", "))
}

// Only the account's authenticator may end another device's session, so Steam wants
// the request signed with its shared secret.
fn revoke(
    client: &Client,
    session: &Session,
    steam_id: u64,
    shared_secret: &Secret,
    token_id: u64,
) -> Result<(), SteamError> {
    let mut request = CAuthentication_RefreshToken_Revoke_Request::new();
    request.set_token_id(token_id);
    request.set_steamid(steam_id);
    request.set_revoke_action(EAuthTokenRevokeAction::k_EAuthTokenRevokePermanent);
    request.set_signature(signature(shared_secret, token_id, steam_id)?);

    let access_token = Jwt::from(session.access_token.expose().to_owned());
    let response = WebApiTransport::new(client.clone())
        .send_request::<_, CAuthentication_RefreshToken_Revoke_Response>(
            ApiRequest::new("IAuthenticationService", "RevokeRefreshToken", 1, request)
                .with_access_token(&access_token),
        )
        .map_err(|err| match err {
            TransportError::Unauthorized => SteamError::SessionExpired,
            TransportError::NetworkFailure(_) => SteamError::Network,
            _ => SteamError::Steam("unexpected response".to_owned()),
        })?;
    match response.result() {
        EResult::OK => Ok(()),
        EResult::AccessDenied => Err(SteamError::SessionExpired),
        result => Err(SteamError::Steam(format!("{result:?}"))),
    }
}

fn signature(shared_secret: &Secret, token_id: u64, steam_id: u64) -> Result<Vec<u8>, SteamError> {
    let key = Zeroizing::new(
        STANDARD
            .decode(shared_secret.expose())
            .map_err(|_| SteamError::Steam("damaged shared secret".to_owned()))?,
    );
    let mut mac = Hmac::<Sha256>::new_from_slice(&key).expect("HMAC accepts keys of any length");
    mac.update(&token_id.to_le_bytes());
    mac.update(&steam_id.to_le_bytes());
    Ok(mac.finalize().into_bytes().to_vec())
}

fn parse_id(id: &str) -> Result<u64, SteamError> {
    id.parse()
        .map_err(|_| SteamError::Steam("unreadable device id".to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIST: &str = r#"{"response":{"refresh_tokens":[
        {"token_id":"111","token_description":"DESKTOP-7Q2","platform_type":1,
         "time_updated":1700000000,"last_seen":{"time":1700000500,"city":"Berlin","country":"DE"}},
        {"token_id":"222","token_description":"Lootify Guard","platform_type":3,
         "last_seen":{"time":1700000100}},
        {"token_id":"333","token_description":"Chrome","platform_type":2,
         "time_updated":1700000900,"last_seen":{"city":"","country":"NL"}}
    ],"requesting_token":"222"}}"#;

    fn listed() -> Vec<Device> {
        devices(serde_json::from_str::<Enumerated>(LIST).unwrap().response)
    }

    #[test]
    fn this_app_comes_first_then_the_latest_seen() {
        let names: Vec<_> = listed().into_iter().map(|device| device.name).collect();
        assert_eq!(names, ["Lootify Guard", "Chrome", "DESKTOP-7Q2"]);
    }

    #[test]
    fn devices_say_what_they_are_and_where() {
        let devices = listed();
        assert!(devices[0].this_app);
        assert_eq!(devices[0].kind, DeviceKind::MobileApp);
        assert_eq!(devices[0].place, None);
        // Without a last-seen time, the token's update time stands in.
        assert_eq!(devices[1].last_seen_at, Some(1700000900));
        assert_eq!(devices[1].place.as_deref(), Some("NL"));
        assert_eq!(devices[2].place.as_deref(), Some("Berlin, DE"));
        assert_eq!(devices[2].kind, DeviceKind::SteamClient);
    }

    #[test]
    fn an_empty_list_is_no_devices() {
        let tokens = serde_json::from_str::<Enumerated>(r#"{"response":{}}"#)
            .unwrap()
            .response;
        assert!(devices(tokens).is_empty());
    }
}
