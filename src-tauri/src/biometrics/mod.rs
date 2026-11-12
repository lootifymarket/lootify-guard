//! Unlocking the vault with the OS biometric prompt. The vault key is kept by the
//! OS and handed back only after the user passes Touch ID or Windows Hello.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
mod unsupported;

#[cfg(target_os = "macos")]
pub use macos::{enroll, forget, is_enrolled, method, release_key};
#[cfg(not(target_os = "macos"))]
pub use unsupported::{enroll, forget, is_enrolled, method, release_key};

use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Method {
    #[cfg(target_os = "macos")]
    TouchId,
}

#[derive(Debug, thiserror::Error)]
pub enum BiometricError {
    #[error("cancelled")]
    Cancelled,
    #[error("no vault key is stored for biometric unlock")]
    NotEnrolled,
    #[cfg(not(target_os = "macos"))]
    #[error("biometric unlock isn't available on this computer")]
    Unavailable,
    #[error("{0}")]
    Failed(String),
}
