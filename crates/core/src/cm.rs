//! The connection the Steam client keeps to Steam's servers (CM). Playtime and
//! card drops count only for games an account plays over one, so the app opens
//! its own, as the Steam client would.

use std::hash::{BuildHasher, Hasher, RandomState};
use std::io::{self, Read};
use std::net::TcpStream;
use std::time::{Duration, Instant};

use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use steamguard::protobufs::steammessages_auth_steamclient::EAuthTokenPlatformType;
use steamguard::transport::WebApiTransport;
use steamguard::{DeviceDetails, UserLogin};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

use crate::contents::Account;
use crate::proxy::ProxyAddress;
use crate::sign_ins;
use crate::steam::{SteamError, client, login_error, request_error};
use crate::tunnel;
use crate::wire::{Fields, Writer};

/// Steam shows and counts at most this many games played at once.
pub const MAX_GAMES: usize = 32;

const CM_LIST_URL: &str =
    "https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?cellid=0";
const PROTOCOL_VERSION: u64 = 65580;
const PROTO_MASK: u32 = 0x8000_0000;
// What the client reports for Windows 10 and a desktop PC.
const WINDOWS_OS_TYPE: u64 = 16;
const DESKTOP_DEVICE_TYPE: u32 = 1;
const MACHINE_NAME: &str = "Lootify Guard";
// Steam signs out an older connection that logs on with the same id, so a
// reconnect replaces the app's own connection instead of piling up beside it.
const LOGON_ID: u32 = 0x4C47_4744;
// The game id the client uses for a non-Steam game, which shows its name as is.
const CUSTOM_STATUS_ID: u64 = 15_190_414_816_125_648_896;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
const LOGON_TIMEOUT: Duration = Duration::from_secs(20);
// How often a wait looks up from the socket to send a heartbeat that's due.
const POLL: Duration = Duration::from_secs(1);
const DEFAULT_HEARTBEAT: Duration = Duration::from_secs(9);
// A Multi unpacks to well under this; past it, it isn't one.
const MAX_UNZIPPED: u64 = 16 * 1024 * 1024;

mod emsg {
    pub const MULTI: u32 = 1;
    pub const HEARTBEAT: u32 = 703;
    pub const LOG_OFF: u32 = 706;
    pub const CHANGE_STATUS: u32 = 716;
    pub const LOGON_RESPONSE: u32 = 751;
    pub const LOGGED_OFF: u32 = 757;
    pub const GAMES_PLAYED: u32 = 5410;
    pub const LOGON: u32 = 5514;
    pub const PLAYING_SESSION_STATE: u32 = 9600;
}

/// How the account shows to friends. Steam keeps a client connection offline
/// until it says otherwise, and then the profile doesn't show the games either.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Presence {
    #[default]
    Online,
    Away,
    /// "Do not disturb" in the client.
    Busy,
    Invisible,
}

impl Presence {
    fn persona_state(self) -> u64 {
        match self {
            Self::Online => 1,
            Self::Busy => 2,
            Self::Away => 3,
            Self::Invisible => 7,
        }
    }
}

/// Something Steam said on the connection that the owner should act on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    /// Steam signed this connection out, with its reason code.
    LoggedOff(i32),
    /// Whether another device is playing on the account. While it is, what this
    /// connection plays doesn't count; once it stops, the games have to be sent again.
    PlayingBlocked(bool),
}

pub struct Connection {
    socket: WebSocket<MaybeTlsStream<TcpStream>>,
    steam_id: u64,
    session_id: i32,
    heartbeat: Duration,
    last_sent: Instant,
}

/// Signs the account in to Steam as the client. That needs a sign-in made for
/// the client, which the app makes itself the first time, or when Steam turns
/// the stored one down. The account's sessions are updated in place, so the
/// caller can save them afterwards.
pub fn connect(
    account: &mut Account,
    proxy: Option<&ProxyAddress>,
) -> Result<Connection, SteamError> {
    let steam_id = account.steam_id.ok_or(SteamError::SessionExpired)?;
    let stored = account.client_token.is_some();
    if !stored {
        new_client_token(account, proxy)?;
    }
    match open(account, proxy, steam_id) {
        Err(SteamError::SessionExpired) if stored => {
            account.client_token = None;
            new_client_token(account, proxy)?;
            open(account, proxy, steam_id)
        }
        result => result,
    }
    // A client sign-in that was just made and still turned down isn't the
    // mobile session's fault, which `SessionExpired` would say.
    .map_err(|err| match err {
        SteamError::SessionExpired => {
            SteamError::Steam("Steam turned down the client sign-in".to_owned())
        }
        err => err,
    })
}

fn open(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    steam_id: u64,
) -> Result<Connection, SteamError> {
    let token = account
        .client_token
        .as_ref()
        .ok_or(SteamError::SessionExpired)?;
    Connection::open(proxy, steam_id, token.expose())
}

/// Starts a QR sign-in as the Steam client and allows it with the account's own
/// Guard, as the user would by scanning the code with the phone.
fn new_client_token(account: &mut Account, proxy: Option<&ProxyAddress>) -> Result<(), SteamError> {
    let mut login = UserLogin::new(
        WebApiTransport::new(client(proxy)?),
        DeviceDetails {
            friendly_name: MACHINE_NAME.to_owned(),
            platform_type: EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient,
            os_type: WINDOWS_OS_TYPE as i32,
            gaming_device_type: DESKTOP_DEVICE_TYPE,
        },
    );
    let qr = login.begin_auth_via_qr().map_err(login_error)?;
    account.session = Some(sign_ins::allow_qr(account, proxy, qr.challenge_url())?);
    let tokens = login
        .poll_until_tokens()
        .map_err(|_| SteamError::Steam("no client sign-in was issued".to_owned()))?;
    account.client_token = Some(tokens.refresh_token().expose_secret().to_owned().into());
    Ok(())
}

#[derive(Deserialize)]
struct CmList {
    response: CmListResponse,
}

#[derive(Deserialize)]
struct CmListResponse {
    #[serde(default)]
    serverlist: Vec<CmServer>,
}

#[derive(Deserialize)]
struct CmServer {
    endpoint: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    realm: String,
    #[serde(default)]
    wtd_load: f64,
}

/// One of the least busy WebSocket servers, picked at random so accounts spread out.
fn cm_endpoint(proxy: Option<&ProxyAddress>) -> Result<String, SteamError> {
    let body = client(proxy)?
        .get(CM_LIST_URL)
        .send()
        .and_then(|response| response.error_for_status())
        .and_then(|response| response.text())
        .map_err(request_error)?;
    let list: CmList = serde_json::from_str(&body)
        .map_err(|_| SteamError::Steam("unreadable server list".to_owned()))?;
    let mut servers: Vec<CmServer> = list
        .response
        .serverlist
        .into_iter()
        .filter(|server| server.kind == "websockets" && server.realm == "steamglobal")
        .collect();
    servers.sort_by(|a, b| a.wtd_load.total_cmp(&b.wtd_load));
    servers.truncate(5);
    if servers.is_empty() {
        return Err(SteamError::Busy);
    }
    let pick = RandomState::new().build_hasher().finish() as usize % servers.len();
    Ok(servers.swap_remove(pick).endpoint)
}

impl Connection {
    fn open(proxy: Option<&ProxyAddress>, steam_id: u64, token: &str) -> Result<Self, SteamError> {
        let endpoint = cm_endpoint(proxy)?;
        let (host, port) = endpoint
            .rsplit_once(':')
            .and_then(|(host, port)| Some((host, port.parse().ok()?)))
            .unwrap_or((endpoint.as_str(), 443));
        let stream = tunnel::connect(proxy, host, port)?;
        // A clone shares the socket, so its timeouts can still be changed once
        // the TLS and WebSocket layers own the stream.
        let timeouts = stream.try_clone().map_err(|_| SteamError::Network)?;
        set_timeout(&timeouts, HANDSHAKE_TIMEOUT)?;
        let (socket, _) = tungstenite::client_tls_with_config(
            format!("wss://{endpoint}/cmsocket/"),
            stream,
            None,
            None,
        )
        .map_err(|_| SteamError::Network)?;
        set_timeout(&timeouts, POLL)?;

        let mut connection = Self {
            socket,
            steam_id,
            session_id: 0,
            heartbeat: DEFAULT_HEARTBEAT,
            last_sent: Instant::now(),
        };
        connection.send(emsg::LOGON, &logon(steam_id, token))?;
        let deadline = Instant::now() + LOGON_TIMEOUT;
        while Instant::now() < deadline {
            for message in connection.receive()? {
                match message.emsg {
                    emsg::LOGON_RESPONSE => {
                        let body = Fields::read(&message.body).map_err(|_| unreadable())?;
                        let eresult = body.int32(1).unwrap_or(2);
                        if eresult != 1 {
                            return Err(logon_error(eresult));
                        }
                        connection.session_id = message.session_id;
                        if let Some(seconds) = body.int32(3).filter(|&seconds| seconds > 0) {
                            connection.heartbeat = Duration::from_secs(seconds as u64);
                        }
                        return Ok(connection);
                    }
                    emsg::LOGGED_OFF => {
                        let body = Fields::read(&message.body).map_err(|_| unreadable())?;
                        return Err(logon_error(body.int32(1).unwrap_or(2)));
                    }
                    _ => {}
                }
            }
        }
        Err(SteamError::Timeout)
    }

    /// Plays the games, and shows the status as a game's name when there is one.
    /// An empty list stops playing.
    pub fn play(&mut self, games: &[u32], status: Option<&str>) -> Result<(), SteamError> {
        self.send(emsg::GAMES_PLAYED, &games_played(games, status))
    }

    pub fn show_as(&mut self, presence: Presence) -> Result<(), SteamError> {
        let body = Writer::default()
            .varint(1, presence.persona_state())
            .finish();
        self.send(emsg::CHANGE_STATUS, &body)
    }

    /// Waits up to `limit` for something to act on, keeping the connection alive
    /// meanwhile. An error means the connection is gone.
    pub fn wait(&mut self, limit: Duration) -> Result<Option<Event>, SteamError> {
        let deadline = Instant::now() + limit;
        loop {
            if self.last_sent.elapsed() >= self.heartbeat {
                self.send(emsg::HEARTBEAT, &[])?;
            }
            if Instant::now() >= deadline {
                return Ok(None);
            }
            for message in self.receive()? {
                if let Some(event) = event(&message)? {
                    return Ok(Some(event));
                }
            }
        }
    }

    /// Signs out, so Steam stops counting the games at once.
    pub fn close(mut self) {
        let _ = self.send(emsg::LOG_OFF, &[]);
        let _ = self.socket.close(None);
        let _ = self.socket.flush();
    }

    fn send(&mut self, emsg: u32, body: &[u8]) -> Result<(), SteamError> {
        let header = Writer::default()
            .fixed64(1, self.steam_id)
            .varint(2, self.session_id as i64 as u64)
            .finish();
        self.socket
            .send(Message::Binary(frame(emsg, &header, body).into()))
            .map_err(|_| SteamError::Network)?;
        self.last_sent = Instant::now();
        Ok(())
    }

    /// What came in within one poll, or nothing.
    fn receive(&mut self) -> Result<Vec<Incoming>, SteamError> {
        match self.socket.read() {
            Ok(Message::Binary(data)) => Ok(messages(&data)),
            Ok(Message::Close(_)) => Err(SteamError::Network),
            Ok(_) => Ok(Vec::new()),
            Err(tungstenite::Error::Io(err))
                if matches!(
                    err.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) =>
            {
                Ok(Vec::new())
            }
            Err(_) => Err(SteamError::Network),
        }
    }
}

fn set_timeout(stream: &TcpStream, timeout: Duration) -> Result<(), SteamError> {
    stream
        .set_read_timeout(Some(timeout))
        .and_then(|()| stream.set_write_timeout(Some(HANDSHAKE_TIMEOUT)))
        .map_err(|_| SteamError::Network)
}

fn unreadable() -> SteamError {
    SteamError::Steam("unreadable message from Steam".to_owned())
}

fn logon_error(eresult: i32) -> SteamError {
    match eresult {
        // Invalid password, access denied, revoked, expired: the sign-in is no good.
        5 | 15 | 26 | 27 => SteamError::SessionExpired,
        // Rate limit exceeded, too many sign-ins.
        84 | 87 => SteamError::RateLimited,
        // No connection, service unavailable, try another server.
        3 | 20 | 48 => SteamError::Busy,
        code => SteamError::Steam(format!("the client sign-in failed (code {code})")),
    }
}

fn event(message: &Incoming) -> Result<Option<Event>, SteamError> {
    Ok(match message.emsg {
        emsg::LOGGED_OFF => {
            let body = Fields::read(&message.body).map_err(|_| unreadable())?;
            Some(Event::LoggedOff(body.int32(1).unwrap_or(2)))
        }
        emsg::PLAYING_SESSION_STATE => {
            let body = Fields::read(&message.body).map_err(|_| unreadable())?;
            Some(Event::PlayingBlocked(body.bool(2).unwrap_or(false)))
        }
        _ => None,
    })
}

fn logon(steam_id: u64, token: &str) -> Vec<u8> {
    Writer::default()
        .varint(1, PROTOCOL_VERSION)
        .string(6, "english")
        .varint(7, WINDOWS_OS_TYPE)
        // should_remember_password, which a sign-in by token is.
        .varint(8, 1)
        .bytes(11, &Writer::default().fixed32(1, LOGON_ID).finish())
        .bytes(30, &machine_id(steam_id))
        // chat_mode 2, the current friends and chat.
        .varint(33, 2)
        .string(96, MACHINE_NAME)
        // supports_rate_limit_response
        .varint(102, 1)
        // The field is called access_token, but takes the refresh token.
        .string(108, token)
        .finish()
}

fn games_played(games: &[u32], status: Option<&str>) -> Vec<u8> {
    let status = status.map(str::trim).filter(|status| !status.is_empty());
    let mut message = Writer::default();
    if let Some(status) = status {
        let game = Writer::default()
            .fixed64(2, CUSTOM_STATUS_ID)
            .string(7, status)
            .finish();
        message = message.bytes(1, &game);
    }
    for &game in games.iter().take(MAX_GAMES - usize::from(status.is_some())) {
        message = message.bytes(1, &Writer::default().fixed64(2, u64::from(game)).finish());
    }
    message.finish()
}

/// What the client sends to tell its machine apart: Valve's binary key-value
/// object with three hashes. They're made from the account, so each account
/// looks like one steady machine.
fn machine_id(steam_id: u64) -> Vec<u8> {
    let mut out = vec![0];
    out.extend_from_slice(b"MessageObject\0");
    for key in ["BB3", "FF2", "3B3"] {
        out.push(1);
        out.extend_from_slice(key.as_bytes());
        out.push(0);
        let hash = Sha1::digest(format!("{MACHINE_NAME} {key} {steam_id}").as_bytes());
        for byte in hash {
            out.extend_from_slice(format!("{byte:02x}").as_bytes());
        }
        out.push(0);
    }
    out.extend_from_slice(&[8, 8]);
    out
}

fn frame(emsg: u32, header: &[u8], body: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + header.len() + body.len());
    out.extend_from_slice(&(emsg | PROTO_MASK).to_le_bytes());
    out.extend_from_slice(&(header.len() as u32).to_le_bytes());
    out.extend_from_slice(header);
    out.extend_from_slice(body);
    out
}

#[derive(Debug, PartialEq, Eq)]
struct Incoming {
    emsg: u32,
    session_id: i32,
    body: Vec<u8>,
}

/// The protobuf messages in a frame, with the ones a Multi carries taken out.
/// Steam gzips a Multi when it's big, as the one with the sign-in answer often
/// is. Messages that aren't protobuf hold nothing the app acts on and are skipped.
fn messages(data: &[u8]) -> Vec<Incoming> {
    let Some((raw, rest)) = split_u32(data) else {
        return Vec::new();
    };
    if raw & PROTO_MASK == 0 {
        return Vec::new();
    }
    let Some((header_len, rest)) = split_u32(rest) else {
        return Vec::new();
    };
    let Some((header, body)) = rest.split_at_checked(header_len as usize) else {
        return Vec::new();
    };
    let emsg = raw & !PROTO_MASK;
    if emsg == emsg::MULTI {
        let Ok(multi) = Fields::read(body) else {
            return Vec::new();
        };
        let packed = multi.bytes(2).unwrap_or_default();
        let mut unzipped = Vec::new();
        let mut payload = if multi.varint(1).unwrap_or(0) > 0 {
            if GzDecoder::new(packed)
                .take(MAX_UNZIPPED)
                .read_to_end(&mut unzipped)
                .is_err()
            {
                return Vec::new();
            }
            unzipped.as_slice()
        } else {
            packed
        };
        let mut out = Vec::new();
        while let Some((len, rest)) = split_u32(payload) {
            let Some((one, rest)) = rest.split_at_checked(len as usize) else {
                break;
            };
            out.extend(messages(one));
            payload = rest;
        }
        return out;
    }
    let session_id = Fields::read(header)
        .ok()
        .and_then(|header| header.int32(2))
        .unwrap_or(0);
    vec![Incoming {
        emsg,
        session_id,
        body: body.to_vec(),
    }]
}

fn split_u32(data: &[u8]) -> Option<(u32, &[u8])> {
    let (head, rest) = data.split_at_checked(4)?;
    Some((u32::from_le_bytes(head.try_into().ok()?), rest))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_carry_the_message_number_header_and_body() {
        let header = Writer::default().fixed64(1, 7).varint(2, 42).finish();
        let data = frame(emsg::LOGON_RESPONSE, &header, &[0x08, 0x01]);
        assert_eq!(&data[..4], &(751 | 0x8000_0000u32).to_le_bytes());
        assert_eq!(
            messages(&data),
            [Incoming {
                emsg: emsg::LOGON_RESPONSE,
                session_id: 42,
                body: vec![0x08, 0x01],
            }]
        );
    }

    #[test]
    fn a_multi_is_unpacked_gzipped_or_not() {
        let one = frame(emsg::LOGGED_OFF, &[], &[0x08, 0x06]);
        let two = frame(emsg::PLAYING_SESSION_STATE, &[], &[0x10, 0x01]);
        let mut payload = Vec::new();
        for message in [&one, &two] {
            payload.extend_from_slice(&(message.len() as u32).to_le_bytes());
            payload.extend_from_slice(message);
        }
        let multi = frame(
            emsg::MULTI,
            &[],
            &Writer::default().bytes(2, &payload).finish(),
        );
        let events: Vec<_> = messages(&multi)
            .iter()
            .map(|message| event(message).unwrap())
            .collect();
        assert_eq!(
            events,
            [Some(Event::LoggedOff(6)), Some(Event::PlayingBlocked(true))]
        );

        let mut zipper = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        std::io::Write::write_all(&mut zipper, &payload).unwrap();
        let gzipped = frame(
            emsg::MULTI,
            &[],
            &Writer::default()
                .varint(1, payload.len() as u64)
                .bytes(2, &zipper.finish().unwrap())
                .finish(),
        );
        assert_eq!(messages(&gzipped).len(), 2);
        let broken = frame(
            emsg::MULTI,
            &[],
            &Writer::default().varint(1, 100).bytes(2, &payload).finish(),
        );
        assert!(messages(&broken).is_empty());
        assert!(messages(&[1, 2]).is_empty());
    }

    #[test]
    fn the_status_comes_first_and_the_list_stops_at_32() {
        let games: Vec<u32> = (1..=40).collect();
        let body = games_played(&games, Some(" Trading "));
        let played = Fields::read(&body).unwrap();
        let entries: Vec<Fields> = played
            .0
            .iter()
            .map(|(_, value)| match value {
                crate::wire::Value::Bytes(entry) => Fields::read(entry).unwrap(),
                _ => panic!("a game is a nested message"),
            })
            .collect();
        assert_eq!(entries.len(), MAX_GAMES);
        assert_eq!(entries[0].fixed64(2), Some(CUSTOM_STATUS_ID));
        assert_eq!(entries[0].bytes(7), Some(&b"Trading"[..]));
        assert_eq!(entries[1].fixed64(2), Some(1));
        assert!(games_played(&[], Some("  ")).is_empty());
    }

    #[test]
    fn the_machine_id_is_steady_per_account() {
        let id = machine_id(76561197960287930);
        assert!(id.starts_with(b"\0MessageObject\0\x01BB3\0"));
        assert!(id.ends_with(&[0, 8, 8]));
        assert_eq!(id, machine_id(76561197960287930));
        assert_ne!(id, machine_id(76561197960287931));
    }

    #[test]
    fn logon_refusals_are_told_apart() {
        assert!(matches!(logon_error(5), SteamError::SessionExpired));
        assert!(matches!(logon_error(84), SteamError::RateLimited));
        assert!(matches!(logon_error(48), SteamError::Busy));
        assert!(matches!(logon_error(65), SteamError::Steam(_)));
    }
}
