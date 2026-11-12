use std::time::{Duration, SystemTime};

/// Tracks when the vault was last used. It runs on wall-clock time on purpose:
/// unlike `Instant`, that keeps counting while the computer sleeps, so a vault left
/// open overnight is already due to lock when the lid opens.
#[derive(Clone, Copy, Debug)]
pub struct IdleTimer {
    timeout: Duration,
    last_active: SystemTime,
}

impl IdleTimer {
    pub fn new(timeout: Duration, now: SystemTime) -> Self {
        Self {
            timeout,
            last_active: now,
        }
    }

    pub fn touch(&mut self, now: SystemTime) {
        self.last_active = now;
    }

    pub fn deadline(&self) -> SystemTime {
        self.last_active + self.timeout
    }

    pub fn is_expired(&self, now: SystemTime) -> bool {
        now >= self.deadline()
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
        let timer = IdleTimer::new(TIMEOUT, at(1000));
        assert!(!timer.is_expired(at(1000 + 899)));
        assert!(timer.is_expired(at(1000 + 900)));
    }

    #[test]
    fn activity_pushes_the_deadline_back() {
        let mut timer = IdleTimer::new(TIMEOUT, at(1000));
        timer.touch(at(1800));
        assert_eq!(timer.deadline(), at(2700));
        assert!(!timer.is_expired(at(2000)));
    }

    #[test]
    fn a_clock_set_back_does_not_lock() {
        let timer = IdleTimer::new(TIMEOUT, at(1000));
        assert!(!timer.is_expired(at(500)));
    }
}
