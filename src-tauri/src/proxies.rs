use lootify_guard_core::contents::Contents;
use lootify_guard_core::proxy::{ProxyAddress, ProxyKind, country_code};
use lootify_guard_core::steam::{self, ProxyCheck};
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::async_runtime::spawn_blocking;
use zeroize::Zeroizing;

use crate::vault::{CommandError, VaultState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxySummary {
    id: u32,
    name: Option<String>,
    country: Option<String>,
    kind: ProxyKind,
    address: String,
    has_login: bool,
    accounts: Vec<String>,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddReport {
    added: usize,
    already_added: usize,
    failed: Vec<FailedLine>,
}

/// Only the line number: the line itself may hold a password.
#[derive(Serialize)]
pub struct FailedLine {
    line: usize,
    reason: String,
}

/// The fields of the add form.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyFields {
    kind: ProxyKind,
    host: String,
    port: u16,
    login: Option<String>,
    password: Option<String>,
}

impl ProxyFields {
    fn into_address(self) -> Result<ProxyAddress, CommandError> {
        ProxyAddress::new(self.kind, &self.host, self.port, self.login, self.password)
            .map_err(|err| CommandError::Failed(err.to_string()))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    ping_ms: u64,
    country: Option<String>,
}

impl From<ProxyCheck> for CheckResult {
    fn from(check: ProxyCheck) -> Self {
        Self {
            ping_ms: u64::try_from(check.latency.as_millis()).unwrap_or(u64::MAX),
            country: check.country,
        }
    }
}

#[tauri::command]
pub fn list_proxies(state: State<'_, VaultState>) -> Result<Vec<ProxySummary>, CommandError> {
    let unlocked = state.unlocked();
    let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
    let contents = Contents::from_bytes(vault.data())?;
    Ok(contents
        .proxies
        .iter()
        .map(|proxy| ProxySummary {
            id: proxy.id,
            name: proxy.name.clone(),
            country: proxy.country.clone(),
            kind: proxy.address.kind,
            address: proxy.address.label(),
            has_login: proxy.address.login.is_some(),
            accounts: contents
                .accounts
                .iter()
                .filter(|account| account.proxy == Some(proxy.id))
                .map(|account| account.account_name.clone())
                .collect(),
        })
        .collect())
}

/// Adds one proxy per line of `text`, skipping blank lines.
#[tauri::command]
pub fn add_proxies(state: State<'_, VaultState>, text: String) -> Result<AddReport, CommandError> {
    let text = Zeroizing::new(text);
    let mut report = AddReport::default();
    let mut addresses = Vec::new();
    for (index, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        match ProxyAddress::parse(line) {
            Ok(address) => addresses.push(address),
            Err(err) => report.failed.push(FailedLine {
                line: index + 1,
                reason: err.to_string(),
            }),
        }
    }

    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    for address in addresses {
        if contents.add_proxy(address).is_some() {
            report.added += 1;
        } else {
            report.already_added += 1;
        }
    }
    if report.added > 0 {
        vault.save_data(contents.to_bytes())?;
    }
    Ok(report)
}

/// Adds one proxy from the form. `country` comes from a test run just before, so
/// the flag shows without checking again. Returns whether it was new.
#[tauri::command]
pub fn add_proxy(
    state: State<'_, VaultState>,
    fields: ProxyFields,
    name: Option<String>,
    country: Option<String>,
) -> Result<bool, CommandError> {
    let address = fields.into_address()?;
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    let Some(proxy) = contents.add_proxy(address) else {
        return Ok(false);
    };
    proxy.name = name
        .map(|name| name.trim().to_owned())
        .filter(|name| !name.is_empty());
    proxy.country = country.as_deref().and_then(country_code);
    vault.save_data(contents.to_bytes())?;
    Ok(true)
}

/// Checks a proxy from the add form before it is saved.
#[tauri::command]
pub async fn test_proxy(fields: ProxyFields) -> Result<CheckResult, CommandError> {
    let address = fields.into_address()?;
    let check = spawn_blocking(move || steam::check_proxy(&address)).await??;
    Ok(check.into())
}

/// Splits a pasted proxy link into the fields of the add form. The password goes
/// back to the page, which already has it: the user just pasted it there.
#[tauri::command]
pub fn parse_proxy(link: String) -> Result<ProxyFields, CommandError> {
    let link = Zeroizing::new(link);
    let address =
        ProxyAddress::parse(&link).map_err(|err| CommandError::Failed(err.to_string()))?;
    Ok(ProxyFields {
        kind: address.kind,
        host: address.host,
        port: address.port,
        login: address.login.map(|login| login.expose().to_owned()),
        password: address
            .password
            .map(|password| password.expose().to_owned()),
    })
}

#[tauri::command]
pub fn remove_proxy(state: State<'_, VaultState>, id: u32) -> Result<(), CommandError> {
    let mut unlocked = state.unlocked();
    let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
    let mut contents = Contents::from_bytes(vault.data())?;
    if contents.remove_proxy(id) {
        vault.save_data(contents.to_bytes())?;
    }
    Ok(())
}

/// Checks a saved proxy and keeps the country it reports.
#[tauri::command]
pub async fn check_proxy(
    state: State<'_, VaultState>,
    id: u32,
) -> Result<CheckResult, CommandError> {
    let address = {
        let unlocked = state.unlocked();
        let vault = unlocked.as_ref().ok_or(CommandError::Locked)?;
        Contents::from_bytes(vault.data())?
            .proxy(id)
            .map(|proxy| proxy.address.clone())
            .ok_or_else(|| CommandError::Failed("the proxy is no longer in the vault".to_owned()))?
    };
    let check = spawn_blocking(move || steam::check_proxy(&address)).await??;

    if let Some(country) = &check.country {
        let mut unlocked = state.unlocked();
        let vault = unlocked.as_mut().ok_or(CommandError::Locked)?;
        let mut contents = Contents::from_bytes(vault.data())?;
        if let Some(proxy) = contents.proxy_mut(id)
            && proxy.country.as_ref() != Some(country)
        {
            proxy.country = Some(country.clone());
            vault.save_data(contents.to_bytes())?;
        }
    }
    Ok(check.into())
}
