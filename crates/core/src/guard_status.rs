use serde::{Deserialize, Serialize};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, request_error, web_api_body, with_session};

const STATUS_URL: &str = "https://api.steampowered.com/ITwoFactorService/QueryStatus/v1/";
/// The status `state` of an authenticator that works. Others, like one added but not
/// confirmed yet, don't give Guard to the account (steamguard-cli and steamctl read it so too).
pub(crate) const STATE_ON: u32 = 1;

/// Whether the Steam Guard in the vault is the one Steam has on the account.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GuardStatus {
    /// Steam has the authenticator whose secrets are in the vault.
    Here,
    /// Steam has a different authenticator, so the codes here don't work.
    Elsewhere,
    /// Steam has no authenticator on the account at all.
    Off,
}

#[derive(Deserialize)]
struct StatusAnswer {
    response: StatusResponse,
}

#[derive(Deserialize)]
struct StatusResponse {
    #[serde(default)]
    state: u32,
    token_gid: Option<String>,
}

/// Asks Steam which authenticator the account has. Returns the session too, since
/// it may have been renewed.
pub fn check(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, GuardStatus), SteamError> {
    let ours = account.authenticator.token_gid.clone();
    with_session(account, proxy, |client, session, steam_id| {
        let response = client
            .post(STATUS_URL)
            .form(&[
                ("access_token", session.access_token.expose()),
                ("steamid", &steam_id.to_string()),
            ])
            .send()
            .map_err(request_error)?;
        parse(&web_api_body(response)?, ours.as_deref())
    })
}

fn parse(body: &[u8], ours: Option<&str>) -> Result<GuardStatus, SteamError> {
    let answer: StatusAnswer = serde_json::from_slice(body)
        .map_err(|_| SteamError::Steam("unreadable Steam Guard status".to_owned()))?;
    let status = answer.response;
    if status.state != STATE_ON {
        return Ok(GuardStatus::Off);
    }
    // An imported file may not say which authenticator it holds; then it's taken as this one.
    match (status.token_gid.as_deref(), ours) {
        (Some(theirs), Some(ours)) if !theirs.eq_ignore_ascii_case(ours) => {
            Ok(GuardStatus::Elsewhere)
        }
        _ => Ok(GuardStatus::Here),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_state_means_no_authenticator() {
        assert_eq!(
            parse(br#"{"response": {"state": 0}}"#, Some("2a2b")).ok(),
            Some(GuardStatus::Off)
        );
        assert_eq!(
            parse(br#"{"response": {}}"#, Some("2a2b")).ok(),
            Some(GuardStatus::Off)
        );
    }

    #[test]
    fn an_authenticator_not_confirmed_yet_is_no_authenticator() {
        assert_eq!(
            parse(
                br#"{"response": {"state": 2, "token_gid": "2a2b"}}"#,
                Some("2a2b")
            )
            .ok(),
            Some(GuardStatus::Off)
        );
    }

    #[test]
    fn the_authenticator_is_told_by_its_token() {
        let status = |body: &str, ours| parse(body.as_bytes(), ours).ok();
        let on = r#"{"response": {"state": 1, "token_gid": "2A2B"}}"#;
        assert_eq!(status(on, Some("2a2b")), Some(GuardStatus::Here));
        assert_eq!(status(on, Some("3c3d")), Some(GuardStatus::Elsewhere));
        assert_eq!(status(on, None), Some(GuardStatus::Here));
        assert_eq!(
            status(r#"{"response": {"state": 1}}"#, Some("2a2b")),
            Some(GuardStatus::Here)
        );
    }

    #[test]
    fn an_odd_answer_is_an_error() {
        assert!(parse(b"<html>", None).is_err());
    }
}
