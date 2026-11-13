use serde::{Deserialize, Serialize};

use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, community_get, with_session, xml_tag};

const NEW_ACCOUNT_DAYS: u64 = 30;
const DAY_SECS: u64 = 24 * 60 * 60;

/// What Steam shows about the other side of a trade, and what looks wrong with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerCheck {
    pub name: Option<String>,
    /// Days since the account was made, when the profile shows it.
    pub age_days: Option<u64>,
    pub level: Option<u32>,
    pub warnings: Vec<Warning>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Warning {
    NewAccount {
        days: u64,
    },
    NoLevel,
    VacBanned,
    TradeBanned,
    TradeProbation,
    /// A private profile hides its age and history, which scammers count on.
    PrivateProfile,
    /// Its nickname matches someone else the user trades with: the classic swap,
    /// where the fake sends a counter-offer or asks for the items "back".
    CopiesName {
        of: String,
    },
}

/// Someone the user already knows by name: another partner or an own account.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Known {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct Profile {
    name: Option<String>,
    member_since: Option<String>,
    private: bool,
    vac_banned: bool,
    trade_ban: Option<String>,
}

#[derive(Deserialize)]
struct MiniProfile {
    level: Option<u32>,
}

/// Looks the partner up and weighs what it finds against the people in `known`.
pub fn check(
    account: &Account,
    proxy: Option<&ProxyAddress>,
    partner_id: &str,
    known: &[Known],
    now: u64,
) -> Result<(Session, PartnerCheck), SteamError> {
    let id: u64 = partner_id
        .parse()
        .map_err(|_| SteamError::Steam("unknown trade partner".to_owned()))?;
    with_session(account, proxy, |client, _, _| {
        let page = community_get(
            client,
            &format!("https://steamcommunity.com/profiles/{id}/?xml=1"),
        )?;
        let profile = parse_profile(&page);
        let level = community_get(
            client,
            &format!(
                "https://steamcommunity.com/miniprofile/{}/json",
                id & 0xFFFF_FFFF
            ),
        )
        .ok()
        .and_then(|body| serde_json::from_str::<MiniProfile>(&body).ok())
        .and_then(|mini| mini.level);
        Ok(assess(profile, level, partner_id, known, now))
    })
}

fn assess(
    profile: Profile,
    level: Option<u32>,
    partner_id: &str,
    known: &[Known],
    now: u64,
) -> PartnerCheck {
    let age_days = profile
        .member_since
        .as_deref()
        .and_then(unix_date)
        .map(|made| now.saturating_sub(made) / DAY_SECS);
    let mut warnings = Vec::new();
    if let Some(days) = age_days.filter(|&days| days < NEW_ACCOUNT_DAYS) {
        warnings.push(Warning::NewAccount { days });
    }
    if level == Some(0) {
        warnings.push(Warning::NoLevel);
    }
    if profile.vac_banned {
        warnings.push(Warning::VacBanned);
    }
    match profile.trade_ban.as_deref() {
        Some("Banned") => warnings.push(Warning::TradeBanned),
        Some("Probation") => warnings.push(Warning::TradeProbation),
        _ => {}
    }
    if profile.private {
        warnings.push(Warning::PrivateProfile);
    }
    if let Some(name) = &profile.name {
        let mine = same_name_key(name);
        if let Some(copied) = known
            .iter()
            .find(|known| known.id != partner_id && same_name_key(&known.name) == mine)
        {
            warnings.push(Warning::CopiesName {
                of: copied.name.clone(),
            });
        }
    }
    PartnerCheck {
        name: profile.name,
        age_days,
        level,
        warnings,
    }
}

/// Names that look alike to a person map to the same key: case, spaces and the
/// usual look-alike characters don't count.
fn same_name_key(name: &str) -> String {
    name.chars()
        .filter(|c| !c.is_whitespace() && *c != '\u{200b}')
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            '0' | 'о' => 'o',
            '1' | 'l' | 'і' | '|' => 'i',
            'а' => 'a',
            'е' => 'e',
            'с' => 'c',
            'р' => 'p',
            'х' => 'x',
            'у' => 'y',
            c => c,
        })
        .collect()
}

fn parse_profile(page: &str) -> Profile {
    let tag = |name: &str| xml_tag(page, name);
    Profile {
        name: tag("steamID"),
        member_since: tag("memberSince"),
        private: tag("privacyState").is_some_and(|state| state != "public"),
        vac_banned: tag("vacBanned").as_deref() == Some("1"),
        trade_ban: tag("tradeBanState").filter(|state| state != "None"),
    }
}

/// Midnight UTC of a date the way Steam writes it on profiles, "March 3, 2021".
fn unix_date(text: &str) -> Option<u64> {
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let (month, rest) = text.trim().split_once(' ')?;
    let (day, year) = rest.split_once(',')?;
    let month = MONTHS.iter().position(|name| *name == month)? as u64 + 1;
    let day: u64 = day.trim().parse().ok()?;
    let year: u64 = year.trim().parse().ok()?;
    if !(1..=31).contains(&day) || year < 1970 {
        return None;
    }
    // Days from the civil date, after Howard Hinnant's algorithm.
    let (y, m) = if month <= 2 {
        (year - 1, month + 9)
    } else {
        (year, month - 3)
    };
    let era = y / 400;
    let year_of_era = y - era * 400;
    let day_of_year = (153 * m + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let days = era * 146_097 + day_of_era;
    Some((days - 719_468) * DAY_SECS)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_700_000_000; // 14 November 2023

    fn known(id: &str, name: &str) -> Known {
        Known {
            id: id.to_owned(),
            name: name.to_owned(),
        }
    }

    #[test]
    fn reads_the_profile_xml() {
        let page = r#"<profile><steamID><![CDATA[n1ck &amp; co]]></steamID>
            <privacyState>public</privacyState><vacBanned>1</vacBanned>
            <tradeBanState>Probation</tradeBanState>
            <memberSince>March 3, 2021</memberSince></profile>"#;
        assert_eq!(
            parse_profile(page),
            Profile {
                name: Some("n1ck & co".to_owned()),
                member_since: Some("March 3, 2021".to_owned()),
                private: false,
                vac_banned: true,
                trade_ban: Some("Probation".to_owned()),
            }
        );
    }

    #[test]
    fn dates_are_read_as_steam_writes_them() {
        assert_eq!(unix_date("January 1, 1970"), Some(0));
        assert_eq!(unix_date("November 14, 2023"), Some(1_699_920_000));
        assert_eq!(unix_date("February 29, 2024"), Some(1_709_164_800));
        assert_eq!(unix_date("Sometime, 2021"), None);
    }

    #[test]
    fn a_fresh_account_copying_a_partner_is_flagged() {
        let profile = Profile {
            name: Some("Kernel R".to_owned()),
            member_since: Some("November 11, 2023".to_owned()),
            ..Profile::default()
        };
        let check = assess(
            profile,
            Some(0),
            "2",
            &[known("1", "kernel r"), known("3", "someone")],
            NOW,
        );
        assert_eq!(check.age_days, Some(3));
        assert_eq!(
            check.warnings,
            [
                Warning::NewAccount { days: 3 },
                Warning::NoLevel,
                Warning::CopiesName {
                    of: "kernel r".to_owned()
                },
            ]
        );
    }

    #[test]
    fn the_real_partner_is_not_its_own_copy() {
        let profile = Profile {
            name: Some("Kernel R".to_owned()),
            member_since: Some("March 3, 2015".to_owned()),
            ..Profile::default()
        };
        let check = assess(profile, Some(12), "1", &[known("1", "Kernel R")], NOW);
        assert!(check.warnings.is_empty());
    }

    #[test]
    fn look_alike_letters_count_as_the_same() {
        assert_eq!(same_name_key("Lootify Bot"), same_name_key("1ootify bot"));
        // A Cyrillic "о" in place of the Latin one.
        assert_eq!(same_name_key("bot01"), same_name_key("bоt01"));
        assert_ne!(same_name_key("bot01"), same_name_key("bot02"));
    }

    #[test]
    fn a_private_profile_has_no_age_but_a_warning() {
        let page = "<profile><steamID>x</steamID><privacyState>private</privacyState></profile>";
        let check = assess(parse_profile(page), None, "2", &[], NOW);
        assert_eq!(check.age_days, None);
        assert_eq!(check.warnings, [Warning::PrivateProfile]);
    }
}
