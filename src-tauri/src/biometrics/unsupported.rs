use lootify_guard_core::vault::{KEY_LEN, VaultKey};

use super::{BiometricError, Method};

pub fn method() -> Option<Method> {
    None
}

pub fn is_enrolled() -> bool {
    false
}

pub fn enroll(_key: &[u8; KEY_LEN]) -> Result<(), BiometricError> {
    Err(BiometricError::Unavailable)
}

pub fn release_key(_reason: &str) -> Result<VaultKey, BiometricError> {
    Err(BiometricError::Unavailable)
}

pub fn forget() -> Result<(), BiometricError> {
    Ok(())
}
