//! Free games any account can play without buying them. Steam adds one to the
//! account when asked, as the client does when Play is pressed on it. They count
//! for playtime, not for card drops: free games drop cards only for money spent
//! in them.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FreeGame {
    pub app_id: u32,
    pub name: &'static str,
}

const fn game(app_id: u32, name: &'static str) -> FreeGame {
    FreeGame { app_id, name }
}

// Free in the store when the list was made. One that stops being free is just
// not added, so a stale entry does no harm.
const FREE_GAMES: &[FreeGame] = &[
    game(730, "Counter-Strike 2"),
    game(570, "Dota 2"),
    game(440, "Team Fortress 2"),
    game(578080, "PUBG: BATTLEGROUNDS"),
    game(2357570, "Overwatch"),
    game(2767030, "Marvel Rivals"),
    game(1172470, "Apex Legends"),
    game(230410, "Warframe"),
    game(1085660, "Destiny 2"),
    game(236390, "War Thunder"),
    game(1407200, "World of Tanks"),
    game(238960, "Path of Exile"),
    game(291550, "Brawlhalla"),
    game(304930, "Unturned"),
    game(444090, "Paladins"),
    game(386360, "SMITE"),
    game(1203220, "NARAKA: BLADEPOINT"),
    game(2073850, "THE FINALS"),
    game(2507950, "Delta Force"),
    game(1599340, "Lost Ark"),
    game(1665460, "eFootball"),
    game(1240440, "Halo Infinite"),
    game(2139460, "Once Human"),
    game(1449850, "Yu-Gi-Oh! Master Duel"),
    game(2923300, "Banana"),
    game(382490, "Relic Hunters Zero: Remix"),
];

pub fn free_games() -> &'static [FreeGame] {
    FREE_GAMES
}

pub fn is_free(app_id: u32) -> bool {
    FREE_GAMES.iter().any(|game| game.app_id == app_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_game_is_listed_once() {
        for (i, game) in FREE_GAMES.iter().enumerate() {
            assert!(
                FREE_GAMES[i + 1..]
                    .iter()
                    .all(|other| other.app_id != game.app_id),
                "{}",
                game.name
            );
        }
    }
}
