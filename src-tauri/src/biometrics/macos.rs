//! The key sits in the login keychain, and Touch ID gates reading it. Without a
//! Developer ID signature the app can't create keychain items that the Secure Enclave
//! itself locks behind biometrics, so the gate is enforced by this code, not the OS.

use std::sync::mpsc;

use block2::RcBlock;
use lootify_guard_core::vault::{KEY_LEN, VaultKey};
use objc2::runtime::Bool;
use objc2_foundation::{NSError, NSString};
use objc2_local_authentication::{LAContext, LAError, LAPolicy};
use security_framework::item::{ItemClass, ItemSearchOptions};
use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};
use zeroize::Zeroizing;

use super::{BiometricError, Method};

const SERVICE: &str = "market.lootify.guard";
const ACCOUNT: &str = "vault-key";
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

pub fn method() -> Option<Method> {
    let context = unsafe { LAContext::new() };
    let available = unsafe {
        context.canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthenticationWithBiometrics)
    };
    available.ok().map(|()| Method::TouchId)
}

// Looks the item up by its attributes only: reading the data could make macOS ask
// for the keychain password, and this runs every time the lock screen opens.
pub fn is_enrolled() -> bool {
    ItemSearchOptions::new()
        .class(ItemClass::generic_password())
        .service(SERVICE)
        .account(ACCOUNT)
        .load_attributes(true)
        .search()
        .is_ok_and(|items| !items.is_empty())
}

pub fn enroll(key: &[u8; KEY_LEN]) -> Result<(), BiometricError> {
    set_generic_password(SERVICE, ACCOUNT, key).map_err(keychain_error)
}

pub fn release_key(reason: &str) -> Result<VaultKey, BiometricError> {
    authenticate(reason)?;
    let stored = Zeroizing::new(get_generic_password(SERVICE, ACCOUNT).map_err(|err| {
        if err.code() == ERR_SEC_ITEM_NOT_FOUND {
            BiometricError::NotEnrolled
        } else {
            keychain_error(err)
        }
    })?);
    let key: [u8; KEY_LEN] = stored
        .as_slice()
        .try_into()
        .map_err(|_| BiometricError::NotEnrolled)?;
    Ok(Zeroizing::new(key))
}

pub fn forget() -> Result<(), BiometricError> {
    match delete_generic_password(SERVICE, ACCOUNT) {
        Err(err) if err.code() != ERR_SEC_ITEM_NOT_FOUND => Err(keychain_error(err)),
        _ => Ok(()),
    }
}

// Blocks until the user answers the Touch ID prompt, so call it off the main thread.
fn authenticate(reason: &str) -> Result<(), BiometricError> {
    let context = unsafe { LAContext::new() };
    let (sender, receiver) = mpsc::channel();
    let reply = RcBlock::new(move |success: Bool, error: *mut NSError| {
        let outcome = if success.as_bool() {
            Ok(())
        } else {
            Err(unsafe { error.as_ref() }
                .map(|error| (error.code(), error.localizedDescription().to_string())))
        };
        // The receiver only goes away once `authenticate` has returned.
        let _ = sender.send(outcome);
    });
    unsafe {
        context.evaluatePolicy_localizedReason_reply(
            LAPolicy::DeviceOwnerAuthenticationWithBiometrics,
            &NSString::from_str(reason),
            &reply,
        );
    }
    let cancelled = [
        LAError::UserCancel.0,
        LAError::SystemCancel.0,
        LAError::AppCancel.0,
        LAError::UserFallback.0,
    ];
    match receiver.recv() {
        Ok(Ok(())) => Ok(()),
        Ok(Err(Some((code, _)))) if cancelled.contains(&code) => Err(BiometricError::Cancelled),
        Ok(Err(Some((_, message)))) => Err(BiometricError::Failed(message)),
        Ok(Err(None)) | Err(_) => Err(BiometricError::Failed("Touch ID failed".into())),
    }
}

fn keychain_error(err: security_framework::base::Error) -> BiometricError {
    BiometricError::Failed(format!("keychain: {err}"))
}
