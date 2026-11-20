//! Joining public Steam Community groups, a few at a time, like a person who
//! finds them one by one.

use std::thread;
use std::time::Duration;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::random;
use crate::steam::{
    COMMUNITY_URL, SteamError, community_get, community_post, html_unescape, session_id,
    with_session,
};

/// A task can't list more groups than this.
pub const MAX_GROUPS: usize = 100;
// Between two groups joined in one run, in seconds.
const PAUSE: (usize, usize) = (3, 9);

/// A group by the name in its link, or by its 64-bit ID.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GroupLink {
    Name(String),
    Id(u64),
}

impl GroupLink {
    fn url(&self) -> String {
        match self {
            Self::Name(name) => format!("{COMMUNITY_URL}/groups/{name}"),
            Self::Id(id) => format!("{COMMUNITY_URL}/gid/{id}"),
        }
    }
}

/// Reads links like steamcommunity.com/groups/name and /gid/103582791429521412,
/// and bare names. They may be split by spaces, commas or lines. On failure, says
/// which one it couldn't read.
pub fn parse(text: &str) -> Result<Vec<GroupLink>, String> {
    let mut links = Vec::new();
    for word in text
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|word| !word.is_empty())
    {
        let link = parse_one(word).ok_or_else(|| word.to_owned())?;
        if !links.contains(&link) {
            links.push(link);
        }
    }
    Ok(links)
}

fn parse_one(word: &str) -> Option<GroupLink> {
    let parts: Vec<&str> = word
        .split(['/', '?', '#'])
        .filter(|part| !part.is_empty())
        .collect();
    let link = match parts
        .iter()
        .position(|part| *part == "groups" || *part == "gid")
    {
        Some(at) => {
            let value = parts.get(at + 1)?;
            if parts[at] == "gid" {
                GroupLink::Id(value.parse().ok()?)
            } else {
                GroupLink::Name((*value).to_owned())
            }
        }
        // A bare word is a group's name; a link to anything else isn't a group.
        None if parts.len() == 1 && !word.contains('.') => GroupLink::Name(word.to_owned()),
        None => return None,
    };
    let fine = match &link {
        GroupLink::Name(name) => name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'),
        GroupLink::Id(_) => true,
    };
    fine.then_some(link)
}

/// What one run did for an account.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Joined {
    /// The groups' names, as their pages show them.
    pub joined: Vec<String>,
    /// Links that led to no group.
    pub missing: usize,
}

/// Joins up to `count` of the groups, picked at random among the ones the account
/// can join and isn't in yet.
pub fn join(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    groups: &[GroupLink],
    count: usize,
) -> Result<(Session, Joined), SteamError> {
    with_session(account, proxy, |client, session, _| {
        let mut done = Joined::default();
        for group in random::shuffled(groups, &mut random::below) {
            if done.joined.len() >= count {
                break;
            }
            let url = group.url();
            match page_state(&community_get(client, &url)?) {
                Page::Missing => done.missing += 1,
                // In it already, or it only takes requests or invites.
                Page::Closed => {}
                Page::Open(name) => {
                    if !done.joined.is_empty() {
                        thread::sleep(
                            Duration::from_secs(random::between(PAUSE.0, PAUSE.1) as u64),
                        );
                    }
                    join_one(client, session, &url)?;
                    done.joined.push(name);
                }
            }
        }
        Ok(done)
    })
}

fn join_one(client: &Client, session: &Session, url: &str) -> Result<(), SteamError> {
    // The group's form names the session `sessionID`, unlike Steam's other forms.
    let id = session_id(session);
    let page = community_post(
        client,
        url,
        session,
        &[("action", "join"), ("sessionID", &id)],
    )?;
    match page_state(&page) {
        Page::Open(_) => Err(SteamError::Refused("Steam didn't let it join".to_owned())),
        _ => Ok(()),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Page {
    Missing,
    /// Has a join button; holds the group's name.
    Open(String),
    Closed,
}

fn page_state(page: &str) -> Page {
    const TITLE: &str = "<title>Steam Community :: Group :: ";
    let Some(start) = page.find(TITLE).map(|at| at + TITLE.len()) else {
        return Page::Missing;
    };
    let name = page[start..]
        .find("</title>")
        .map(|end| html_unescape(page[start..start + end].trim()))
        .unwrap_or_default();
    // Groups that take requests have the same form with another action.
    let join_form = page
        .find("id=\"join_group_form\"")
        .map(|at| &page[at..])
        .and_then(|form| form.find("</form>").map(|end| &form[..end]));
    match join_form {
        Some(form) if form.contains("name=\"action\" value=\"join\"") => Page::Open(name),
        _ => Page::Closed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OPEN: &str = r#"<title>Steam Community :: Group :: Steam Client Beta</title>
        <form name="join_group_form" id="join_group_form" method="POST" action="https://steamcommunity.com/groups/SteamClientBeta">
            <input type="hidden" name="action" value="join">
            <input type="hidden" name="sessionID" value="007a10a5e6910dba87caeb49">
        </form>"#;

    #[test]
    fn links_and_names_are_read() {
        assert_eq!(
            parse(
                "https://steamcommunity.com/groups/SteamClientBeta/, gid/103582791429521412\n\
                 csgo_trade steamcommunity.com/groups/SteamClientBeta?l=russian"
            ),
            Ok(vec![
                GroupLink::Name("SteamClientBeta".to_owned()),
                GroupLink::Id(103582791429521412),
                GroupLink::Name("csgo_trade".to_owned()),
            ])
        );
        assert_eq!(
            parse("store.steampowered.com/app/440"),
            Err("store.steampowered.com/app/440".to_owned())
        );
        assert_eq!(parse("gid/abc"), Err("gid/abc".to_owned()));
        assert_eq!(parse("bad<name>"), Err("bad<name>".to_owned()));
    }

    #[test]
    fn the_page_says_whether_it_can_be_joined() {
        assert_eq!(page_state(OPEN), Page::Open("Steam Client Beta".to_owned()));
        let member = "<title>Steam Community :: Group :: Steam Client Beta</title>";
        assert_eq!(page_state(member), Page::Closed);
        let requests = OPEN.replace("value=\"join\"", "value=\"request\"");
        assert_eq!(page_state(&requests), Page::Closed);
        let missing = "<title>Steam Community :: Error</title>No group could be retrieved";
        assert_eq!(page_state(missing), Page::Missing);
    }

    #[test]
    fn names_are_unescaped() {
        let page = "<title>Steam Community :: Group :: Tom &amp; Jerry</title>";
        assert_eq!(page_state(page), Page::Closed);
        let page = OPEN.replace("Steam Client Beta", "Tom &amp; Jerry");
        assert_eq!(page_state(&page), Page::Open("Tom & Jerry".to_owned()));
    }
}
