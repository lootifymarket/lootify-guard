// Keeps Windows release builds from opening a console window next to the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod accounts;
mod add_account;
mod auto_confirm;
mod biometrics;
mod confirmations;
mod farming;
mod groups;
mod inventory;
mod playing;
mod profile;
mod proxies;
mod security;
mod settings;
mod sign_ins;
mod tasks;
mod trades;
mod tray;
mod vault;

use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![tray::HIDDEN_ARG]),
        ))
        // The camera reads sign-in QR codes; nothing else the page might ask for is needed.
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Camera => PermissionResponse::Allow,
            _ => PermissionResponse::Deny,
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let settings = settings::SettingsState::load(data_dir.join("settings.json"));
            app.manage(vault::VaultState::new(
                data_dir.join("vault.lgv"),
                settings.get().auto_lock(),
            ));
            app.manage(settings);
            app.manage(auto_confirm::AutoConfirmLog::default());
            app.manage(add_account::AddAccountState::default());
            app.manage(inventory::InventoryCache::default());
            app.manage(inventory::IconCache::default());
            app.manage(tasks::Tasks::default());
            app.manage(playing::Players::default());
            app.manage(farming::Farms::default());
            tray::install(app.handle())?;
            if std::env::args().any(|arg| arg == tray::HIDDEN_ARG) {
                tray::hide_window(app.handle());
            }
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
            vault::change_master_password,
            vault::disable_biometrics,
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
            add_account::add_account_sign_in,
            add_account::add_account_sign_in_code,
            add_account::add_account_guard,
            add_account::add_account_confirm,
            add_account::save_new_revocation_code,
            add_account::add_account_cancel,
            groups::create_group,
            groups::rename_group,
            groups::remove_group,
            groups::set_account_group,
            confirmations::list_confirmations,
            confirmations::respond_to_confirmations,
            auto_confirm::set_auto_confirm_rule,
            auto_confirm::set_auto_confirm_paused,
            auto_confirm::auto_confirm_log,
            security::check_api_key,
            security::trust_api_key,
            security::revoke_api_key,
            security::list_devices,
            security::sign_out_other_devices,
            security::sign_out_device,
            security::name_device,
            security::check_standing,
            sign_ins::list_sign_in_requests,
            sign_ins::answer_sign_in,
            sign_ins::allow_qr_sign_in,
            profile::trade_url,
            profile::new_trade_url,
            profile::wallet_balance,
            profile::profile_settings,
            profile::save_profile,
            profile::clear_name_history,
            profile::change_avatar,
            settings::get_settings,
            settings::set_auto_lock,
            settings::set_streamer_mode,
            settings::set_close_to_tray,
            settings::launch_at_startup,
            settings::set_launch_at_startup,
            settings::export_backup,
            playing::start_playing,
            farming::start_farming,
            farming::farming_now,
            playing::stop_playing,
            playing::playing_now,
            playing::playing_list,
            playing::owned_games,
            tasks::start_task,
            tasks::task_queue,
            tasks::cancel_task,
            tasks::clear_finished_tasks,
            trades::list_trade_offers,
            trades::accept_trade_offer,
            trades::decline_trade_offer,
            trades::cancel_trade_offer,
            trades::confirm_trade_offer,
            trades::check_trade_partner,
            inventory::inventory_items,
            trades::send_trade_offer,
            inventory::item_icons,
            inventory::move_items,
            inventory::market_prices,
            inventory::list_on_market,
            proxies::list_proxies,
            proxies::add_proxies,
            proxies::add_proxy,
            proxies::parse_proxy,
            proxies::test_proxy,
            proxies::remove_proxy,
            proxies::check_proxy,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event
                && window
                    .state::<settings::SettingsState>()
                    .get()
                    .close_to_tray
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build tauri application")
        .run(on_run_event);
}

/// Clicking the Dock icon brings back a window that was closed to the tray.
#[cfg(target_os = "macos")]
fn on_run_event(app: &AppHandle, event: RunEvent) {
    if let RunEvent::Reopen { .. } = event {
        tray::show_window(app);
    }
}

#[cfg(not(target_os = "macos"))]
fn on_run_event(_: &AppHandle, _: RunEvent) {}
