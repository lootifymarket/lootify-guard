//! A proxy on this computer for an account's browser tab. A webview can be
//! pointed at a proxy only by its address, with no login, so the tab talks to
//! this one, which reaches out through the account's own proxy, login and all.

use std::io::{self, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use crate::proxy::ProxyAddress;
use crate::tunnel;

// Browsers ask for a tunnel in one short request; a longer one isn't one.
const MAX_REQUEST: usize = 8 * 1024;
// How often the listener looks up to see whether it should stop.
const POLL: Duration = Duration::from_millis(100);

/// Listens on a port of its own on 127.0.0.1 until dropped.
pub struct Forwarder {
    port: u16,
    stopped: Arc<AtomicBool>,
}

impl Forwarder {
    /// Starts listening. Every tunnel goes through `upstream`, or straight out
    /// when there's none.
    pub fn start(upstream: Option<ProxyAddress>) -> io::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = stopped.clone();
        let upstream = Arc::new(upstream);
        thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((client, _)) => {
                        let upstream = upstream.clone();
                        thread::spawn(move || {
                            let _ = serve(client, upstream.as_ref().as_ref());
                        });
                    }
                    Err(err) if err.kind() == io::ErrorKind::WouldBlock => thread::sleep(POLL),
                    Err(_) => thread::sleep(POLL),
                }
            }
        });
        Ok(Self { port, stopped })
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Drop for Forwarder {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Relaxed);
    }
}

/// Answers one `CONNECT host:port`, then passes bytes both ways until either
/// side closes. Everything Steam serves is HTTPS, so plain requests are refused.
fn serve(mut client: TcpStream, upstream: Option<&ProxyAddress>) -> io::Result<()> {
    client.set_nonblocking(false)?;
    let request = read_head(&mut client)?;
    let Some((host, port)) = connect_target(&request) else {
        return client.write_all(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n");
    };
    let server = match tunnel::connect(upstream, &host, port) {
        Ok(server) => server,
        Err(_) => {
            return client.write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
        }
    };
    // The tunnel waits for traffic as long as the page keeps it open.
    server.set_read_timeout(None)?;
    client.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")?;
    pipe(client, server)
}

fn read_head(stream: &mut TcpStream) -> io::Result<String> {
    // Byte by byte, so nothing the browser sends after the request is lost.
    let mut head = Vec::new();
    let mut byte = [0u8];
    while !head.ends_with(b"\r\n\r\n") {
        if head.len() > MAX_REQUEST {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "request too long",
            ));
        }
        stream.read_exact(&mut byte)?;
        head.push(byte[0]);
    }
    String::from_utf8(head).map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "not text"))
}

/// The host and port of a `CONNECT` request.
fn connect_target(request: &str) -> Option<(String, u16)> {
    let mut words = request.lines().next()?.split_whitespace();
    if words.next()? != "CONNECT" {
        return None;
    }
    let (host, port) = words.next()?.rsplit_once(':')?;
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if host.is_empty() {
        return None;
    }
    Some((host.to_owned(), port.parse().ok()?))
}

fn pipe(client: TcpStream, server: TcpStream) -> io::Result<()> {
    let (mut client_in, mut server_out) = (client.try_clone()?, server.try_clone()?);
    let upload = thread::spawn(move || {
        let _ = io::copy(&mut client_in, &mut server_out);
        let _ = server_out.shutdown(Shutdown::Write);
    });
    let (mut server_in, mut client_out) = (server, client);
    let _ = io::copy(&mut server_in, &mut client_out);
    let _ = client_out.shutdown(Shutdown::Write);
    let _ = upload.join();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connect_requests_are_read() {
        assert_eq!(
            connect_target("CONNECT steamcommunity.com:443 HTTP/1.1\r\nHost: x\r\n\r\n"),
            Some(("steamcommunity.com".to_owned(), 443))
        );
        assert_eq!(
            connect_target("CONNECT [::1]:443 HTTP/1.1\r\n\r\n"),
            Some(("::1".to_owned(), 443))
        );
        assert_eq!(
            connect_target("GET http://example.com/ HTTP/1.1\r\n\r\n"),
            None
        );
        assert_eq!(connect_target("CONNECT example.com HTTP/1.1\r\n\r\n"), None);
    }

    #[test]
    fn a_tunnel_carries_bytes_both_ways() {
        // A server on this computer that sends back what it gets.
        let echo = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let echo_port = echo.local_addr().unwrap().port();
        thread::spawn(move || {
            let (mut stream, _) = echo.accept().unwrap();
            let mut buffer = [0u8; 5];
            stream.read_exact(&mut buffer).unwrap();
            stream.write_all(&buffer).unwrap();
        });

        let forwarder = Forwarder::start(None).unwrap();
        let mut browser = TcpStream::connect(("127.0.0.1", forwarder.port())).unwrap();
        browser
            .write_all(format!("CONNECT 127.0.0.1:{echo_port} HTTP/1.1\r\n\r\n").as_bytes())
            .unwrap();
        let answer = read_head(&mut browser).unwrap();
        assert!(answer.starts_with("HTTP/1.1 200"), "{answer}");
        browser.write_all(b"hello").unwrap();
        let mut echoed = [0u8; 5];
        browser.read_exact(&mut echoed).unwrap();
        assert_eq!(&echoed, b"hello");
    }

    #[test]
    fn plain_requests_are_turned_away() {
        let forwarder = Forwarder::start(None).unwrap();
        let mut browser = TcpStream::connect(("127.0.0.1", forwarder.port())).unwrap();
        browser
            .write_all(b"GET http://example.com/ HTTP/1.1\r\n\r\n")
            .unwrap();
        assert!(read_head(&mut browser).unwrap().starts_with("HTTP/1.1 405"));
    }
}
