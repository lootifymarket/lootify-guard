use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager};

// Ids of the tab items; the page gets the rest of the id as the shortcut's name.
const TAB_PREFIX: &str = "tab:";
// ⌘2–⌘9 pick the browser tabs, after ⌘1 for the dashboard.
const NUMBERED_TABS: u8 = 8;

/// The menu bar: the usual one, with a Tab menu. Its shortcuts reach the app
/// even while a Steam page has the keyboard, which keys pressed there don't.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let app_menu = Submenu::with_items(
        app,
        app.package_info().name.clone(),
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let tab = Submenu::with_items(
        app,
        "Tab",
        true,
        &[
            &tab_item(app, "new", "New Tab", "CmdOrCtrl+T")?,
            &tab_item(app, "close", "Close Tab", "CmdOrCtrl+W")?,
            &PredefinedMenuItem::separator(app)?,
            &tab_item(app, "1", "Dashboard", "CmdOrCtrl+1")?,
        ],
    )?;
    for number in 1..=NUMBERED_TABS {
        tab.append(&tab_item(
            app,
            &(number + 1).to_string(),
            &format!("Tab {number}"),
            &format!("CmdOrCtrl+{}", number + 1),
        )?)?;
    }
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;
    app.set_menu(Menu::with_items(app, &[&app_menu, &edit, &tab, &window])?)?;
    app.on_menu_event(|app, event| {
        if let Some(shortcut) = event.id().as_ref().strip_prefix(TAB_PREFIX) {
            pass_on(app, shortcut);
        }
    });
    Ok(())
}

fn tab_item(
    app: &AppHandle,
    shortcut: &str,
    text: &str,
    accelerator: &str,
) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(
        app,
        format!("{TAB_PREFIX}{shortcut}"),
        text,
        true,
        Some(accelerator),
    )
}

/// The app's page can't listen for events from here, so it's told through a
/// DOM event of its own.
fn pass_on(app: &AppHandle, shortcut: &str) {
    if let Some(page) = app.get_webview("main") {
        let _ = page.eval(format!(
            "window.dispatchEvent(new CustomEvent('app-shortcut', {{ detail: {shortcut:?} }}))"
        ));
    }
}
