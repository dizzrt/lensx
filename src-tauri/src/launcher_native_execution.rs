//! Main-window execution ownership. Native work validates the captured epoch
//! inside the main-thread callback; queue admission never grants future authority.
use crate::plugin_child_webview_execution::NativeExecutionGuard;
use std::sync::{
    atomic::{AtomicU64, AtomicU8, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};

const NORMAL: u8 = 0;
const TRANSFER: u8 = 1;
const RECOVERY: u8 = 2;
const STOPPED: u8 = 3;

pub(crate) struct LauncherNativeFence {
    epoch: AtomicU64,
    mode: AtomicU8,
    host_epoch: AtomicU64,
    navigation_revision: AtomicU64,
    presentation_revision: AtomicU64,
    control: Mutex<()>,
}
impl Default for LauncherNativeFence {
    fn default() -> Self {
        Self {
            epoch: AtomicU64::new(1),
            mode: AtomicU8::new(NORMAL),
            host_epoch: AtomicU64::new(1),
            navigation_revision: AtomicU64::new(0),
            presentation_revision: AtomicU64::new(0),
            control: Mutex::new(()),
        }
    }
}
impl LauncherNativeFence {
    pub(crate) fn epoch(&self) -> u64 {
        self.epoch.load(Ordering::Acquire)
    }
    pub(crate) fn begin_transfer(&self) -> Option<u64> {
        let _control = self
            .control
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        self.mode
            .compare_exchange(NORMAL, TRANSFER, Ordering::AcqRel, Ordering::Acquire)
            .ok()?;
        self.epoch
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |value| {
                value.checked_add(1)
            })
            .ok()
            .map(|old| old + 1)
    }
    pub(crate) fn renew_transfer(&self, previous: u64) -> Option<u64> {
        self.renew(previous, TRANSFER)
    }
    pub(crate) fn recovery(&self, previous: u64) -> Option<u64> {
        self.renew(previous, RECOVERY)
    }
    fn renew(&self, previous: u64, mode: u8) -> Option<u64> {
        let _control = self
            .control
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let next = previous.checked_add(1)?;
        self.epoch
            .compare_exchange(previous, next, Ordering::AcqRel, Ordering::Acquire)
            .ok()?;
        self.mode.store(mode, Ordering::Release);
        Some(next)
    }
    pub(crate) fn finish(&self, epoch: u64) -> bool {
        self.renew(epoch, NORMAL).is_some()
    }
    pub(crate) fn reset_host(&self) {
        let _control = self
            .control
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if self.mode.load(Ordering::Acquire) == STOPPED {
            return;
        }
        let _ = self
            .host_epoch
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |value| {
                value.checked_add(1)
            });
        self.navigation_revision.store(0, Ordering::Release);
        self.presentation_revision.store(0, Ordering::Release);
        let _ = self
            .epoch
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |value| {
                value.checked_add(1)
            });
        self.mode.store(NORMAL, Ordering::Release);
    }
    pub(crate) fn shutdown(&self) {
        let _control = self
            .control
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        self.epoch.fetch_add(1, Ordering::AcqRel);
        self.mode.store(STOPPED, Ordering::Release);
    }
    pub(crate) fn host_epoch(&self) -> u64 {
        self.host_epoch.load(Ordering::Acquire)
    }
    pub(crate) fn begin_surface_intent(
        &self,
        host_epoch: u64,
        navigation_revision: u64,
    ) -> Option<u64> {
        let _control = self
            .control
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if self.host_epoch() != host_epoch
            || self.mode.load(Ordering::Acquire) != NORMAL
            || navigation_revision <= self.navigation_revision.load(Ordering::Acquire)
        {
            return None;
        }
        let next = self.epoch().checked_add(1)?;
        self.navigation_revision
            .store(navigation_revision, Ordering::Release);
        self.presentation_revision.store(0, Ordering::Release);
        self.epoch.store(next, Ordering::Release);
        Some(next)
    }
    pub(crate) fn surface_guard(
        self: &Arc<Self>,
        host_epoch: u64,
        intent_epoch: u64,
        revision: u64,
    ) -> Option<NativeExecutionGuard> {
        let _control = self
            .control
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if self.host_epoch() != host_epoch
            || self.epoch() != intent_epoch
            || self.mode.load(Ordering::Acquire) != NORMAL
            || revision <= self.presentation_revision.load(Ordering::Acquire)
        {
            return None;
        }
        self.presentation_revision
            .store(revision, Ordering::Release);
        let fence = Arc::clone(self);
        Some(NativeExecutionGuard::new(move || {
            fence.host_epoch() == host_epoch
                && fence.epoch() == intent_epoch
                && fence.mode.load(Ordering::Acquire) == NORMAL
                && fence.presentation_revision.load(Ordering::Acquire) == revision
        }))
    }
    pub(crate) fn normal_guard(
        self: &Arc<Self>,
        allow_recovery_show: bool,
    ) -> NativeExecutionGuard {
        let epoch = self.epoch();
        let fence = Arc::clone(self);
        NativeExecutionGuard::new(move || {
            let mode = fence.mode.load(Ordering::Acquire);
            fence.epoch() == epoch && (mode == NORMAL || (allow_recovery_show && mode == RECOVERY))
        })
    }
    pub(crate) fn owned_guard(
        self: &Arc<Self>,
        epoch: u64,
        upstream: &NativeExecutionGuard,
    ) -> NativeExecutionGuard {
        let fence = Arc::clone(self);
        let upstream = upstream.clone();
        NativeExecutionGuard::new(move || {
            upstream.is_current()
                && fence.epoch() == epoch
                && fence.mode.load(Ordering::Acquire) != NORMAL
        })
    }
}

pub(crate) fn fence<R: Runtime>(app: &AppHandle<R>) -> Arc<LauncherNativeFence> {
    if let Some(fence) = app.try_state::<Arc<LauncherNativeFence>>() {
        return Arc::clone(fence.inner());
    }
    let candidate = Arc::new(LauncherNativeFence::default());
    if app.manage(Arc::clone(&candidate)) {
        candidate
    } else {
        Arc::clone(app.state::<Arc<LauncherNativeFence>>().inner())
    }
}

pub(crate) fn confirmed<R: Runtime, T: Send + 'static>(
    app: &AppHandle<R>,
    guard: &NativeExecutionGuard,
    budget: Duration,
    execute: impl FnOnce(&NativeExecutionGuard) -> Result<T, ()> + Send + 'static,
) -> Result<T, ()> {
    if budget.is_zero() {
        return Err(());
    }
    let timeout = budget.min(Duration::from_secs(5));
    let operation = guard.with_deadline(timeout);
    #[cfg(target_os = "macos")]
    if objc2::MainThreadMarker::new().is_some() {
        if !operation.is_current() {
            return Err(());
        }
        let result = execute(&operation);
        return if operation.is_current() {
            result
        } else {
            Err(())
        };
    }
    let callback_guard = operation.clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let result = if callback_guard.is_current() {
            execute(&callback_guard)
        } else {
            Err(())
        };
        let result = if callback_guard.is_current() {
            result
        } else {
            Err(())
        };
        let _ = sender.send(result);
    })
    .map_err(|_| ())?;
    match receiver.recv_timeout(timeout) {
        Ok(result) => result,
        Err(_) => {
            operation.expire();
            Err(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quit_revokes_every_main_lease_and_host_reload_cannot_reenable_it() {
        let fence = Arc::new(LauncherNativeFence::default());
        let normal = fence.normal_guard(false);
        let transfer = fence.begin_transfer().unwrap();
        let pending = fence.owned_guard(transfer, &NativeExecutionGuard::new(|| true));
        fence.shutdown();
        assert!(!normal.is_current() && !pending.is_current());
        assert!(fence.begin_transfer().is_none());
        assert!(fence.begin_surface_intent(fence.host_epoch(), 1).is_none());
        fence.reset_host();
        assert!(!fence.normal_guard(true).is_current());
        assert!(!fence.finish(transfer));
    }
    #[test]
    fn old_main_callbacks_never_resume_after_transfer_rollback_or_new_main_owner() {
        let fence = Arc::new(LauncherNativeFence::default());
        let old_hide = fence.normal_guard(false);
        let epoch = fence.begin_transfer().unwrap();
        assert!(!old_hide.is_current());
        let upstream = NativeExecutionGuard::new(|| true);
        let old_transfer = fence.owned_guard(epoch, &upstream);
        let rollback = fence.renew_transfer(epoch).unwrap();
        assert!(!old_transfer.is_current());
        let old_rollback = fence.owned_guard(rollback, &upstream);
        let recovery = fence.recovery(rollback).unwrap();
        assert!(!old_rollback.is_current());
        assert!(fence.normal_guard(true).is_current());
        assert!(!fence.normal_guard(false).is_current());
        let old_repair = fence.owned_guard(recovery, &upstream);
        assert!(fence.finish(recovery));
        let new_main = fence.normal_guard(false);
        assert!(new_main.is_current());
        assert!(!old_repair.is_current());
        assert!(!old_hide.is_current());
        assert!(!fence.finish(recovery));
        assert!(new_main.is_current());
    }
    #[test]
    fn terminal_or_expired_transaction_cannot_show_main_repair() {
        let fence = Arc::new(LauncherNativeFence::default());
        let epoch = fence.begin_transfer().unwrap();
        let upstream = NativeExecutionGuard::new(|| true);
        let guard = fence.owned_guard(epoch, &upstream);
        upstream.expire();
        assert!(!guard.is_current());
        let guard = fence.owned_guard(epoch, &NativeExecutionGuard::new(|| true));
        fence.reset_host();
        assert!(!guard.is_current());
        assert!(fence.normal_guard(false).is_current());
    }
    #[test]
    fn late_surface_intents_cannot_rebind_after_new_page_or_host_reload() {
        let fence = Arc::new(LauncherNativeFence::default());
        let realm = fence.host_epoch();
        let a = fence.begin_surface_intent(realm, 1).unwrap();
        let stale_native = fence.surface_guard(realm, a, 1).unwrap();
        let b = fence.begin_surface_intent(realm, 2).unwrap();
        assert!(!stale_native.is_current());
        assert!(fence.begin_surface_intent(realm, 1).is_none());
        assert!(fence.surface_guard(realm, a, 99).is_none());
        let b_resize = fence.surface_guard(realm, b, 1).unwrap();
        let newest = fence.surface_guard(realm, b, 2).unwrap();
        assert!(!b_resize.is_current());
        assert!(newest.is_current());
        fence.reset_host();
        assert!(!newest.is_current());
        assert!(fence.begin_surface_intent(realm, 99).is_none());
        assert!(fence.begin_surface_intent(fence.host_epoch(), 1).is_some());
    }
}
