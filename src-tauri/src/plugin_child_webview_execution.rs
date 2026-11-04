//! Revocable execution permits for Host-owned native presentation.
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

pub(crate) struct PresentationEpoch {
    active: AtomicBool,
    slot: AtomicU64,
    visibility: AtomicU64,
}

impl Default for PresentationEpoch {
    fn default() -> Self {
        Self {
            active: AtomicBool::new(true),
            slot: AtomicU64::new(0),
            visibility: AtomicU64::new(0),
        }
    }
}

impl PresentationEpoch {
    pub(crate) fn revoke(&self) {
        self.active.store(false, Ordering::Release);
    }
    pub(crate) fn slot_revision(&self) -> u64 {
        self.slot.load(Ordering::Acquire)
    }
    pub(crate) fn slot_guard(self: &Arc<Self>, revision: u64) -> NativeExecutionGuard {
        self.slot.store(revision, Ordering::Release);
        let epoch = Arc::clone(self);
        NativeExecutionGuard::new(move || {
            epoch.active.load(Ordering::Acquire) && epoch.slot.load(Ordering::Acquire) == revision
        })
    }
    pub(crate) fn visibility_guard(self: &Arc<Self>, revision: u64) -> NativeExecutionGuard {
        self.visibility.store(revision, Ordering::Release);
        self.focus_guard(revision)
    }
    pub(crate) fn focus_guard(self: &Arc<Self>, revision: u64) -> NativeExecutionGuard {
        let epoch = Arc::clone(self);
        NativeExecutionGuard::new(move || {
            epoch.active.load(Ordering::Acquire)
                && epoch.visibility.load(Ordering::Acquire) == revision
        })
    }
}

#[derive(Clone)]
pub(crate) struct NativeExecutionGuard {
    current: Arc<dyn Fn() -> bool + Send + Sync>,
    expired: Arc<Expiration>,
    deadline: Option<Instant>,
}

#[derive(Default)]
struct Expiration {
    expired: AtomicBool,
    listeners: Mutex<Vec<Box<dyn FnOnce() + Send>>>,
}

impl Expiration {
    fn expire(&self) {
        if self.expired.swap(true, Ordering::AcqRel) {
            return;
        }
        let listeners = std::mem::take(
            &mut *self
                .listeners
                .lock()
                .unwrap_or_else(|error| error.into_inner()),
        );
        for listener in listeners {
            listener();
        }
    }
}

impl std::fmt::Debug for NativeExecutionGuard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NativeExecutionGuard")
            .field("expired", &self.expired.expired.load(Ordering::Acquire))
            .finish_non_exhaustive()
    }
}

impl NativeExecutionGuard {
    pub(crate) fn new(current: impl Fn() -> bool + Send + Sync + 'static) -> Self {
        Self {
            current: Arc::new(current),
            expired: Arc::default(),
            deadline: None,
        }
    }
    pub(crate) fn is_current(&self) -> bool {
        self.is_unexpired() && (self.current)() && self.is_unexpired()
    }
    pub(crate) fn expire(&self) {
        self.expired.expire();
    }
    /// Register a nonblocking wakeup. No guard mutex is held while it runs.
    pub(crate) fn on_expire(&self, listener: impl FnOnce() + Send + 'static) {
        let mut listener = Some(Box::new(listener) as Box<dyn FnOnce() + Send>);
        {
            let mut listeners = self
                .expired
                .listeners
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if self.is_unexpired() {
                listeners.push(listener.take().expect("listener exists"));
            }
        }
        if let Some(listener) = listener {
            listener();
        }
    }
    pub(crate) fn remaining_timeout(&self, maximum: Duration) -> Duration {
        self.deadline.map_or(maximum, |deadline| {
            maximum.min(deadline.saturating_duration_since(Instant::now()))
        })
    }
    /// Use only alongside an independent identity check under its owning lock.
    /// This cannot call the currentness closure, which may acquire that lock.
    pub(crate) fn is_unexpired(&self) -> bool {
        !self.expired.expired.load(Ordering::Acquire)
            && self
                .deadline
                .is_none_or(|deadline| Instant::now() < deadline)
    }

    pub(crate) fn with_deadline(&self, duration: Duration) -> Self {
        let parent = self.clone();
        let deadline = self.deadline.map_or(Instant::now() + duration, |deadline| {
            deadline.min(Instant::now() + duration)
        });
        let mut guard = Self::new(move || parent.is_current());
        guard.deadline = Some(deadline);
        let child = Arc::downgrade(&guard.expired);
        self.on_expire(move || {
            if let Some(child) = child.upgrade() {
                child.expire();
            }
        });
        guard
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum NativePresentationOperation {
    Bounds {
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    },
    Show,
    Hide,
    Focus,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum NativePresentationStep {
    ConfirmClip,
    HideUnconfirmed,
    Apply(NativePresentationOperation),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NativePresentationOutcome {
    Applied,
    Stale,
    FocusUnavailable { awaiting_key: bool },
    Failed,
    FailedHidden,
}

/// Runs inside the native execution callback, never at queue admission. Recheck
/// between stages: a timeout, hide, transfer or termination may retire the permit
/// while clipping/readback is in progress. No later mutation then runs.
pub(crate) fn perform_owned_presentation(
    guard: &NativeExecutionGuard,
    operation: NativePresentationOperation,
    mut execute: impl FnMut(NativePresentationStep) -> Result<(), ()>,
) -> NativePresentationOutcome {
    if !guard.is_current() {
        return NativePresentationOutcome::Stale;
    }
    if operation == NativePresentationOperation::Show {
        let clipped = execute(NativePresentationStep::ConfirmClip).is_ok();
        if !guard.is_current() {
            return NativePresentationOutcome::Stale;
        }
        if !clipped {
            let hidden = execute(NativePresentationStep::HideUnconfirmed).is_ok();
            return if !guard.is_current() {
                NativePresentationOutcome::Stale
            } else if hidden {
                NativePresentationOutcome::FailedHidden
            } else {
                NativePresentationOutcome::Failed
            };
        }
    }
    if !guard.is_current() {
        return NativePresentationOutcome::Stale;
    }
    let applied = execute(NativePresentationStep::Apply(operation)).is_ok();
    if !guard.is_current() {
        NativePresentationOutcome::Stale
    } else if applied {
        NativePresentationOutcome::Applied
    } else {
        NativePresentationOutcome::Failed
    }
}

pub(crate) fn confirm_native_execution(
    guard: &NativeExecutionGuard,
    timeout: Duration,
    is_main_thread: bool,
    schedule: impl FnOnce(Box<dyn FnOnce() + Send>) -> Result<(), ()>,
    execute: impl FnOnce(&NativeExecutionGuard) -> NativePresentationOutcome + Send + 'static,
) -> NativePresentationOutcome {
    let guard = guard.with_deadline(timeout);
    if is_main_thread {
        return if guard.is_current() {
            execute(&guard)
        } else {
            NativePresentationOutcome::Stale
        };
    }
    let callback_guard = guard.clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    if schedule(Box::new(move || {
        let outcome = if callback_guard.is_current() {
            execute(&callback_guard)
        } else {
            NativePresentationOutcome::Stale
        };
        let _ = sender.send(outcome);
    }))
    .is_err()
    {
        guard.expire();
        return NativePresentationOutcome::Failed;
    }
    match receiver.recv_timeout(timeout) {
        Ok(outcome) => outcome,
        Err(_) => {
            guard.expire();
            NativePresentationOutcome::Failed
        }
    }
}

/// Host physical pixels map to the parent's logical coordinate system. Keep
/// fractional logical pixels: truncating odd Retina pixels loses slot coverage.
pub(crate) fn logical_child_frame(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
    parent_height: f64,
    flipped: bool,
) -> Option<[f64; 4]> {
    if !scale.is_finite()
        || scale <= 0.0
        || !parent_height.is_finite()
        || parent_height <= 0.0
        || x < 0
        || y < 0
        || width == 0
        || height == 0
    {
        return None;
    }
    let x = f64::from(x) / scale;
    let y = f64::from(y) / scale;
    let width = f64::from(width) / scale;
    let height = f64::from(height) / scale;
    Some([
        x,
        if flipped {
            y
        } else {
            parent_height - y - height
        },
        width,
        height,
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn expiration_wakes_descendants_once_without_expiring_the_parent_from_a_child() {
        let parent = NativeExecutionGuard::new(|| true);
        let child = parent.with_deadline(Duration::from_secs(10));
        child.expire();
        assert!(parent.is_current());
        let active_child = parent.with_deadline(Duration::from_secs(10));
        let (send, receive) = std::sync::mpsc::channel();
        active_child.on_expire(move || {
            let _ = send.send(());
        });
        parent.expire();
        parent.expire();
        receive.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(receive.try_recv().is_err());
        assert!(!active_child.is_current());
    }

    #[test]
    fn expiration_callbacks_run_outside_the_listener_lock_and_late_registration_is_immediate() {
        let guard = NativeExecutionGuard::new(|| true);
        let reentrant = guard.clone();
        let (send, receive) = std::sync::mpsc::channel();
        guard.on_expire(move || {
            reentrant.on_expire(move || {
                let _ = send.send(());
            })
        });
        let worker = std::thread::spawn(move || guard.expire());
        receive.recv_timeout(Duration::from_secs(1)).unwrap();
        worker.join().unwrap();
    }

    #[test]
    fn queued_old_owner_work_is_inert_after_same_window_rollback() {
        let epoch = Arc::new(PresentationEpoch::default());
        let guard = epoch.visibility_guard(1);
        epoch.revoke();
        let replacement = Arc::new(PresentationEpoch::default());
        assert!(replacement.visibility_guard(1).is_current());
        for operation in [
            NativePresentationOperation::Hide,
            NativePresentationOperation::Focus,
            NativePresentationOperation::Bounds {
                x: 1,
                y: 2,
                width: 3,
                height: 4,
            },
        ] {
            assert_eq!(
                perform_owned_presentation(&guard, operation, |_| panic!(
                    "retired owner must not mutate native state"
                )),
                NativePresentationOutcome::Stale
            );
        }
    }

    #[test]
    fn later_intent_supersedes_queued_bounds_and_focus() {
        let epoch = Arc::new(PresentationEpoch::default());
        let bounds = epoch.slot_guard(1);
        let focus = epoch.visibility_guard(1);
        let newest_bounds = epoch.slot_guard(2);
        let newest_visibility = epoch.visibility_guard(2);
        assert!(!bounds.is_current());
        assert!(!focus.is_current());
        assert!(newest_bounds.is_current());
        assert!(newest_visibility.is_current());
    }

    #[test]
    fn retirement_during_clip_never_runs_show_or_failure_hide() {
        for success in [true, false] {
            let epoch = Arc::new(PresentationEpoch::default());
            let guard = epoch.visibility_guard(1);
            let mut steps = vec![];
            assert_eq!(
                perform_owned_presentation(&guard, NativePresentationOperation::Show, |step| {
                    steps.push(step);
                    epoch.revoke();
                    if success {
                        Ok(())
                    } else {
                        Err(())
                    }
                }),
                NativePresentationOutcome::Stale
            );
            assert_eq!(steps, [NativePresentationStep::ConfirmClip]);
        }
    }

    #[test]
    fn timeout_expires_a_queued_callback_before_it_can_mutate() {
        let queued = Arc::new(Mutex::new(None));
        let job = Arc::clone(&queued);
        let guard = NativeExecutionGuard::new(|| true);
        assert_eq!(
            confirm_native_execution(
                &guard,
                Duration::from_millis(1),
                false,
                move |callback| {
                    *job.lock().unwrap() = Some(callback);
                    Ok(())
                },
                |_| panic!("late callback must be inert")
            ),
            NativePresentationOutcome::Failed
        );
        queued.lock().unwrap().take().unwrap()();
    }

    #[test]
    fn confirmed_completion_reports_actual_native_failure() {
        for succeed in [true, false] {
            let guard = NativeExecutionGuard::new(|| true);
            let expected = if succeed {
                NativePresentationOutcome::Applied
            } else {
                NativePresentationOutcome::Failed
            };
            assert_eq!(
                confirm_native_execution(
                    &guard,
                    Duration::from_secs(1),
                    false,
                    |job| {
                        job();
                        Ok(())
                    },
                    move |guard| {
                        perform_owned_presentation(guard, NativePresentationOperation::Hide, |_| {
                            if succeed {
                                Ok(())
                            } else {
                                Err(())
                            }
                        })
                    }
                ),
                expected
            );
        }
    }
    #[test]
    fn retina_bounds_keep_odd_pixels_and_parent_axis_direction() {
        assert_eq!(
            logical_child_frame(21, 41, 601, 401, 2.0, 600.0, false),
            Some([10.5, 379.0, 300.5, 200.5])
        );
        assert_eq!(
            logical_child_frame(21, 41, 601, 401, 2.0, 600.0, true),
            Some([10.5, 20.5, 300.5, 200.5])
        );
        for scale in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            assert!(logical_child_frame(0, 0, 1, 1, scale, 600.0, false).is_none());
        }
    }

    #[test]
    fn main_thread_execution_never_waits_on_its_own_dispatch_queue() {
        let guard = NativeExecutionGuard::new(|| true);
        assert_eq!(
            confirm_native_execution(
                &guard,
                Duration::from_secs(1),
                true,
                |_| panic!("main-thread execution must not queue and wait"),
                |_| NativePresentationOutcome::Applied
            ),
            NativePresentationOutcome::Applied
        );
    }

    #[test]
    fn timeout_during_execution_prevents_later_mutation_stages() {
        let guard = NativeExecutionGuard::new(|| true);
        let mut count = 0;
        assert_eq!(
            perform_owned_presentation(&guard, NativePresentationOperation::Show, |_| {
                count += 1;
                guard.expire();
                Ok(())
            }),
            NativePresentationOutcome::Stale
        );
        assert_eq!(count, 1);
    }
    #[test]
    fn expiry_while_currentness_callback_waits_cannot_authorize_late_native_work() {
        let (started, observed) = std::sync::mpsc::channel();
        let (release, blocked) = std::sync::mpsc::channel();
        let blocked = std::sync::Mutex::new(blocked);
        let guard = NativeExecutionGuard::new(move || {
            started.send(()).unwrap();
            blocked.lock().unwrap().recv().unwrap();
            true
        });
        let queued = guard.clone();
        let task = std::thread::spawn(move || queued.is_current());
        observed.recv_timeout(Duration::from_secs(1)).unwrap();
        guard.expire();
        release.send(()).unwrap();
        assert!(!task.join().unwrap());
    }
}
