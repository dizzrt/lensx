//! Thread-bound passive monitor ownership and deterministic recovery policy.
//! Platform backends own their callback context and notification subscriptions;
//! they are dropped only after this owner has retired every native resource.
use super::service::MonitorStatus;
use std::{
    marker::PhantomData,
    rc::Rc,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};

/// Notification facts must become visible without acquiring the service lock.
/// Encoding sleep and its epoch together prevents a new epoch from being paired
/// with the previous sleep state while a notification waits for that lock.
#[derive(Clone, Default)]
pub(super) struct WorkspaceSleep(Arc<AtomicU64>);

impl WorkspaceSleep {
    pub fn update(&self, sleeping: bool) {
        let _ = self
            .0
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |state| {
                Some((state.wrapping_add(2) & !1) | u64::from(sleeping))
            });
    }

    pub fn snapshot(&self) -> (u64, bool) {
        let state = self.0.load(Ordering::Acquire);
        (state, state & 1 != 0)
    }

    pub fn allows(&self, expected: u64) -> bool {
        self.snapshot() == (expected, false)
    }
}

/// Native operations are synchronous and cleanup operations must not unwind.
/// An implementation retains the original RunLoop/mode used by `attach`.
pub(super) trait Backend {
    type Tap;
    type Source;

    fn create_tap(&mut self) -> Option<Self::Tap>;
    fn create_source(&mut self, tap: &Self::Tap) -> Option<Self::Source>;
    fn attach(&mut self, source: &Self::Source);
    fn enabled(&self, tap: &Self::Tap) -> bool;
    fn invalidate(&mut self, tap: &Self::Tap);
    fn remove(&mut self, source: &Self::Source);
    fn release_source(&mut self, source: Self::Source);
    fn release_tap(&mut self, tap: Self::Tap);
}

pub(super) trait Recognition {
    fn revoke(&mut self);
    fn reset(&mut self);
    fn seed(&mut self);
}

/// Declared after the monitor so admission is revoked before native teardown,
/// including when the observer unwinds while a service guard is still held.
pub(super) struct OnExit<F: FnOnce()>(Option<F>);

impl<F: FnOnce()> OnExit<F> {
    pub fn new(cleanup: F) -> Self {
        Self(Some(cleanup))
    }
}

impl<F: FnOnce()> Drop for OnExit<F> {
    fn drop(&mut self) {
        if let Some(cleanup) = self.0.take() {
            cleanup();
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(super) struct Facts {
    pub permitted: bool,
    pub sleeping: bool,
    pub secure_input: bool,
    pub wanted: bool,
    pub interrupted: bool,
    pub reset: bool,
    pub stopped: bool,
}

pub(super) struct Monitor<B: Backend> {
    // Drop cleans handles before Rust drops the backend and its callback context.
    backend: B,
    tap: Option<B::Tap>,
    source: Option<B::Source>,
    attached: bool,
    last_attempt: Option<Duration>,
    stopped: bool,
    // Even a backend made of integer fake handles must obey thread confinement.
    _thread_bound: PhantomData<Rc<()>>,
}

impl<B: Backend> Monitor<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            tap: None,
            source: None,
            attached: false,
            last_attempt: None,
            stopped: false,
            _thread_bound: PhantomData,
        }
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }

    pub fn backend_mut(&mut self) -> &mut B {
        &mut self.backend
    }

    /// This is the only native retirement path, including partial construction
    /// and Drop. Taking each handle makes explicit cleanup followed by Drop safe.
    fn cleanup(&mut self) {
        if let Some(tap) = self.tap.take() {
            self.backend.invalidate(&tap);
            if let Some(source) = self.source.take() {
                if std::mem::take(&mut self.attached) {
                    self.backend.remove(&source);
                }
                self.backend.release_source(source);
            }
            self.backend.release_tap(tap);
        }
    }

    pub fn stop(&mut self, recognition: &mut impl Recognition) {
        self.stopped = true;
        recognition.revoke();
        recognition.reset();
        self.cleanup();
    }

    pub fn poll(
        &mut self,
        facts: Facts,
        now: Duration,
        recognition: &mut impl Recognition,
    ) -> MonitorStatus {
        if self.stopped || facts.stopped {
            self.stop(recognition);
            return MonitorStatus::Unavailable;
        }
        let observable = facts.permitted && !facts.sleeping && !facts.secure_input;
        let disabled = self
            .tap
            .as_ref()
            .is_some_and(|tap| !self.backend.enabled(tap));
        let retire = !observable || !facts.wanted || facts.interrupted || disabled;
        if retire {
            // Revoke before touching the native resource or permitting replacement.
            recognition.revoke();
            recognition.reset();
            self.cleanup();
        } else if facts.reset {
            // Configuration, recording, hide, and gesture epochs do not alter a
            // healthy registration while observation remains necessary.
            recognition.reset();
        }

        let retry_ready = self
            .last_attempt
            .is_none_or(|last| now.saturating_sub(last) >= Duration::from_secs(1));
        if observable && facts.wanted && self.tap.is_none() && retry_ready {
            self.last_attempt = Some(now);
            recognition.revoke();
            recognition.reset();
            self.tap = self.backend.create_tap();
            if let Some(tap) = &self.tap {
                self.source = self.backend.create_source(tap);
                if let Some(source) = &self.source {
                    self.attached = true;
                    self.backend.attach(source);
                }
            }
            let ready = self.source.is_some()
                && self
                    .tap
                    .as_ref()
                    .is_some_and(|tap| self.backend.enabled(tap));
            if ready {
                // Snapshot physical state only after complete establishment and
                // before the caller publishes Active.
                recognition.seed();
            } else {
                self.cleanup();
            }
        }

        if !facts.permitted {
            MonitorStatus::PermissionRequired
        } else if observable && facts.wanted && self.source.is_some() {
            MonitorStatus::Active
        } else {
            MonitorStatus::Unavailable
        }
    }
}

impl<B: Backend> Drop for Monitor<B> {
    fn drop(&mut self) {
        // Native cleanup deliberately does not acquire the shortcut service lock.
        self.cleanup();
    }
}

#[cfg(test)]
#[path = "monitor_tests.rs"]
mod tests;
