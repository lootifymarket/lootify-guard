// Keeps Windows release builds from opening a console window next to the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod accounts;
mod biometrics;
mod vault;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(vault::VaultState::new(data_dir.join("vault.lgv")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault::vault_status,
            vault::biometric_status,
            vault::create_vault,
            vault::unlock_vault,
            vault::unlock_with_biometrics,
            vault::enable_biometrics,
            vault::change_password,
            vault::lock_vault,
            vault::erase_vault,
            accounts::list_accounts,
            accounts::import_mafiles,
            accounts::reveal_revocation_code,
            accounts::export_mafile,
            accounts::remove_account,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
