use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::StatusCode;
use reqwest::Url;
use reqwest::blocking::multipart::Form;
use reqwest::blocking::{Client, ClientBuilder, Response};
use reqwest::cookie::Jar;
use serde::Deserialize;
use sha1::{Digest, Sha1};
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
use crate::proxy::{ProxyAddress, country_code};

// What the Steam mobile app reports for itself. Signing in as it is what makes the
// tokens good for trade confirmations later.
const ANDROID_OS_TYPE: i32 = -500;
const PHONE_DEVICE_TYPE: u32 = 528;

const LINK_DETAILS_URL: &str =
    "https://api.steampowered.com/IPlayerService/GetPlayerLinkDetails/v1/";
const AVATAR_URL: &str = "https://avatars.steamstatic.com";
// A 64×64 JPEG is a few kilobytes; anything far bigger isn't an avatar.
const MAX_AVATAR_LEN: usize = 256 * 1024;
const COMMUNITY_URL: &str = "https://steamcommunity.com";
const SERVER_INFO_URL: &str = "https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/";
// Open-source and keyless. It sees only the proxy's IP, since the lookup goes through it.
const COUNTRY_URL: &str = "https://api.country.is/";
// A dead proxy should fail the request, not hang it.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

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
    #[error("wrong code, check it and try again")]
    WrongCode,
    #[error("Steam wants a phone number on the account first")]
    NeedsPhone,
    #[error("open the link in the email Steam sent, then try again")]
    ConfirmEmail,
    #[error("the account already has Steam Guard on another device")]
    GuardElsewhere,
    #[error("the Steam session has ended, sign in again")]
    SessionExpired,
    #[error("not a link from a Steam sign-in QR code")]
    NotQrLink,
    #[error("couldn't reach Steam, check the connection")]
    Network,
    #[error("Steam took too long to answer, try again")]
    Timeout,
    #[error("couldn't reach Steam through the proxy")]
    Proxy,
    /// Steam turned the change down and said why, in its own words.
    #[error("Steam said: {0}")]
    Refused(String),
    #[error("Steam answered with something unexpected ({0})")]
    Steam(String),
}

pub struct SignedIn {
    pub steam_id: u64,
    pub session: Session,
}

/// Signs in with the account's password, confirming with its own Guard code. Like
/// everything here, it blocks on the network, so call it off the async runtime.
/// Every request goes through `proxy` when there is one.
pub fn sign_in(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    password: &str,
) -> Result<SignedIn, SteamError> {
    let transport = WebApiTransport::new(client(proxy)?);
    // Steam checks the code against its own clock, which the computer's may be off from.
    let server_time = get_server_time(transport.clone())
        .map_err(|_| SteamError::Network)?
        .server_time();

    let mut login = mobile_login(transport);
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
    Ok(SignedIn {
        steam_id: steam_id_of(&tokens)?,
        session: session_of(&tokens),
    })
}

pub(crate) fn mobile_login(transport: WebApiTransport) -> UserLogin<WebApiTransport> {
    UserLogin::new(
        transport,
        DeviceDetails {
            friendly_name: "Lootify Guard".to_owned(),
            platform_type: EAuthTokenPlatformType::k_EAuthTokenPlatformType_MobileApp,
            os_type: ANDROID_OS_TYPE,
            gaming_device_type: PHONE_DEVICE_TYPE,
        },
    )
}

pub(crate) fn steam_id_of(tokens: &Tokens) -> Result<u64, SteamError> {
    Ok(tokens
        .refresh_token()
        .decode()
        .map_err(|_| SteamError::Steam("unreadable session token".to_owned()))?
        .steam_id())
}

pub(crate) fn session_of(tokens: &Tokens) -> Session {
    Session {
        access_token: tokens.access_token().expose_secret().to_owned().into(),
        refresh_token: tokens.refresh_token().expose_secret().to_owned().into(),
    }
}

/// Runs `op` with the account's session. Access tokens last about a day: when
/// Steam says the stored one has run out, a new one is made from the refresh token
/// and `op` runs once more. Returns the session, renewed or not, so it can be saved.
pub(crate) fn with_session<T>(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    op: impl Fn(&Client, &Session, u64) -> Result<T, SteamError>,
) -> Result<(Session, T), SteamError> {
    let (Some(session), Some(steam_id)) = (&account.session, account.steam_id) else {
        return Err(SteamError::SessionExpired);
    };
    let mut session = session.clone();
    let client = session_client(proxy, &session, steam_id)?;
    let result = match op(&client, &session, steam_id) {
        Err(SteamError::SessionExpired) => {
            session.access_token = refresh_access_token(&client, &session, steam_id)?;
            // The cookie jar holds the old token, so the client is made anew.
            let client = session_client(proxy, &session, steam_id)?;
            op(&client, &session, steam_id)?
        }
        result => result?,
    };
    Ok((session, result))
}

/// A client signed in to steamcommunity.com. Its cookies live in a jar rather than
/// a fixed header, because Steam sets more of them on the way through redirects
/// and keeps redirecting until it gets them back.
fn session_client(
    proxy: Option<&ProxyAddress>,
    session: &Session,
    steam_id: u64,
) -> Result<Client, SteamError> {
    let community: Url = COMMUNITY_URL.parse().expect("a valid URL");
    let jar = Jar::default();
    jar.add_cookie_str(
        &format!(
            "steamLoginSecure={steam_id}%7C%7C{}; Secure; HttpOnly",
            session.access_token.expose()
        ),
        &community,
    );
    jar.add_cookie_str(&format!("sessionid={}", session_id(session)), &community);
    builder(proxy)?
        .cookie_provider(Arc::new(jar))
        .build()
        .map_err(|_| SteamError::Network)
}

/// Steam only checks that a form's `sessionid` matches the cookie, so any value
/// works. It is derived from the token so that the form can name the same one.
pub(crate) fn session_id(session: &Session) -> String {
    Sha1::digest(session.access_token.expose().as_bytes())[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Asks Steam for the account's nickname and avatar. That only works with a live
/// session, so it doubles as a check of one.
pub fn fetch_profile(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, Profile), SteamError> {
    with_session(account, proxy, |client, session, steam_id| {
        let details = link_details(client, session, steam_id)?;
        Ok(Profile {
            avatar: details
                .sha_digest_avatar
                .map(|digest| download_avatar(client, &digest))
                .transpose()?,
            persona_name: details.persona_name.unwrap_or_default(),
        })
    })
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

pub struct ProxyCheck {
    pub latency: Duration,
    /// `None` when the lookup failed: the proxy still works for Steam.
    pub country: Option<String>,
}

/// Times a request to Steam through the proxy, which is the one thing it is for,
/// then asks where the proxy comes out.
pub fn check_proxy(proxy: &ProxyAddress) -> Result<ProxyCheck, SteamError> {
    let client = client(Some(proxy))?;
    let started = Instant::now();
    client
        .get(SERVER_INFO_URL)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|_| SteamError::Proxy)?;
    let latency = started.elapsed();
    Ok(ProxyCheck {
        latency,
        country: proxy_country(&client),
    })
}

#[derive(Deserialize)]
struct CountryAnswer {
    country: String,
}

fn proxy_country(client: &Client) -> Option<String> {
    let answer: CountryAnswer = client
        .get(COUNTRY_URL)
        .send()
        .and_then(|response| response.error_for_status())
        .and_then(|response| response.json())
        .ok()?;
    country_code(&answer.country)
}

pub(crate) fn client(proxy: Option<&ProxyAddress>) -> Result<Client, SteamError> {
    builder(proxy)?.build().map_err(|_| SteamError::Network)
}

fn builder(proxy: Option<&ProxyAddress>) -> Result<ClientBuilder, SteamError> {
    let mut builder = Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT);
    if let Some(proxy) = proxy {
        // An explicit proxy also turns off the system one, so nothing goes around it.
        builder = builder.proxy(proxy.to_reqwest().map_err(|_| SteamError::Proxy)?);
    }
    Ok(builder)
}

/// A GET to Steam's Web API on behalf of the session.
pub(crate) fn web_api_get(
    client: &Client,
    url: &str,
    session: &Session,
    query: &[(&str, &str)],
) -> Result<Vec<u8>, SteamError> {
    let response = client
        .get(url)
        .query(&[("access_token", session.access_token.expose())])
        .query(query)
        .send()
        .map_err(request_error)?;
    web_api_body(response)
}

/// A POST to Steam's Web API on behalf of the session, for the methods that take no GET.
/// The token goes in the body: Steam turns down a POST without one.
pub(crate) fn web_api_post(
    client: &Client,
    url: &str,
    session: &Session,
) -> Result<Vec<u8>, SteamError> {
    let response = client
        .post(url)
        .form(&[("access_token", session.access_token.expose())])
        .send()
        .map_err(request_error)?;
    web_api_body(response)
}

fn web_api_body(response: Response) -> Result<Vec<u8>, SteamError> {
    if matches!(
        response.status(),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
    ) {
        return Err(SteamError::SessionExpired);
    }
    if !response.status().is_success() {
        return Err(SteamError::Steam(response.status().to_string()));
    }
    response
        .bytes()
        .map(|body| body.to_vec())
        .map_err(request_error)
}

/// A page on steamcommunity.com, signed in with the session's web cookie. Steam
/// sends a signed-out visitor to its login page, which means the session ended.
/// Takes a client from `with_session`, whose cookies sign it in.
pub(crate) fn community_get(client: &Client, url: &str) -> Result<String, SteamError> {
    let response = client.get(url).send().map_err(request_error)?;
    community_page(response)
}

/// A form sent to steamcommunity.com with a client from `with_session`.
pub(crate) fn community_post(
    client: &Client,
    url: &str,
    session: &Session,
    form: &[(&str, &str)],
) -> Result<String, SteamError> {
    let session_id = session_id(session);
    let mut fields = vec![("sessionid", session_id.as_str())];
    fields.extend_from_slice(form);
    let response = client
        .post(url)
        .form(&fields)
        .send()
        .map_err(request_error)?;
    community_page(response)
}

/// A file upload to steamcommunity.com with a client from `with_session`.
pub(crate) fn community_upload(
    client: &Client,
    url: &str,
    form: Form,
) -> Result<String, SteamError> {
    let response = client
        .post(url)
        .multipart(form)
        .send()
        .map_err(request_error)?;
    community_page(response)
}

/// Tells apart the ways a request can fail without passing on reqwest's text,
/// which includes the URL.
fn request_error(err: reqwest::Error) -> SteamError {
    if err.is_timeout() {
        SteamError::Timeout
    } else if err.is_redirect() {
        // Only where it ended up: the query may carry Steam's own tokens.
        let place = err
            .url()
            .map(|url| format!(" to {}{}", url.host_str().unwrap_or(""), url.path()))
            .unwrap_or_default();
        SteamError::Steam(format!("it kept redirecting{place}"))
    } else if err.is_body() || err.is_decode() {
        SteamError::Steam("the answer was cut off".to_owned())
    } else {
        SteamError::Network
    }
}

/// Undoes the escaping of text taken out of an HTML page.
pub(crate) fn html_unescape(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

fn community_page(response: Response) -> Result<String, SteamError> {
    if response.url().path().starts_with("/login") {
        return Err(SteamError::SessionExpired);
    }
    if !response.status().is_success() {
        return Err(SteamError::Steam(response.status().to_string()));
    }
    response.text().map_err(request_error)
}

fn link_details(
    client: &Client,
    session: &Session,
    steam_id: u64,
) -> Result<PublicData, SteamError> {
    let body = web_api_get(
        client,
        LINK_DETAILS_URL,
        session,
        &[("steamids[0]", &steam_id.to_string())],
    )?;
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

pub(crate) fn login_error(err: LoginError) -> SteamError {
    match err {
        LoginError::BadCredentials => SteamError::BadCredentials,
        LoginError::TooManyAttempts => SteamError::TooManyAttempts,
        LoginError::NetworkFailure(_)
        | LoginError::TransportError(TransportError::NetworkFailure(_)) => SteamError::Network,
        LoginError::UnknownEResult(result) => SteamError::Steam(format!("{result:?}")),
        _ => SteamError::Steam("unexpected response".to_owned()),
    }
}

pub(crate) fn guard_code_error(err: UpdateAuthSessionError) -> SteamError {
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
    use std::io::{BufRead, BufReader, ErrorKind, Write};
    use std::net::TcpListener;
    use std::thread;

    use super::*;
    use crate::proxy::ProxyKind;

    fn http_proxy(port: u16) -> ProxyAddress {
        ProxyAddress::new(ProxyKind::Http, "127.0.0.1", port, None, None).unwrap()
    }

    #[test]
    fn requests_go_through_the_proxy() {
        let proxy = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = proxy.local_addr().unwrap().port();
        let seen = thread::spawn(move || {
            let (mut stream, _) = proxy.accept().unwrap();
            let mut line = String::new();
            BufReader::new(&stream).read_line(&mut line).unwrap();
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n")
                .unwrap();
            line
        });

        client(Some(&http_proxy(port)))
            .unwrap()
            .get("http://steam.invalid/")
            .send()
            .unwrap();
        assert!(
            seen.join()
                .unwrap()
                .starts_with("GET http://steam.invalid/")
        );
    }

    #[test]
    fn a_dead_proxy_fails_instead_of_going_direct() {
        let target = TcpListener::bind("127.0.0.1:0").unwrap();
        target.set_nonblocking(true).unwrap();
        let target_port = target.local_addr().unwrap().port();
        // Bound and dropped, so nothing listens on this port.
        let dead_port = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();

        let result = client(Some(&http_proxy(dead_port)))
            .unwrap()
            .get(format!("http://127.0.0.1:{target_port}/"))
            .send();
        assert!(result.is_err());
        assert_eq!(target.accept().unwrap_err().kind(), ErrorKind::WouldBlock);
    }

    #[test]
    fn avatar_url_uses_the_hex_digest() {
        // Steam's default avatar.
        assert_eq!(
            avatar_url("/vSef6fhmXMQ1wWyphWP+Nwc3+s=").unwrap(),
            "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg"
        );
    }
}
