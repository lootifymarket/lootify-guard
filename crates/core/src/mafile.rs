use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Deserialize;
use zeroize::Zeroizing;

use crate::contents::{Account, Authenticator, Secret};

const SECRET_LEN: usize = 20;
// The upper half of every user's SteamID64: public universe, individual account,
// desktop instance. Groups and game servers differ here.
const USER_ID_HIGH: u64 = 0x0110_0001;

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

    let steam_id = match mafile
        .steam_id
        .or(mafile.session.and_then(|session| session.steam_id))
        .ok_or(MaFileError::Missing("Steam ID"))?
    {
        SteamId::Number(id) => id,
        SteamId::Text(text) => text.parse().map_err(|_| MaFileError::Invalid("Steam ID"))?,
    };
    if steam_id >> 32 != USER_ID_HIGH || steam_id as u32 == 0 {
        return Err(MaFileError::Invalid("Steam ID"));
    }

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
    })
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
        assert_eq!(account.steam_id, 76561198000000001);
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
        assert_eq!(parse_json(&file).unwrap().steam_id, 76561198000000002);

        file["steam_id"] = "76561198000000003".into();
        assert_eq!(parse_json(&file).unwrap().steam_id, 76561198000000003);
    }

    #[test]
    fn keeps_only_the_required_fields_when_others_are_missing() {
        let file = serde_json::json!({
            "account_name": "trader_one",
            "shared_secret": SHARED,
            "identity_secret": IDENTITY,
            "Session": { "SteamID": 76561198000000001u64 },
        });
        let account = parse_json(&file).unwrap();
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

        let mut file = sda();
        file.as_object_mut().unwrap().remove("Session");
        assert_eq!(
            parse_json(&file).unwrap_err(),
            MaFileError::Missing("Steam ID")
        );
    }

    #[test]
    fn broken_json_is_malformed() {
        let err = parse(b"{\"shared_secret\": ").unwrap_err();
        assert!(matches!(err, MaFileError::Malformed { .. }));
    }
}
