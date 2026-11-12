use std::fmt;

use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

/// What the vault holds once decrypted.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Contents {
    pub accounts: Vec<Account>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    /// Some `.maFile`s don't carry it, and it can't be derived from the login offline.
    pub steam_id: Option<u64>,
    pub account_name: String,
    pub authenticator: Authenticator,
}

/// The data Steam hands out when a mobile authenticator is added. All of it is kept,
/// even the parts we don't use yet, because a lost field can't be recovered later
/// once the user deletes the `.maFile` it came from. Only the two secrets are
/// required, as some tools write `.maFile`s with fewer fields than SDA does.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Authenticator {
    pub shared_secret: Secret,
    pub identity_secret: Secret,
    pub revocation_code: Option<Secret>,
    pub secret_1: Option<Secret>,
    pub uri: Option<Secret>,
    pub serial_number: Option<String>,
    pub token_gid: Option<String>,
    pub device_id: Option<String>,
}

/// A string that is wiped on drop and never shows up in `Debug` output.
#[derive(Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Secret(Zeroizing<String>);

impl Secret {
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl From<String> for Secret {
    fn from(value: String) -> Self {
        Self(Zeroizing::new(value))
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(..)")
    }
}

/// serde_json errors can quote the offending value, which here may be a secret,
/// so only the position is kept.
#[derive(Debug, thiserror::Error)]
#[error("vault contents are damaged at line {line}, column {column}")]
pub struct DamagedContents {
    line: usize,
    column: usize,
}

impl Contents {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, DamagedContents> {
        // A freshly created vault holds no bytes at all.
        if bytes.is_empty() {
            return Ok(Self::default());
        }
        serde_json::from_slice(bytes).map_err(|err| DamagedContents {
            line: err.line(),
            column: err.column(),
        })
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        serde_json::to_vec(self).expect("contents have only string keys")
    }

    pub fn account(&self, account_name: &str) -> Option<&Account> {
        self.accounts
            .iter()
            .find(|account| account.account_name == account_name)
    }

    pub fn remove_account(&mut self, account_name: &str) -> bool {
        let count = self.accounts.len();
        self.accounts
            .retain(|account| account.account_name != account_name);
        self.accounts.len() < count
    }

    /// Adds the account unless it's already there. Steam logins are unique and
    /// case-insensitive, so the login identifies an account even without a Steam ID.
    pub fn add_account(&mut self, account: Account) -> bool {
        let is_same = |known: &Account| {
            known
                .account_name
                .eq_ignore_ascii_case(&account.account_name)
                || (known.steam_id.is_some() && known.steam_id == account.steam_id)
        };
        if self.accounts.iter().any(is_same) {
            return false;
        }
        self.accounts.push(account);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account() -> Account {
        Account {
            steam_id: Some(76561198000000001),
            account_name: "trader_one".to_owned(),
            authenticator: Authenticator {
                shared_secret: "c2hhcmVkLXNlY3JldC0yMGJ5dGU=".to_owned().into(),
                identity_secret: "aWRlbnRpdHktc2VjcmV0LTIwYg==".to_owned().into(),
                revocation_code: Some("R12345".to_owned().into()),
                secret_1: Some("c2VjcmV0LW9uZS0yMC1ieXRlcw==".to_owned().into()),
                uri: None,
                serial_number: Some("1234567890123456789".to_owned()),
                token_gid: Some("2a2b2c2d2e2f".to_owned()),
                device_id: Some("android:0b6c5d4e-1f2a-3b4c-5d6e-7f8091a2b3c4".to_owned()),
            },
        }
    }

    fn secrets(account: &Account) -> Vec<&str> {
        let auth = &account.authenticator;
        [
            Some(&auth.shared_secret),
            Some(&auth.identity_secret),
            auth.revocation_code.as_ref(),
            auth.secret_1.as_ref(),
            auth.uri.as_ref(),
        ]
        .into_iter()
        .flatten()
        .map(Secret::expose)
        .collect()
    }

    #[test]
    fn empty_vault_has_no_accounts() {
        let contents = Contents::from_bytes(b"").unwrap();
        assert!(contents.accounts.is_empty());
    }

    #[test]
    fn accounts_survive_a_round_trip() {
        let contents = Contents {
            accounts: vec![account()],
        };

        let restored = Contents::from_bytes(&contents.to_bytes()).unwrap();
        let [restored] = restored.accounts.as_slice() else {
            panic!("expected one account");
        };
        let original = account();
        assert_eq!(restored.steam_id, original.steam_id);
        assert_eq!(restored.account_name, original.account_name);
        assert_eq!(secrets(restored), secrets(&original));
        assert_eq!(
            restored.authenticator.device_id,
            original.authenticator.device_id
        );
    }

    #[test]
    fn same_account_is_not_added_twice() {
        let mut contents = Contents::default();
        assert!(contents.add_account(account()));

        let mut renamed = account();
        renamed.account_name = "trader_two".to_owned();
        assert!(!contents.add_account(renamed));

        let mut without_id = account();
        without_id.steam_id = None;
        without_id.account_name = "Trader_One".to_owned();
        assert!(!contents.add_account(without_id));

        assert_eq!(contents.accounts.len(), 1);
        assert_eq!(contents.accounts[0].account_name, "trader_one");
    }

    #[test]
    fn removes_only_the_named_account() {
        let mut contents = Contents::default();
        let mut other = account();
        other.steam_id = None;
        other.account_name = "trader_two".to_owned();
        contents.add_account(account());
        contents.add_account(other);

        assert!(contents.remove_account("trader_one"));
        assert!(!contents.remove_account("trader_one"));
        assert!(contents.account("trader_one").is_none());
        assert!(contents.account("trader_two").is_some());
    }

    #[test]
    fn accounts_without_steam_ids_are_told_apart_by_login() {
        let mut contents = Contents::default();
        for name in ["trader_one", "trader_two"] {
            let mut account = account();
            account.steam_id = None;
            account.account_name = name.to_owned();
            assert!(contents.add_account(account), "{name}");
        }
        assert_eq!(contents.accounts.len(), 2);
    }

    #[test]
    fn debug_output_has_no_secrets() {
        let account = account();
        let debug = format!("{account:?}");
        for secret in secrets(&account) {
            assert!(!debug.contains(secret), "{secret}");
        }
    }

    #[test]
    fn damaged_contents_do_not_echo_secrets() {
        let mut json = String::from_utf8(
            Contents {
                accounts: vec![account()],
            }
            .to_bytes(),
        )
        .unwrap();
        // Turns the number into a string, so serde_json reports the value it found.
        json = json.replace("76561198000000001", "\"c2hhcmVkLXNlY3JldC0yMGJ5dGU=\"");
        let raw = serde_json::from_str::<Contents>(&json).unwrap_err();
        assert!(raw.to_string().contains("c2hhcmVk"));

        let err = Contents::from_bytes(json.as_bytes()).unwrap_err();
        assert!(!err.to_string().contains("c2hhcmVk"));
        assert!(!format!("{err:?}").contains("c2hhcmVk"));
    }
}
