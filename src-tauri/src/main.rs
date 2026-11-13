// Keeps Windows release builds from opening a console window next to the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod accounts;
mod auto_confirm;
mod biometrics;
mod confirmations;
mod proxies;
mod sign_ins;
mod vault;

use tauri::Manager;
use tauri::webview::{PermissionKind, PermissionResponse};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // The camera reads sign-in QR codes; nothing else the page might ask for is needed.
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Camera => PermissionResponse::Allow,
            _ => PermissionResponse::Deny,
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(vault::VaultState::new(data_dir.join("vault.lgv")));
            app.manage(auto_confirm::AutoConfirmLog::default());
            vault::watch_idle(app.handle().clone());
            auto_confirm::watch(app.handle().clone());
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
            confirmations::list_confirmations,
            confirmations::respond_to_confirmations,
            auto_confirm::set_auto_confirm_rule,
            auto_confirm::set_auto_confirm_paused,
            auto_confirm::auto_confirm_log,
            sign_ins::list_sign_in_requests,
            sign_ins::answer_sign_in,
            sign_ins::allow_qr_sign_in,
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
