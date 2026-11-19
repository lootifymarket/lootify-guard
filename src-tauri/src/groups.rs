use lootify_guard_core::contents::{Contents, GroupColor, GroupError};
use serde::Serialize;
use tauri::State;

use crate::vault::{CommandError, VaultState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupView {
    id: u32,
    name: String,
    color: GroupColor,
    /// How many accounts are in it.
    count: usize,
}

impl From<GroupError> for CommandError {
    fn from(err: GroupError) -> Self {
        Self::Failed(err.to_string())
    }
}

/// Groups in the order they were made, with how many accounts each has.
pub(crate) fn views(contents: &Contents) -> Vec<GroupView> {
    contents
        .groups
        .iter()
        .map(|group| GroupView {
            id: group.id,
            name: group.name.clone(),
            color: group.color,
            count: contents
                .accounts
                .iter()
                .filter(|account| account.groups.contains(&group.id))
                .count(),
        })
        .collect()
}

/// Makes a group with these accounts in it. They stay in their other groups.
#[tauri::command]
pub fn create_group(
    state: State<'_, VaultState>,
    name: String,
    color: GroupColor,
    account_names: Vec<String>,
) -> Result<u32, CommandError> {
    change(&state, |contents| {
        let id = contents.add_group(&name, color)?;
        contents.add_to_group(&account_names, id)?;
        Ok(id)
    })
}

#[tauri::command]
pub fn update_group(
    state: State<'_, VaultState>,
    id: u32,
    name: String,
    color: GroupColor,
) -> Result<(), CommandError> {
    change(&state, |contents| {
        Ok(contents.update_group(id, &name, color)?)
    })
}

/// Deletes the group; its accounts stay, in their other groups.
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

/// Adds the accounts to the group, keeping their other groups.
#[tauri::command]
pub fn add_to_group(
    state: State<'_, VaultState>,
    account_names: Vec<String>,
    group_id: u32,
) -> Result<(), CommandError> {
    change(&state, |contents| {
        Ok(contents.add_to_group(&account_names, group_id)?)
    })
}

#[tauri::command]
pub fn remove_from_group(
    state: State<'_, VaultState>,
    account_names: Vec<String>,
    group_id: u32,
) -> Result<(), CommandError> {
    change(&state, |contents| {
        contents.remove_from_group(&account_names, group_id);
        Ok(())
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
