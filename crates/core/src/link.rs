use std::collections::BTreeMap;

use std::error::Error;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Serialize;
use steamguard::accountlinker::{AccountLinkConfirmType, RemoveAuthenticatorError, TransferError};
use steamguard::protobufs::service_twofactor::CTwoFactor_FinalizeAddAuthenticator_Request;
use steamguard::protobufs::steammessages_auth_steamclient::EAuthSessionGuardType;
use steamguard::steamapi::{EResult, TwoFactorClient};
use steamguard::token::Tokens;
use steamguard::transport::{TransportError, WebApiTransport};
use steamguard::{AccountLinkError, AccountLinker, ExposeSecret, SteamGuardAccount, UserLogin};

use crate::contents::{Account, Authenticator, AutoConfirm, Secret};
use crate::games::PlayingList;
use crate::proxy::ProxyAddress;
use crate::steam::{
    self, SteamError, guard_code_error, login_error, mobile_login, session_of, steam_id_of,
};

// Steam asks for codes from a few windows in a row to see that the new secret works;
// SDA gives up after this many.
const MAX_FINALIZE_ROUNDS: usize = 30;
const CODE_PERIOD_SECS: u64 = 30;
// What Steam's finalize answer says when the code from the SMS or email is wrong.
const STATUS_WRONG_ACTIVATION_CODE: i32 = 89;

/// What Steam asks for before it gives a session to an account that isn't in the vault.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SignInCode {
    /// Sent to the account's email.
    Email,
    /// From Steam Guard in the Steam app on the phone.
    Phone,
}

/// Signing in to an account that isn't in the vault yet, so there's no secret to
/// answer Steam with: the user types the code instead.
pub struct NewSignIn {
    login: UserLogin<WebApiTransport>,
    transport: WebApiTransport,
    /// `None` when Steam gives the session without a code.
    pub code: Option<SignInCode>,
}

/// Starts signing in. Blocks on the network; every request goes through `proxy`.
pub fn begin_sign_in(
    account_name: &str,
    password: &str,
    proxy: Option<&ProxyAddress>,
) -> Result<NewSignIn, SteamError> {
    let transport = WebApiTransport::new(steam::client(proxy)?);
    let mut login = mobile_login(transport.clone());
    let confirmations = login
        .begin_auth_via_credentials(account_name, password)
        .map_err(login_error)?;
    let kinds: Vec<_> = confirmations
        .iter()
        .map(|confirmation| confirmation.confirmation_type)
        .collect();
    Ok(NewSignIn {
        login,
        transport,
        code: code_for(&kinds)?,
    })
}

// A phone with Guard also offers to approve in the app, but waiting on that can't be
// cancelled, so the code is always asked for.
fn code_for(kinds: &[EAuthSessionGuardType]) -> Result<Option<SignInCode>, SteamError> {
    if kinds.contains(&EAuthSessionGuardType::k_EAuthSessionGuardType_DeviceCode) {
        Ok(Some(SignInCode::Phone))
    } else if kinds.contains(&EAuthSessionGuardType::k_EAuthSessionGuardType_EmailCode) {
        Ok(Some(SignInCode::Email))
    } else if kinds.contains(&EAuthSessionGuardType::k_EAuthSessionGuardType_None) {
        Ok(None)
    } else {
        Err(SteamError::UnsupportedConfirmation)
    }
}

impl NewSignIn {
    /// A wrong code leaves the sign-in as it was, so the user can try again.
    pub fn submit_code(&mut self, code: &str) -> Result<(), SteamError> {
        let kind = match self.code {
            Some(SignInCode::Phone) => EAuthSessionGuardType::k_EAuthSessionGuardType_DeviceCode,
            Some(SignInCode::Email) => EAuthSessionGuardType::k_EAuthSessionGuardType_EmailCode,
            None => return Ok(()),
        };
        self.login
            .submit_steam_guard_code(kind, code.to_owned())
            .map(|_| ())
            .map_err(|err| match guard_code_error(err) {
                SteamError::GuardCodeRejected => SteamError::WrongCode,
                err => err,
            })
    }

    /// Takes the session. Call it once the code is in, or Steam is never done waiting.
    pub fn finish(mut self) -> Result<NewGuard, SteamError> {
        let tokens = self
            .login
            .poll_until_tokens()
            .map_err(|_| SteamError::Steam("no session was issued".to_owned()))?;
        Ok(NewGuard {
            steam_id: steam_id_of(&tokens)?,
            guard_on_phone: self.code == Some(SignInCode::Phone),
            client: TwoFactorClient::new(self.transport.clone()),
            linker: AccountLinker::new(self.transport, tokens),
            pending: None,
        })
    }
}

/// How Steam sends the code that confirms the new authenticator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "by")]
pub enum ConfirmBy {
    #[serde(rename_all = "camelCase")]
    Sms {
        /// The last digits Steam shows, when it does.
        phone_hint: Option<String>,
    },
    Email,
}

/// Gives an account already in the vault a new authenticator. Steam makes new
/// secrets, and the old ones stop working wherever they are: a .maFile, SDA, a phone.
/// Blocks on the network; every request goes through `proxy`.
pub fn begin_replace(
    account: &Account,
    proxy: Option<&ProxyAddress>,
) -> Result<NewGuard, SteamError> {
    let (Some(session), Some(steam_id)) = (&account.session, account.steam_id) else {
        return Err(SteamError::SessionExpired);
    };
    let client = steam::client(proxy)?;
    // The stored access token may have run out, and every call here needs a live one.
    let access_token = steam::refresh_access_token(&client, session, steam_id)?;
    let tokens = Tokens::new(
        access_token.expose().to_owned(),
        session.refresh_token.expose().to_owned(),
    );
    let transport = WebApiTransport::new(client);
    Ok(NewGuard {
        client: TwoFactorClient::new(transport.clone()),
        linker: AccountLinker::new(transport, tokens),
        steam_id,
        guard_on_phone: false,
        pending: None,
    })
}

/// A signed-in account that gets an authenticator on this device.
pub struct NewGuard {
    linker: AccountLinker<WebApiTransport>,
    /// The same connection, for the calls whose answers the linker doesn't read in full.
    client: TwoFactorClient<WebApiTransport>,
    steam_id: u64,
    /// Steam Guard is already on a phone, so it can only be moved here.
    pub guard_on_phone: bool,
    pending: Option<Pending>,
}

enum Pending {
    /// Steam made the secrets, but they work only after the code it sent is in.
    New {
        account: Box<SteamGuardAccount>,
        server_time: u64,
    },
    Move,
}

impl NewGuard {
    /// Asks Steam for a new authenticator; it sends a code to confirm with.
    pub fn add(&mut self) -> Result<ConfirmBy, SteamError> {
        let linked = self.linker.link().map_err(link_error)?;
        let by = match linked.confirm_type() {
            AccountLinkConfirmType::Email => ConfirmBy::Email,
            _ => ConfirmBy::Sms {
                phone_hint: Some(linked.phone_number_hint().to_owned())
                    .filter(|hint| !hint.is_empty()),
            },
        };
        self.pending = Some(Pending::New {
            server_time: linked.server_time(),
            account: Box::new(linked.into_account()),
        });
        Ok(by)
    }

    /// Whether Steam has an authenticator on the account right now.
    pub fn guard_is_on(&self) -> Result<bool, SteamError> {
        let mut account = SteamGuardAccount::new();
        account.steam_id = self.steam_id;
        let status = self
            .linker
            .query_status(&account)
            .map_err(|err| match err {
                TransportError::Unauthorized => SteamError::SessionExpired,
                err => unknown(&err),
            })?;
        Ok(status.state() != 0)
    }

    /// Asks Steam to move Guard here from the phone; it sends an SMS to confirm with.
    pub fn start_move(&mut self) -> Result<ConfirmBy, SteamError> {
        self.linker.transfer_start().map_err(transfer_error)?;
        self.pending = Some(Pending::Move);
        Ok(ConfirmBy::Sms { phone_hint: None })
    }

    /// Takes the account's authenticator off with its revocation code. Until `add`
    /// is confirmed, the account has no Steam Guard at all.
    pub fn remove(&mut self, revocation_code: &str) -> Result<(), SteamError> {
        self.linker
            .remove_authenticator(Some(&revocation_code.to_owned()))
            .map_err(remove_error)
    }

    /// Confirms with the code Steam sent. Returns the account to keep: Guard on it
    /// already works, so it must be saved at once. A wrong code can be retried.
    pub fn confirm(&mut self, code: &str) -> Result<Account, SteamError> {
        let tokens = self.linker.tokens().clone();
        let linked = match self.pending.as_mut() {
            None => return Err(SteamError::Steam("nothing to confirm".to_owned())),
            Some(Pending::Move) => self.linker.transfer_finish(code).map_err(transfer_error)?,
            Some(Pending::New {
                account,
                server_time,
            }) => {
                finalize(&self.linker, &self.client, account, *server_time, code)?;
                (**account).clone()
            }
        };
        self.pending = None;
        to_account(linked, self.steam_id, &tokens)
    }
}

/// steamguard's own finalize reads only the result code, and Steam answers a wrong
/// email or SMS code with an OK one, so the answer itself is read here.
fn finalize(
    linker: &AccountLinker<WebApiTransport>,
    client: &TwoFactorClient<WebApiTransport>,
    account: &SteamGuardAccount,
    mut server_time: u64,
    code: &str,
) -> Result<(), SteamError> {
    for _ in 0..MAX_FINALIZE_ROUNDS {
        let mut request = CTwoFactor_FinalizeAddAuthenticator_Request::new();
        request.set_steamid(account.steam_id);
        request.set_authenticator_code(account.generate_code(server_time));
        request.set_authenticator_time(server_time);
        request.set_activation_code(code.to_owned());
        request.set_validate_sms_code(true);
        let response = client
            .finalize_authenticator(request, linker.tokens().access_token())
            .map_err(|err| match err {
                TransportError::Unauthorized => SteamError::SessionExpired,
                err => unknown(&err),
            })?;
        match response.result() {
            EResult::OK => {}
            EResult::TwoFactorActivationCodeMismatch => return Err(SteamError::WrongCode),
            result => return Err(SteamError::Steam(format!("{result:?}"))),
        }
        let answer = response.into_response_data();
        if answer.status() == STATUS_WRONG_ACTIVATION_CODE {
            return Err(SteamError::WrongCode);
        }
        if answer.want_more() {
            // Each round needs a code from a later window than the one before.
            server_time = answer.server_time().max(server_time + CODE_PERIOD_SECS);
            continue;
        }
        if !answer.success() {
            return Err(SteamError::Steam(format!(
                "Steam didn't turn the new authenticator on (status {})",
                answer.status()
            )));
        }
        return Ok(());
    }
    Err(SteamError::Steam(
        "Steam didn't accept the new authenticator's codes".to_owned(),
    ))
}

fn to_account(
    linked: SteamGuardAccount,
    steam_id: u64,
    tokens: &Tokens,
) -> Result<Account, SteamError> {
    let secret = |value: &steamguard::SecretString| {
        Some(Secret::from(value.expose_secret().to_owned()))
            .filter(|secret| !secret.expose().is_empty())
    };
    let text = |value: String| Some(value).filter(|value| !value.is_empty());
    Ok(Account {
        steam_id: Some(steam_id),
        account_name: linked.account_name.clone(),
        authenticator: Authenticator {
            shared_secret: STANDARD.encode(linked.shared_secret.expose_secret()).into(),
            identity_secret: secret(&linked.identity_secret)
                .ok_or_else(|| SteamError::Steam("no identity secret".to_owned()))?,
            revocation_code: secret(&linked.revocation_code),
            secret_1: secret(&linked.secret_1),
            uri: secret(&linked.uri),
            serial_number: text(linked.serial_number),
            token_gid: text(linked.token_gid),
            device_id: text(linked.device_id),
        },
        session: Some(session_of(tokens)),
        password: None,
        profile: None,
        proxy: None,
        auto_confirm: AutoConfirm::default(),
        groups: Vec::new(),
        trusted_api_key: None,
        device_names: BTreeMap::new(),
        client_token: None,
        playing: PlayingList::default(),
        note: None,
        wallet: None,
        last_check: None,
        saved_cookies: Vec::new(),
        browser_region: Default::default(),
    })
}

fn link_error(err: AccountLinkError) -> SteamError {
    match err {
        AccountLinkError::MustProvidePhoneNumber => SteamError::NeedsPhone,
        AccountLinkError::MustConfirmEmail => SteamError::ConfirmEmail,
        AccountLinkError::AuthenticatorPresent => SteamError::GuardElsewhere,
        AccountLinkError::RateLimitExceeded => SteamError::TooManyAttempts,
        AccountLinkError::GenericFailure => {
            SteamError::Steam("Steam couldn't add an authenticator".to_owned())
        }
        AccountLinkError::UnknownEResult(result) => SteamError::Steam(format!("{result:?}")),
        AccountLinkError::Unknown(err) => unknown(&*err),
    }
}

fn transfer_error(err: TransferError) -> SteamError {
    match err {
        TransferError::BadSmsCode => SteamError::WrongCode,
        // Seen when the account has no phone number, which moving needs.
        TransferError::GenericFailure => SteamError::NeedsPhone,
        TransferError::UnknownEResult(result) => SteamError::Steam(format!("{result:?}")),
        TransferError::Transport(err) => unknown(&err),
        TransferError::Unknown(err) => unknown(&*err),
    }
}

fn remove_error(err: RemoveAuthenticatorError) -> SteamError {
    match err {
        RemoveAuthenticatorError::IncorrectRevocationCode { attempts_remaining } => {
            SteamError::WrongRevocationCode(attempts_remaining)
        }
        RemoveAuthenticatorError::MissingRevocationCode => {
            SteamError::Steam("no revocation code".to_owned())
        }
        RemoveAuthenticatorError::TransportError(TransportError::Unauthorized) => {
            SteamError::SessionExpired
        }
        RemoveAuthenticatorError::TransportError(err) => unknown(&err),
        RemoveAuthenticatorError::UnknownEResult(result) => {
            SteamError::Steam(format!("{result:?}"))
        }
        RemoveAuthenticatorError::Unknown(err) => unknown(&*err),
    }
}

/// steamguard wraps network failures in context, so the whole chain is searched.
fn unknown(err: &(dyn Error + 'static)) -> SteamError {
    let network = std::iter::successors(Some(err), |&err| err.source()).any(|err| {
        err.is::<reqwest::Error>()
            || matches!(
                err.downcast_ref::<TransportError>(),
                Some(TransportError::NetworkFailure(_))
            )
    });
    if network {
        SteamError::Network
    } else {
        SteamError::Steam("unexpected response".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_phone_code_wins_over_email_and_approval() {
        use EAuthSessionGuardType::*;
        assert_eq!(
            code_for(&[
                k_EAuthSessionGuardType_DeviceConfirmation,
                k_EAuthSessionGuardType_DeviceCode
            ])
            .unwrap(),
            Some(SignInCode::Phone)
        );
        assert_eq!(
            code_for(&[k_EAuthSessionGuardType_EmailCode]).unwrap(),
            Some(SignInCode::Email)
        );
        assert_eq!(code_for(&[k_EAuthSessionGuardType_None]).unwrap(), None);
        assert!(matches!(
            code_for(&[k_EAuthSessionGuardType_DeviceConfirmation]),
            Err(SteamError::UnsupportedConfirmation)
        ));
    }

    #[test]
    fn a_wrong_revocation_code_says_how_many_tries_are_left() {
        let err = remove_error(RemoveAuthenticatorError::IncorrectRevocationCode {
            attempts_remaining: 4,
        });
        assert_eq!(err.to_string(), "wrong revocation code, 4 tries left");
        assert!(matches!(
            remove_error(RemoveAuthenticatorError::TransportError(
                TransportError::Unauthorized
            )),
            SteamError::SessionExpired
        ));
    }

    #[test]
    fn linked_secrets_become_a_vault_account() {
        let linked = SteamGuardAccount {
            account_name: "kernelrogue".to_owned(),
            shared_secret: steamguard::token::TwoFactorSecret::from_bytes(vec![7; 20]),
            identity_secret: "aWRlbnRpdHk=".to_owned().into(),
            revocation_code: "R71904".to_owned().into(),
            device_id: "android:1".to_owned(),
            ..SteamGuardAccount::default()
        };
        let tokens = Tokens::new("access".to_owned(), "refresh".to_owned());
        let account = to_account(linked, 76561198000000001, &tokens).unwrap();

        assert_eq!(account.steam_id, Some(76561198000000001));
        assert_eq!(
            account.authenticator.shared_secret.expose(),
            STANDARD.encode([7; 20])
        );
        assert_eq!(
            account.authenticator.revocation_code.unwrap().expose(),
            "R71904"
        );
        // Fields Steam left empty aren't kept as empty strings.
        assert!(account.authenticator.uri.is_none());
        assert!(account.authenticator.serial_number.is_none());
        assert_eq!(account.session.unwrap().refresh_token.expose(), "refresh");
    }
}
