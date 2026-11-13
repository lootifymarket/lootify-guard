use serde::Serialize;

use crate::cm::MAX_GAMES;
use crate::contents::{Account, Session};
use crate::proxy::ProxyAddress;
use crate::steam::{SteamError, community_get, html_unescape, with_session};

// Steam drops cards only for a game played on its own, once it has this much
// playtime; before that, games build it up together.
const HOURS_BEFORE_DROPS: f32 = 2.0;
// Hundreds of games fit in a few pages; this only stops a page that loops.
const MAX_PAGES: u32 = 50;

/// A game that still has trading cards to drop for the account.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardGame {
    pub app_id: u32,
    pub name: String,
    pub drops: u32,
    pub hours: f32,
}

/// The account's games with card drops left, read from its badges pages.
pub fn games_with_drops(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<(Session, Vec<CardGame>), SteamError> {
    with_session(account, proxy, |client, _, steam_id| {
        let mut games = Vec::new();
        let mut page = 1;
        loop {
            // In English, so the words the page is read by are always the same.
            let url = format!(
                "https://steamcommunity.com/profiles/{steam_id}/badges/?l=english&p={page}"
            );
            let html = community_get(client, &url)?;
            games.extend(read_page(&html).into_iter().filter(|game| game.drops > 0));
            if page >= last_page(&html).min(MAX_PAGES) {
                return Ok(games);
            }
            page += 1;
        }
    })
}

/// Which games to play next: those still short of the playtime drops need, all
/// together, until there are none; then one at a time, most drops first.
pub fn next_to_play(games: &[CardGame]) -> Vec<u32> {
    match games
        .iter()
        .filter(|game| game.hours >= HOURS_BEFORE_DROPS)
        .max_by_key(|game| game.drops)
    {
        Some(game) => vec![game.app_id],
        None => games
            .iter()
            .take(MAX_GAMES)
            .map(|game| game.app_id)
            .collect(),
    }
}

fn read_page(html: &str) -> Vec<CardGame> {
    html.split("class=\"badge_row is_link\"")
        .skip(1)
        .filter_map(read_row)
        .collect()
}

fn read_row(row: &str) -> Option<CardGame> {
    // Badges that aren't for a game have no card page.
    let app_id = row
        .split("/gamecards/")
        .nth(1)?
        .split(|c: char| !c.is_ascii_digit())
        .next()?
        .parse()
        .ok()?;
    let drops_text = text_after(row, "class=\"progress_info_bold\">").unwrap_or_default();
    let drops = drops_text
        .split_whitespace()
        .next()
        .and_then(|word| word.parse().ok())
        .unwrap_or(0);
    let hours = text_after(row, "class=\"badge_title_stats_playtime\">")
        .and_then(|text| {
            text.split_whitespace()
                .next()
                .map(|hours| hours.replace(',', ""))
        })
        .and_then(|hours| hours.parse().ok())
        .unwrap_or(0.0);
    let name = text_after(row, "class=\"badge_title\">")
        .map(|name| name.trim().to_owned())
        .unwrap_or_default();
    Some(CardGame {
        app_id,
        name,
        drops,
        hours,
    })
}

/// The text from after `mark` up to the next tag, unescaped, with Steam's
/// non-breaking spaces as plain ones.
fn text_after(html: &str, mark: &str) -> Option<String> {
    let start = html.find(mark)? + mark.len();
    let text = html[start..].split('<').next()?;
    Some(
        html_unescape(&text.replace("&nbsp;", " "))
            .trim()
            .to_owned(),
    )
}

fn last_page(html: &str) -> u32 {
    html.split("class=\"pagelink\"")
        .skip(1)
        .filter_map(|link| {
            link.split("?p=")
                .nth(1)?
                .split(|c: char| !c.is_ascii_digit())
                .next()?
                .parse()
                .ok()
        })
        .max()
        .unwrap_or(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = r#"
        <div class="badge_row is_link">
            <a class="badge_row_overlay" href="https://steamcommunity.com/profiles/1/gamecards/730/"></a>
            <div class="badge_title">
                Counter-Strike 2&nbsp;<span class="badge_view_details">View details</span>
            </div>
            <div class="badge_title_stats_playtime">&nbsp;1,024.5 hrs on record</div>
            <span class="progress_info_bold">3 card drops remaining</span>
        </div>
        <div class="badge_row is_link">
            <a class="badge_row_overlay" href="https://steamcommunity.com/profiles/1/gamecards/440/"></a>
            <div class="badge_title">Team Fortress 2&nbsp;<span>View details</span></div>
            <span class="progress_info_bold">No card drops remaining</span>
        </div>
        <div class="badge_row is_link">
            <a class="badge_row_overlay" href="https://steamcommunity.com/profiles/1/badges/13/"></a>
            <div class="badge_title">Years of Service</div>
        </div>
        <div class="pageLinks">
            <a class="pagelink" href="?p=2">2</a> <a class="pagelink" href="?p=3">3</a>
        </div>
    "#;

    #[test]
    fn badge_rows_are_read() {
        assert_eq!(
            read_page(PAGE),
            [
                CardGame {
                    app_id: 730,
                    name: "Counter-Strike 2".to_owned(),
                    drops: 3,
                    hours: 1024.5,
                },
                CardGame {
                    app_id: 440,
                    name: "Team Fortress 2".to_owned(),
                    drops: 0,
                    hours: 0.0,
                },
            ]
        );
        assert_eq!(last_page(PAGE), 3);
        assert_eq!(last_page("<p>no links</p>"), 1);
    }

    fn game(app_id: u32, drops: u32, hours: f32) -> CardGame {
        CardGame {
            app_id,
            name: String::new(),
            drops,
            hours,
        }
    }

    #[test]
    fn games_build_hours_together_then_drop_one_by_one() {
        assert_eq!(next_to_play(&[game(1, 2, 0.5), game(2, 4, 1.0)]), [1, 2]);
        assert_eq!(
            next_to_play(&[game(1, 2, 0.5), game(2, 1, 3.0), game(3, 4, 2.0)]),
            [3]
        );
        let many: Vec<CardGame> = (0..40).map(|id| game(id, 1, 0.0)).collect();
        assert_eq!(next_to_play(&many).len(), MAX_GAMES);
        assert!(next_to_play(&[]).is_empty());
    }
}
