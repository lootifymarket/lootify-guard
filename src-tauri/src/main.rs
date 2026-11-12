// Keeps Windows release builds from opening a console window next to the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod vault;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(vault::VaultState::new(data_dir.join("vault.lgv")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault::vault_status,
            vault::create_vault,
            vault::unlock_vault,
            vault::lock_vault,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
