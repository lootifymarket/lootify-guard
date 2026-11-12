use reqwest::Url;
use serde::{Deserialize, Serialize};

use crate::contents::Secret;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProxyKind {
    Http,
    Socks5,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proxy {
    pub id: u32,
    /// What the user calls it, shown instead of the address.
    pub name: Option<String>,
    /// ISO 3166 code of where the proxy comes out, from its last check.
    pub country: Option<String>,
    #[serde(flatten)]
    pub address: ProxyAddress,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyAddress {
    pub kind: ProxyKind,
    pub host: String,
    pub port: u16,
    pub login: Option<Secret>,
    pub password: Option<Secret>,
}

/// Proxy lists carry passwords, so the offending text is never repeated.
#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum ProxyError {
    #[error("unknown proxy type, use http:// or socks5://")]
    UnknownKind,
    #[error("expected host:port, optionally with a login and password")]
    Malformed,
    #[error("the port must be a number from 1 to 65535")]
    BadPort,
}

impl ProxyAddress {
    pub fn new(
        kind: ProxyKind,
        host: &str,
        port: u16,
        login: Option<String>,
        password: Option<String>,
    ) -> Result<Self, ProxyError> {
        let host = host.trim();
        if host.is_empty() || host.contains(|c: char| c.is_whitespace() || "/@:".contains(c)) {
            return Err(ProxyError::Malformed);
        }
        if port == 0 {
            return Err(ProxyError::BadPort);
        }
        let login = login.filter(|login| !login.is_empty());
        Ok(Self {
            kind,
            host: host.to_owned(),
            port,
            password: password.filter(|_| login.is_some()).map(Secret::from),
            login: login.map(Secret::from),
        })
    }

    /// Reads one line of a proxy list: `socks5://login:password@host:port`, the same
    /// without a scheme (HTTP is assumed), or `host:port:login:password`.
    pub fn parse(line: &str) -> Result<Self, ProxyError> {
        let line = line.trim();
        let (kind, rest) = match line.split_once("://") {
            Some((scheme, rest)) => (kind_for_scheme(scheme)?, rest),
            None => (ProxyKind::Http, line),
        };
        let rest = rest.trim_end_matches('/');

        // A password may itself contain `@`, so the host is after the last one.
        if let Some((credentials, host_port)) = rest.rsplit_once('@') {
            let (login, password) = credentials.split_once(':').ok_or(ProxyError::Malformed)?;
            let (host, port) = host_port.split_once(':').ok_or(ProxyError::Malformed)?;
            return Self::new(
                kind,
                host,
                parse_port(port)?,
                Some(login.to_owned()),
                Some(password.to_owned()),
            );
        }
        match rest.splitn(4, ':').collect::<Vec<_>>()[..] {
            [host, port] => Self::new(kind, host, parse_port(port)?, None, None),
            [host, port, login, password] => Self::new(
                kind,
                host,
                parse_port(port)?,
                Some(login.to_owned()),
                Some(password.to_owned()),
            ),
            _ => Err(ProxyError::Malformed),
        }
    }

    /// `host:port`, safe to show: no login or password.
    pub fn label(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }

    /// Whether both point to the same proxy as the same user.
    pub fn same_as(&self, other: &Self) -> bool {
        self.kind == other.kind
            && self.host.eq_ignore_ascii_case(&other.host)
            && self.port == other.port
            && self.login.as_ref().map(Secret::expose) == other.login.as_ref().map(Secret::expose)
    }

    pub fn to_reqwest(&self) -> reqwest::Result<reqwest::Proxy> {
        // socks5h sends DNS lookups through the proxy too, so they don't give away
        // where the computer really is.
        let scheme = match self.kind {
            ProxyKind::Http => "http",
            ProxyKind::Socks5 => "socks5h",
        };
        let mut url = Url::parse(&format!("{scheme}://{}", self.label()))
            .expect("host and port were checked when the proxy was added");
        if let Some(login) = &self.login {
            // Url percent-encodes both, so `@` or `:` in them stay part of the value.
            url.set_username(login.expose())
                .and_then(|()| url.set_password(self.password.as_ref().map(Secret::expose)))
                .expect("a URL with a host takes credentials");
        }
        reqwest::Proxy::all(url)
    }
}

/// Accepts only a two-letter country code, so whatever a lookup service returns
/// can't end up shown as something else.
pub fn country_code(code: &str) -> Option<String> {
    let code = code.trim();
    (code.len() == 2 && code.bytes().all(|b| b.is_ascii_alphabetic()))
        .then(|| code.to_ascii_uppercase())
}

fn kind_for_scheme(scheme: &str) -> Result<ProxyKind, ProxyError> {
    match scheme.to_ascii_lowercase().as_str() {
        // Lists say https for HTTP proxies that can tunnel HTTPS, which is all of ours.
        "http" | "https" => Ok(ProxyKind::Http),
        "socks5" | "socks5h" => Ok(ProxyKind::Socks5),
        _ => Err(ProxyError::UnknownKind),
    }
}

fn parse_port(port: &str) -> Result<u16, ProxyError> {
    match port.parse() {
        Ok(0) | Err(_) => Err(ProxyError::BadPort),
        Ok(port) => Ok(port),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parts(address: &ProxyAddress) -> (ProxyKind, &str, u16, Option<&str>, Option<&str>) {
        (
            address.kind,
            address.host.as_str(),
            address.port,
            address.login.as_ref().map(Secret::expose),
            address.password.as_ref().map(Secret::expose),
        )
    }

    #[test]
    fn reads_common_list_formats() {
        let cases = [
            (
                "socks5://user:secret@185.12.40.7:1080",
                (
                    ProxyKind::Socks5,
                    "185.12.40.7",
                    1080,
                    Some("user"),
                    Some("secret"),
                ),
            ),
            (
                "http://91.214.3.8:8080",
                (ProxyKind::Http, "91.214.3.8", 8080, None, None),
            ),
            (
                "proxy.example.com:3128",
                (ProxyKind::Http, "proxy.example.com", 3128, None, None),
            ),
            (
                "65.21.4.4:1080:user:secret",
                (
                    ProxyKind::Http,
                    "65.21.4.4",
                    1080,
                    Some("user"),
                    Some("secret"),
                ),
            ),
            (
                "  SOCKS5H://user:p@ss:word@host.net:1080/ ",
                (
                    ProxyKind::Socks5,
                    "host.net",
                    1080,
                    Some("user"),
                    Some("p@ss:word"),
                ),
            ),
        ];
        for (line, expected) in cases {
            assert_eq!(
                parts(&ProxyAddress::parse(line).unwrap()),
                expected,
                "{line}"
            );
        }
    }

    #[test]
    fn rejects_broken_lines() {
        for (line, error) in [
            ("ftp://host:21", ProxyError::UnknownKind),
            ("host", ProxyError::Malformed),
            ("host:port", ProxyError::BadPort),
            ("host:0", ProxyError::BadPort),
            ("host:70000", ProxyError::BadPort),
            ("user@host:1080", ProxyError::Malformed),
            (":1080", ProxyError::Malformed),
        ] {
            assert_eq!(ProxyAddress::parse(line).unwrap_err(), error, "{line}");
        }
    }

    #[test]
    fn errors_do_not_repeat_the_line() {
        let err = ProxyAddress::parse("ftp://user:hunter2@host:21").unwrap_err();
        assert!(!err.to_string().contains("hunter2"));
    }

    #[test]
    fn label_has_no_credentials() {
        let address = ProxyAddress::parse("socks5://user:secret@host.net:1080").unwrap();
        assert_eq!(address.label(), "host.net:1080");
    }

    #[test]
    fn same_proxy_is_recognised_regardless_of_password() {
        let a = ProxyAddress::parse("socks5://user:one@Host.net:1080").unwrap();
        let b = ProxyAddress::parse("socks5://user:two@host.net:1080").unwrap();
        let other_user = ProxyAddress::parse("socks5://admin:one@host.net:1080").unwrap();
        assert!(a.same_as(&b));
        assert!(!a.same_as(&other_user));
    }

    #[test]
    fn only_two_letter_country_codes_pass() {
        assert_eq!(country_code("de").as_deref(), Some("DE"));
        assert_eq!(country_code(" NL ").as_deref(), Some("NL"));
        for bad in ["", "D", "DEU", "1A", "<b>"] {
            assert_eq!(country_code(bad), None, "{bad}");
        }
    }

    #[test]
    fn credentials_with_special_characters_build_a_proxy() {
        let address = ProxyAddress::parse("socks5://user:p@ss:word@host.net:1080").unwrap();
        assert!(address.to_reqwest().is_ok());
    }
}
