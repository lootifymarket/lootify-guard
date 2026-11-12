use std::fs;
use std::io;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};

use lootify_guard_core::contents::DamagedContents;
use lootify_guard_core::guard::InvalidSharedSecret;
use lootify_guard_core::vault::{KdfParams, Vault, VaultError};
use serde::Serialize;
use tauri::State;
use tauri::async_runtime::spawn_blocking;
use zeroize::Zeroizing;

use crate::biometrics::{self, BiometricError};

const UNLOCK_REASON: &str = "unlock your vault";

pub struct VaultState {
    path: PathBuf,
    unlocked: Mutex<Option<Vault>>,
}

impl VaultState {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            unlocked: Mutex::new(None),
        }
    }

    // A panic elsewhere can't leave `Option<Vault>` half-updated, so a poisoned lock is safe to reuse.
    pub(crate) fn unlocked(&self) -> MutexGuard<'_, Option<Vault>> {
        self.unlocked.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VaultStatus {
    Missing,
    Locked,
    Unlocked,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiometricStatus {
    method: Option<biometrics::Method>,
    enrolled: bool,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum CommandError {
    WrongPassword,
    Locked,
    Cancelled,
    BiometricsOutdated,
    Failed(String),
}

impl From<VaultError> for CommandError {
    fn from(err: VaultError) -> Self {
        match err {
            VaultError::WrongPassword => Self::WrongPassword,
            err => Self::Failed(err.to_string()),
        }
    }
}

impl From<BiometricError> for CommandError {
    fn from(err: BiometricError) -> Self {
        match err {
            BiometricError::Cancelled => Self::Cancelled,
            BiometricError::NotEnrolled => Self::BiometricsOutdated,
            err => Self::Failed(err.to_string()),
        }
    }
}

impl From<tauri::Error> for CommandError {
    fn from(err: tauri::Error) -> Self {
        Self::Failed(err.to_string())
    }
}

impl From<DamagedContents> for CommandError {
    fn from(err: DamagedContents) -> Self {
        Self::Failed(err.to_string())
    }
}

impl From<InvalidSharedSecret> for CommandError {
    fn from(err: InvalidSharedSecret) -> Self {
        Self::Failed(err.to_string())
    }
}

#[tauri::command]
pub fn vault_status(state: State<'_, VaultState>) -> VaultStatus {
    if state.unlocked().is_some() {
        VaultStatus::Unlocked
    } else if state.path.exists() {
        VaultStatus::Locked
    } else {
        VaultStatus::Missing
    }
}

#[tauri::command]
pub fn biometric_status() -> BiometricStatus {
    let method = biometrics::method();
    BiometricStatus {
        method,
        enrolled: method.is_some() && biometrics::is_enrolled(),
    }
}

// Argon2 and the biometric prompt run on a blocking thread so the window stays responsive.
#[tauri::command]
pub async fn create_vault(
    state: State<'_, VaultState>,
    password: String,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    // A key left over from a vault that was deleted by hand would never open this one.
    biometrics::forget()?;
    let path = state.path.clone();
    let vault =
        spawn_blocking(move || Vault::create(&path, &password, KdfParams::DEFAULT)).await??;
    *state.unlocked() = Some(vault);
    Ok(())
}

#[tauri::command]
pub async fn unlock_vault(
    state: State<'_, VaultState>,
    password: String,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    let path = state.path.clone();
    let vault = spawn_blocking(move || Vault::open(&path, &password)).await??;
    *state.unlocked() = Some(vault);
    Ok(())
}

#[tauri::command]
pub async fn unlock_with_biometrics(state: State<'_, VaultState>) -> Result<(), CommandError> {
    let path = state.path.clone();
    let vault = spawn_blocking(move || {
        let key = biometrics::release_key(UNLOCK_REASON)?;
        Vault::open_with_key(&path, &key).map_err(|err| match err {
            VaultError::WrongPassword => {
                // The stored key belongs to an older password. Drop it so the
                // biometric button stops offering an unlock that can't work.
                biometrics::forget()
                    .map_or_else(CommandError::from, |()| CommandError::BiometricsOutdated)
            }
            err => err.into(),
        })
    })
    .await??;
    *state.unlocked() = Some(vault);
    Ok(())
}

#[tauri::command]
pub async fn enable_biometrics(state: State<'_, VaultState>) -> Result<(), CommandError> {
    let key = state
        .unlocked()
        .as_ref()
        .map(|vault| Zeroizing::new(*vault.key()))
        .ok_or(CommandError::Locked)?;
    spawn_blocking(move || biometrics::enroll(&key)).await??;
    Ok(())
}

#[tauri::command]
pub async fn change_password(
    state: State<'_, VaultState>,
    password: String,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    let mut vault = state.unlocked().take().ok_or(CommandError::Locked)?;
    let (vault, changed) = spawn_blocking(move || {
        let changed = vault.change_password(&password);
        (vault, changed)
    })
    .await?;
    let key = Zeroizing::new(*vault.key());
    *state.unlocked() = Some(vault);
    changed?;
    if biometrics::is_enrolled() {
        spawn_blocking(move || biometrics::enroll(&key)).await??;
    }
    Ok(())
}

#[tauri::command]
pub fn lock_vault(state: State<'_, VaultState>) {
    *state.unlocked() = None;
}

#[tauri::command]
pub fn erase_vault(state: State<'_, VaultState>) -> Result<(), CommandError> {
    *state.unlocked() = None;
    biometrics::forget()?;
    match fs::remove_file(&state.path) {
        Err(err) if err.kind() != io::ErrorKind::NotFound => {
            Err(CommandError::Failed(err.to_string()))
        }
        _ => Ok(()),
    }
}
