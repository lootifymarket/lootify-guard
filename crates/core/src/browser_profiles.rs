//! Browser profiles: tabs signed in to no Steam account that keep their sign-ins,
//! like a shared mailbox or a forum. Each always goes through the same proxy.

use serde::{Deserialize, Serialize};

use crate::browser::SavedCookie;
use crate::browser_region::RegionChoice;
use crate::contents::{Contents, MissingProxy};
use crate::proxy::Proxy;

// Names show in tabs and menus.
const MAX_PROFILE_NAME: usize = 40;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserProfile {
    pub id: u32,
    pub name: String,
    /// The proxy every page of the profile goes through; `None` goes straight out.
    pub proxy: Option<u32>,
    #[serde(default)]
    pub saved_cookies: Vec<SavedCookie>,
    /// The page the profile was last on, where it opens again.
    #[serde(default)]
    pub last_url: Option<String>,
    /// Unix seconds.
    #[serde(default)]
    pub last_opened: Option<u64>,
    /// The time zone and language its pages see.
    #[serde(default)]
    pub region: RegionChoice,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum ProfileError {
    #[error("give the profile a name")]
    EmptyName,
    #[error("keep the name under {MAX_PROFILE_NAME} characters")]
    LongName,
    #[error("there's already a profile with that name")]
    Taken,
    #[error("the profile is no longer in the vault")]
    Missing,
    #[error("the proxy is no longer there")]
    MissingProxy,
    #[error("unknown time zone")]
    UnknownRegion,
}

fn check_region(region: &RegionChoice) -> Result<(), ProfileError> {
    if region.is_known() {
        Ok(())
    } else {
        Err(ProfileError::UnknownRegion)
    }
}

impl Contents {
    /// Makes a profile and returns its id.
    pub fn add_profile(
        &mut self,
        name: &str,
        proxy: Option<u32>,
        region: RegionChoice,
    ) -> Result<u32, ProfileError> {
        let name = self.profile_name(name, None)?;
        self.check_proxy(proxy)?;
        check_region(&region)?;
        self.last_profile_id += 1;
        self.profiles.push(BrowserProfile {
            id: self.last_profile_id,
            name,
            proxy,
            saved_cookies: Vec::new(),
            last_url: None,
            last_opened: None,
            region,
        });
        Ok(self.last_profile_id)
    }

    pub fn update_profile(
        &mut self,
        id: u32,
        name: &str,
        proxy: Option<u32>,
        region: RegionChoice,
    ) -> Result<(), ProfileError> {
        let name = self.profile_name(name, Some(id))?;
        self.check_proxy(proxy)?;
        check_region(&region)?;
        let profile = self.profile_mut(id).ok_or(ProfileError::Missing)?;
        profile.name = name;
        profile.proxy = proxy;
        profile.region = region;
        Ok(())
    }

    pub fn remove_profile(&mut self, id: u32) -> bool {
        let count = self.profiles.len();
        self.profiles.retain(|profile| profile.id != id);
        self.profiles.len() < count
    }

    pub fn profile(&self, id: u32) -> Option<&BrowserProfile> {
        self.profiles.iter().find(|profile| profile.id == id)
    }

    pub fn profile_mut(&mut self, id: u32) -> Option<&mut BrowserProfile> {
        self.profiles.iter_mut().find(|profile| profile.id == id)
    }

    /// The profile's proxy. A deleted one is an error rather than `None`, so the
    /// profile never goes out straight by accident.
    pub fn proxy_of_profile(
        &self,
        profile: &BrowserProfile,
    ) -> Result<Option<&Proxy>, MissingProxy> {
        profile
            .proxy
            .map(|id| self.proxy(id).ok_or(MissingProxy))
            .transpose()
    }

    fn check_proxy(&self, proxy: Option<u32>) -> Result<(), ProfileError> {
        match proxy {
            Some(id) if self.proxy(id).is_none() => Err(ProfileError::MissingProxy),
            _ => Ok(()),
        }
    }

    fn profile_name(&self, name: &str, renaming: Option<u32>) -> Result<String, ProfileError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(ProfileError::EmptyName);
        }
        if name.chars().count() > MAX_PROFILE_NAME {
            return Err(ProfileError::LongName);
        }
        let taken = self.profiles.iter().any(|profile| {
            Some(profile.id) != renaming && profile.name.to_lowercase() == name.to_lowercase()
        });
        if taken {
            return Err(ProfileError::Taken);
        }
        Ok(name.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_names_are_unique_and_tidy() {
        let mut contents = Contents::default();
        let mail = contents
            .add_profile("  Shared mailbox ", None, RegionChoice::default())
            .unwrap();
        assert_eq!(contents.profile(mail).unwrap().name, "Shared mailbox");
        assert_eq!(
            contents.add_profile("shared MAILBOX", None, RegionChoice::default()),
            Err(ProfileError::Taken)
        );
        assert_eq!(
            contents.add_profile(" ", None, RegionChoice::default()),
            Err(ProfileError::EmptyName)
        );
        assert_eq!(
            contents.add_profile(&"x".repeat(41), None, RegionChoice::default()),
            Err(ProfileError::LongName)
        );
        // Keeping its own name is no clash.
        assert!(
            contents
                .update_profile(mail, "Shared mailbox", None, RegionChoice::default())
                .is_ok()
        );
    }

    #[test]
    fn a_profile_takes_only_a_proxy_that_exists() {
        let mut contents = Contents::default();
        assert_eq!(
            contents.add_profile("Forum", Some(7), RegionChoice::default()),
            Err(ProfileError::MissingProxy)
        );
        let forum = contents
            .add_profile("Forum", None, RegionChoice::default())
            .unwrap();
        assert_eq!(
            contents.update_profile(forum, "Forum", Some(7), RegionChoice::default()),
            Err(ProfileError::MissingProxy)
        );
    }

    #[test]
    fn ids_are_never_reused() {
        let mut contents = Contents::default();
        let first = contents
            .add_profile("One", None, RegionChoice::default())
            .unwrap();
        assert!(contents.remove_profile(first));
        let second = contents
            .add_profile("Two", None, RegionChoice::default())
            .unwrap();
        assert_ne!(first, second);
        assert!(!contents.remove_profile(first));
    }
}
