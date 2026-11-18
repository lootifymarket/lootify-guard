use lootify_guard_core::browser::cookie_sites;
use lootify_guard_core::browser_profiles::ProfileError;
use lootify_guard_core::contents::Contents;
use serde::Serialize;
use tauri::State;

use crate::browser::Browsers;
use crate::vault::{CommandError, VaultState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    id: u32,
    name: String,
    proxy_id: Option<u32>,
    /// How many sites it keeps sign-ins for.
    saved_sites: usize,
    /// Unix seconds.
    last_opened: Option<u64>,
}

impl From<ProfileError> for CommandError {
    fn from(err: ProfileError) -> Self {
        Self::Failed(err.to_string())
    }
}

/// Profiles in the order they were made.
#[tauri::command]
pub fn list_browser_profiles(
    state: State<'_, VaultState>,
) -> Result<Vec<ProfileView>, CommandError> {
    let unlocked = state.unlocked();
    let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
    Ok(Contents::from_bytes(vault.data())?
        .profiles
        .iter()
        .map(|profile| ProfileView {
            id: profile.id,
            name: profile.name.clone(),
            proxy_id: profile.proxy,
            saved_sites: cookie_sites(&profile.saved_cookies),
            last_opened: profile.last_opened,
        })
        .collect())
}

/// Returns the new profile's id.
#[tauri::command]
pub fn add_browser_profile(
    state: State<'_, VaultState>,
    name: String,
    proxy_id: Option<u32>,
) -> Result<u32, CommandError> {
    change(
        &state,
        |contents| Ok(contents.add_profile(&name, proxy_id)?),
    )
}

/// A new proxy takes effect the next time the profile's tab opens.
#[tauri::command]
pub fn update_browser_profile(
    state: State<'_, VaultState>,
    id: u32,
    name: String,
    proxy_id: Option<u32>,
) -> Result<(), CommandError> {
    change(&state, |contents| {
        Ok(contents.update_profile(id, &name, proxy_id)?)
    })
}

/// Removes the profile and its sign-ins, closing its tab without saving it.
#[tauri::command]
pub fn remove_browser_profile(
    state: State<'_, VaultState>,
    browsers: State<'_, Browsers>,
    id: u32,
) -> Result<(), CommandError> {
    browsers.close(&format!("profile:{id}"));
    change(&state, |contents| {
        if contents.remove_profile(id) {
            Ok(())
        } else {
            Err(ProfileError::Missing.into())
        }
    })
}

fn change<T>(
    state: &VaultState,
    op: impl FnOnce(&mut Contents) -> Result<T, CommandError>,
) -> Result<T, CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let result = op(&mut contents)?;
    vault.save_data(contents.to_bytes())?;
    Ok(result)
}
