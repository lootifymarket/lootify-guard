use std::fs;
use std::io;
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::vault::write_atomically;

/// The auto-lock choices, in minutes.
pub const AUTO_LOCK_CHOICES: [u32; 3] = [5, 15, 60];

/// The languages the app is translated into.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    En,
    Ru,
    Uk,
    Zh,
}

/// App preferences. They hold no secrets and are needed before the vault is
/// open, so they live in a plain file beside it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// `None` never locks.
    pub auto_lock_minutes: Option<u32>,
    /// When the last backup was saved, in Unix seconds.
    pub last_backup_at: Option<u64>,
    /// Blurs codes, Steam IDs, trade URLs and money, for showing the screen to others.
    pub streamer_mode: bool,
    /// Closing the window leaves the app running in the tray.
    pub close_to_tray: bool,
    pub language: Language,
    /// The sidebar shows icons only.
    pub sidebar_collapsed: bool,
    /// New versions download by themselves and install on the next restart.
    pub auto_update: bool,
    /// The update installed on the way out, to say so once the new version opens.
    pub installed_update: Option<InstalledUpdate>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledUpdate {
    pub version: String,
    /// What the release says is new, as written for it.
    pub notes: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_lock_minutes: Some(15),
            last_backup_at: None,
            streamer_mode: false,
            close_to_tray: true,
            language: Language::En,
            sidebar_collapsed: false,
            auto_update: true,
            installed_update: None,
        }
    }
}

impl Settings {
    /// A missing or unreadable file gives the defaults.
    pub fn load(path: &Path) -> Self {
        fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        let json = serde_json::to_vec_pretty(self).map_err(io::Error::other)?;
        write_atomically(path, &json)
    }

    pub fn auto_lock(&self) -> Option<Duration> {
        self.auto_lock_minutes
            .map(|minutes| Duration::from_secs(u64::from(minutes) * 60))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_fields_take_the_defaults() {
        let settings: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(settings, Settings::default());
        let never: Settings = serde_json::from_str(r#"{"autoLockMinutes": null}"#).unwrap();
        assert_eq!(never.auto_lock(), None);
        assert_eq!(
            Settings::default().auto_lock(),
            Some(Duration::from_secs(15 * 60))
        );
    }

    #[test]
    fn settings_survive_a_save_and_a_damaged_file_gives_the_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let settings = Settings {
            auto_lock_minutes: None,
            last_backup_at: Some(1_700_000_000),
            streamer_mode: true,
            close_to_tray: false,
            language: Language::Uk,
            sidebar_collapsed: true,
            auto_update: false,
            installed_update: Some(InstalledUpdate {
                version: "0.2.0".to_owned(),
                notes: Some("- Faster".to_owned()),
            }),
        };
        settings.save(&path).unwrap();
        assert_eq!(Settings::load(&path), settings);
        fs::write(&path, b"{ not json").unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
    }
}
