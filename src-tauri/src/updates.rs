use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use lootify_guard_core::settings::{InstalledUpdate, Settings};
use serde::Serialize;
use tauri::async_runtime::{self, block_on};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::settings::SettingsState;
use crate::vault::CommandError;

// Long enough for the window to be up first, so the check never slows the start.
const FIRST_CHECK_AFTER: Duration = Duration::from_secs(10);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

/// Where the next version stands. It's checked, then downloaded, then installed
/// on a restart the user agrees to, or when the app quits.
#[derive(Default)]
pub struct Updates(Mutex<Pending>);

#[derive(Default)]
struct Pending {
    status: UpdateStatus,
    update: Option<Update>,
    /// The downloaded package, already checked against the release's signature.
    package: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UpdateStatus {
    #[default]
    NotChecked,
    UpToDate {
        /// Unix seconds.
        checked_at: u64,
    },
    Checking,
    Available {
        release: Release,
    },
    Downloading {
        release: Release,
        downloaded: u64,
        total: Option<u64>,
    },
    /// Downloaded; installs on the next restart.
    Ready {
        release: Release,
    },
    Failed {
        /// What was being tried: `None` for a check, else the release it was for.
        release: Option<Release>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    version: String,
    notes: Option<String>,
    /// Unix seconds.
    date: Option<u64>,
}

impl From<&Update> for Release {
    fn from(update: &Update) -> Self {
        Self {
            version: update.version.clone(),
            notes: update.body.clone().filter(|notes| !notes.trim().is_empty()),
            date: update
                .date
                .and_then(|date| u64::try_from(date.unix_timestamp()).ok()),
        }
    }
}

impl Updates {
    fn pending(&self) -> MutexGuard<'_, Pending> {
        // Each step replaces the status whole, so a poisoned lock never holds half of one.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn status(&self) -> UpdateStatus {
        self.pending().status.clone()
    }

    fn set_status(&self, status: UpdateStatus) {
        self.pending().status = status;
    }
}

/// Checks after the app has opened, then every few hours, and downloads what it
/// finds when the user lets updates install themselves.
pub fn watch(app: AppHandle) {
    thread::spawn(move || {
        thread::sleep(FIRST_CHECK_AFTER);
        loop {
            block_on(check_and_maybe_download(&app));
            thread::sleep(CHECK_EVERY);
        }
    });
}

async fn check_and_maybe_download(app: &AppHandle) {
    check(app).await;
    let auto = app.state::<SettingsState>().get().auto_update;
    if auto
        && matches!(
            app.state::<Updates>().status(),
            UpdateStatus::Available { .. }
        )
    {
        download(app).await;
    }
}

async fn check(app: &AppHandle) {
    let updates = app.state::<Updates>();
    // Something already on its way in stays as it is.
    if matches!(
        updates.status(),
        UpdateStatus::Checking | UpdateStatus::Downloading { .. } | UpdateStatus::Ready { .. }
    ) {
        return;
    }
    updates.set_status(UpdateStatus::Checking);
    let found = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(err) => Err(err),
    };
    let mut pending = updates.pending();
    match found {
        Ok(Some(update)) => {
            pending.status = UpdateStatus::Available {
                release: Release::from(&update),
            };
            pending.update = Some(update);
        }
        Ok(None) => {
            pending.status = UpdateStatus::UpToDate {
                checked_at: unix_now(),
            };
            pending.update = None;
        }
        Err(_) => pending.status = UpdateStatus::Failed { release: None },
    }
}

async fn download(app: &AppHandle) {
    let updates = app.state::<Updates>();
    let update = {
        let mut pending = updates.pending();
        let Some(update) = pending.update.clone() else {
            return;
        };
        if !matches!(
            pending.status,
            UpdateStatus::Available { .. } | UpdateStatus::Failed { .. }
        ) {
            return;
        }
        pending.status = UpdateStatus::Downloading {
            release: Release::from(&update),
            downloaded: 0,
            total: None,
        };
        update
    };
    let release = Release::from(&update);
    let mut downloaded = 0u64;
    let package = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                updates.set_status(UpdateStatus::Downloading {
                    release: release.clone(),
                    downloaded,
                    total,
                });
            },
            || {},
        )
        .await;
    let mut pending = updates.pending();
    match package {
        Ok(package) => {
            pending.package = Some(package);
            pending.status = UpdateStatus::Ready { release };
        }
        Err(_) => {
            pending.status = UpdateStatus::Failed {
                release: Some(release),
            }
        }
    }
}

/// Installs a downloaded update. Settings remember it first, since on Windows the
/// installer closes the app straight away.
fn install(app: &AppHandle, restart: bool) -> Result<bool, CommandError> {
    let updates = app.state::<Updates>();
    let (update, package) = {
        let mut pending = updates.pending();
        match (pending.update.take(), pending.package.take()) {
            (Some(update), Some(package)) => (update, package),
            _ => return Ok(false),
        }
    };
    let settings = app.state::<SettingsState>();
    settings.save(Settings {
        installed_update: Some(InstalledUpdate {
            version: update.version.clone(),
            notes: update.body.clone(),
        }),
        ..settings.get()
    })?;
    update
        .restart_after_install(restart)
        .install(package)
        .map_err(|_| CommandError::Failed("couldn't install the update".to_owned()))?;
    Ok(true)
}

/// A downloaded update goes in as the app quits, so the next launch is the new version.
pub fn install_on_quit(app: &AppHandle) {
    let _ = install(app, false);
}

#[tauri::command]
pub fn update_status(updates: State<'_, Updates>) -> UpdateStatus {
    updates.status()
}

/// Checks now, and downloads what it finds when updates install themselves.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateStatus, CommandError> {
    check(&app).await;
    let status = app.state::<Updates>().status();
    if app.state::<SettingsState>().get().auto_update
        && matches!(status, UpdateStatus::Available { .. })
    {
        let app = app.clone();
        async_runtime::spawn(async move { download(&app).await });
    }
    Ok(status)
}

/// Starts downloading the update found; `update_status` follows it.
#[tauri::command]
pub fn download_update(app: AppHandle) {
    async_runtime::spawn(async move { download(&app).await });
}

/// Installs the downloaded update and opens the new version.
#[tauri::command]
pub fn install_update(app: AppHandle) -> Result<(), CommandError> {
    if !install(&app, true)? {
        return Err(CommandError::Failed(
            "the update hasn't finished downloading".to_owned(),
        ));
    }
    // Windows has closed the app for its installer by now; macOS needs the restart.
    app.restart();
}

#[tauri::command]
pub fn set_auto_update(app: AppHandle, on: bool) -> Result<(), CommandError> {
    let settings = app.state::<SettingsState>();
    settings.save(Settings {
        auto_update: on,
        ..settings.get()
    })?;
    if on
        && matches!(
            app.state::<Updates>().status(),
            UpdateStatus::Available { .. }
        )
    {
        async_runtime::spawn(async move { download(&app).await });
    }
    Ok(())
}

/// Forgets the update that was installed, once the new version has said so.
#[tauri::command]
pub fn dismiss_installed_update(settings: State<'_, SettingsState>) -> Result<(), CommandError> {
    settings.save(Settings {
        installed_update: None,
        ..settings.get()
    })
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}
