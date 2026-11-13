use lootify_guard_core::contents::{Contents, GroupError};
use serde::Serialize;
use tauri::State;

use crate::vault::{CommandError, VaultState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupView {
    id: u32,
    name: String,
    /// How many accounts are in it.
    count: usize,
}

impl From<GroupError> for CommandError {
    fn from(err: GroupError) -> Self {
        Self::Failed(err.to_string())
    }
}

/// Groups in the order they were made.
#[tauri::command]
pub fn list_groups(state: State<'_, VaultState>) -> Result<Vec<GroupView>, CommandError> {
    let unlocked = state.unlocked();
    let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
    let contents = Contents::from_bytes(vault.data())?;
    Ok(contents
        .groups
        .iter()
        .map(|group| GroupView {
            id: group.id,
            name: group.name.clone(),
            count: contents
                .accounts
                .iter()
                .filter(|account| account.group == Some(group.id))
                .count(),
        })
        .collect())
}

/// Makes a group with these accounts in it, taking them out of any other.
#[tauri::command]
pub fn create_group(
    state: State<'_, VaultState>,
    name: String,
    account_names: Vec<String>,
) -> Result<u32, CommandError> {
    change(&state, |contents| {
        let id = contents.add_group(&name)?;
        contents.set_group(&account_names, Some(id))?;
        Ok(id)
    })
}

#[tauri::command]
pub fn rename_group(
    state: State<'_, VaultState>,
    id: u32,
    name: String,
) -> Result<(), CommandError> {
    change(&state, |contents| Ok(contents.rename_group(id, &name)?))
}

/// Deletes the group; its accounts stay, in no group.
#[tauri::command]
pub fn remove_group(state: State<'_, VaultState>, id: u32) -> Result<(), CommandError> {
    change(&state, |contents| {
        if contents.remove_group(id) {
            Ok(())
        } else {
            Err(GroupError::Missing.into())
        }
    })
}

/// Puts the accounts in the group, or in none when `group_id` is missing.
#[tauri::command]
pub fn set_account_group(
    state: State<'_, VaultState>,
    account_names: Vec<String>,
    group_id: Option<u32>,
) -> Result<(), CommandError> {
    change(&state, |contents| {
        Ok(contents.set_group(&account_names, group_id)?)
    })
}

/// Reads the vault, applies `edit` and saves once.
fn change<T>(
    state: &VaultState,
    edit: impl FnOnce(&mut Contents) -> Result<T, CommandError>,
) -> Result<T, CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let result = edit(&mut contents)?;
    vault.save_data(contents.to_bytes())?;
    Ok(result)
}
