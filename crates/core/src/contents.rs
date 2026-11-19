use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Deserializer, Serialize};
use zeroize::Zeroizing;

use crate::browser::{Bookmark, SavedCookie};
use crate::browser_profiles::BrowserProfile;
use crate::browser_region::RegionChoice;
use crate::games::PlayingList;
use crate::proxy::{Proxy, ProxyAddress};

/// What the vault holds once decrypted.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Contents {
    pub accounts: Vec<Account>,
    #[serde(default)]
    pub proxies: Vec<Proxy>,
    /// Ids are never reused: an account still pointing at a deleted proxy must not
    /// end up on a new one by accident.
    #[serde(default)]
    last_proxy_id: u32,
    /// Stops every auto-confirm rule at once, and stays that way across restarts.
    #[serde(default)]
    pub auto_confirm_paused: bool,
    #[serde(default)]
    pub groups: Vec<Group>,
    /// Never reused, like proxy ids, so a stale id can't land on a new group.
    #[serde(default)]
    last_group_id: u32,
    /// In the vault rather than the settings: a saved profile page names the account.
    #[serde(default)]
    pub bookmarks: Vec<Bookmark>,
    #[serde(default)]
    pub profiles: Vec<BrowserProfile>,
    /// Never reused, so a tab of a deleted profile can't turn into a new one.
    #[serde(default)]
    pub(crate) last_profile_id: u32,
}

/// A set of accounts the user handles together, like "Farm" or "Storage".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Group {
    pub id: u32,
    pub name: String,
    /// What its pills are tinted with.
    #[serde(default)]
    pub color: GroupColor,
}

/// The few tints a group can have, so every one reads well on the dark page.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GroupColor {
    #[default]
    Gray,
    Red,
    Orange,
    Yellow,
    Green,
    Teal,
    Blue,
    Purple,
    Pink,
}

// Group names show in narrow chips and menus.
const MAX_GROUP_NAME: usize = 40;

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum GroupError {
    #[error("give the group a name")]
    EmptyName,
    #[error("keep the name under {MAX_GROUP_NAME} characters")]
    LongName,
    #[error("there's already a group with that name")]
    Taken,
    #[error("the group is no longer in the vault")]
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    /// Some `.maFile`s don't carry it, and it can't be derived from the login offline.
    pub steam_id: Option<u64>,
    pub account_name: String,
    pub authenticator: Authenticator,
    pub session: Option<Session>,
    /// Kept only when the user asks, so the app can sign in again by itself.
    pub password: Option<Secret>,
    pub profile: Option<Profile>,
    /// The id of the proxy every request for this account goes through.
    pub proxy: Option<u32>,
    #[serde(default)]
    pub auto_confirm: AutoConfirm,
    /// The ids of the groups the account is in, in the order it joined them.
    #[serde(default, alias = "group", deserialize_with = "group_ids")]
    pub groups: Vec<u32>,
    /// The fingerprint of a Web API key the user said is theirs, so it isn't flagged
    /// again. A different key on the account is flagged as usual.
    #[serde(default)]
    pub trusted_api_key: Option<String>,
    /// Names the user gave the account's signed-in devices, by Steam's device id.
    /// They stay in the vault and never reach Steam.
    #[serde(default)]
    pub device_names: BTreeMap<String, String>,
    /// A refresh token for signing in as the Steam client, which playing games
    /// needs and the mobile session can't do. The app makes it itself.
    #[serde(default)]
    pub client_token: Option<Secret>,
    #[serde(default)]
    pub playing: PlayingList,
    /// What the user wrote about the account, shown in the list. It stays in
    /// the vault and never reaches Steam.
    #[serde(default)]
    pub note: Option<String>,
    /// The wallet as Steam last showed it, so the list has it without asking again.
    #[serde(default)]
    pub wallet: Option<StoredWallet>,
    /// What the last check found wrong, so the list can flag the account.
    #[serde(default)]
    pub last_check: Option<LastCheck>,
    /// The account's browser tab's sign-ins to other sites, put back when it opens.
    #[serde(default)]
    pub saved_cookies: Vec<SavedCookie>,
    /// The time zone and language its browser tab shows pages.
    #[serde(default)]
    pub browser_region: RegionChoice,
}

/// Vaults from before an account could be in several groups keep one id, or none.
fn group_ids<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<u32>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Ids {
        Many(Vec<u32>),
        One(Option<u32>),
    }
    Ok(match Ids::deserialize(deserializer)? {
        Ids::Many(ids) => ids,
        Ids::One(id) => id.into_iter().collect(),
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredWallet {
    /// ISO 4217, or `None` for a currency this app doesn't know.
    pub currency: Option<String>,
    /// In hundredths of the currency.
    pub balance: u64,
    pub pending: u64,
    /// When it was read, in Unix seconds.
    pub at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastCheck {
    /// In Unix seconds.
    pub at: u64,
    /// Empty when all was clear.
    pub problems: Vec<String>,
}

/// What the app may confirm for the account without asking. Everything is off until
/// the user turns it on.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoConfirm {
    /// Only trades whose other side is an account in this vault. Steam asks to
    /// confirm a trade only when items leave the account, so a rule for any trade
    /// would hand them to whoever swapped an offer through a stolen API key.
    pub trades_to_own_accounts: bool,
    /// Every listing, wherever it was made, so also one made by someone who got
    /// into the account's Steam session.
    pub any_market_listing: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AutoConfirmRule {
    TradesToOwnAccounts,
    AnyMarketListing,
}

impl AutoConfirm {
    pub fn any(&self) -> bool {
        self.trades_to_own_accounts || self.any_market_listing
    }

    pub fn set(&mut self, rule: AutoConfirmRule, on: bool) {
        match rule {
            AutoConfirmRule::TradesToOwnAccounts => self.trades_to_own_accounts = on,
            AutoConfirmRule::AnyMarketListing => self.any_market_listing = on,
        }
    }
}

/// What Steam shows for the account, kept so the list doesn't ask Steam each time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub persona_name: String,
    /// A 64×64 JPEG, base64.
    pub avatar: Option<String>,
}

/// Tokens from signing in to Steam as the mobile app.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub access_token: Secret,
    pub refresh_token: Secret,
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

#[derive(Debug, thiserror::Error)]
#[error("the account's proxy is no longer in the vault")]
pub struct MissingProxy;

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

    pub fn account_mut(&mut self, account_name: &str) -> Option<&mut Account> {
        self.accounts
            .iter_mut()
            .find(|account| account.account_name == account_name)
    }

    pub fn remove_account(&mut self, account_name: &str) -> bool {
        let count = self.accounts.len();
        self.accounts
            .retain(|account| account.account_name != account_name);
        self.accounts.len() < count
    }

    /// The proxy assigned to the account. An id that points nowhere is an error
    /// rather than `None`, so a broken assignment never sends requests directly.
    pub fn proxy_of(&self, account: &Account) -> Result<Option<&Proxy>, MissingProxy> {
        account
            .proxy
            .map(|id| self.proxy(id).ok_or(MissingProxy))
            .transpose()
    }

    pub fn proxy(&self, id: u32) -> Option<&Proxy> {
        self.proxies.iter().find(|proxy| proxy.id == id)
    }

    /// Adds the proxy unless the same one is already there, and returns it to fill in
    /// the rest.
    pub fn add_proxy(&mut self, address: ProxyAddress) -> Option<&mut Proxy> {
        if self
            .proxies
            .iter()
            .any(|known| known.address.same_as(&address))
        {
            return None;
        }
        self.last_proxy_id += 1;
        self.proxies.push(Proxy {
            id: self.last_proxy_id,
            name: None,
            country: None,
            address,
        });
        self.proxies.last_mut()
    }

    pub fn proxy_mut(&mut self, id: u32) -> Option<&mut Proxy> {
        self.proxies.iter_mut().find(|proxy| proxy.id == id)
    }

    /// Removes the proxy but leaves it assigned to its accounts. Their requests fail
    /// until they get another one, instead of quietly going out from the real IP.
    pub fn remove_proxy(&mut self, id: u32) -> bool {
        let count = self.proxies.len();
        self.proxies.retain(|proxy| proxy.id != id);
        self.proxies.len() < count
    }

    /// Makes a group and returns its id.
    pub fn add_group(&mut self, name: &str, color: GroupColor) -> Result<u32, GroupError> {
        let name = self.group_name(name, None)?;
        self.last_group_id += 1;
        self.groups.push(Group {
            id: self.last_group_id,
            name,
            color,
        });
        Ok(self.last_group_id)
    }

    pub fn update_group(
        &mut self,
        id: u32,
        name: &str,
        color: GroupColor,
    ) -> Result<(), GroupError> {
        let name = self.group_name(name, Some(id))?;
        let group = self
            .groups
            .iter_mut()
            .find(|group| group.id == id)
            .ok_or(GroupError::Missing)?;
        group.name = name;
        group.color = color;
        Ok(())
    }

    /// Removes the group; its accounts stay, in their other groups.
    pub fn remove_group(&mut self, id: u32) -> bool {
        let count = self.groups.len();
        self.groups.retain(|group| group.id != id);
        for account in &mut self.accounts {
            account.groups.retain(|&group| group != id);
        }
        self.groups.len() < count
    }

    /// Adds the accounts to the group, keeping their other groups. Logins not in
    /// the vault are skipped.
    pub fn add_to_group(&mut self, account_names: &[String], id: u32) -> Result<(), GroupError> {
        if !self.groups.iter().any(|group| group.id == id) {
            return Err(GroupError::Missing);
        }
        for account in &mut self.accounts {
            if account_names.contains(&account.account_name) && !account.groups.contains(&id) {
                account.groups.push(id);
            }
        }
        Ok(())
    }

    /// Takes the accounts out of the group, leaving their other groups.
    pub fn remove_from_group(&mut self, account_names: &[String], id: u32) {
        for account in &mut self.accounts {
            if account_names.contains(&account.account_name) {
                account.groups.retain(|&group| group != id);
            }
        }
    }

    /// The name as it will be kept, checked against every other group's.
    fn group_name(&self, name: &str, renaming: Option<u32>) -> Result<String, GroupError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(GroupError::EmptyName);
        }
        if name.chars().count() > MAX_GROUP_NAME {
            return Err(GroupError::LongName);
        }
        let taken = self.groups.iter().any(|group| {
            Some(group.id) != renaming && group.name.to_lowercase() == name.to_lowercase()
        });
        if taken {
            return Err(GroupError::Taken);
        }
        Ok(name.to_owned())
    }

    /// Adds the account unless it's already there. Steam logins are unique and
    /// case-insensitive, so the login identifies an account even without a Steam ID.
    pub fn add_account(&mut self, account: Account) -> bool {
        if self
            .accounts
            .iter()
            .any(|known| same_account(known, &account))
        {
            return false;
        }
        self.accounts.push(account);
        true
    }

    /// Adds an account whose Guard was just set up here, dropping any copy already in
    /// the vault: Steam has made that copy's secrets useless.
    pub fn put_account(&mut self, account: Account) {
        self.accounts.retain(|known| !same_account(known, &account));
        self.accounts.push(account);
    }

    pub fn has_login(&self, account_name: &str) -> bool {
        self.accounts
            .iter()
            .any(|known| known.account_name.eq_ignore_ascii_case(account_name))
    }
}

fn same_account(known: &Account, account: &Account) -> bool {
    known
        .account_name
        .eq_ignore_ascii_case(&account.account_name)
        || (known.steam_id.is_some() && known.steam_id == account.steam_id)
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
            session: Some(Session {
                access_token: "eyJhY2Nlc3MiOnRydWV9.access".to_owned().into(),
                refresh_token: "eyJyZWZyZXNoIjp0cnVlfQ.refresh".to_owned().into(),
            }),
            password: Some("steam-password-1".to_owned().into()),
            profile: None,
            proxy: None,
            auto_confirm: AutoConfirm::default(),
            groups: Vec::new(),
            trusted_api_key: None,
            device_names: BTreeMap::new(),
            client_token: None,
            playing: PlayingList::default(),
            note: None,
            wallet: None,
            last_check: None,
            saved_cookies: Vec::new(),
            browser_region: RegionChoice::default(),
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
            account.session.as_ref().map(|s| &s.access_token),
            account.session.as_ref().map(|s| &s.refresh_token),
            account.password.as_ref(),
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
            ..Contents::default()
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
    fn accounts_saved_before_auto_confirm_load_with_it_off() {
        let mut json: serde_json::Value = serde_json::from_slice(
            &Contents {
                accounts: vec![account()],
                ..Contents::default()
            }
            .to_bytes(),
        )
        .unwrap();
        json["accounts"][0]
            .as_object_mut()
            .unwrap()
            .remove("auto_confirm")
            .unwrap();

        let restored = Contents::from_bytes(json.to_string().as_bytes()).unwrap();
        assert_eq!(restored.accounts[0].auto_confirm, AutoConfirm::default());
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
    fn a_new_guard_replaces_the_old_copy() {
        let mut contents = Contents::default();
        contents.add_account(account());

        let mut moved = account();
        moved.account_name = "Trader_One".to_owned();
        moved.authenticator.shared_secret = "bmV3LXNlY3JldA==".to_owned().into();
        contents.put_account(moved);

        let [kept] = contents.accounts.as_slice() else {
            panic!("expected one account");
        };
        assert_eq!(
            kept.authenticator.shared_secret.expose(),
            "bmV3LXNlY3JldA=="
        );
        assert!(contents.has_login("TRADER_ONE"));
    }

    #[test]
    fn group_names_are_unique_and_tidy() {
        let mut contents = Contents::default();
        let farm = contents.add_group("  Farm ", GroupColor::Gray).unwrap();
        assert_eq!(contents.groups[0].name, "Farm");
        assert_eq!(
            contents.add_group("farm", GroupColor::Gray),
            Err(GroupError::Taken)
        );
        assert_eq!(
            contents.add_group(" ", GroupColor::Gray),
            Err(GroupError::EmptyName)
        );
        assert_eq!(
            contents.add_group(&"x".repeat(41), GroupColor::Gray),
            Err(GroupError::LongName)
        );
        // A group may keep its own name in another case.
        assert_eq!(
            contents.update_group(farm, "FARM", GroupColor::Teal),
            Ok(())
        );
        assert_eq!(contents.groups[0].color, GroupColor::Teal);
        assert_eq!(
            contents.update_group(99, "Other", GroupColor::Gray),
            Err(GroupError::Missing)
        );
    }

    #[test]
    fn removing_a_group_leaves_the_others_and_its_id_is_not_reused() {
        let mut contents = Contents::default();
        contents.add_account(account());
        let farm = contents.add_group("Farm", GroupColor::Gray).unwrap();
        let storage = contents.add_group("Storage", GroupColor::Gray).unwrap();
        let trader = ["trader_one".to_owned()];
        contents.add_to_group(&trader, farm).unwrap();
        contents.add_to_group(&trader, storage).unwrap();
        assert_eq!(contents.accounts[0].groups, [farm, storage]);

        assert!(contents.remove_group(farm));
        assert_eq!(contents.accounts[0].groups, [storage]);
        assert_ne!(contents.add_group("Farm", GroupColor::Gray).unwrap(), farm);
        assert_eq!(
            contents.add_to_group(&trader, farm),
            Err(GroupError::Missing)
        );
    }

    #[test]
    fn an_account_from_an_older_vault_keeps_its_one_group() {
        let mut json = serde_json::to_value(account()).unwrap();
        let fields = json.as_object_mut().unwrap();
        fields.remove("groups");
        fields.insert("group".to_owned(), 3.into());
        let account: Account = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(account.groups, [3]);

        json["group"] = serde_json::Value::Null;
        let account: Account = serde_json::from_value(json).unwrap();
        assert!(account.groups.is_empty());
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
    fn a_deleted_proxy_blocks_its_accounts_and_its_id_is_not_reused() {
        let mut contents = Contents::default();
        assert!(
            contents
                .add_proxy(ProxyAddress::parse("socks5://host.one:1080").unwrap())
                .is_some()
        );
        assert!(
            contents
                .add_proxy(ProxyAddress::parse("socks5://HOST.one:1080").unwrap())
                .is_none()
        );
        let mut account = account();
        account.proxy = Some(1);
        contents.add_account(account);

        let account = &contents.accounts[0];
        assert_eq!(contents.proxy_of(account).unwrap().unwrap().id, 1);

        assert!(contents.remove_proxy(1));
        assert!(contents.proxy_of(&contents.accounts[0]).is_err());

        contents.add_proxy(ProxyAddress::parse("http://host.two:8080").unwrap());
        assert_eq!(contents.proxies[0].id, 2);
        assert!(contents.proxy_of(&contents.accounts[0]).is_err());
    }

    #[test]
    fn proxies_and_their_ids_survive_a_round_trip() {
        let mut contents = Contents::default();
        contents.add_proxy(ProxyAddress::parse("socks5://user:secret@host.one:1080").unwrap());
        contents.remove_proxy(1);
        contents.add_proxy(ProxyAddress::parse("http://host.two:8080").unwrap());

        let mut restored = Contents::from_bytes(&contents.to_bytes()).unwrap();
        assert_eq!(restored.proxies.len(), 1);
        assert_eq!(restored.proxies[0].address.label(), "host.two:8080");
        restored.add_proxy(ProxyAddress::parse("http://host.three:8080").unwrap());
        assert_eq!(restored.proxies[1].id, 3);
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
                ..Contents::default()
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
