//! A plain TCP connection to a host, through the account's proxy when it has
//! one. reqwest does this for web requests; the Steam client connection needs
//! its own.

use std::io::{self, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;

use crate::contents::Secret;
use crate::proxy::{ProxyAddress, ProxyKind};
use crate::steam::SteamError;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
// A proxy's greeting is a few dozen bytes; a longer one isn't a proxy talking.
const MAX_REPLY: usize = 8 * 1024;

pub(crate) fn connect(
    proxy: Option<&ProxyAddress>,
    host: &str,
    port: u16,
) -> Result<TcpStream, SteamError> {
    let Some(proxy) = proxy else {
        return open(host, port).map_err(|_| SteamError::Network);
    };
    let mut stream = open(&proxy.host, proxy.port).map_err(|_| SteamError::Proxy)?;
    stream
        .set_read_timeout(Some(CONNECT_TIMEOUT))
        .map_err(|_| SteamError::Proxy)?;
    match proxy.kind {
        ProxyKind::Http => http_connect(&mut stream, proxy, host, port),
        ProxyKind::Socks5 => socks5_connect(&mut stream, proxy, host, port),
    }
    .map_err(|_| SteamError::Proxy)?;
    Ok(stream)
}

fn open(host: &str, port: u16) -> io::Result<TcpStream> {
    let mut last = io::Error::new(io::ErrorKind::NotFound, "no address");
    for address in (host, port).to_socket_addrs()? {
        match TcpStream::connect_timeout(&address, CONNECT_TIMEOUT) {
            Ok(stream) => return Ok(stream),
            Err(err) => last = err,
        }
    }
    Err(last)
}

fn refused() -> io::Error {
    io::Error::new(io::ErrorKind::ConnectionRefused, "the proxy refused")
}

fn credentials(proxy: &ProxyAddress) -> Option<(&str, &str)> {
    let login = proxy.login.as_ref()?.expose();
    Some((login, proxy.password.as_ref().map_or("", Secret::expose)))
}

fn http_connect(
    stream: &mut (impl Read + Write),
    proxy: &ProxyAddress,
    host: &str,
    port: u16,
) -> io::Result<()> {
    let mut request = format!("CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n");
    if let Some((login, password)) = credentials(proxy) {
        let token = STANDARD.encode(format!("{login}:{password}"));
        request.push_str(&format!("Proxy-Authorization: Basic {token}\r\n"));
    }
    request.push_str("\r\n");
    stream.write_all(request.as_bytes())?;

    // Byte by byte, so nothing past the proxy's reply is taken from the tunnel.
    let mut reply = Vec::new();
    let mut byte = [0u8];
    while !reply.ends_with(b"\r\n\r\n") {
        if reply.len() > MAX_REPLY {
            return Err(refused());
        }
        stream.read_exact(&mut byte)?;
        reply.push(byte[0]);
    }
    let status = reply
        .split(|&b| b == b' ')
        .nth(1)
        .and_then(|code| std::str::from_utf8(code).ok());
    if status == Some("200") {
        Ok(())
    } else {
        Err(refused())
    }
}

fn socks5_connect(
    stream: &mut (impl Read + Write),
    proxy: &ProxyAddress,
    host: &str,
    port: u16,
) -> io::Result<()> {
    let credentials = credentials(proxy);
    // No authentication, or a login and password.
    let method = if credentials.is_some() { 2 } else { 0 };
    stream.write_all(&[5, 1, method])?;
    let mut answer = [0u8; 2];
    stream.read_exact(&mut answer)?;
    if answer != [5, method] {
        return Err(refused());
    }
    if let Some((login, password)) = credentials {
        let (login, password) = (login.as_bytes(), password.as_bytes());
        let (Ok(login_len), Ok(password_len)) =
            (u8::try_from(login.len()), u8::try_from(password.len()))
        else {
            return Err(refused());
        };
        let mut request = vec![1, login_len];
        request.extend_from_slice(login);
        request.push(password_len);
        request.extend_from_slice(password);
        stream.write_all(&request)?;
        stream.read_exact(&mut answer)?;
        if answer[1] != 0 {
            return Err(refused());
        }
    }

    // The host goes by name, so the proxy looks it up and DNS doesn't give away
    // where the computer is.
    let name = u8::try_from(host.len()).map_err(|_| refused())?;
    let mut request = vec![5, 1, 0, 3, name];
    request.extend_from_slice(host.as_bytes());
    request.extend_from_slice(&port.to_be_bytes());
    stream.write_all(&request)?;
    let mut head = [0u8; 4];
    stream.read_exact(&mut head)?;
    if head[0] != 5 || head[1] != 0 {
        return Err(refused());
    }
    // The address the proxy bound, which isn't needed but has to be read past.
    let address_len = match head[3] {
        1 => 4,
        4 => 16,
        3 => {
            let mut len = [0u8];
            stream.read_exact(&mut len)?;
            usize::from(len[0])
        }
        _ => return Err(refused()),
    };
    let mut rest = vec![0u8; address_len + 2];
    stream.read_exact(&mut rest)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A proxy that answers with what it was given and keeps what it was sent.
    struct Script {
        reply: io::Cursor<Vec<u8>>,
        sent: Vec<u8>,
    }

    impl Script {
        fn new(reply: &[u8]) -> Self {
            Self {
                reply: io::Cursor::new(reply.to_vec()),
                sent: Vec::new(),
            }
        }
    }

    impl Read for Script {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            self.reply.read(buf)
        }
    }

    impl Write for Script {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.sent.extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    fn proxy(kind: ProxyKind, login: Option<&str>) -> ProxyAddress {
        ProxyAddress::new(
            kind,
            "proxy.example.com",
            1080,
            login.map(str::to_owned),
            login.map(|_| "secret".to_owned()),
        )
        .unwrap()
    }

    #[test]
    fn socks5_signs_in_and_asks_for_the_host_by_name() {
        let mut script = Script::new(&[5, 2, 1, 0, 5, 0, 0, 1, 10, 0, 0, 1, 0x1F, 0x90, 0xFF]);
        socks5_connect(
            &mut script,
            &proxy(ProxyKind::Socks5, Some("me")),
            "cm.steam",
            443,
        )
        .unwrap();
        let mut expected = vec![5, 1, 2, 1, 2, b'm', b'e', 6];
        expected.extend_from_slice(b"secret");
        expected.extend_from_slice(&[5, 1, 0, 3, 8]);
        expected.extend_from_slice(b"cm.steam");
        expected.extend_from_slice(&[1, 0xBB]);
        assert_eq!(script.sent, expected);
        // Nothing past the proxy's reply was read.
        assert_eq!(script.reply.position(), 14);
    }

    #[test]
    fn socks5_refusals_are_errors() {
        let refuses_method = &[5, 0xFF][..];
        let refuses_login = &[5, 2, 1, 1][..];
        let refuses_host = &[5, 2, 1, 0, 5, 5, 0, 1][..];
        for reply in [refuses_method, refuses_login, refuses_host] {
            let mut script = Script::new(reply);
            assert!(
                socks5_connect(
                    &mut script,
                    &proxy(ProxyKind::Socks5, Some("me")),
                    "cm.steam",
                    443
                )
                .is_err()
            );
        }
    }

    #[test]
    fn http_proxies_get_a_connect_with_credentials() {
        let mut script = Script::new(b"HTTP/1.1 200 Connection established\r\n\r\nTLS");
        http_connect(
            &mut script,
            &proxy(ProxyKind::Http, Some("me")),
            "cm.steam",
            443,
        )
        .unwrap();
        let sent = String::from_utf8(script.sent).unwrap();
        assert!(sent.starts_with("CONNECT cm.steam:443 HTTP/1.1\r\n"));
        assert!(sent.contains(&format!(
            "Proxy-Authorization: Basic {}\r\n",
            STANDARD.encode("me:secret")
        )));
        assert!(sent.ends_with("\r\n\r\n"));
        assert_eq!(script.reply.position(), 39);

        let mut script = Script::new(b"HTTP/1.1 407 Proxy Authentication Required\r\n\r\n");
        assert!(http_connect(&mut script, &proxy(ProxyKind::Http, None), "cm.steam", 443).is_err());
    }
}
