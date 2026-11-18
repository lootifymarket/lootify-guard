// Keeps Windows release builds from opening a console window next to the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod accounts;
mod add_account;
mod auto_confirm;
mod biometrics;
mod browser;
mod browser_profiles;
mod confirmations;
mod farming;
mod groups;
mod inventory;
#[cfg(target_os = "macos")]
mod menu;
mod playing;
mod profile;
mod profiles;
mod proxies;
mod security;
mod settings;
mod sign_ins;
mod tasks;
mod trades;
mod tray;
mod updates;
mod vault;

use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

fn main() {
    tauri::Builder::default()
        // Runs first, so a second launch only brings this one forward. Windows
        // would otherwise start a new copy, with a new tray icon, on every launch.
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !args.iter().any(|arg| arg == tray::HIDDEN_ARG) {
                tray::show_window(app);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            app.manage(browser::Browsers::default());
            app.manage(updates::Updates::default());
            tray::install(app.handle())?;
            #[cfg(target_os = "macos")]
            menu::install(app.handle())?;
            if std::env::args().any(|arg| arg == tray::HIDDEN_ARG) {
                tray::hide_window(app.handle());
            }
            vault::watch_idle(app.handle().clone());
            auto_confirm::watch(app.handle().clone());
            profiles::watch(app.handle().clone());
            browser::watch_cookies(app.handle().clone());
            updates::watch(app.handle().clone());
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
            accounts::export_account,
            accounts::remove_account,
            accounts::sign_in,
            accounts::refresh_profile,
            accounts::set_account_note,
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
            settings::app_version,
            settings::get_settings,
            settings::set_auto_lock,
            settings::set_streamer_mode,
            settings::set_language,
            settings::set_close_to_tray,
            settings::set_sidebar_collapsed,
            updates::update_status,
            updates::check_for_updates,
            updates::download_update,
            updates::install_update,
            updates::set_auto_update,
            updates::dismiss_installed_update,
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
            browser::open_browser,
            browser::open_private_browser,
            browser::open_profile_browser,
            browser_profiles::list_browser_profiles,
            browser_profiles::add_browser_profile,
            browser_profiles::update_browser_profile,
            browser_profiles::remove_browser_profile,
            browser::place_browser,
            browser::hide_browser,
            browser::close_browser,
            browser::clear_saved_cookies,
            browser::browser_regions,
            browser::set_browser_region,
            browser::browser_navigate,
            browser::browser_snapshot,
            browser::browser_back,
            browser::browser_forward,
            browser::browser_reload,
            browser::browser_state,
            browser::list_bookmarks,
            browser::bookmark_page,
            browser::remove_bookmark,
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

fn on_run_event(app: &AppHandle, event: RunEvent) {
    match event {
        RunEvent::Exit => updates::install_on_quit(app),
        // Clicking the Dock icon brings back a window that was closed to the tray.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => tray::show_window(app),
        _ => {}
    }
}
