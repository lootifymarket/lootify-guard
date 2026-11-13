use std::time::{Duration, SystemTime};

/// Tracks when the vault was last used. It runs on wall-clock time on purpose:
/// unlike `Instant`, that keeps counting while the computer sleeps, so a vault left
/// open overnight is already due to lock when the lid opens.
#[derive(Clone, Copy, Debug)]
pub struct IdleTimer {
    /// `None` never locks.
    timeout: Option<Duration>,
    last_active: SystemTime,
}

impl IdleTimer {
    pub fn new(timeout: Option<Duration>, now: SystemTime) -> Self {
        Self {
            timeout,
            last_active: now,
        }
    }

    pub fn touch(&mut self, now: SystemTime) {
        self.last_active = now;
    }

    /// Counts from the last activity, so a shorter timeout can take effect at once.
    pub fn set_timeout(&mut self, timeout: Option<Duration>) {
        self.timeout = timeout;
    }

    pub fn deadline(&self) -> Option<SystemTime> {
        self.timeout.map(|timeout| self.last_active + timeout)
    }

    pub fn is_expired(&self, now: SystemTime) -> bool {
        self.deadline().is_some_and(|deadline| now >= deadline)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TIMEOUT: Duration = Duration::from_secs(15 * 60);

    fn at(secs: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(secs)
    }

    #[test]
    fn expires_once_the_timeout_has_passed() {
        let timer = IdleTimer::new(Some(TIMEOUT), at(1000));
        assert!(!timer.is_expired(at(1000 + 899)));
        assert!(timer.is_expired(at(1000 + 900)));
    }

    #[test]
    fn activity_pushes_the_deadline_back() {
        let mut timer = IdleTimer::new(Some(TIMEOUT), at(1000));
        timer.touch(at(1800));
        assert_eq!(timer.deadline(), Some(at(2700)));
        assert!(!timer.is_expired(at(2000)));
    }

    #[test]
    fn no_timeout_never_locks_and_a_new_one_counts_from_the_last_activity() {
        let mut timer = IdleTimer::new(None, at(1000));
        assert!(!timer.is_expired(at(1000 + 1_000_000)));
        assert_eq!(timer.deadline(), None);
        timer.set_timeout(Some(Duration::from_secs(300)));
        assert!(timer.is_expired(at(1300)));
        assert!(!timer.is_expired(at(1299)));
    }

    #[test]
    fn a_clock_set_back_does_not_lock() {
        let timer = IdleTimer::new(Some(TIMEOUT), at(1000));
        assert!(!timer.is_expired(at(500)));
    }
}
