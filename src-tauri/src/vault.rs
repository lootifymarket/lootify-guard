use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use lootify_guard_core::contents::{DamagedContents, MissingProxy};
use lootify_guard_core::guard::InvalidSharedSecret;
use lootify_guard_core::idle::IdleTimer;
use lootify_guard_core::steam::SteamError;
use lootify_guard_core::vault::{KdfParams, Vault, VaultError};
use serde::Serialize;
use tauri::async_runtime::spawn_blocking;
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

use crate::accounts::confirm_owner;
use crate::biometrics::{self, BiometricError};
use crate::browser::{self, Browsers};
use crate::tasks::Tasks;

const UNLOCK_REASON: &str = "unlock your vault";
const IDLE_CHECK_EVERY: Duration = Duration::from_secs(10);

pub struct VaultState {
    path: PathBuf,
    unlocked: Mutex<Option<Vault>>,
    idle: Mutex<IdleTimer>,
}

impl VaultState {
    /// `auto_lock` is how long the vault may sit idle; `None` never locks it.
    pub fn new(path: PathBuf, auto_lock: Option<Duration>) -> Self {
        Self {
            path,
            unlocked: Mutex::new(None),
            idle: Mutex::new(IdleTimer::new(auto_lock, SystemTime::now())),
        }
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn set_auto_lock(&self, auto_lock: Option<Duration>) {
        self.idle().set_timeout(auto_lock);
    }

    /// The open vault, if any. A vault that has sat idle too long is dropped here, so
    /// no command can reach it in the seconds before the idle watcher notices.
    pub(crate) fn unlocked(&self) -> MutexGuard<'_, Option<Vault>> {
        // A panic elsewhere can't leave these values half-updated, so poisoned locks are safe to reuse.
        let mut unlocked = self.unlocked.lock().unwrap_or_else(PoisonError::into_inner);
        if unlocked.is_some() && self.idle().is_expired(SystemTime::now()) {
            *unlocked = None;
        }
        unlocked
    }

    fn idle(&self) -> MutexGuard<'_, IdleTimer> {
        self.idle.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Counts as user activity while the vault is open.
    pub(crate) fn touch(&self) {
        let unlocked = self.unlocked();
        if unlocked.is_some() {
            self.idle().touch(SystemTime::now());
        }
    }

    fn open(&self, vault: Vault) {
        // Restart the timer first, or the time since the last session would lock it at once.
        self.idle().touch(SystemTime::now());
        *self.unlocked() = Some(vault);
    }
}

/// Wipes a forgotten vault from memory on time even when the window is hidden and
/// nothing asks for the vault.
pub fn watch_idle(app: AppHandle) {
    thread::spawn(move || {
        loop {
            thread::sleep(IDLE_CHECK_EVERY);
            if app.state::<VaultState>().unlocked().is_none() {
                app.state::<Browsers>().close_all();
            }
        }
    });
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
    /// The Touch ID prompt was dismissed.
    #[cfg(target_os = "macos")]
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
            #[cfg(target_os = "macos")]
            BiometricError::Cancelled => Self::Cancelled,
            #[cfg(target_os = "macos")]
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

impl From<SteamError> for CommandError {
    fn from(err: SteamError) -> Self {
        match err {
            SteamError::BadCredentials => Self::WrongPassword,
            err => Self::Failed(err.to_string()),
        }
    }
}

impl From<MissingProxy> for CommandError {
    fn from(err: MissingProxy) -> Self {
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
    state.open(vault);
    Ok(())
}

#[tauri::command]
pub async fn unlock_vault(
    state: State<'_, VaultState>,
    tasks: State<'_, Tasks>,
    password: String,
) -> Result<(), CommandError> {
    let password = Zeroizing::new(password);
    let path = state.path.clone();
    let vault = spawn_blocking(move || Vault::open(&path, &password)).await??;
    state.open(vault);
    // Jobs that went on while it was locked brought back renewed sessions.
    tasks.save_held(&state);
    Ok(())
}

#[tauri::command]
pub async fn unlock_with_biometrics(
    state: State<'_, VaultState>,
    tasks: State<'_, Tasks>,
) -> Result<(), CommandError> {
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
    state.open(vault);
    tasks.save_held(&state);
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
    state.open(vault);
    changed?;
    if biometrics::is_enrolled() {
        spawn_blocking(move || biometrics::enroll(&key)).await??;
    }
    Ok(())
}

/// Changes the password from the settings. The current one has to be given: an
/// unlocked vault alone isn't enough, since anyone can walk up to the computer.
#[tauri::command]
pub async fn change_master_password(
    state: State<'_, VaultState>,
    current: String,
    password: String,
) -> Result<(), CommandError> {
    confirm_owner(&state, Some(current), "change the master password").await?;
    change_password(state, password).await
}

#[tauri::command]
pub fn disable_biometrics() -> Result<(), CommandError> {
    biometrics::forget()?;
    Ok(())
}

#[tauri::command]
pub async fn lock_vault(
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
) -> Result<(), CommandError> {
    lock(&state, &browsers);
    Ok(())
}

/// Locks the vault from the tray menu, whose handler runs on the main thread,
/// which the tabs need free to hand over their cookies.
pub fn lock_from_menu(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || lock(&app.state(), &app.state()));
}

/// Keeps the browser tabs' sign-ins first, as the tabs close with the vault.
fn lock(state: &VaultState, browsers: &Browsers) {
    browser::save_cookies(state, browsers);
    *state.unlocked() = None;
    browsers.close_all();
}

#[tauri::command]
pub fn erase_vault(
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
) -> Result<(), CommandError> {
    *state.unlocked() = None;
    browsers.close_all();
    biometrics::forget()?;
    match fs::remove_file(&state.path) {
        Err(err) if err.kind() != io::ErrorKind::NotFound => {
            Err(CommandError::Failed(err.to_string()))
        }
        _ => Ok(()),
    }
}

/// Called by the UI on user activity. Returns when the vault will lock if nothing
/// else happens, in Unix seconds, or `None` when it never locks by itself.
#[tauri::command]
pub fn report_activity(state: State<'_, VaultState>) -> Result<Option<u64>, CommandError> {
    if state.unlocked().is_none() {
        return Err(CommandError::Locked);
    }
    let mut idle = state.idle();
    idle.touch(SystemTime::now());
    Ok(idle.deadline().map(unix_secs))
}

/// When the vault will lock, in Unix seconds, without counting this call as activity.
#[tauri::command]
pub fn auto_lock_deadline(state: State<'_, VaultState>) -> Result<Option<u64>, CommandError> {
    if state.unlocked().is_none() {
        return Err(CommandError::Locked);
    }
    Ok(state.idle().deadline().map(unix_secs))
}

fn unix_secs(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}
