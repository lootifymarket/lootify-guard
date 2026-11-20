//! Joining public Steam Community groups, a few at a time, like a person who
//! finds them one by one.

use std::collections::HashSet;
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
    /// The group's page.
    pub fn url(&self) -> String {
        match self {
            Self::Name(name) => format!("{COMMUNITY_URL}/groups/{name}"),
            Self::Id(id) => format!("{COMMUNITY_URL}/gid/{id}"),
        }
    }
}

/// Public groups many players are in, by the name in their links: teams, leagues,
/// games and Steam's own. Each was looked up on Steam, and joins without a request.
pub const POPULAR: &[&str] = &[
    // Steam.
    "steamuniverse",
    "SteamClientBeta",
    "SteamDB",
    "community_market",
    "steambroadcasting",
    "SteamMobileApp",
    "steamfamilies",
    "summersaliens",
    "gaben",
    // Teams and players.
    "Natus-Vincere",
    "oficalnavijunior",
    "Fnatic",
    "fnaticteam",
    "g2esports-official",
    "virtusprofessional",
    "cs2astralis",
    "offSPIRIT",
    "FaZe_CSGO",
    "Team_Liquid_Pro",
    "C9gaming-",
    "teamcloud9cs",
    "mouz33",
    "mousesports",
    "NIPGaming",
    "ninjasinpyjamasgaming",
    "big",
    "eternalfiredream",
    "Officialteamvitality",
    "TheMongolz",
    "tylooteams",
    "tyloo",
    "ezforence",
    "ogcsgofans",
    "1TapElite",
    "kennySchrub",
    "ZywooPEEK",
    "m0NESYofficial",
    "ohnePixel",
    "ceh9tv",
    // Leagues and stats.
    "FACEITcom",
    "esl",
    "eslcs",
    "ESEA",
    "HLTV",
    "CCSGO",
    "pglromania",
    "esl_dota2",
    "UGCLeague",
    "tfcompetitive",
    "dotabuff",
    "cybershokesteam",
    // Trading.
    "csmoneytrade",
    "CsDealsOfficial",
    "tradeitgg",
    "skinsmonkey",
    "dota2lounge",
    "tf2scrap",
    "csgoexchange",
    // Games.
    "gmod",
    "fp",
    "Facepunch",
    "TF2_group",
    "TF",
    "Terraria_Online",
    "terraria",
    "mta",
    "counterssa",
    "officialcsp",
    "cs-go-fr",
    "TRCS2",
    "cs2women",
    "Star__Citizen",
    "dayzunderground",
    "asciiartamalgamation",
    // Servers.
    "gfl_css",
    "UKCS",
    "intoxgaming",
    "Icefuse-Networks",
    "FireGamesNetworkCSGO",
    "-iNET-",
    "werwolfgaming",
    "warbanditsgg",
    "bestrustservers",
    "rustacademynet",
    "rustyremains",
    "LimitlessRustServer",
    "PixieRust",
    "ace-rust",
    "dope_rust",
    "survivorsrust",
    "andysolam",
    "immense-csgo",
    "vf4freeze",
    "vaultf4",
    "LotusEU",
    "TheBattleGrounds",
    "ALTFS",
    "WOTF2",
    "xxlgamersdotnet",
    "RunAwayGaming",
];

/// The built-in groups, as links to show and edit.
pub fn popular() -> Vec<GroupLink> {
    POPULAR
        .iter()
        .map(|name| GroupLink::Name((*name).to_owned()))
        .collect()
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
    /// Groups it asked to join that Steam answered with an error.
    pub refused: Vec<String>,
    /// Links that led to no group.
    pub missing: usize,
}

/// Joins up to `count` of the groups, picked at random among the ones the account
/// can join and isn't in yet. What it's in comes from the account's own list of
/// groups, as the group's page shows a join button to members too. That list
/// lags a few minutes behind, so a join is judged by Steam's answer to it.
pub fn join(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    groups: &[GroupLink],
    count: usize,
) -> Result<(Session, Joined), SteamError> {
    with_session(account, proxy, |client, session, steam_id| {
        let member_of = memberships(client, steam_id)?;
        let mut done = Joined::default();
        for group in random::shuffled(groups, &mut random::below) {
            if done.joined.len() + done.refused.len() >= count {
                break;
            }
            if let GroupLink::Id(id) = group
                && member_of.contains(&id)
            {
                continue;
            }
            let url = group.url();
            match page_state(&community_get(client, &url)?) {
                Page::Missing => done.missing += 1,
                // It only takes requests or invites.
                Page::Closed => {}
                Page::Open { id, .. } if member_of.contains(&id) => {}
                Page::Open { name, .. } => {
                    if !done.joined.is_empty() || !done.refused.is_empty() {
                        thread::sleep(
                            Duration::from_secs(random::between(PAUSE.0, PAUSE.1) as u64),
                        );
                    }
                    if join_one(client, session, &url)? {
                        done.joined.push(name);
                    } else {
                        done.refused.push(name);
                    }
                }
            }
        }
        Ok(done)
    })
}

/// The IDs of the groups the account is in, from its profile's XML.
fn memberships(client: &Client, steam_id: u64) -> Result<HashSet<u64>, SteamError> {
    let page = community_get(
        client,
        &format!("{COMMUNITY_URL}/profiles/{steam_id}/?xml=1"),
    )?;
    Ok(group_ids(&page))
}

fn group_ids(page: &str) -> HashSet<u64> {
    page.split("<groupID64>")
        .skip(1)
        .filter_map(|rest| rest.split('<').next()?.trim().parse().ok())
        .collect()
}

/// Whether Steam took the join: it answers with the group's page, or its error page.
fn join_one(client: &Client, session: &Session, url: &str) -> Result<bool, SteamError> {
    // The group's form names the session `sessionID`, unlike Steam's other forms.
    let id = session_id(session);
    let page = community_post(
        client,
        url,
        session,
        &[("action", "join"), ("sessionID", &id)],
    )?;
    Ok(page_state(&page) != Page::Missing)
}

#[derive(Debug, PartialEq, Eq)]
enum Page {
    Missing,
    /// Has a join button, which members see too; holds the group's name and ID.
    Open {
        name: String,
        id: u64,
    },
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
    // The page names the group by its ID in its comment thread and its chat button.
    let id = ["Clan_", "OpenGroupChat( '"].into_iter().find_map(|mark| {
        page.split(mark).skip(1).find_map(|rest| {
            let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
            digits.parse::<u64>().ok()
        })
    });
    // Groups that take requests have the same form with another action.
    let join_form = page
        .find("id=\"join_group_form\"")
        .map(|at| &page[at..])
        .and_then(|form| form.find("</form>").map(|end| &form[..end]));
    match (join_form, id) {
        (Some(form), Some(id)) if form.contains("name=\"action\" value=\"join\"") => {
            Page::Open { name, id }
        }
        _ => Page::Closed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OPEN: &str = r#"<title>Steam Community :: Group :: Steam Client Beta</title>
        <div id="commentthread_Clan_103582791433918461_pagecontrols"></div>
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
        assert_eq!(
            page_state(OPEN),
            Page::Open {
                name: "Steam Client Beta".to_owned(),
                id: 103582791433918461
            }
        );
        let member = "<title>Steam Community :: Group :: Steam Client Beta</title>";
        assert_eq!(page_state(member), Page::Closed);
        let requests = OPEN.replace("value=\"join\"", "value=\"request\"");
        assert_eq!(page_state(&requests), Page::Closed);
        let no_comments = OPEN.replace(
            r#"<div id="commentthread_Clan_103582791433918461_pagecontrols"></div>"#,
            r#"<div class="joinchat_bg" onclick="OpenGroupChat( '103582791433918461' )"></div>"#,
        );
        assert!(matches!(
            page_state(&no_comments),
            Page::Open {
                id: 103582791433918461,
                ..
            }
        ));
        let missing = "<title>Steam Community :: Error</title>No group could be retrieved";
        assert_eq!(page_state(missing), Page::Missing);
    }

    #[test]
    fn the_popular_groups_read_back_and_fit_a_task() {
        assert!(POPULAR.len() <= MAX_GROUPS);
        let links: Vec<String> = popular().iter().map(GroupLink::url).collect();
        assert_eq!(parse(&links.join("\n")), Ok(popular()));
    }

    #[test]
    fn a_profile_lists_its_groups_by_id() {
        let xml = r#"<groups><group isPrimary="1"><groupID64>103582791434298690</groupID64>
            <groupURL><![CDATA[SteamDB]]></groupURL></group>
            <group isPrimary="0"><groupID64>103582791430626789</groupID64></group></groups>"#;
        assert_eq!(
            group_ids(xml),
            HashSet::from([103582791434298690, 103582791430626789])
        );
        assert!(group_ids("<profile></profile>").is_empty());
    }

    #[test]
    fn names_are_unescaped() {
        let page = "<title>Steam Community :: Group :: Tom &amp; Jerry</title>";
        assert_eq!(page_state(page), Page::Closed);
        let page = OPEN.replace("Steam Client Beta", "Tom &amp; Jerry");
        assert_eq!(
            page_state(&page),
            Page::Open {
                name: "Tom & Jerry".to_owned(),
                id: 103582791433918461
            }
        );
    }
}
