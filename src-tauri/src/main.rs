// Keeps Windows release builds from opening a console window next to the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod accounts;
mod biometrics;
mod proxies;
mod vault;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(vault::VaultState::new(data_dir.join("vault.lgv")));
            vault::watch_idle(app.handle().clone());
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
            vault::report_activity,
            vault::auto_lock_deadline,
            accounts::list_accounts,
            accounts::import_mafiles,
            accounts::reveal_revocation_code,
            accounts::export_mafile,
            accounts::remove_account,
            accounts::sign_in,
            accounts::refresh_profile,
            accounts::set_account_proxy,
            proxies::list_proxies,
            proxies::add_proxies,
            proxies::add_proxy,
            proxies::parse_proxy,
            proxies::test_proxy,
            proxies::remove_proxy,
            proxies::check_proxy,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run tauri application");
}
