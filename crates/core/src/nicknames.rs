//! Random nicknames that read like ones people pick. Several shapes are mixed, so
//! accounts named in one go don't share an obvious pattern.

use std::hash::{BuildHasher, Hasher, RandomState};

/// No nickname made here is longer, so a template can be checked before it runs.
pub const MAX_LEN: usize = 20;

const ADJECTIVES: &[&str] = &[
    "silent", "rapid", "lucky", "frozen", "golden", "hidden", "crimson", "lazy", "brave", "wild",
    "dark", "bright", "quiet", "angry", "happy", "sneaky", "cosmic", "rusty", "shadow", "electric",
    "toxic", "lunar", "solar", "mystic", "savage", "humble", "clever", "fuzzy", "crispy", "spicy",
    "salty", "sleepy", "tiny", "giant", "noble", "royal", "steel", "iron", "silver", "neon",
    "retro", "atomic", "arctic", "desert", "jungle", "ocean", "thunder", "velvet", "wicked",
    "witty", "zen", "chill", "crazy", "fancy", "grumpy", "jolly", "mighty", "nimble", "proud",
    "rogue", "swift", "bold", "calm", "cold", "dusty", "early", "faded", "fierce", "gentle",
    "hollow", "icy", "lost", "lone", "mellow", "misty", "odd", "pale", "rare", "shy", "sly",
    "smooth", "stray", "sunny", "true", "vivid", "wired", "young", "agile", "amber", "ancient",
    "ashen", "azure", "bitter", "blazing", "blue", "bouncy", "brisk", "broken", "bronze",
    "burning", "busy", "candid", "cheeky", "cherry", "chilly", "chunky", "cloudy", "cobalt",
    "cocky", "comfy", "copper", "coral", "cozy", "crafty", "cranky", "creepy", "cryptic", "cubic",
    "curly", "cyber", "daring", "dazzled", "deadly", "deep", "dizzy", "dreamy", "drowsy", "dry",
    "eager", "eerie", "elder", "elite", "empty", "endless", "epic", "eternal", "exotic", "fast",
    "feral", "fiery", "final", "flashy", "floppy", "flying", "foggy", "frantic", "free", "fresh",
    "frosty", "funky", "furious", "fussy", "gilded", "glossy", "gloomy", "glowing", "goofy",
    "grand", "gray", "greedy", "green", "grim", "gritty", "groovy", "hairy", "hardy", "hasty",
    "hazy", "heavy", "hefty", "heroic", "honest", "hungry", "hyper", "idle", "inky", "jade",
    "jagged", "jazzy", "jumpy", "keen", "kind", "lanky", "late", "lemon", "light", "lilac",
    "limber", "liquid", "little", "lively", "loud", "loyal", "lucid", "magic", "major", "manic",
    "marble", "merry", "metal", "midnight", "mild", "minty", "modern", "moody", "mossy", "muddy",
    "murky", "mute", "naive", "neat", "nervous", "nifty", "nordic", "nutty", "obsidian", "olive",
    "orange", "plain", "plastic", "plucky", "plush", "polar", "poppy", "prime", "proper", "purple",
    "quick", "quirky", "radiant", "rainy", "random", "raw", "rebel", "red", "regal", "restless",
    "rich", "rigid", "ripe", "robust", "rocky", "rosy", "rough", "round", "ruby", "rugged",
    "rustic", "sacred", "sandy", "scarlet", "secret", "serene", "shaggy", "sharp", "shiny",
    "short", "silky", "simple", "sizzling", "slick", "slim", "slow", "snappy", "snowy", "soft",
    "solid", "sonic", "sour", "spare", "speedy", "spiky", "stealth", "sticky", "stoic", "stormy",
    "stout", "strange", "strong", "sturdy", "sublime", "sugary", "super", "sweet", "tall", "tame",
    "tangy", "teal", "tender", "thirsty", "tidy", "timid", "tired", "topaz", "tough", "tribal",
    "tricky", "turbo", "twisted", "ultra", "umber", "unruly", "upbeat", "urban", "vain", "vast",
    "violet", "viral", "wacky", "warm", "wary", "weird", "white", "windy", "wise", "wooden",
    "woolly", "yellow", "zany", "zesty",
];

const NOUNS: &[&str] = &[
    "fox", "wolf", "raven", "falcon", "tiger", "panda", "otter", "badger", "lynx", "hawk", "viper",
    "cobra", "shark", "whale", "bear", "owl", "crow", "moose", "gecko", "koala", "llama", "yak",
    "bison", "puma", "jaguar", "dragon", "phoenix", "golem", "ghost", "ninja", "pirate", "knight",
    "wizard", "ranger", "hunter", "sniper", "pilot", "rider", "drifter", "nomad", "monk",
    "samurai", "viking", "baron", "outlaw", "scout", "comet", "meteor", "nova", "pulsar", "orbit",
    "rocket", "engine", "circuit", "glitch", "byte", "cipher", "vector", "matrix", "signal",
    "echo", "spark", "blaze", "frost", "ember", "breeze", "river", "canyon", "summit", "harbor",
    "forest", "cactus", "maple", "pepper", "mango", "cookie", "waffle", "noodle", "pickle",
    "muffin", "biscuit", "taco", "donut", "potato", "walrus", "penguin", "beetle", "hornet",
    "alpaca", "anchor", "angel", "ant", "ape", "arrow", "atlas", "axe", "badge", "bandit", "banjo",
    "bat", "beacon", "beaver", "bee", "bishop", "blade", "boar", "bolt", "bones", "bongo",
    "bramble", "bucket", "buffalo", "bug", "bullet", "bunny", "burrito", "butler", "buzzard",
    "camel", "candle", "cannon", "captain", "carrot", "cat", "cedar", "chef", "cherub", "chimp",
    "chip", "claw", "clown", "cobweb", "condor", "coyote", "crab", "crane", "crater", "cricket",
    "crown", "cub", "cyborg", "dagger", "dart", "deer", "dingo", "dino", "diver", "dodo", "dog",
    "dolphin", "dove", "drone", "drum", "duck", "dune", "eagle", "eel", "elk", "elf", "emu",
    "ferret", "finch", "fish", "flame", "flask", "fleet", "flint", "frog", "fungus", "gator",
    "giraffe", "goblin", "goose", "gopher", "gorilla", "griffin", "grizzly", "guitar", "gull",
    "hammer", "hamster", "hare", "heron", "hippo", "hobbit", "hound", "husky", "hydra", "ibis",
    "iguana", "imp", "jackal", "jester", "jet", "joker", "kettle", "kiwi", "kraken", "lamb",
    "lantern", "lark", "leopard", "lion", "lizard", "lobster", "locust", "mage", "magpie",
    "mammoth", "mantis", "marlin", "marmot", "mask", "mink", "mole", "monkey", "moth", "mouse",
    "mule", "narwhal", "newt", "oak", "octopus", "ogre", "oracle", "orca", "oriole", "osprey",
    "ox", "oyster", "panther", "parrot", "pebble", "pelican", "pigeon", "piglet", "pike", "pixie",
    "plum", "pony", "poodle", "possum", "prism", "puffin", "pug", "python", "quail", "rabbit",
    "raccoon", "ram", "rat", "reaper", "rhino", "robin", "robot", "rook", "rooster", "salmon",
    "satyr", "scorpio", "seal", "sheep", "shrimp", "skunk", "sloth", "slug", "snail", "snake",
    "spider", "squid", "stag", "starling", "stork", "sparrow", "swan", "tapir", "termite", "thief",
    "titan", "toad", "toucan", "trout", "troll", "tuna", "turtle", "unicorn", "vulture", "wasp",
    "weasel", "wombat", "worm", "wraith", "yeti", "zebra", "zombie",
];

/// A nickname of up to `MAX_LEN` characters.
pub fn random() -> String {
    generate(&mut |below| (RandomState::new().build_hasher().finish() % below as u64) as usize)
}

/// Builds a nickname from `pick`, which gives a number under the one it's handed.
/// The shapes with a number come up more often, as they have the most names to give.
fn generate(pick: &mut impl FnMut(usize) -> usize) -> String {
    let adjective = ADJECTIVES[pick(ADJECTIVES.len())];
    let noun = NOUNS[pick(NOUNS.len())];
    let name = match pick(20) {
        0..=6 => format!("{adjective}{noun}{}", 10 + pick(990)),
        7..=10 => format!(
            "{}{}{}",
            capitalized(noun),
            capitalized(adjective),
            pick(10)
        ),
        11..=13 => format!("{}{}", capitalized(noun), 10 + pick(990)),
        14..=15 => format!("{}{}", capitalized(adjective), capitalized(noun)),
        16..=17 => format!("{adjective}_{noun}"),
        _ => format!("{adjective}.{noun}"),
    };
    // Every word is short enough, but a cut keeps the promise if one ever isn't.
    name.chars().take(MAX_LEN).collect()
}

fn capitalized(word: &str) -> String {
    let mut letters = word.chars();
    letters
        .next()
        .map(|first| first.to_uppercase().chain(letters).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_shape_stays_short() {
        // The longest words with every shape, and the biggest numbers.
        let longest = |words: &[&str]| {
            (0..words.len())
                .max_by_key(|&index| words[index].len())
                .unwrap()
        };
        for shape in 0..20 {
            let mut picks = vec![longest(ADJECTIVES), longest(NOUNS), shape, 989].into_iter();
            let name = generate(&mut |below| picks.next().unwrap().min(below - 1));
            assert!(name.chars().count() <= MAX_LEN, "{name} is too long");
            assert!(!name.is_empty());
        }
    }

    #[test]
    fn the_shapes_look_like_names() {
        let name = |picks: [usize; 4]| {
            let mut picks = picks.into_iter();
            generate(&mut |_| picks.next().unwrap())
        };
        assert_eq!(name([0, 0, 0, 17]), "silentfox27");
        assert_eq!(name([0, 1, 7, 3]), "WolfSilent3");
        assert_eq!(name([0, 2, 11, 32]), "Raven42");
        assert_eq!(name([0, 0, 14, 0]), "SilentFox");
        assert_eq!(name([2, 1, 16, 0]), "lucky_wolf");
        assert_eq!(name([1, 2, 19, 0]), "rapid.raven");
    }

    #[test]
    fn the_words_are_plain_and_never_repeat() {
        let mut seen = std::collections::HashSet::new();
        for word in ADJECTIVES.iter().chain(NOUNS) {
            assert!(word.len() <= 8, "{word} is long");
            assert!(
                word.chars().all(|letter| letter.is_ascii_lowercase()),
                "{word}"
            );
            assert!(seen.insert(word), "{word} is listed twice");
        }
    }

    #[test]
    fn random_names_differ() {
        let names: std::collections::HashSet<String> = (0..50).map(|_| random()).collect();
        assert!(names.len() > 40);
    }
}
