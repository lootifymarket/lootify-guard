//! The tray icon. With it, closing the window leaves the app running, so
//! auto-confirm, playing and card farming go on in the background. Its menu also
//! copies any account's Steam Guard code without opening the window.

use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use lootify_guard_core::contents::Contents;
use lootify_guard_core::guard;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::vault::{self, VaultState};

/// Passed when the system starts the app at login, which then stays in the tray.
pub const HIDDEN_ARG: &str = "--hidden";

const WINDOW: &str = "main";
const TRAY: &str = "main";
// A menu item that copies a code has this id before the login.
const COPY_CODE: &str = "code:";
// How often the menu checks that its accounts are still the vault's.
const WATCH_EVERY: Duration = Duration::from_secs(2);
// How long the menu bar says the code was copied.
const COPIED_FOR: Duration = Duration::from_millis(1500);

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let mut tray = TrayIconBuilder::with_id(TRAY)
        .tooltip("Lootify Guard")
        .menu(&menu(app, None)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_window(app),
            "lock" => vault::lock_from_menu(app),
            "quit" => app.exit(0),
            id => {
                if let Some(account_name) = id.strip_prefix(COPY_CODE) {
                    copy_code(app, account_name);
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });
    // The menu bar takes a one-colour icon that macOS tints for light and dark;
    // elsewhere, a black icon would vanish on a dark taskbar, so it's the app's own.
    if cfg!(target_os = "macos") {
        tray = tray
            .icon(tauri::include_image!("icons/tray.png"))
            .icon_as_template(true);
    } else if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Rebuilds the menu whenever the vault locks, unlocks or its accounts change.
pub fn watch_accounts(app: AppHandle) {
    thread::spawn(move || {
        let mut shown = None;
        loop {
            let now = listed(&app);
            if now != shown {
                if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY), menu(&app, now.as_deref())) {
                    let _ = tray.set_menu(Some(menu));
                }
                shown = now;
            }
            thread::sleep(WATCH_EVERY);
        }
    });
}

/// `accounts` are the logins and labels to copy codes for, `None` while locked.
fn menu(app: &AppHandle, accounts: Option<&[(String, String)]>) -> tauri::Result<Menu<Wry>> {
    let items = accounts
        .unwrap_or_default()
        .iter()
        .map(|(account_name, label)| {
            MenuItem::with_id(
                app,
                format!("{COPY_CODE}{account_name}"),
                label,
                true,
                None::<&str>,
            )
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let items: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = items
        .iter()
        .map(|item| item as &dyn tauri::menu::IsMenuItem<Wry>)
        .collect();
    let codes = Submenu::with_id_and_items(
        app,
        "codes",
        if accounts.is_some() {
            "Copy Steam Guard code"
        } else {
            "Copy Steam Guard code (unlock first)"
        },
        !items.is_empty(),
        &items,
    )?;
    let open = MenuItem::with_id(app, "open", "Open Lootify Guard", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", "Lock vault", accounts.is_some(), None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &open,
            &codes,
            &lock,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )
}

/// Each account's login and the label the menu shows for it, or `None` while
/// the vault is locked. Only names leave the vault here, never secrets.
fn listed(app: &AppHandle) -> Option<Vec<(String, String)>> {
    let state = app.state::<VaultState>();
    let unlocked = state.unlocked();
    let contents = Contents::from_bytes(unlocked.as_ref()?.data()).ok()?;
    Some(
        contents
            .accounts
            .iter()
            .map(|account| {
                let label = match account
                    .profile
                    .as_ref()
                    .map(|profile| &profile.persona_name)
                {
                    Some(persona) if !persona.is_empty() && *persona != account.account_name => {
                        format!("{} · {persona}", account.account_name)
                    }
                    _ => account.account_name.clone(),
                };
                (account.account_name.clone(), label)
            })
            .collect(),
    )
}

/// Puts the account's current code on the clipboard. The menu may be older than
/// the vault, so a locked vault or a removed account just copies nothing.
fn copy_code(app: &AppHandle, account_name: &str) {
    let state = app.state::<VaultState>();
    let code = {
        let unlocked = state.unlocked();
        let Some(vault) = unlocked.as_ref() else {
            return;
        };
        let Ok(contents) = Contents::from_bytes(vault.data()) else {
            return;
        };
        let Some(account) = contents.account(account_name) else {
            return;
        };
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |since| since.as_secs());
        guard::code(&account.authenticator.shared_secret, now)
    };
    let Ok(code) = code else {
        return;
    };
    state.touch();
    if app.clipboard().write_text(code).is_ok() {
        say_copied(app);
    }
}

/// The menu bar shows "Copied" by the icon for a moment; other systems have no
/// place for it, and the code is simply there to paste.
fn say_copied(app: &AppHandle) {
    if !cfg!(target_os = "macos") {
        return;
    }
    let Some(tray) = app.tray_by_id(TRAY) else {
        return;
    };
    let _ = tray.set_title(Some("Copied"));
    thread::spawn(move || {
        thread::sleep(COPIED_FOR);
        let _ = tray.set_title(None::<&str>);
    });
}

pub fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn hide_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.hide();
    }
}
