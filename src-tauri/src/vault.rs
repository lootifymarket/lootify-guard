use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};

use lootify_guard_core::vault::{KdfParams, Vault, VaultError};
use serde::Serialize;
use tauri::State;
use tauri::async_runtime::spawn_blocking;
use zeroize::Zeroizing;

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
    fn unlocked(&self) -> MutexGuard<'_, Option<Vault>> {
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

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum CommandError {
    WrongPassword,
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

impl From<tauri::Error> for CommandError {
    fn from(err: tauri::Error) -> Self {
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

// Argon2 runs on a blocking thread so the window stays responsive while it works.
#[tauri::command]
pub async fn create_vault(
    state: State<'_, VaultState>,
    password: String,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
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
pub fn lock_vault(state: State<'_, VaultState>) {
    *state.unlocked() = None;
}
