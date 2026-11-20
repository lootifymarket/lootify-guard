//! Profile descriptions put together from pieces, so a group of accounts gets texts
//! that differ in their words, their order and their look, not just in a name.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::description_pools::{
    ARTS, BULLETS, DIVIDERS, KAOMOJI, QUOTE_MARKS, Words, english, russian,
};
use crate::random::{self, shuffled};

/// A part of a generated description. Dividers go between the others.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Piece {
    Greeting,
    About,
    Games,
    Status,
    Quote,
    TradeNote,
    Ascii,
    Kaomoji,
    Divider,
}

const PIECES: [Piece; 9] = [
    Piece::Greeting,
    Piece::About,
    Piece::Games,
    Piece::Status,
    Piece::Quote,
    Piece::TradeNote,
    Piece::Ascii,
    Piece::Kaomoji,
    Piece::Divider,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Language {
    /// Each account gets one of the others.
    Mixed,
    English,
    Russian,
}

/// How many pieces a description has, dividers aside.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Length {
    Short,
    Medium,
    Long,
}

impl Length {
    fn pieces(self) -> (usize, usize) {
        match self {
            Self::Short => (1, 2),
            Self::Medium => (3, 4),
            Self::Long => (5, 7),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", tag = "mode")]
pub enum DescriptionSource {
    Generate {
        pieces: Vec<Piece>,
        language: Language,
        length: Length,
    },
    /// The user's own descriptions, one a line. `{a|b}` picks one of the options,
    /// `{country}` a country and `{n}` the account's place in the task.
    Lines { lines: String },
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum DescriptionError {
    #[error("pick at least one piece besides dividers")]
    NoPieces,
    #[error("add at least one line")]
    NoLines,
}

// A new text is made this many times before one already given is let through,
// which only happens when the options are few.
const TRIES: usize = 50;

/// One description for each of `count` accounts, no two the same while the options
/// allow it. The one at index `i` is for the account at place `i + 1`.
pub fn for_accounts(
    source: &DescriptionSource,
    count: usize,
) -> Result<Vec<String>, DescriptionError> {
    many(source, count, &mut random::below)
}

fn many(
    source: &DescriptionSource,
    count: usize,
    pick: &mut impl FnMut(usize) -> usize,
) -> Result<Vec<String>, DescriptionError> {
    let maker = Maker::new(source)?;
    let mut given = HashSet::new();
    Ok((1..=count)
        .map(|place| {
            let mut text = maker.make(place, pick);
            for _ in 1..TRIES {
                if !given.contains(&text) {
                    break;
                }
                text = maker.make(place, pick);
            }
            given.insert(text.clone());
            text
        })
        .collect())
}

enum Maker<'a> {
    Generate {
        pieces: Vec<Piece>,
        dividers: bool,
        language: Language,
        length: Length,
    },
    Lines(Vec<&'a str>),
}

impl<'a> Maker<'a> {
    fn new(source: &'a DescriptionSource) -> Result<Self, DescriptionError> {
        match source {
            DescriptionSource::Generate {
                pieces,
                language,
                length,
            } => {
                // In one order whatever order they came in, so the same choice
                // always makes the same kind of text.
                let chosen: Vec<Piece> = PIECES
                    .into_iter()
                    .filter(|piece| *piece != Piece::Divider && pieces.contains(piece))
                    .collect();
                if chosen.is_empty() {
                    return Err(DescriptionError::NoPieces);
                }
                Ok(Self::Generate {
                    pieces: chosen,
                    dividers: pieces.contains(&Piece::Divider),
                    language: *language,
                    length: *length,
                })
            }
            DescriptionSource::Lines { lines } => {
                let lines: Vec<&str> = lines
                    .lines()
                    .map(str::trim)
                    .filter(|line| !line.is_empty())
                    .collect();
                if lines.is_empty() {
                    return Err(DescriptionError::NoLines);
                }
                Ok(Self::Lines(lines))
            }
        }
    }

    fn make(&self, place: usize, pick: &mut impl FnMut(usize) -> usize) -> String {
        match self {
            Self::Generate {
                pieces,
                dividers,
                language,
                length,
            } => {
                let words = match language {
                    Language::English => english(),
                    Language::Russian => russian(),
                    Language::Mixed if pick(2) == 0 => english(),
                    Language::Mixed => russian(),
                };
                generate(pieces, *dividers, *length, words, pick)
            }
            Self::Lines(lines) => {
                let line = lines[pick(lines.len())];
                // A line in Russian wants its countries in Russian too.
                let words = if line.chars().any(is_cyrillic) {
                    russian()
                } else {
                    english()
                };
                let line = line.replace("{n}", &place.to_string());
                spin(&with_countries(&line, words, pick), pick)
            }
        }
    }
}

/// How the lines of one description are joined.
#[derive(Clone, Copy)]
enum Gaps {
    Single,
    Double,
    Mixed,
}

/// How the words of one description are cased.
#[derive(Clone, Copy)]
enum Case {
    AsWritten,
    Sentence,
    Lower,
}

fn generate(
    pieces: &[Piece],
    dividers: bool,
    length: Length,
    words: &Words,
    pick: &mut impl FnMut(usize) -> usize,
) -> String {
    let (least, most) = length.pieces();
    let count = (least + pick(most - least + 1)).min(pieces.len());
    let mut chosen = shuffled(pieces, pick);
    chosen.truncate(count);
    arrange(&mut chosen, pick);

    let case = [Case::AsWritten, Case::Sentence, Case::Lower][pick(3)];
    // Bullets only look like a list with a few lines to go on.
    let bullet = (chosen.len() >= 3 && pick(4) == 0).then(|| BULLETS[pick(BULLETS.len())]);
    let mut lines: Vec<String> = Vec::new();
    for piece in chosen {
        match piece {
            Piece::Ascii => lines.push(spin(ARTS[pick(ARTS.len())], pick)),
            Piece::Kaomoji => {
                let face = KAOMOJI[pick(KAOMOJI.len())];
                // A face reads as well at the end of a line as on its own.
                match lines.last_mut() {
                    Some(last) if pick(2) == 0 => {
                        last.push(' ');
                        last.push_str(face);
                    }
                    _ => lines.push(face.to_owned()),
                }
            }
            piece => {
                let text = match piece {
                    Piece::Quote => quote(words, pick),
                    piece => {
                        let pool = words.pool(piece);
                        tidy(&spin(
                            &with_countries(pool[pick(pool.len())], words, pick),
                            pick,
                        ))
                    }
                };
                let text = cased(&text, case);
                lines.push(match bullet {
                    Some(bullet) => format!("{bullet}{text}"),
                    None => text,
                });
            }
        }
    }

    let divider = (dividers && lines.len() > 1).then(|| DIVIDERS[pick(DIVIDERS.len())]);
    let gaps = [Gaps::Single, Gaps::Double, Gaps::Mixed][pick(3)];
    let mut text = String::new();
    for (index, line) in lines.iter().enumerate() {
        if index > 0 {
            match (divider, gaps) {
                (Some(divider), _) if pick(3) == 0 => {
                    text.push('\n');
                    text.push_str(divider);
                    text.push('\n');
                }
                (_, Gaps::Single) => text.push('\n'),
                (_, Gaps::Double) => text.push_str("\n\n"),
                (_, Gaps::Mixed) => text.push_str(if pick(2) == 0 { "\n" } else { "\n\n" }),
            }
        }
        text.push_str(line);
    }
    text
}

/// A greeting opens, a trade note mostly closes, and art sits at either end.
fn arrange(pieces: &mut [Piece], pick: &mut impl FnMut(usize) -> usize) {
    let art_first = pick(2) == 0;
    let note_last = pick(10) < 7;
    pieces.sort_by_key(|piece| match piece {
        Piece::Greeting => 1,
        Piece::Ascii if art_first => 0,
        Piece::Ascii => 4,
        Piece::TradeNote if note_last => 3,
        _ => 2,
    });
}

fn quote(words: &Words, pick: &mut impl FnMut(usize) -> usize) -> String {
    let saying = words.quotes[pick(words.quotes.len())];
    let (open, close) = QUOTE_MARKS[pick(QUOTE_MARKS.len())];
    let mut text = format!("{open}{saying}{close}");
    if pick(4) == 0 {
        let by = spin(words.quote_by, pick);
        text.push_str(if pick(2) == 0 { " " } else { "\n" });
        text.push_str(&by);
    }
    text
}

fn with_countries(text: &str, words: &Words, pick: &mut impl FnMut(usize) -> usize) -> String {
    let mut out = text.to_owned();
    while let Some(at) = out.find("{country}") {
        let country = words.countries[pick(words.countries.len())];
        out.replace_range(at..at + "{country}".len(), country);
    }
    out
}

/// Picks one option of every `{a|b|c}`, the inner ones first. A brace without its
/// pair stays as it is.
fn spin(text: &str, pick: &mut impl FnMut(usize) -> usize) -> String {
    // Each open brace holds the options read so far, the last one still growing.
    let mut open: Vec<Vec<String>> = Vec::new();
    let mut out = String::new();
    for c in text.chars() {
        match c {
            '{' => open.push(vec![String::new()]),
            '|' if !open.is_empty() => open.last_mut().unwrap().push(String::new()),
            '}' if !open.is_empty() => {
                let options = open.pop().unwrap();
                let chosen = &options[pick(options.len())];
                match open.last_mut() {
                    Some(outer) => outer.last_mut().unwrap().push_str(chosen),
                    None => out.push_str(chosen),
                }
            }
            c => match open.last_mut() {
                Some(outer) => outer.last_mut().unwrap().push(c),
                None => out.push(c),
            },
        }
    }
    // Braces never closed are given back as they were typed.
    for options in open {
        out.push('{');
        out.push_str(&options.join("|"));
    }
    out
}

/// Options left out leave double spaces and spaces before punctuation behind.
fn tidy(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.trim().chars() {
        if c == ' ' && out.ends_with(' ') {
            continue;
        }
        if matches!(c, ',' | '.' | '!' | '?' | ')') && out.ends_with(' ') {
            out.pop();
        }
        out.push(c);
    }
    out
}

fn cased(text: &str, case: Case) -> String {
    match case {
        Case::AsWritten => text.to_owned(),
        Case::Lower => text.to_lowercase(),
        Case::Sentence => {
            let mut chars = text.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().chain(chars).collect())
                .unwrap_or_default()
        }
    }
}

fn is_cyrillic(c: char) -> bool {
    matches!(c, '\u{0400}'..='\u{04FF}')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::description_pools::{english, russian};

    fn generate_with(pieces: &[Piece], language: Language, length: Length) -> DescriptionSource {
        DescriptionSource::Generate {
            pieces: pieces.to_vec(),
            language,
            length,
        }
    }

    #[test]
    fn options_are_picked_inside_out() {
        let mut first = |_| 0;
        assert_eq!(spin("{hey|hi} {there|}", &mut first), "hey there");
        let mut last = |below: usize| below - 1;
        assert_eq!(spin("{hey|hi} {there|}", &mut last), "hi ");
        assert_eq!(spin("{a {b|c}|d}", &mut first), "a b");
    }

    #[test]
    fn a_lone_brace_stays() {
        let mut first = |_| 0;
        assert_eq!(spin("a } b", &mut first), "a } b");
        assert_eq!(spin("a {b|c", &mut first), "a {b|c");
        assert_eq!(spin("a | b", &mut first), "a | b");
    }

    #[test]
    fn leftover_spaces_are_tidied() {
        assert_eq!(
            tidy(" just  a player , from Spain ."),
            "just a player, from Spain."
        );
    }

    #[test]
    fn every_template_spins_clean() {
        let mut picks: [fn(usize) -> usize; 2] = [|_| 0, |below| below - 1];
        for words in [english(), russian()] {
            for piece in [
                Piece::Greeting,
                Piece::About,
                Piece::Games,
                Piece::Status,
                Piece::TradeNote,
            ] {
                for template in words.pool(piece) {
                    for pick in &mut picks {
                        let text = spin(&with_countries(template, words, pick), pick);
                        assert!(!text.contains(['{', '}', '|']), "{template} left {text}");
                        assert!(!tidy(&text).is_empty(), "{template} can come out empty");
                    }
                }
            }
            for saying in words.quotes {
                assert!(!saying.contains(['{', '}', '|']), "{saying}");
            }
            for pick in &mut picks {
                assert!(!spin(words.quote_by, pick).contains(['{', '}']));
            }
        }
        for art in ARTS {
            for pick in &mut picks {
                assert!(!spin(art, pick).contains(['{', '}']), "{art}");
            }
        }
    }

    #[test]
    fn art_needs_no_spaces_to_line_up() {
        // Steam's page squeezes runs of spaces, so art mustn't lean on them.
        for art in ARTS.iter().chain(KAOMOJI).chain(DIVIDERS) {
            assert!(!art.contains("  "), "{art}");
            assert!(art.lines().all(|line| !line.starts_with(' ')), "{art}");
        }
    }

    #[test]
    fn thousands_of_accounts_get_different_texts() {
        for language in [Language::English, Language::Russian, Language::Mixed] {
            for length in [Length::Short, Length::Medium, Length::Long] {
                let source = generate_with(&PIECES, language, length);
                let texts = for_accounts(&source, 3000).unwrap();
                let different: HashSet<&String> = texts.iter().collect();
                assert_eq!(different.len(), texts.len(), "{language:?} {length:?}");
                assert!(texts.iter().all(|text| !text.trim().is_empty()));
            }
        }
    }

    #[test]
    fn only_the_chosen_pieces_are_used() {
        let source = generate_with(&[Piece::Kaomoji], Language::English, Length::Long);
        for text in for_accounts(&source, 50).unwrap() {
            assert!(KAOMOJI.contains(&text.as_str()), "{text}");
        }
    }

    #[test]
    fn dividers_alone_make_nothing() {
        let source = generate_with(&[Piece::Divider], Language::English, Length::Short);
        assert_eq!(for_accounts(&source, 1), Err(DescriptionError::NoPieces));
    }

    #[test]
    fn own_lines_fill_in_their_options() {
        let source = DescriptionSource::Lines {
            lines: "\n  {hey|hi}, farm {n}  \n\n".to_owned(),
        };
        let texts = many(&source, 2, &mut |_| 0).unwrap();
        assert_eq!(texts, ["hey, farm 1", "hey, farm 2"]);
        let blank = DescriptionSource::Lines {
            lines: " \n".to_owned(),
        };
        assert_eq!(for_accounts(&blank, 1), Err(DescriptionError::NoLines));
    }

    #[test]
    fn a_russian_line_gets_a_russian_country() {
        let source = DescriptionSource::Lines {
            lines: "игрок из {country}".to_owned(),
        };
        let text = many(&source, 1, &mut |_| 0).unwrap().remove(0);
        assert_eq!(text, format!("игрок из {}", russian().countries[0]));
    }

    #[test]
    fn few_options_repeat_rather_than_fail() {
        let source = DescriptionSource::Lines {
            lines: "same".to_owned(),
        };
        assert_eq!(for_accounts(&source, 3).unwrap(), ["same", "same", "same"]);
    }
}
