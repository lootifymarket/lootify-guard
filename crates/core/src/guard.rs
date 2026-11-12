use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use hmac::{Hmac, KeyInit, Mac};
use sha1::Sha1;
use zeroize::Zeroizing;

use crate::contents::Secret;

// Steam's codes are TOTP with its own alphabet: no vowels and nothing that
// looks like another character.
const ALPHABET: &[u8; 26] = b"23456789BCDFGHJKMNPQRTVWXY";
const CODE_LEN: usize = 5;
const PERIOD_SECS: u64 = 30;

#[derive(Debug, thiserror::Error)]
#[error("shared secret is not valid base64")]
pub struct InvalidSharedSecret;

/// The Steam Guard code for the 30-second window that `unix_time` falls in.
pub fn code(shared_secret: &Secret, unix_time: u64) -> Result<String, InvalidSharedSecret> {
    let key = Zeroizing::new(
        STANDARD
            .decode(shared_secret.expose())
            .map_err(|_| InvalidSharedSecret)?,
    );
    let mut mac = Hmac::<Sha1>::new_from_slice(&key).expect("HMAC accepts keys of any length");
    mac.update(&(unix_time / PERIOD_SECS).to_be_bytes());
    let hash = mac.finalize().into_bytes();

    let offset = usize::from(hash[hash.len() - 1] & 0x0f);
    let mut value =
        u32::from_be_bytes(hash[offset..offset + 4].try_into().expect("4 bytes")) & 0x7fff_ffff;
    let code = (0..CODE_LEN)
        .map(|_| {
            let symbol = ALPHABET[(value % 26) as usize];
            value /= 26;
            char::from(symbol)
        })
        .collect();
    Ok(code)
}

/// When the code for `unix_time` stops being valid.
pub fn code_expires_at(unix_time: u64) -> u64 {
    (unix_time / PERIOD_SECS + 1) * PERIOD_SECS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret(value: &str) -> Secret {
        value.to_owned().into()
    }

    // Codes cross-checked against steamguard-cli and an independent Python version.
    #[test]
    fn matches_known_codes() {
        let shared = secret("zvIayp3JPvtvX/QGHqsqKBk/44s=");
        for (time, expected) in [
            (0, "8J8QF"),
            (1616374841, "2F9J5"),
            (1616374860, "3HJXN"),
            (1767225600, "434XF"),
        ] {
            assert_eq!(code(&shared, time).unwrap(), expected, "time {time}");
        }
    }

    #[test]
    fn code_holds_for_the_whole_window() {
        let shared = secret("zvIayp3JPvtvX/QGHqsqKBk/44s=");
        assert_eq!(code(&shared, 1616374830).unwrap(), "2F9J5");
        assert_eq!(code(&shared, 1616374859).unwrap(), "2F9J5");
        assert_ne!(code(&shared, 1616374860).unwrap(), "2F9J5");
        assert_eq!(code_expires_at(1616374830), 1616374860);
        assert_eq!(code_expires_at(1616374859), 1616374860);
    }

    #[test]
    fn broken_secret_is_an_error() {
        assert!(code(&secret("not base64!"), 0).is_err());
    }
}
