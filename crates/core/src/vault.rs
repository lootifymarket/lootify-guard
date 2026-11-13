use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use aes_gcm::Aes256Gcm;
use aes_gcm::aead::{Aead, Generate, KeyInit, Nonce, Payload};
use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroizing;

const MAGIC: &[u8; 4] = b"LGVT";
const VERSION: u8 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;
pub const KEY_LEN: usize = 32;

const VERSION_AT: usize = MAGIC.len();
const PARAMS_AT: usize = VERSION_AT + 1;
const SALT_AT: usize = PARAMS_AT + 3 * 4;
const NONCE_AT: usize = SALT_AT + SALT_LEN;
const HEADER_LEN: usize = NONCE_AT + NONCE_LEN;

// The header is read before it can be authenticated, so a damaged or crafted file
// must not be able to make us allocate an arbitrary amount of memory.
const MAX_MEMORY_KIB: u32 = 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("a vault already exists at this path")]
    AlreadyExists,
    #[error("not a Lootify Guard vault")]
    NotAVault,
    #[error("vault format version {0} is not supported")]
    UnsupportedVersion(u8),
    #[error("wrong password or the vault is damaged")]
    WrongPassword,
    #[error("key derivation failed: {0}")]
    Kdf(argon2::Error),
    #[error(transparent)]
    Io(#[from] io::Error),
}

/// Argon2id cost parameters, stored in the vault header so they can be raised later
/// without breaking existing vaults.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KdfParams {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl KdfParams {
    pub const DEFAULT: Self = Self {
        memory_kib: 64 * 1024,
        iterations: 3,
        parallelism: 4,
    };
}

/// An unlocked vault. Holds the derived key rather than the password, so it can be
/// saved again without asking for it. The key and the data are wiped on drop.
pub struct Vault {
    path: PathBuf,
    params: KdfParams,
    salt: [u8; SALT_LEN],
    key: VaultKey,
    data: Zeroizing<Vec<u8>>,
}

pub type VaultKey = Zeroizing<[u8; KEY_LEN]>;

impl Vault {
    pub fn create(path: &Path, password: &str, params: KdfParams) -> Result<Self, VaultError> {
        if path.exists() {
            return Err(VaultError::AlreadyExists);
        }
        let salt = <[u8; SALT_LEN]>::generate();
        let vault = Self {
            path: path.to_owned(),
            params,
            salt,
            key: derive_key(password, &salt, params)?,
            data: Zeroizing::new(Vec::new()),
        };
        vault.save()?;
        Ok(vault)
    }

    pub fn open(path: &Path, password: &str) -> Result<Self, VaultError> {
        Self::open_with(path, |header| {
            derive_key(password, &header.salt, header.params)
        })
    }

    /// Opens the vault with a key taken earlier from [`Vault::key`], so it can be
    /// unlocked through the OS keychain without the password.
    pub fn open_with_key(path: &Path, key: &[u8; KEY_LEN]) -> Result<Self, VaultError> {
        Self::open_with(path, |_| Ok(Zeroizing::new(*key)))
    }

    fn open_with(
        path: &Path,
        key_for: impl FnOnce(&Header) -> Result<VaultKey, VaultError>,
    ) -> Result<Self, VaultError> {
        let file = fs::read(path)?;
        let (header, ciphertext) = Header::parse(&file)?;
        let key = key_for(&header)?;
        let data = cipher(&key)
            .decrypt(
                &Nonce::<Aes256Gcm>::from(header.nonce),
                Payload {
                    msg: ciphertext,
                    aad: &file[..HEADER_LEN],
                },
            )
            .map_err(|_| VaultError::WrongPassword)?;
        Ok(Self {
            path: path.to_owned(),
            params: header.params,
            salt: header.salt,
            key,
            data: Zeroizing::new(data),
        })
    }

    pub fn key(&self) -> &[u8; KEY_LEN] {
        &self.key
    }

    pub fn password_check(&self) -> PasswordCheck {
        PasswordCheck {
            params: self.params,
            salt: self.salt,
            key: self.key.clone(),
        }
    }

    /// Re-encrypts the vault for a new password. The salt changes too, so a key
    /// stored for the old password no longer opens it.
    pub fn change_password(&mut self, password: &str) -> Result<(), VaultError> {
        let salt = <[u8; SALT_LEN]>::generate();
        let key = derive_key(password, &salt, self.params)?;
        let old_salt = std::mem::replace(&mut self.salt, salt);
        let old_key = std::mem::replace(&mut self.key, key);
        if let Err(err) = self.save() {
            // The file still holds the old encryption, so the key in memory must too.
            self.salt = old_salt;
            self.key = old_key;
            return Err(err);
        }
        Ok(())
    }

    pub fn data(&self) -> &[u8] {
        &self.data
    }

    /// Replaces the data and saves it. If saving fails, the old data stays in memory
    /// too, so the vault never holds changes that aren't on disk.
    pub fn save_data(&mut self, data: Vec<u8>) -> Result<(), VaultError> {
        let old_data = std::mem::replace(&mut self.data, Zeroizing::new(data));
        if let Err(err) = self.save() {
            self.data = old_data;
            return Err(err);
        }
        Ok(())
    }

    pub fn save(&self) -> Result<(), VaultError> {
        let nonce = <[u8; NONCE_LEN]>::generate();
        let header = Header {
            params: self.params,
            salt: self.salt,
            nonce,
        }
        .to_bytes();
        let ciphertext = cipher(&self.key)
            .encrypt(
                &Nonce::<Aes256Gcm>::from(nonce),
                Payload {
                    msg: &self.data,
                    aad: &header,
                },
            )
            .expect("vault data is far below the AES-GCM message limit");
        write_atomically(&self.path, &[&header[..], &ciphertext].concat())?;
        Ok(())
    }
}

impl fmt::Debug for Vault {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Vault")
            .field("path", &self.path)
            .field("params", &self.params)
            .finish_non_exhaustive()
    }
}

/// What it takes to check a password against an unlocked vault, copied out of it so
/// the slow key derivation doesn't have to hold on to the vault while it runs.
pub struct PasswordCheck {
    params: KdfParams,
    salt: [u8; SALT_LEN],
    key: VaultKey,
}

impl PasswordCheck {
    pub fn matches(&self, password: &str) -> Result<bool, VaultError> {
        Ok(*derive_key(password, &self.salt, self.params)? == *self.key)
    }
}

struct Header {
    params: KdfParams,
    salt: [u8; SALT_LEN],
    nonce: [u8; NONCE_LEN],
}

impl Header {
    fn parse(file: &[u8]) -> Result<(Self, &[u8]), VaultError> {
        let (header, ciphertext) = file
            .split_first_chunk::<HEADER_LEN>()
            .ok_or(VaultError::NotAVault)?;
        if !header.starts_with(MAGIC) || ciphertext.len() < TAG_LEN {
            return Err(VaultError::NotAVault);
        }
        let version = header[VERSION_AT];
        if version != VERSION {
            return Err(VaultError::UnsupportedVersion(version));
        }
        let u32_at =
            |at: usize| u32::from_le_bytes(header[at..at + 4].try_into().expect("4 bytes"));
        let params = KdfParams {
            memory_kib: u32_at(PARAMS_AT),
            iterations: u32_at(PARAMS_AT + 4),
            parallelism: u32_at(PARAMS_AT + 8),
        };
        if params.memory_kib > MAX_MEMORY_KIB {
            return Err(VaultError::NotAVault);
        }
        let header = Self {
            params,
            salt: header[SALT_AT..NONCE_AT].try_into().expect("salt length"),
            nonce: header[NONCE_AT..].try_into().expect("nonce length"),
        };
        Ok((header, ciphertext))
    }

    fn to_bytes(&self) -> [u8; HEADER_LEN] {
        let mut bytes = Vec::with_capacity(HEADER_LEN);
        bytes.extend_from_slice(MAGIC);
        bytes.push(VERSION);
        bytes.extend_from_slice(&self.params.memory_kib.to_le_bytes());
        bytes.extend_from_slice(&self.params.iterations.to_le_bytes());
        bytes.extend_from_slice(&self.params.parallelism.to_le_bytes());
        bytes.extend_from_slice(&self.salt);
        bytes.extend_from_slice(&self.nonce);
        bytes.try_into().expect("header length")
    }
}

fn derive_key(password: &str, salt: &[u8], params: KdfParams) -> Result<VaultKey, VaultError> {
    let params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(KEY_LEN),
    )
    .map_err(VaultError::Kdf)?;
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(VaultError::Kdf)?;
    Ok(key)
}

fn cipher(key: &[u8; KEY_LEN]) -> Aes256Gcm {
    Aes256Gcm::new(key.into())
}

// Writes next to the target and renames over it, so a crash mid-save leaves
// the previous vault intact instead of a truncated one.
pub(crate) fn write_atomically(path: &Path, contents: &[u8]) -> io::Result<()> {
    let mut tmp_name = path.file_name().unwrap_or_default().to_owned();
    tmp_name.push(".tmp");
    let tmp_path = path.with_file_name(tmp_name);

    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);

    let mut file = options.open(&tmp_path)?;
    file.write_all(contents)?;
    file.sync_all()?;
    fs::rename(&tmp_path, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: KdfParams = KdfParams {
        memory_kib: 64,
        iterations: 1,
        parallelism: 1,
    };

    fn vault_path(dir: &tempfile::TempDir) -> PathBuf {
        dir.path().join("vault.lgv")
    }

    fn create_with(path: &Path, data: &[u8]) {
        let mut vault = Vault::create(path, "correct horse", FAST).unwrap();
        vault.save_data(data.to_vec()).unwrap();
    }

    fn flip_byte(path: &Path, at: usize) {
        let mut file = fs::read(path).unwrap();
        file[at] ^= 0x01;
        fs::write(path, file).unwrap();
    }

    #[test]
    fn new_vault_opens_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        Vault::create(&path, "correct horse", FAST).unwrap();

        let vault = Vault::open(&path, "correct horse").unwrap();
        assert!(vault.data().is_empty());
    }

    #[test]
    fn saved_data_survives_reopening() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");

        let mut vault = Vault::open(&path, "correct horse").unwrap();
        assert_eq!(vault.data(), b"shared_secret");

        vault.save_data(b"identity_secret".to_vec()).unwrap();
        let vault = Vault::open(&path, "correct horse").unwrap();
        assert_eq!(vault.data(), b"identity_secret");
    }

    #[test]
    fn wrong_password_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");

        let err = Vault::open(&path, "battery staple").unwrap_err();
        assert!(matches!(err, VaultError::WrongPassword));
    }

    #[test]
    fn create_does_not_overwrite_an_existing_vault() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");

        let err = Vault::create(&path, "battery staple", FAST).unwrap_err();
        assert!(matches!(err, VaultError::AlreadyExists));
        let vault = Vault::open(&path, "correct horse").unwrap();
        assert_eq!(vault.data(), b"shared_secret");
    }

    #[test]
    fn every_save_uses_a_fresh_nonce() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");
        let vault = Vault::open(&path, "correct horse").unwrap();

        vault.save().unwrap();
        let first = fs::read(&path).unwrap();
        vault.save().unwrap();
        let second = fs::read(&path).unwrap();
        assert_ne!(first[NONCE_AT..HEADER_LEN], second[NONCE_AT..HEADER_LEN]);
    }

    #[test]
    fn tampering_with_salt_nonce_or_ciphertext_is_detected() {
        for at in [SALT_AT, NONCE_AT, HEADER_LEN, HEADER_LEN + 5] {
            let dir = tempfile::tempdir().unwrap();
            let path = vault_path(&dir);
            create_with(&path, b"shared_secret");
            flip_byte(&path, at);

            let err = Vault::open(&path, "correct horse").unwrap_err();
            assert!(matches!(err, VaultError::WrongPassword), "byte {at}");
        }
    }

    #[test]
    fn foreign_or_truncated_files_are_not_vaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);

        fs::write(&path, b"{\"shared_secret\": \"\"}").unwrap();
        assert!(matches!(
            Vault::open(&path, "correct horse"),
            Err(VaultError::NotAVault)
        ));

        fs::remove_file(&path).unwrap();
        create_with(&path, b"");
        let file = fs::read(&path).unwrap();
        fs::write(&path, &file[..HEADER_LEN + TAG_LEN - 1]).unwrap();
        assert!(matches!(
            Vault::open(&path, "correct horse"),
            Err(VaultError::NotAVault)
        ));
    }

    #[test]
    fn unknown_version_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");
        flip_byte(&path, VERSION_AT);

        let err = Vault::open(&path, "correct horse").unwrap_err();
        assert!(matches!(err, VaultError::UnsupportedVersion(0)));
    }

    #[test]
    fn oversized_memory_cost_is_refused_before_allocating() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");
        let mut file = fs::read(&path).unwrap();
        file[PARAMS_AT..PARAMS_AT + 4].copy_from_slice(&u32::MAX.to_le_bytes());
        fs::write(&path, file).unwrap();

        let err = Vault::open(&path, "correct horse").unwrap_err();
        assert!(matches!(err, VaultError::NotAVault));
    }

    #[test]
    fn stored_key_opens_without_password() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");
        let key = *Vault::open(&path, "correct horse").unwrap().key();

        let vault = Vault::open_with_key(&path, &key).unwrap();
        assert_eq!(vault.data(), b"shared_secret");

        let mut wrong = key;
        wrong[0] ^= 0x01;
        let err = Vault::open_with_key(&path, &wrong).unwrap_err();
        assert!(matches!(err, VaultError::WrongPassword));
    }

    #[test]
    fn changed_password_replaces_the_old_one_and_its_key() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");
        let mut vault = Vault::open(&path, "correct horse").unwrap();
        let old_key = *vault.key();

        vault.change_password("battery staple").unwrap();

        assert!(matches!(
            Vault::open(&path, "correct horse"),
            Err(VaultError::WrongPassword)
        ));
        assert!(matches!(
            Vault::open_with_key(&path, &old_key),
            Err(VaultError::WrongPassword)
        ));
        let reopened = Vault::open(&path, "battery staple").unwrap();
        assert_eq!(reopened.data(), b"shared_secret");
        assert_eq!(reopened.key(), vault.key());
    }

    #[cfg(unix)]
    #[test]
    fn failed_save_keeps_the_old_data() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");
        let mut vault = Vault::open(&path, "correct horse").unwrap();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o500)).unwrap();

        let result = vault.save_data(b"identity_secret".to_vec());
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o700)).unwrap();

        assert!(matches!(result, Err(VaultError::Io(_))));
        assert_eq!(vault.data(), b"shared_secret");
        assert_eq!(
            Vault::open(&path, "correct horse").unwrap().data(),
            b"shared_secret"
        );
    }

    #[test]
    fn password_check_accepts_only_the_current_password() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        create_with(&path, b"shared_secret");
        let mut vault = Vault::open(&path, "correct horse").unwrap();

        let check = vault.password_check();
        assert!(check.matches("correct horse").unwrap());
        assert!(!check.matches("battery staple").unwrap());

        vault.change_password("battery staple").unwrap();
        let check = vault.password_check();
        assert!(check.matches("battery staple").unwrap());
        assert!(!check.matches("correct horse").unwrap());
    }

    #[test]
    fn debug_output_has_no_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let path = vault_path(&dir);
        let mut vault = Vault::create(&path, "correct horse", FAST).unwrap();
        vault.save_data(b"shared_secret".to_vec()).unwrap();

        let debug = format!("{vault:?}");
        assert!(!debug.contains("shared_secret"));
        assert!(!debug.contains(&format!("{:?}", vault.key.as_slice())));
    }
}
