use std::thread;
use std::time::Duration;

use serde::Serialize;

use crate::contents::Account;
use crate::profile;
use crate::proxy::ProxyAddress;
use crate::steam::SteamError;
use crate::trades::{self, Asset};

const MESSAGE: &str = "Moved by Lootify Guard";
// Steam may not show a just-sent offer to the other side for a moment.
const ACCEPT_TRIES: usize = 3;
const ACCEPT_PAUSE: Duration = Duration::from_secs(2);

/// An account taking part in a move. Its session is updated in place as Steam
/// renews it, so the caller can save it afterwards.
pub struct Side<'a> {
    pub account: &'a mut Account,
    pub proxy: Option<&'a ProxyAddress>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "outcome")]
pub enum Moved {
    /// The items are on the target account.
    Done,
    /// The offer went out and was confirmed, but the target couldn't take it; it
    /// waits among the target's incoming offers.
    Sent { reason: String },
}

/// Which side a failure came from, so the right account's session is dropped.
#[derive(Debug)]
pub enum Failed {
    From(SteamError),
    To(SteamError),
}

/// Sends the items from one account to another and takes them there, all with
/// the accounts' own sessions and Guard secrets, so nothing waits for a phone.
pub fn move_items(from: Side, to: Side, assets: &[Asset]) -> Result<Moved, Failed> {
    let from_id = from
        .account
        .steam_id
        .ok_or(Failed::From(SteamError::SessionExpired))?
        .to_string();
    let (session, url) = profile::trade_url(to.account, to.proxy).map_err(Failed::To)?;
    to.account.session = Some(session);

    let (session, sent) =
        trades::send(from.account, from.proxy, &url, assets, MESSAGE).map_err(Failed::From)?;
    from.account.session = Some(session);

    let mut last = None;
    for attempt in 0..ACCEPT_TRIES {
        if attempt > 0 {
            thread::sleep(ACCEPT_PAUSE);
        }
        match trades::accept(to.account, to.proxy, &sent.offer_id, &from_id) {
            Ok((session, _)) => {
                to.account.session = Some(session);
                return Ok(Moved::Done);
            }
            // Nothing a retry would fix.
            Err(err @ (SteamError::SessionExpired | SteamError::Network | SteamError::Proxy)) => {
                last = Some(err);
                break;
            }
            Err(err) => last = Some(err),
        }
    }
    Ok(Moved::Sent {
        reason: last.map(|err| err.to_string()).unwrap_or_default(),
    })
}
