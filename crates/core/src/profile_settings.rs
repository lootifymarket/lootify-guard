use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{
    SteamError, community_get, community_post, html_unescape, session_id, with_session,
};

// Where the edit pages keep their current values for the page's own script.
const INFO_MARK: &str = "data-profile-edit=";
const PRIVACY_MARK: &str = "data-privacysettings=";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Visibility {
    Private,
    FriendsOnly,
    Public,
}

impl Visibility {
    fn from_steam(value: &Value) -> Option<Self> {
        match value.as_i64()? {
            1 => Some(Self::Private),
            2 => Some(Self::FriendsOnly),
            3 => Some(Self::Public),
            _ => None,
        }
    }

    fn to_steam(self) -> i64 {
        match self {
            Self::Private => 1,
            Self::FriendsOnly => 2,
            Self::Public => 3,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Privacy {
    pub profile: Visibility,
    pub inventory: Visibility,
    pub games: Visibility,
}

// Steam's names for the three settings above, in the same order.
const PRIVACY_KEYS: [&str; 3] = ["PrivacyProfile", "PrivacyInventory", "PrivacyOwnedGames"];

/// What the profile shows, as the edit page has it now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSettings {
    pub persona_name: String,
    /// The part after steamcommunity.com/id/, empty when there is none.
    pub custom_url: String,
    pub summary: String,
    pub privacy: Privacy,
    /// Newest first. `None` when Steam's list couldn't be read: the rest still works.
    pub past_names: Option<Vec<PastName>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PastName {
    #[serde(rename(deserialize = "newname"))]
    pub name: String,
    /// As Steam words it, like "14 Jul @ 10:02am".
    #[serde(rename(deserialize = "timechanged"))]
    pub changed: String,
}

/// What to change; `None` keeps what Steam has.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileChanges {
    pub persona_name: Option<String>,
    pub custom_url: Option<String>,
    pub summary: Option<String>,
    pub privacy: Option<Privacy>,
}

pub fn settings(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, ProfileSettings), SteamError> {
    with_session(account, proxy, |client, _, steam_id| {
        let info = page_data(
            &community_get(client, &edit_url(steam_id, "info"))?,
            INFO_MARK,
        )?;
        let privacy = privacy_data(client, steam_id, &info)?;
        let past_names = match community_get(client, &profile_url(steam_id, "ajaxaliases/")) {
            Ok(body) => serde_json::from_str(&body).ok(),
            Err(SteamError::Steam(_)) => None,
            Err(err) => return Err(err),
        };
        Ok(ProfileSettings {
            persona_name: text(&info, "strPersonaName"),
            custom_url: text(&info, "strCustomURL"),
            summary: text(&info, "strSummary"),
            privacy: read_privacy(&privacy)?,
            past_names,
        })
    })
}

/// Saves the changes. The edit form replaces every field at once, so the current
/// values are read first and sent back with the changes laid over them.
pub fn save(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    changes: &ProfileChanges,
) -> Result<Session, SteamError> {
    let (session, ()) = with_session(account, proxy, |client, session, steam_id| {
        let info_changed = changes.persona_name.is_some()
            || changes.custom_url.is_some()
            || changes.summary.is_some();
        if info_changed {
            let info = page_data(
                &community_get(client, &edit_url(steam_id, "info"))?,
                INFO_MARK,
            )?;
            let form = info_form(&info, changes, &session_id(session));
            let fields: Vec<(&str, &str)> = form
                .iter()
                .map(|(key, value)| (*key, value.as_str()))
                .collect();
            answer(community_post(
                client,
                &profile_url(steam_id, "edit/"),
                session,
                &fields,
            )?)?;
        }
        if let Some(privacy) = changes.privacy {
            set_privacy(client, session, steam_id, privacy)?;
        }
        Ok(())
    })?;
    Ok(session)
}

/// Clears the list of the account's past nicknames that others see on its profile.
pub fn clear_name_history(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<Session, SteamError> {
    let (session, ()) = with_session(account, proxy, |client, session, steam_id| {
        let url = profile_url(steam_id, "ajaxclearaliashistory/");
        answer(community_post(client, &url, session, &[])?)
    })?;
    Ok(session)
}

fn set_privacy(
    client: &Client,
    session: &Session,
    steam_id: u64,
    privacy: Privacy,
) -> Result<(), SteamError> {
    let info = page_data(
        &community_get(client, &edit_url(steam_id, "info"))?,
        INFO_MARK,
    )?;
    let current = privacy_data(client, steam_id, &info)?;
    let (settings, comments) = privacy_form(&current, privacy)?;
    let url = profile_url(steam_id, "ajaxsetprivacy/");
    answer(community_post(
        client,
        &url,
        session,
        &[("Privacy", &settings), ("eCommentPermission", &comments)],
    )?)
}

/// The edit page keeps privacy with everything else; the older settings page kept
/// it in an attribute of its own, which is read only when the first has none.
fn privacy_data(client: &Client, steam_id: u64, info: &Value) -> Result<Value, SteamError> {
    match info.get("Privacy") {
        Some(privacy) if privacy.get("PrivacySettings").is_some() => Ok(privacy.clone()),
        _ => page_data(
            &community_get(client, &edit_url(steam_id, "settings"))?,
            PRIVACY_MARK,
        ),
    }
}

fn profile_url(steam_id: u64, path: &str) -> String {
    format!("https://steamcommunity.com/profiles/{steam_id}/{path}")
}

fn edit_url(steam_id: u64, page: &str) -> String {
    profile_url(steam_id, &format!("edit/{page}"))
}

/// The JSON a page keeps in an HTML attribute, quoted either way.
fn page_data(page: &str, mark: &str) -> Result<Value, SteamError> {
    let missing = || {
        SteamError::Steam(format!(
            "no {} on the page \"{}\"",
            mark.trim_end_matches('='),
            title(page)
        ))
    };
    let start = page.find(mark).ok_or_else(missing)? + mark.len();
    let quote = page[start..]
        .chars()
        .next()
        .filter(|c| matches!(c, '"' | '\''));
    let quote = quote.ok_or_else(missing)?;
    let value = &page[start + 1..];
    let end = value
        .find(quote)
        .ok_or_else(|| SteamError::Steam("unreadable profile settings".to_owned()))?;
    serde_json::from_str(&html_unescape(&value[..end]))
        .map_err(|_| SteamError::Steam("unreadable profile settings".to_owned()))
}

/// The page's title, to tell in an error which page Steam sent instead.
fn title(page: &str) -> String {
    let title = page
        .find("<title>")
        .map(|start| &page[start + "<title>".len()..])
        .and_then(|rest| rest.split('<').next())
        .unwrap_or("untitled");
    html_unescape(title.trim())
}

fn text(data: &Value, key: &str) -> String {
    match data.get(key) {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        _ => String::new(),
    }
}

fn read_privacy(data: &Value) -> Result<Privacy, SteamError> {
    let settings = &data["PrivacySettings"];
    let read = |key: &str| {
        Visibility::from_steam(&settings[key])
            .ok_or_else(|| SteamError::Steam("unreadable privacy settings".to_owned()))
    };
    Ok(Privacy {
        profile: read(PRIVACY_KEYS[0])?,
        inventory: read(PRIVACY_KEYS[1])?,
        games: read(PRIVACY_KEYS[2])?,
    })
}

/// Every field of the edit form, with the changes over the current values.
fn info_form(
    info: &Value,
    changes: &ProfileChanges,
    session_id: &str,
) -> Vec<(&'static str, String)> {
    let location = &info["LocationData"];
    let current = |key| text(info, key);
    let pick = |change: &Option<String>, key| change.clone().unwrap_or_else(|| current(key));
    vec![
        // This form spells it with a capital D, unlike every other one.
        ("sessionID", session_id.to_owned()),
        ("type", "profileSave".to_owned()),
        ("json", "1".to_owned()),
        ("personaName", pick(&changes.persona_name, "strPersonaName")),
        ("customURL", pick(&changes.custom_url, "strCustomURL")),
        ("summary", pick(&changes.summary, "strSummary")),
        ("real_name", current("strRealName")),
        ("country", text(location, "locCountryCode")),
        ("state", text(location, "locStateCode")),
        ("city", text(location, "locCityCode")),
        (
            "hide_profile_awards",
            text(&info["ProfilePreferences"], "hide_profile_awards"),
        ),
    ]
}

/// The privacy form: the current settings with the three this app shows replaced,
/// so the ones it doesn't show, like the friends list, stay as they are.
fn privacy_form(current: &Value, privacy: Privacy) -> Result<(String, String), SteamError> {
    let mut settings: Map<String, Value> = current["PrivacySettings"]
        .as_object()
        .cloned()
        .ok_or_else(|| SteamError::Steam("unreadable privacy settings".to_owned()))?;
    for (key, visibility) in
        PRIVACY_KEYS
            .iter()
            .zip([privacy.profile, privacy.inventory, privacy.games])
    {
        settings.insert((*key).to_owned(), Value::from(visibility.to_steam()));
    }
    let comments = current
        .get("eCommentPermission")
        .map(Value::to_string)
        .unwrap_or_else(|| "1".to_owned());
    Ok((Value::Object(settings).to_string(), comments))
}

/// Steam's forms answer `{"success": 1}`, or a message saying why not.
fn answer(body: String) -> Result<(), SteamError> {
    let answer: Value = serde_json::from_str(&body)
        .map_err(|_| SteamError::Steam("unreadable answer".to_owned()))?;
    let success = &answer["success"];
    if success == &Value::from(1) || success == &Value::Bool(true) {
        return Ok(());
    }
    let message = text(&answer, "errmsg");
    Err(if message.is_empty() {
        SteamError::Steam("the change wasn't saved".to_owned())
    } else {
        SteamError::Refused(strip_tags(&message))
    })
}

fn strip_tags(text: &str) -> String {
    let mut plain = String::new();
    let mut in_tag = false;
    for c in text.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => plain.push(c),
            _ => {}
        }
    }
    html_unescape(plain.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    const INFO_PAGE: &str = r#"<div id="profile_edit_config" data-profile-edit="{&quot;strPersonaName&quot;:&quot;kernel &amp; rogue&quot;,&quot;strCustomURL&quot;:&quot;kernelrogue&quot;,&quot;strRealName&quot;:&quot;Ivan&quot;,&quot;strSummary&quot;:&quot;Trading.&quot;,&quot;LocationData&quot;:{&quot;locCountryCode&quot;:&quot;NL&quot;,&quot;locStateCode&quot;:&quot;07&quot;,&quot;locCityCode&quot;:4022},&quot;ProfilePreferences&quot;:{&quot;hide_profile_awards&quot;:0}}" data-profile-badges="[]"></div>"#;

    const PRIVACY_PAGE: &str = r#"<div class="ProfileReactRoot" data-privacysettings="{&quot;PrivacySettings&quot;:{&quot;PrivacyProfile&quot;:3,&quot;PrivacyInventory&quot;:2,&quot;PrivacyInventoryGifts&quot;:1,&quot;PrivacyOwnedGames&quot;:1,&quot;PrivacyPlaytime&quot;:1,&quot;PrivacyFriendsList&quot;:3},&quot;eCommentPermission&quot;:2}"></div>"#;

    fn form_value<'a>(form: &'a [(&str, String)], key: &str) -> &'a str {
        &form.iter().find(|(name, _)| *name == key).unwrap().1
    }

    #[test]
    fn reads_the_edit_pages() {
        let info = page_data(INFO_PAGE, INFO_MARK).unwrap();
        assert_eq!(text(&info, "strPersonaName"), "kernel & rogue");
        assert_eq!(text(&info["LocationData"], "locCityCode"), "4022");
        let privacy = read_privacy(&page_data(PRIVACY_PAGE, PRIVACY_MARK).unwrap()).unwrap();
        assert_eq!(
            privacy,
            Privacy {
                profile: Visibility::Public,
                inventory: Visibility::FriendsOnly,
                games: Visibility::Private,
            }
        );
    }

    #[test]
    fn privacy_is_read_from_the_edit_page_when_it_is_there() {
        let page = r#"<div data-profile-edit="{&quot;strPersonaName&quot;:&quot;K&quot;,&quot;Privacy&quot;:{&quot;PrivacySettings&quot;:{&quot;PrivacyProfile&quot;:2,&quot;PrivacyInventory&quot;:3,&quot;PrivacyOwnedGames&quot;:1},&quot;eCommentPermission&quot;:0}}"></div>"#;
        let info = page_data(page, INFO_MARK).unwrap();
        let privacy = info.get("Privacy").unwrap();
        assert_eq!(
            read_privacy(privacy).unwrap().profile,
            Visibility::FriendsOnly
        );
        assert_eq!(
            privacy_form(privacy, read_privacy(privacy).unwrap())
                .unwrap()
                .1,
            "0"
        );
    }

    #[test]
    fn reads_past_names() {
        let names: Vec<PastName> =
            serde_json::from_str(r#"[{"newname":"kernelrogue","timechanged":"14 Jul @ 10:02am"}]"#)
                .unwrap();
        assert_eq!(names[0].name, "kernelrogue");
        assert_eq!(names[0].changed, "14 Jul @ 10:02am");
    }

    #[test]
    fn single_quoted_data_is_read_too() {
        let page = r#"<div data-privacysettings='{"PrivacySettings":{"PrivacyProfile":3,"PrivacyInventory":3,"PrivacyOwnedGames":3}}'></div>"#;
        let privacy = read_privacy(&page_data(page, PRIVACY_MARK).unwrap()).unwrap();
        assert_eq!(privacy.games, Visibility::Public);
    }

    #[test]
    fn a_page_without_the_data_is_named_by_its_title() {
        let err = page_data("<title>Steam Community :: Error</title>", INFO_MARK).unwrap_err();
        assert!(err.to_string().contains("\"Steam Community :: Error\""));
    }

    #[test]
    fn the_edit_form_keeps_what_wasnt_changed() {
        let info = page_data(INFO_PAGE, INFO_MARK).unwrap();
        let changes = ProfileChanges {
            persona_name: Some("NeonCrate".to_owned()),
            ..ProfileChanges::default()
        };
        let form = info_form(&info, &changes, "abc");
        assert_eq!(form_value(&form, "personaName"), "NeonCrate");
        assert_eq!(form_value(&form, "customURL"), "kernelrogue");
        assert_eq!(form_value(&form, "summary"), "Trading.");
        assert_eq!(form_value(&form, "real_name"), "Ivan");
        assert_eq!(form_value(&form, "country"), "NL");
        assert_eq!(form_value(&form, "city"), "4022");
        assert_eq!(form_value(&form, "sessionID"), "abc");
    }

    #[test]
    fn the_privacy_form_keeps_settings_this_app_doesnt_show() {
        let current = page_data(PRIVACY_PAGE, PRIVACY_MARK).unwrap();
        let (settings, comments) = privacy_form(
            &current,
            Privacy {
                profile: Visibility::Private,
                inventory: Visibility::Public,
                games: Visibility::FriendsOnly,
            },
        )
        .unwrap();
        let settings: Value = serde_json::from_str(&settings).unwrap();
        assert_eq!(settings["PrivacyProfile"], 1);
        assert_eq!(settings["PrivacyInventory"], 3);
        assert_eq!(settings["PrivacyOwnedGames"], 2);
        assert_eq!(settings["PrivacyFriendsList"], 3);
        assert_eq!(settings["PrivacyPlaytime"], 1);
        assert_eq!(comments, "2");
    }

    #[test]
    fn steam_refusals_come_back_in_its_words() {
        assert!(answer(r#"{"success":1,"errmsg":""}"#.to_owned()).is_ok());
        let err = answer(
            r#"{"success":2,"errmsg":"The profile URL you specified is <b>already in use</b>."}"#
                .to_owned(),
        )
        .unwrap_err();
        assert_eq!(
            err.to_string(),
            "Steam said: The profile URL you specified is already in use."
        );
    }
}
