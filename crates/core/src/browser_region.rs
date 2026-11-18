//! The time zone and language a browser tab shows pages, so they agree with the
//! country its proxy comes out in rather than with this computer.

use serde::{Deserialize, Serialize};

/// A time zone with the language spoken there.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Region {
    /// ISO 3166, the country it's for.
    pub country: &'static str,
    /// IANA, like `Europe/Berlin`.
    pub time_zone: &'static str,
    /// BCP 47, like `de-DE`.
    pub language: &'static str,
}

const fn region(country: &'static str, time_zone: &'static str, language: &'static str) -> Region {
    Region {
        country,
        time_zone,
        language,
    }
}

// Where proxies usually come out, each with its main time zone. A country that
// spans several gets the one most people there live in.
const REGIONS: &[Region] = &[
    region("US", "America/New_York", "en-US"),
    region("CA", "America/Toronto", "en-CA"),
    region("MX", "America/Mexico_City", "es-MX"),
    region("BR", "America/Sao_Paulo", "pt-BR"),
    region("AR", "America/Argentina/Buenos_Aires", "es-AR"),
    region("GB", "Europe/London", "en-GB"),
    region("IE", "Europe/Dublin", "en-IE"),
    region("PT", "Europe/Lisbon", "pt-PT"),
    region("ES", "Europe/Madrid", "es-ES"),
    region("FR", "Europe/Paris", "fr-FR"),
    region("BE", "Europe/Brussels", "nl-BE"),
    region("NL", "Europe/Amsterdam", "nl-NL"),
    region("DE", "Europe/Berlin", "de-DE"),
    region("CH", "Europe/Zurich", "de-CH"),
    region("AT", "Europe/Vienna", "de-AT"),
    region("IT", "Europe/Rome", "it-IT"),
    region("DK", "Europe/Copenhagen", "da-DK"),
    region("NO", "Europe/Oslo", "nb-NO"),
    region("SE", "Europe/Stockholm", "sv-SE"),
    region("FI", "Europe/Helsinki", "fi-FI"),
    region("EE", "Europe/Tallinn", "et-EE"),
    region("LV", "Europe/Riga", "lv-LV"),
    region("LT", "Europe/Vilnius", "lt-LT"),
    region("PL", "Europe/Warsaw", "pl-PL"),
    region("CZ", "Europe/Prague", "cs-CZ"),
    region("SK", "Europe/Bratislava", "sk-SK"),
    region("HU", "Europe/Budapest", "hu-HU"),
    region("SI", "Europe/Ljubljana", "sl-SI"),
    region("HR", "Europe/Zagreb", "hr-HR"),
    region("RS", "Europe/Belgrade", "sr-RS"),
    region("RO", "Europe/Bucharest", "ro-RO"),
    region("BG", "Europe/Sofia", "bg-BG"),
    region("GR", "Europe/Athens", "el-GR"),
    region("TR", "Europe/Istanbul", "tr-TR"),
    region("UA", "Europe/Kyiv", "uk-UA"),
    region("BY", "Europe/Minsk", "ru-BY"),
    region("RU", "Europe/Moscow", "ru-RU"),
    region("KZ", "Asia/Almaty", "ru-KZ"),
    region("IL", "Asia/Jerusalem", "he-IL"),
    region("AE", "Asia/Dubai", "ar-AE"),
    region("IN", "Asia/Kolkata", "en-IN"),
    region("TH", "Asia/Bangkok", "th-TH"),
    region("VN", "Asia/Ho_Chi_Minh", "vi-VN"),
    region("MY", "Asia/Kuala_Lumpur", "ms-MY"),
    region("SG", "Asia/Singapore", "en-SG"),
    region("ID", "Asia/Jakarta", "id-ID"),
    region("PH", "Asia/Manila", "en-PH"),
    region("CN", "Asia/Shanghai", "zh-CN"),
    region("HK", "Asia/Hong_Kong", "zh-HK"),
    region("TW", "Asia/Taipei", "zh-TW"),
    region("KR", "Asia/Seoul", "ko-KR"),
    region("JP", "Asia/Tokyo", "ja-JP"),
    region("AU", "Australia/Sydney", "en-AU"),
    region("NZ", "Pacific/Auckland", "en-NZ"),
    region("ZA", "Africa/Johannesburg", "en-ZA"),
];

/// Every region a tab can be set to.
pub fn regions() -> &'static [Region] {
    REGIONS
}

/// What a tab shows as its time zone and language.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "timeZone", rename_all = "camelCase")]
pub enum RegionChoice {
    /// Where the tab's proxy comes out. A proxy of unknown country, or none,
    /// leaves the computer's own.
    #[default]
    MatchProxy,
    /// The computer's own, whatever the proxy.
    ThisComputer,
    /// The region with this time zone.
    Fixed(String),
}

impl RegionChoice {
    /// The region to show pages, or `None` to leave them the computer's.
    pub fn resolve(&self, proxy_country: Option<&str>) -> Option<Region> {
        match self {
            Self::MatchProxy => {
                let country = proxy_country?;
                REGIONS
                    .iter()
                    .find(|region| region.country.eq_ignore_ascii_case(country))
                    .copied()
            }
            Self::ThisComputer => None,
            Self::Fixed(time_zone) => REGIONS
                .iter()
                .find(|region| region.time_zone == time_zone)
                .copied(),
        }
    }

    /// Whether it names a region this app knows.
    pub fn is_known(&self) -> bool {
        match self {
            Self::Fixed(time_zone) => REGIONS.iter().any(|region| region.time_zone == time_zone),
            _ => true,
        }
    }
}

/// A script for every frame of a tab that makes its pages see `region`'s time
/// zone and language: in `Intl`, in the dates' offset and local strings, and in
/// `navigator`. Workers and the `Accept-Language` header aren't reached.
pub fn script(region: &Region) -> String {
    let time_zone = serde_json::to_string(region.time_zone).expect("a string");
    let language = serde_json::to_string(region.language).expect("a string");
    format!(
        r#"(() => {{
  const TZ = {time_zone}, LANG = {language};
  const Original = Intl.DateTimeFormat;
  const withZone = (options) => {{
    const o = Object.assign({{}}, options);
    if (o.timeZone === undefined) o.timeZone = TZ;
    return o;
  }};
  function DateTimeFormat(locales, options) {{
    return new Original(locales === undefined ? LANG : locales, withZone(options));
  }}
  DateTimeFormat.prototype = Original.prototype;
  DateTimeFormat.supportedLocalesOf = Original.supportedLocalesOf;
  Object.defineProperty(Intl, 'DateTimeFormat', {{ value: DateTimeFormat, writable: true, configurable: true }});
  const parts = new Original('en-US', {{ timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }});
  const define = (target, name, value) => Object.defineProperty(target, name, {{ value, writable: true, configurable: true }});
  define(Date.prototype, 'getTimezoneOffset', function getTimezoneOffset() {{
    const time = this.getTime();
    if (Number.isNaN(time)) return NaN;
    const p = {{}};
    for (const {{ type, value }} of parts.formatToParts(this)) p[type] = Number(value);
    const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((time - (((time % 1000) + 1000) % 1000) - local) / 60000);
  }});
  for (const name of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {{
    const original = Date.prototype[name];
    define(Date.prototype, name, function (locales, options) {{
      return original.call(this, locales === undefined ? LANG : locales, withZone(options));
    }});
  }}
  const languages = Object.freeze([LANG, LANG.split('-')[0]]);
  Object.defineProperty(Navigator.prototype, 'language', {{ get: () => LANG, configurable: true }});
  Object.defineProperty(Navigator.prototype, 'languages', {{ get: () => languages, configurable: true }});
}})();"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matching_the_proxy_takes_its_country() {
        let region = RegionChoice::MatchProxy.resolve(Some("de")).unwrap();
        assert_eq!(region.time_zone, "Europe/Berlin");
        assert_eq!(region.language, "de-DE");
        // Unknown or no country leaves the computer's own.
        assert_eq!(RegionChoice::MatchProxy.resolve(Some("XX")), None);
        assert_eq!(RegionChoice::MatchProxy.resolve(None), None);
    }

    #[test]
    fn a_fixed_region_ignores_the_proxy() {
        let choice = RegionChoice::Fixed("Asia/Tokyo".to_owned());
        assert_eq!(choice.resolve(Some("DE")).unwrap().language, "ja-JP");
        assert_eq!(RegionChoice::ThisComputer.resolve(Some("DE")), None);
        assert!(!RegionChoice::Fixed("Mars/Base".to_owned()).is_known());
    }

    #[test]
    fn regions_are_unique() {
        for (i, region) in REGIONS.iter().enumerate() {
            assert!(
                REGIONS[i + 1..]
                    .iter()
                    .all(|other| other.country != region.country
                        && other.time_zone != region.time_zone),
                "{}",
                region.country
            );
        }
    }

    #[test]
    fn the_choice_reads_back_as_saved() {
        for choice in [
            RegionChoice::MatchProxy,
            RegionChoice::ThisComputer,
            RegionChoice::Fixed("Europe/Berlin".to_owned()),
        ] {
            let json = serde_json::to_string(&choice).unwrap();
            assert_eq!(serde_json::from_str::<RegionChoice>(&json).unwrap(), choice);
        }
    }

    #[test]
    fn the_script_names_the_region() {
        let script = script(&RegionChoice::MatchProxy.resolve(Some("FI")).unwrap());
        assert!(script.contains(r#"TZ = "Europe/Helsinki", LANG = "fi-FI""#));
    }
}
