use std::error::Error;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Serialize;
use steamguard::accountlinker::{AccountLinkConfirmType, TransferError};
use steamguard::protobufs::steammessages_auth_steamclient::EAuthSessionGuardType;
use steamguard::token::Tokens;
use steamguard::transport::{TransportError, WebApiTransport};
use steamguard::{
    AccountLinkError, AccountLinker, ExposeSecret, FinalizeLinkError, SteamGuardAccount, UserLogin,
};

use crate::contents::{Account, Authenticator, AutoConfirm, Secret};
use crate::proxy::ProxyAddress;
use crate::steam::{
    self, SteamError, guard_code_error, login_error, mobile_login, session_of, steam_id_of,
};

// Steam asks for codes from a few windows in a row to see that the new secret works;
// SDA gives up after this many.
const MAX_FINALIZE_ROUNDS: usize = 30;
const CODE_PERIOD_SECS: u64 = 30;

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

/// A signed-in account that gets an authenticator on this device.
pub struct NewGuard {
    linker: AccountLinker<WebApiTransport>,
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

    /// Asks Steam to move Guard here from the phone; it sends an SMS to confirm with.
    pub fn start_move(&mut self) -> Result<ConfirmBy, SteamError> {
        self.linker.transfer_start().map_err(transfer_error)?;
        self.pending = Some(Pending::Move);
        Ok(ConfirmBy::Sms { phone_hint: None })
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
                finalize(&mut self.linker, account, *server_time, code)?;
                (**account).clone()
            }
        };
        self.pending = None;
        to_account(linked, self.steam_id, &tokens)
    }
}

fn finalize(
    linker: &mut AccountLinker<WebApiTransport>,
    account: &mut SteamGuardAccount,
    mut server_time: u64,
    code: &str,
) -> Result<(), SteamError> {
    for _ in 0..MAX_FINALIZE_ROUNDS {
        match linker.finalize(server_time, account, code.to_owned()) {
            Ok(()) => return Ok(()),
            // Each round needs a code from a later window than the one before.
            Err(FinalizeLinkError::WantMore { server_time: next }) => {
                server_time = next.max(server_time + CODE_PERIOD_SECS);
            }
            Err(err) => return Err(finalize_error(err)),
        }
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

fn finalize_error(err: FinalizeLinkError) -> SteamError {
    match err {
        FinalizeLinkError::BadSmsCode => SteamError::WrongCode,
        FinalizeLinkError::UnknownEResult(result) => SteamError::Steam(format!("{result:?}")),
        FinalizeLinkError::TransportError(err) => unknown(&err),
        FinalizeLinkError::Unknown(err) => unknown(&*err),
        FinalizeLinkError::WantMore { .. } => {
            SteamError::Steam("Steam wants more codes".to_owned())
        }
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
