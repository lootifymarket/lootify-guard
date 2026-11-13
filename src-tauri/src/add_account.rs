use std::sync::{Mutex, MutexGuard, PoisonError};

use lootify_guard_core::contents::{Contents, Secret};
use lootify_guard_core::link::{self, ConfirmBy, NewGuard, NewSignIn, SignInCode};
use lootify_guard_core::steam::SteamError;
use serde::{Deserialize, Serialize};
use tauri::async_runtime::spawn_blocking;
use tauri::{State, Window};
use tauri_plugin_dialog::DialogExt;
use zeroize::Zeroizing;

use crate::accounts::{file_name, find, write_private};
use crate::vault::{CommandError, VaultState};

/// The account being added, one at a time. It lives only in memory, and a command
/// that finds the vault locked drops it.
#[derive(Default)]
pub struct AddAccountState(Mutex<Option<Flow>>);

struct Flow {
    proxy_id: Option<u32>,
    /// Only when the user asked to keep it.
    password: Option<Secret>,
    step: Step,
}

enum Step {
    SigningIn(NewSignIn),
    Guard(NewGuard),
    /// Saved to the vault; kept only to know whose revocation code may be saved to a file.
    Added {
        account_name: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "step")]
pub enum Next {
    /// Steam wants a code before it gives the session.
    #[serde(rename_all = "camelCase")]
    Code { from: SignInCode },
    #[serde(rename_all = "camelCase")]
    Guard { on_phone: bool },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GuardMethod {
    New,
    Move,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAccount {
    account_name: String,
    revocation_code: Option<String>,
}

impl AddAccountState {
    fn lock(&self) -> MutexGuard<'_, Option<Flow>> {
        // A panic elsewhere can't leave the flow half-updated, so a poisoned lock is safe to reuse.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Takes the flow out for a network call, which must not hold the lock.
    fn take(&self, vault: &VaultState) -> Result<Flow, CommandError> {
        let mut flow = self.lock();
        if vault.unlocked().is_none() {
            *flow = None;
            return Err(CommandError::Locked);
        }
        flow.take().ok_or_else(start_again)
    }

    fn put(&self, flow: Flow) {
        *self.lock() = Some(flow);
    }
}

#[tauri::command]
pub async fn add_account_sign_in(
    state: State<'_, VaultState>,
    flow: State<'_, AddAccountState>,
    account_name: String,
    password: String,
    proxy_id: Option<u32>,
    remember_password: bool,
) -> Result<Next, CommandError> {
    let password = Zeroizing::new(password);
    *flow.lock() = None;
    let proxy = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        let contents = Contents::from_bytes(vault.data())?;
        if contents.has_login(&account_name) {
            return Err(CommandError::Failed(
                "this account is already in the vault".to_owned(),
            ));
        }
        proxy_id
            .map(|id| {
                contents
                    .proxy(id)
                    .map(|proxy| proxy.address.clone())
                    .ok_or_else(|| {
                        CommandError::Failed("the proxy is no longer in the vault".to_owned())
                    })
            })
            .transpose()?
    };

    let (step, next) = spawn_blocking({
        let password = password.clone();
        move || {
            let sign_in = link::begin_sign_in(&account_name, &password, proxy.as_ref())?;
            Ok::<_, SteamError>(match sign_in.code {
                Some(from) => (Step::SigningIn(sign_in), Next::Code { from }),
                None => guard_step(sign_in.finish()?),
            })
        }
    })
    .await??;
    flow.put(Flow {
        proxy_id,
        password: remember_password.then(|| password.to_string().into()),
        step,
    });
    Ok(next)
}

/// The code Steam sent by email, or the one Steam Guard shows on the phone.
#[tauri::command]
pub async fn add_account_sign_in_code(
    state: State<'_, VaultState>,
    flow: State<'_, AddAccountState>,
    code: String,
) -> Result<Next, CommandError> {
    let mut current = flow.take(&state)?;
    let Step::SigningIn(mut sign_in) = current.step else {
        return Err(start_again());
    };
    let result = spawn_blocking(move || match sign_in.submit_code(code.trim()) {
        Ok(()) => sign_in.finish().map_err(|err| (None, err)),
        Err(err) => Err((Some(Box::new(sign_in)), err)),
    })
    .await?;
    match result {
        Ok(guard) => {
            let (step, next) = guard_step(guard);
            current.step = step;
            flow.put(current);
            Ok(next)
        }
        // A wrong code can be typed again; anything else needs a new sign-in.
        Err((sign_in, err)) => {
            if let Some(sign_in) = sign_in {
                current.step = Step::SigningIn(*sign_in);
                flow.put(current);
            }
            Err(err.into())
        }
    }
}

/// Asks Steam for a new authenticator, or to move the phone's here. Either way
/// Steam sends a code that `add_account_confirm` takes.
#[tauri::command]
pub async fn add_account_guard(
    state: State<'_, VaultState>,
    flow: State<'_, AddAccountState>,
    method: GuardMethod,
) -> Result<ConfirmBy, CommandError> {
    let mut current = flow.take(&state)?;
    let Step::Guard(mut guard) = current.step else {
        return Err(start_again());
    };
    let (guard, result) = spawn_blocking(move || {
        let result = match method {
            GuardMethod::New => guard.add(),
            GuardMethod::Move => guard.start_move(),
        };
        (guard, result)
    })
    .await?;
    current.step = Step::Guard(guard);
    flow.put(current);
    Ok(result?)
}

/// Confirms the authenticator and saves the account at once: from here on its
/// secrets are the only way to get Guard codes.
#[tauri::command]
pub async fn add_account_confirm(
    state: State<'_, VaultState>,
    flow: State<'_, AddAccountState>,
    code: String,
) -> Result<NewAccount, CommandError> {
    let mut current = flow.take(&state)?;
    let Step::Guard(mut guard) = current.step else {
        return Err(start_again());
    };
    let (guard, result) = spawn_blocking(move || {
        let result = guard.confirm(code.trim());
        (guard, result)
    })
    .await?;
    let mut account = match result {
        Ok(account) => account,
        Err(err) => {
            current.step = Step::Guard(guard);
            flow.put(current);
            return Err(err.into());
        }
    };
    account.proxy = current.proxy_id;
    account.password = current.password.take();
    let added = NewAccount {
        account_name: account.account_name.clone(),
        revocation_code: account
            .authenticator
            .revocation_code
            .as_ref()
            .map(|code| code.expose().to_owned()),
    };

    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    contents.put_account(account);
    vault.save_data(contents.to_bytes())?;
    current.step = Step::Added {
        account_name: added.account_name.clone(),
    };
    flow.put(current);
    Ok(added)
}

/// Saves the just-added account's revocation code as a text file where the user picks.
/// Returns the file name, or `None` when saving was cancelled.
#[tauri::command]
pub async fn save_new_revocation_code(
    window: Window,
    state: State<'_, VaultState>,
    flow: State<'_, AddAccountState>,
) -> Result<Option<String>, CommandError> {
    let account_name = match flow.lock().as_ref().map(|flow| &flow.step) {
        Some(Step::Added { account_name }) => account_name.clone(),
        _ => return Err(start_again()),
    };
    let picker = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(format!("{account_name} revocation code.txt"))
        .add_filter("Text", &["txt"]);
    let Some(target) = spawn_blocking(move || picker.blocking_save_file()).await? else {
        return Ok(None);
    };
    let path = target
        .into_path()
        .map_err(|err| CommandError::Failed(err.to_string()))?;

    let text = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        let contents = Contents::from_bytes(vault.data())?;
        let code = find(&contents, &account_name)?
            .authenticator
            .revocation_code
            .as_ref()
            .ok_or_else(|| {
                CommandError::Failed("this account has no revocation code".to_owned())
            })?;
        Zeroizing::new(format!(
            "Steam Guard revocation code for {account_name}: {}\n",
            code.expose()
        ))
    };
    let name = file_name(&path);
    spawn_blocking(move || write_private(&path, text.as_bytes()))
        .await?
        .map_err(|err| CommandError::Failed(err.to_string()))?;
    Ok(Some(name))
}

#[tauri::command]
pub fn add_account_cancel(flow: State<'_, AddAccountState>) {
    *flow.lock() = None;
}

fn guard_step(guard: NewGuard) -> (Step, Next) {
    let next = Next::Guard {
        on_phone: guard.guard_on_phone,
    };
    (Step::Guard(guard), next)
}

fn start_again() -> CommandError {
    CommandError::Failed("this sign-in has ended, start adding the account again".to_owned())
}
