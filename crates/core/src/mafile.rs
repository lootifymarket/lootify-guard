use std::collections::BTreeMap;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::contents::{Account, Authenticator, AutoConfirm, Secret};
use crate::games::PlayingList;

const SECRET_LEN: usize = 20;
// The upper half of every user's SteamID64: public universe, individual account,
// desktop instance. Groups and game servers differ here.
pub(crate) const USER_ID_HIGH: u64 = 0x0110_0001;

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum MaFileError {
    #[error(
        "the file is encrypted by Steam Desktop Authenticator, turn off encryption in SDA first"
    )]
    Encrypted,
    #[error("not a .maFile (broken at line {line}, column {column})")]
    Malformed { line: usize, column: usize },
    #[error("the file has no {0}")]
    Missing(&'static str),
    #[error("{0} in the file is damaged")]
    Invalid(&'static str),
}

// Everything is optional here so that a missing field is reported by name
// instead of as a serde error.
#[derive(Deserialize)]
struct MaFile {
    account_name: Option<String>,
    shared_secret: Option<Secret>,
    identity_secret: Option<Secret>,
    revocation_code: Option<Secret>,
    secret_1: Option<Secret>,
    uri: Option<Secret>,
    serial_number: Option<String>,
    token_gid: Option<String>,
    device_id: Option<String>,
    // steamguard-cli writes the Steam ID at the top level, SDA inside the session.
    steam_id: Option<SteamId>,
    #[serde(rename = "Session")]
    session: Option<Session>,
}

#[derive(Deserialize)]
struct Session {
    #[serde(rename = "SteamID")]
    steam_id: Option<SteamId>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum SteamId {
    Number(u64),
    Text(String),
}

/// Reads a `.maFile` as written by Steam Desktop Authenticator, ASF or steamguard-cli.
pub fn parse(file: &[u8]) -> Result<Account, MaFileError> {
    // Notepad on Windows saves JSON with a byte order mark in front.
    let file = file.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(file);
    if looks_encrypted(file.trim_ascii()) {
        return Err(MaFileError::Encrypted);
    }
    let mafile: MaFile = serde_json::from_slice(file).map_err(|err| MaFileError::Malformed {
        line: err.line(),
        column: err.column(),
    })?;

    let steam_id = mafile
        .steam_id
        .or(mafile.session.and_then(|session| session.steam_id))
        .map(user_steam_id)
        .transpose()?;

    Ok(Account {
        steam_id,
        account_name: mafile
            .account_name
            .filter(|name| !name.is_empty())
            .ok_or(MaFileError::Missing("account name"))?,
        authenticator: Authenticator {
            shared_secret: required_secret(mafile.shared_secret, "shared_secret")?,
            identity_secret: required_secret(mafile.identity_secret, "identity_secret")?,
            revocation_code: mafile.revocation_code,
            secret_1: mafile.secret_1,
            uri: mafile.uri,
            serial_number: mafile.serial_number,
            token_gid: mafile.token_gid,
            device_id: mafile.device_id,
        },
        session: None,
        password: None,
        profile: None,
        proxy: None,
        auto_confirm: AutoConfirm::default(),
        group: None,
        trusted_api_key: None,
        device_names: BTreeMap::new(),
        client_token: None,
        playing: PlayingList::default(),
    })
}

#[derive(Serialize)]
struct SdaFile<'a> {
    account_name: &'a str,
    shared_secret: &'a Secret,
    identity_secret: &'a Secret,
    #[serde(skip_serializing_if = "Option::is_none")]
    revocation_code: Option<&'a Secret>,
    #[serde(skip_serializing_if = "Option::is_none")]
    secret_1: Option<&'a Secret>,
    #[serde(skip_serializing_if = "Option::is_none")]
    uri: Option<&'a Secret>,
    #[serde(skip_serializing_if = "Option::is_none")]
    serial_number: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_gid: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    device_id: Option<&'a str>,
    #[serde(rename = "Session", skip_serializing_if = "Option::is_none")]
    session: Option<SdaSession>,
}

#[derive(Serialize)]
struct SdaSession {
    #[serde(rename = "SteamID")]
    steam_id: u64,
}

/// Writes the account as an SDA `.maFile`, the format other managers read too.
pub fn export(account: &Account) -> Zeroizing<Vec<u8>> {
    let auth = &account.authenticator;
    let file = SdaFile {
        account_name: &account.account_name,
        shared_secret: &auth.shared_secret,
        identity_secret: &auth.identity_secret,
        revocation_code: auth.revocation_code.as_ref(),
        secret_1: auth.secret_1.as_ref(),
        uri: auth.uri.as_ref(),
        serial_number: auth.serial_number.as_deref(),
        token_gid: auth.token_gid.as_deref(),
        device_id: auth.device_id.as_deref(),
        session: account.steam_id.map(|steam_id| SdaSession { steam_id }),
    };
    Zeroizing::new(serde_json::to_vec(&file).expect("a .maFile has only string keys"))
}

fn user_steam_id(id: SteamId) -> Result<u64, MaFileError> {
    let id = match id {
        SteamId::Number(id) => id,
        SteamId::Text(text) => text.parse().map_err(|_| MaFileError::Invalid("Steam ID"))?,
    };
    if id >> 32 != USER_ID_HIGH || id as u32 == 0 {
        return Err(MaFileError::Invalid("Steam ID"));
    }
    Ok(id)
}

// SDA encrypts a .maFile into a single base64 blob, where JSON would start with `{`.
fn looks_encrypted(file: &[u8]) -> bool {
    !file.is_empty()
        && file
            .iter()
            .all(|&b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))
}

fn required_secret(secret: Option<Secret>, name: &'static str) -> Result<Secret, MaFileError> {
    let secret = secret
        .filter(|secret| !secret.expose().is_empty())
        .ok_or(MaFileError::Missing(name))?;
    let bytes = Zeroizing::new(
        STANDARD
            .decode(secret.expose())
            .map_err(|_| MaFileError::Invalid(name))?,
    );
    if bytes.len() != SECRET_LEN {
        return Err(MaFileError::Invalid(name));
    }
    Ok(secret)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contents::Session;

    const SHARED: &str = "zvIayp3JPvtvX/QGHqsqKBk/44s=";
    const IDENTITY: &str = "AAECAwQFBgcICQoLDA0ODxAREhM=";

    fn sda() -> serde_json::Value {
        serde_json::json!({
            "shared_secret": SHARED,
            "serial_number": "1234567890123456789",
            "revocation_code": "R12345",
            "uri": "otpauth://totp/Steam:trader_one?secret=ZZZ&issuer=Steam",
            "server_time": 1616374841,
            "account_name": "trader_one",
            "token_gid": "2a2b2c2d2e2f",
            "identity_secret": IDENTITY,
            "secret_1": "c2VjcmV0LW9uZS0yMC1ieXRlcw==",
            "status": 1,
            "device_id": "android:0b6c5d4e-1f2a-3b4c-5d6e-7f8091a2b3c4",
            "fully_enrolled": true,
            "Session": {
                "SessionID": "abc",
                "SteamID": 76561198000000001u64,
            },
        })
    }

    fn parse_json(value: &serde_json::Value) -> Result<Account, MaFileError> {
        parse(value.to_string().as_bytes())
    }

    #[test]
    fn reads_an_sda_file() {
        let account = parse_json(&sda()).unwrap();
        assert_eq!(account.steam_id, Some(76561198000000001));
        assert_eq!(account.account_name, "trader_one");
        let auth = &account.authenticator;
        assert_eq!(auth.shared_secret.expose(), SHARED);
        assert_eq!(auth.identity_secret.expose(), IDENTITY);
        assert_eq!(auth.revocation_code.as_ref().unwrap().expose(), "R12345");
        assert_eq!(auth.serial_number.as_deref(), Some("1234567890123456789"));
        assert_eq!(
            auth.device_id.as_deref(),
            Some("android:0b6c5d4e-1f2a-3b4c-5d6e-7f8091a2b3c4")
        );
    }

    #[test]
    fn reads_a_top_level_or_text_steam_id() {
        let mut file = sda();
        file.as_object_mut().unwrap().remove("Session");
        file["steam_id"] = 76561198000000002u64.into();
        assert_eq!(parse_json(&file).unwrap().steam_id, Some(76561198000000002));

        file["steam_id"] = "76561198000000003".into();
        assert_eq!(parse_json(&file).unwrap().steam_id, Some(76561198000000003));
    }

    #[test]
    fn reads_a_file_with_only_the_required_fields() {
        let file = serde_json::json!({
            "account_name": "trader_one",
            "shared_secret": SHARED,
            "identity_secret": IDENTITY,
        });
        let account = parse_json(&file).unwrap();
        assert_eq!(account.steam_id, None);
        assert!(account.authenticator.revocation_code.is_none());
        assert!(account.authenticator.device_id.is_none());
    }

    #[test]
    fn accepts_a_byte_order_mark() {
        let file = [b"\xEF\xBB\xBF".as_slice(), sda().to_string().as_bytes()].concat();
        assert!(parse(&file).is_ok());
    }

    #[test]
    fn recognises_an_encrypted_sda_file() {
        let err = parse(b"q83vASNFZ4mrze8BI0VniQ==\n").unwrap_err();
        assert_eq!(err, MaFileError::Encrypted);
    }

    #[test]
    fn reports_what_is_missing_or_damaged() {
        let mut file = sda();
        file.as_object_mut().unwrap().remove("identity_secret");
        assert_eq!(
            parse_json(&file).unwrap_err(),
            MaFileError::Missing("identity_secret")
        );

        let mut file = sda();
        file["shared_secret"] = "c2hvcnQ=".into();
        assert_eq!(
            parse_json(&file).unwrap_err(),
            MaFileError::Invalid("shared_secret")
        );

        // A group's ID and the lowest possible user ID with no account number.
        for id in [103582791429521408u64, 76561197960265728] {
            let mut file = sda();
            file["Session"]["SteamID"] = id.into();
            assert_eq!(
                parse_json(&file).unwrap_err(),
                MaFileError::Invalid("Steam ID")
            );
        }
    }

    #[test]
    fn exported_file_reads_back_the_same() {
        let original = parse_json(&sda()).unwrap();
        let restored = parse(&export(&original)).unwrap();

        assert_eq!(restored.steam_id, original.steam_id);
        assert_eq!(restored.account_name, original.account_name);
        let secrets = |account: &Account| {
            let auth = &account.authenticator;
            [
                Some(auth.shared_secret.expose().to_owned()),
                Some(auth.identity_secret.expose().to_owned()),
                auth.revocation_code.as_ref().map(|s| s.expose().to_owned()),
                auth.secret_1.as_ref().map(|s| s.expose().to_owned()),
                auth.uri.as_ref().map(|s| s.expose().to_owned()),
                auth.serial_number.clone(),
                auth.token_gid.clone(),
                auth.device_id.clone(),
            ]
        };
        assert_eq!(secrets(&restored), secrets(&original));
    }

    #[test]
    fn export_leaves_out_what_the_account_lacks() {
        let file = serde_json::json!({
            "account_name": "trader_one",
            "shared_secret": SHARED,
            "identity_secret": IDENTITY,
        });
        let exported: serde_json::Value =
            serde_json::from_slice(&export(&parse_json(&file).unwrap())).unwrap();
        assert_eq!(exported, file);
    }

    #[test]
    fn export_keeps_the_session_and_password_out() {
        let mut account = parse_json(&sda()).unwrap();
        account.session = Some(Session {
            access_token: "access-token-value".to_owned().into(),
            refresh_token: "refresh-token-value".to_owned().into(),
        });
        account.password = Some("steam-password-value".to_owned().into());

        let file = String::from_utf8(export(&account).to_vec()).unwrap();
        for secret in [
            "access-token-value",
            "refresh-token-value",
            "steam-password-value",
        ] {
            assert!(!file.contains(secret), "{secret}");
        }
    }

    #[test]
    fn broken_json_is_malformed() {
        let err = parse(b"{\"shared_secret\": ").unwrap_err();
        assert!(matches!(err, MaFileError::Malformed { .. }));
    }
}
