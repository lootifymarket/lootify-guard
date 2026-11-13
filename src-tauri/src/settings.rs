use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use lootify_guard_core::settings::{AUTO_LOCK_CHOICES, Settings};
use tauri::async_runtime::spawn_blocking;
use tauri::{AppHandle, State, Window};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;

use crate::accounts::write_private;
use crate::vault::{CommandError, VaultState};

pub struct SettingsState {
    path: PathBuf,
    current: Mutex<Settings>,
}

impl SettingsState {
    pub fn load(path: PathBuf) -> Self {
        Self {
            current: Mutex::new(Settings::load(&path)),
            path,
        }
    }

    pub fn get(&self) -> Settings {
        self.lock().clone()
    }

    fn lock(&self) -> MutexGuard<'_, Settings> {
        // Settings are replaced whole, so a poisoned lock never holds half of one.
        self.current.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn save(&self, settings: Settings) -> Result<(), CommandError> {
        settings
            .save(&self.path)
            .map_err(|err| CommandError::Failed(err.to_string()))?;
        *self.lock() = settings;
        Ok(())
    }
}

#[tauri::command]
pub fn get_settings(settings: State<'_, SettingsState>) -> Settings {
    settings.get()
}

/// `None` never locks.
#[tauri::command]
pub fn set_auto_lock(
    settings: State<'_, SettingsState>,
    vault: State<'_, VaultState>,
    minutes: Option<u32>,
) -> Result<(), CommandError> {
    if minutes.is_some_and(|minutes| !AUTO_LOCK_CHOICES.contains(&minutes)) {
        return Err(CommandError::Failed("pick 5, 15 or 60 minutes".to_owned()));
    }
    let next = Settings {
        auto_lock_minutes: minutes,
        ..settings.get()
    };
    settings.save(next.clone())?;
    vault.set_auto_lock(next.auto_lock());
    Ok(())
}

#[tauri::command]
pub fn set_streamer_mode(settings: State<'_, SettingsState>, on: bool) -> Result<(), CommandError> {
    settings.save(Settings {
        streamer_mode: on,
        ..settings.get()
    })
}

#[tauri::command]
pub fn set_close_to_tray(settings: State<'_, SettingsState>, on: bool) -> Result<(), CommandError> {
    settings.save(Settings {
        close_to_tray: on,
        ..settings.get()
    })
}

/// Whether the system starts the app at login. The system holds this, not the
/// settings file, so it stays right if the user turns it off there.
#[tauri::command]
pub fn launch_at_startup(app: AppHandle) -> Result<bool, CommandError> {
    app.autolaunch().is_enabled().map_err(autostart_error)
}

#[tauri::command]
pub fn set_launch_at_startup(app: AppHandle, on: bool) -> Result<(), CommandError> {
    let autolaunch = app.autolaunch();
    if on {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    }
    .map_err(autostart_error)
}

fn autostart_error(err: tauri_plugin_autostart::Error) -> CommandError {
    CommandError::Failed(format!("couldn't change the startup item: {err}"))
}

/// Saves a copy of the vault file where the user picks. It stays encrypted with
/// the master password and opens only with it. Resolves to false when no place
/// was picked.
#[tauri::command]
pub async fn export_backup(
    window: Window,
    settings: State<'_, SettingsState>,
    vault: State<'_, VaultState>,
) -> Result<bool, CommandError> {
    if vault.unlocked().is_none() {
        return Err(CommandError::Locked);
    }
    let picker = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name("lootify-guard-backup.lgv")
        .add_filter("Lootify Guard vault", &["lgv"]);
    let Some(picked) = spawn_blocking(move || picker.blocking_save_file()).await? else {
        return Ok(false);
    };
    let target = picked
        .into_path()
        .map_err(|err| CommandError::Failed(err.to_string()))?;
    let source = vault.path().to_owned();
    spawn_blocking(move || write_private(&target, &fs::read(source)?))
        .await?
        .map_err(|err| CommandError::Failed(err.to_string()))?;
    let saved_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs());
    settings.save(Settings {
        last_backup_at: Some(saved_at),
        ..settings.get()
    })?;
    Ok(true)
}
