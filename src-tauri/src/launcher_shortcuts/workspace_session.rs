//! Workspace notifications and the input source share one atomic generation.
//! Publish interruption before waiting for the shortcut service or main thread.
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

#[derive(Clone, Copy)]
pub(in crate::launcher_shortcuts) enum Interruption {
    Sleep = 1,
    Display = 2,
    InactiveSession = 4,
    LoginWindow = 8,
    SecureInput = 16,
}

const BLOCKERS: u64 = 31;
const DESKTOP: u64 = 32;
const EPOCH: u64 = 64;

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(in crate::launcher_shortcuts) struct SessionSnapshot {
    pub epoch: u64,
    pub interrupted: bool,
    pub desktop: bool,
}

#[derive(Default, Clone)]
pub(in crate::launcher_shortcuts) struct WorkspaceSession(Arc<AtomicU64>);

impl WorkspaceSession {
    pub fn snapshot(&self) -> SessionSnapshot {
        let word = self.0.load(Ordering::Acquire);
        SessionSnapshot {
            epoch: word / EPOCH,
            interrupted: word & BLOCKERS != 0,
            desktop: word & DESKTOP != 0,
        }
    }

    pub fn allows(&self, epoch: u64) -> bool {
        let current = self.snapshot();
        !current.interrupted && current.epoch == epoch
    }

    #[cfg(test)]
    pub fn set(&self, reason: Interruption, active: bool) -> bool {
        self.change_interruption(reason, active, Some(self.snapshot().epoch))
    }

    pub fn sample_secure_input(&self, expected: u64, secure: bool) -> bool {
        self.change_interruption(Interruption::SecureInput, secure, Some(expected))
    }

    /// Even a wake without its matching sleep is a boundary. Cached desktop
    /// evidence and queued input cannot be carried past the notification.
    pub fn notification(&self, reason: Interruption, active: bool) {
        self.change_interruption(reason, active, None);
    }

    fn change_interruption(
        &self,
        reason: Interruption,
        active: bool,
        sample_epoch: Option<u64>,
    ) -> bool {
        let mask = reason as u64;
        self.0
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |old| {
                if sample_epoch
                    .is_some_and(|expected| old / EPOCH != expected || (old & mask != 0) == active)
                {
                    return None;
                }
                let next = old.wrapping_add(EPOCH) & !(mask | DESKTOP);
                Some(if active { next | mask } else { next })
            })
            .is_ok()
    }

    /// The activation that clears a login screen may itself establish desktop
    /// evidence. Compare and publish its sampled facts in one generation so
    /// that a concurrently observed lock or full sleep/wake wins over it.
    pub fn observe_frontmost(
        &self,
        expected: u64,
        login: Option<bool>,
        secure: bool,
        matched_desktop: bool,
    ) -> bool {
        let updated = self
            .0
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |old| {
                if old / EPOCH != expected {
                    return None;
                }
                let mut reasons = old & BLOCKERS;
                for (reason, active) in [
                    (Interruption::SecureInput, Some(secure)),
                    (Interruption::LoginWindow, login),
                ] {
                    if let Some(active) = active {
                        let bit = reason as u64;
                        reasons = if active {
                            reasons | bit
                        } else {
                            reasons & !bit
                        };
                    }
                }
                let mut next = if reasons == old & BLOCKERS {
                    old
                } else {
                    (old.wrapping_add(EPOCH) & !(DESKTOP | BLOCKERS)) | reasons
                };
                if matched_desktop && reasons == 0 {
                    next |= DESKTOP;
                }
                Some(next)
            });
        updated.is_ok() && matched_desktop && self.snapshot().desktop
    }

    #[cfg(test)]
    pub fn desktop_activation(&self, epoch: u64, regular_and_frontmost: bool) -> bool {
        // Simulate just an activation, preserving currently sampled blockers.
        let old = self.0.load(Ordering::Acquire);
        self.observe_frontmost(
            epoch,
            None,
            old & Interruption::SecureInput as u64 != 0,
            regular_and_frontmost,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::{Interruption::*, *};

    #[test]
    fn return_from_display_sleep_or_wake_cannot_certify_the_desktop() {
        let session = WorkspaceSession::default();
        assert!(session.desktop_activation(0, true));
        for reason in [LoginWindow, Display, Sleep, InactiveSession] {
            assert!(session.set(reason, true));
            assert!(!session.snapshot().desktop);
        }
        for reason in [Display, Sleep, InactiveSession] {
            assert!(session.set(reason, false));
            assert!(!session.desktop_activation(session.snapshot().epoch, true));
            assert!(session.snapshot().interrupted);
        }
        assert!(session.set(LoginWindow, false));
        let epoch = session.snapshot().epoch;
        assert!(session.allows(epoch));
        assert!(!session.snapshot().desktop);
        assert!(!session.desktop_activation(0, true)); // activation from before lock
        assert!(!session.desktop_activation(epoch, false)); // login UI or different frontmost app
        assert!(session.desktop_activation(epoch, true));
    }

    #[test]
    fn first_matching_desktop_can_clear_the_login_surface_even_after_worker_exit() {
        let workspace = WorkspaceSession::default();
        let independent_observer = workspace.clone();
        workspace.set(LoginWindow, true);
        let locked = workspace.snapshot().epoch;
        // Dropping the tap owner (e.g. when permission is revoked) has no effect
        // on AppKit's observation. The first fresh desktop can enable repair.
        drop(workspace);
        assert!(independent_observer.observe_frontmost(locked, Some(false), false, true));
        let desktop = independent_observer.snapshot();
        assert!(desktop.desktop);
        assert!(!desktop.interrupted);
        independent_observer.set(Sleep, true);
        independent_observer.set(Sleep, false);
        assert!(!independent_observer.observe_frontmost(desktop.epoch, Some(false), false, true));
        assert!(!independent_observer.snapshot().desktop);
    }

    #[test]
    fn wake_without_the_sleep_notification_revokes_cached_evidence() {
        let session = WorkspaceSession::default();
        assert!(session.desktop_activation(0, true));
        session.notification(Display, false);
        assert!(!session.allows(0));
        assert!(!session.snapshot().interrupted);
        assert!(!session.snapshot().desktop);
    }

    #[test]
    fn lock_only_and_password_input_start_new_sequences_without_authorizing_repair() {
        for reason in [LoginWindow, SecureInput] {
            let session = WorkspaceSession::default();
            assert!(session.desktop_activation(0, true));
            assert!(session.set(reason, true));
            assert!(!session.set(reason, true));
            assert!(!session.desktop_activation(session.snapshot().epoch, true));
            assert!(session.set(reason, false));
            assert!(!session.allows(0));
            assert!(session.allows(2));
            assert!(!session.snapshot().desktop);
        }
    }
}
