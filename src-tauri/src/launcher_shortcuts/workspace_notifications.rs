//! AppKit owns session notifications for the Host lifetime, independently of
//! Input Monitoring permission, event-tap resources and the observer thread.
use super::*;
use block2::{DynBlock, RcBlock};
use objc2::{rc::Retained, runtime::ProtocolObject, MainThreadMarker};
use objc2_app_kit::{
    NSApplicationActivationPolicy, NSRunningApplication, NSWorkspace, NSWorkspaceApplicationKey,
    NSWorkspaceDidActivateApplicationNotification, NSWorkspaceDidWakeNotification,
    NSWorkspaceScreensDidSleepNotification, NSWorkspaceScreensDidWakeNotification,
    NSWorkspaceSessionDidBecomeActiveNotification, NSWorkspaceSessionDidResignActiveNotification,
    NSWorkspaceWillSleepNotification,
};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSObjectProtocol};
use std::{cell::RefCell, ptr::NonNull};

struct Subscriptions {
    center: Retained<NSNotificationCenter>,
    tokens: Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>,
}

impl Subscriptions {
    fn subscribe(
        &mut self,
        name: &objc2_foundation::NSNotificationName,
        block: &DynBlock<dyn Fn(NonNull<NSNotification>)>,
    ) {
        self.tokens.push(unsafe {
            self.center
                .addObserverForName_object_queue_usingBlock(Some(name), None, None, block)
        });
    }
}

impl Drop for Subscriptions {
    fn drop(&mut self) {
        for token in self.tokens.drain(..) {
            unsafe { self.center.removeObserver((*token).as_ref()) };
        }
    }
}

thread_local! {
    static SUBSCRIPTIONS: RefCell<Option<Subscriptions>> = const { RefCell::new(None) };
}

pub(in crate::launcher_shortcuts) fn stop_workspace<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.run_on_main_thread(|| {
        SUBSCRIPTIONS.with_borrow_mut(|owner| {
            owner.take();
        })
    });
}

fn login_surface(application: &NSRunningApplication) -> bool {
    application.bundleIdentifier().is_some_and(|id| {
        matches!(
            id.to_string().as_str(),
            "com.apple.loginwindow" | "com.apple.ScreenSaver.Engine"
        )
    })
}

// The epoch is invalidated before waiting for the service. Fold simultaneous
// changes into the latest snapshot; an older callback may obtain the lock last.
fn reconcile<R: Runtime>(app: &AppHandle<R>, workspace: &WorkspaceSession) {
    let Ok(state) = state(app) else { return };
    let Ok(mut service) = state.lock() else {
        return;
    };
    let latest = workspace.snapshot();
    if service.stopped || service.workspace_epoch == latest.epoch {
        return;
    }
    service.workspace_epoch = latest.epoch;
    service.sleeping = latest.interrupted;
    service.inner.admission().set_sleeping(latest.interrupted);
    service.monitor_epoch += 1;
    service.gesture.reset(monotonic_millis());
    let cancelled = service.inner.interrupt_input();
    if !latest.interrupted {
        service.inner.sync_held_chords(platform::chord_key_held);
    }
    // A dead worker cannot rebuild. The independent session boundary keeps
    // checking this existing failure on activation and explicit Reopen.
    if service.inner.monitor_status() != MonitorStatus::ObserverStopped {
        service.inner.set_monitor(MonitorStatus::Unavailable);
    }
    let snapshot = service.inner.snapshot();
    drop(service);
    if let Some(lease) = cancelled {
        emit(
            app,
            RECORDING,
            RecordingEvent {
                lease_id: lease.lease_id,
                trigger: None,
                cancelled: true,
            },
        );
    }
    emit(app, CHANGED, snapshot);
    publish_failures(app);
}

pub(super) fn observe_secure_input<R: Runtime>(
    app: &AppHandle<R>,
    workspace: &WorkspaceSession,
) -> bool {
    let expected = workspace.snapshot().epoch;
    let secure = unsafe { platform::IsSecureEventInputEnabled() };
    if workspace.sample_secure_input(expected, secure) {
        reconcile(app, workspace);
    }
    secure
}

fn preflight() -> bool {
    unsafe { platform::CGPreflightListenEventAccess() }
}

fn recheck_permission<R: Runtime>(
    app: &AppHandle<R>,
    workspace: &WorkspaceSession,
    preflight: impl FnOnce() -> bool,
) {
    let Ok(state) = state(app) else { return };
    let Ok(mut service) = state.lock() else {
        return;
    };
    if service.stopped || workspace.snapshot().interrupted || !service.inner.wants_monitor() {
        return;
    }
    let current = service.inner.monitor_status();
    if current == MonitorStatus::ObserverStopped {
        return;
    }
    let status = match (current, preflight()) {
        (_, false) => MonitorStatus::PermissionRequired,
        (MonitorStatus::PermissionRequired, true) => MonitorStatus::Unavailable,
        _ => return,
    };
    let snapshot = service
        .inner
        .set_monitor(status)
        .then(|| service.inner.snapshot());
    drop(service);
    if let Some(snapshot) = snapshot {
        emit(app, CHANGED, snapshot);
    }
}

/// Main-thread final check. A query can invalidate evidence; only a matching,
/// freshly delivered workspace activation can grant it.
pub(in crate::launcher_shortcuts) fn refresh_session<R: Runtime>(app: &AppHandle<R>) {
    if !SUBSCRIPTIONS.with_borrow(|owner| owner.is_some()) {
        return;
    }
    if let Some(session) = app.try_state::<WorkspaceSession>() {
        let epoch = session.snapshot().epoch;
        let front = NSWorkspace::sharedWorkspace().frontmostApplication();
        session.observe_frontmost(
            epoch,
            front.as_deref().map(login_surface),
            unsafe { platform::IsSecureEventInputEnabled() },
            false,
        );
        reconcile(app, &session);
        recheck_permission(app, &session, preflight);
    }
}

pub(super) fn install<R: Runtime>(app: &AppHandle<R>, workspace: &WorkspaceSession) {
    // Tauri installs the shortcut service from its main-thread setup callback.
    let _main = MainThreadMarker::new().expect("workspace observation requires main thread");
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    let mut owner = Subscriptions {
        center,
        tokens: Vec::new(),
    };
    for (name, reason, active) in unsafe {
        [
            (NSWorkspaceWillSleepNotification, Interruption::Sleep, true),
            (NSWorkspaceDidWakeNotification, Interruption::Sleep, false),
            (
                NSWorkspaceScreensDidSleepNotification,
                Interruption::Display,
                true,
            ),
            (
                NSWorkspaceScreensDidWakeNotification,
                Interruption::Display,
                false,
            ),
            (
                NSWorkspaceSessionDidResignActiveNotification,
                Interruption::InactiveSession,
                true,
            ),
            (
                NSWorkspaceSessionDidBecomeActiveNotification,
                Interruption::InactiveSession,
                false,
            ),
        ]
    } {
        let app = app.clone();
        let workspace = workspace.clone();
        let block = RcBlock::new(move |_: NonNull<NSNotification>| {
            workspace.notification(reason, active);
            reconcile(&app, &workspace);
        });
        owner.subscribe(name, &block);
    }
    let activation_app = app.clone();
    let activation_workspace = workspace.clone();
    let block = RcBlock::new(move |notification: NonNull<NSNotification>| {
        let workspace = &activation_workspace;
        let before = workspace.snapshot();
        let front = NSWorkspace::sharedWorkspace().frontmostApplication();
        let notified = unsafe { notification.as_ref() }
            .userInfo()
            .and_then(|info| info.objectForKey(unsafe { NSWorkspaceApplicationKey }.as_ref()));
        let matches = notified
            .as_ref()
            .and_then(|object| object.downcast_ref::<NSRunningApplication>())
            .zip(front.as_deref())
            .is_some_and(|(notified, front)| {
                notified == front
                    && !front.isTerminated()
                    && front.activationPolicy() == NSApplicationActivationPolicy::Regular
                    && !login_surface(front)
            });
        workspace.observe_frontmost(
            before.epoch,
            front.as_deref().map(login_surface),
            unsafe { platform::IsSecureEventInputEnabled() },
            matches,
        );
        reconcile(&activation_app, workspace);
        recheck_permission(&activation_app, workspace, preflight);
        // Re-evaluate even when the permission value did not change. A
        // mismatched activation contributes no new evidence to the gate.
        ensure_recovery_visible(&activation_app);
    });
    owner.subscribe(
        unsafe { NSWorkspaceDidActivateApplicationNotification },
        &block,
    );
    SUBSCRIPTIONS.with_borrow_mut(|slot| *slot = Some(owner));
    let initial = workspace.snapshot();
    let front = NSWorkspace::sharedWorkspace().frontmostApplication();
    let initial_desktop = initial.epoch == 0
        && front.as_deref().is_some_and(|app| {
            !login_surface(app)
                && !app.isTerminated()
                && app.activationPolicy() == NSApplicationActivationPolicy::Regular
        });
    workspace.observe_frontmost(
        initial.epoch,
        front.as_deref().map(login_surface),
        unsafe { platform::IsSecureEventInputEnabled() },
        initial_desktop,
    );
    reconcile(app, workspace);
    recheck_permission(app, workspace, preflight);
    ensure_recovery_visible(app);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn returning_desktop_rechecks_identical_permission_and_persistent_observer_failure() {
        use crate::launcher_shortcuts::monitor_exit_tests::monitored_service;
        let app = tauri::test::mock_app();
        let app = app.handle();
        let (state, _directory) = monitored_service(app);
        let workspace = app.state::<WorkspaceSession>();
        let status = || state.lock().unwrap().inner.monitor_status();
        workspace.notification(Interruption::Display, true);
        reconcile(app, &workspace);
        assert_eq!(status(), MonitorStatus::Unavailable);
        assert!(!recovery_degraded(app));
        recheck_permission(app, &workspace, || panic!("cannot assess while asleep"));
        workspace.notification(Interruption::Display, false);
        reconcile(app, &workspace);
        let awake = workspace.snapshot().epoch;
        recheck_permission(app, &workspace, || false);
        assert_eq!(status(), MonitorStatus::PermissionRequired);
        assert!(!workspace.snapshot().desktop);
        assert!(workspace.observe_frontmost(awake, Some(false), false, true));
        recheck_permission(app, &workspace, || false);
        assert!(recovery_degraded(app));
        recheck_permission(app, &workspace, || true);
        assert_eq!(status(), MonitorStatus::Unavailable);
        // A visible repair stays accessible until an eligible rebuild succeeds.
        // Pending recovery supplies no current evidence for an automatic Show.
        assert!(recovery_degraded(app));
        assert_eq!(state.lock().unwrap().inner.repair_fault(), None);

        workspace.set(Interruption::LoginWindow, true);
        reconcile(app, &workspace);
        finish_observation(app, &state);
        assert_eq!(status(), MonitorStatus::ObserverStopped);
        assert!(workspace.observe_frontmost(workspace.snapshot().epoch, Some(false), false, true));
        reconcile(app, &workspace);
        recheck_permission(app, &workspace, || {
            panic!("a dead observer cannot be restored by permission")
        });
        assert!(workspace.snapshot().desktop);
        assert_eq!(status(), MonitorStatus::ObserverStopped);
        assert!(recovery_degraded(app));
    }

    #[test]
    fn local_notification_tokens_are_scoped_to_host_teardown() {
        // A private in-process Foundation center, independent of AppKit and any input tap.
        let center = NSNotificationCenter::new();
        let name = objc2_foundation::NSString::from_str("test.desktop");
        let count = Arc::new(AtomicUsize::new(0));
        let mut owner = Subscriptions {
            center: center.clone(),
            tokens: Vec::new(),
        };
        for _ in 0..2 {
            let observed = count.clone();
            let block = RcBlock::new(move |_: NonNull<NSNotification>| {
                observed.fetch_add(1, Ordering::Relaxed);
            });
            owner.subscribe(&name, &block);
        }
        let post = || unsafe { center.postNotificationName_object(&name, None) };
        post();
        assert_eq!(count.load(Ordering::Relaxed), 2);
        drop(owner);
        post();
        assert_eq!(count.load(Ordering::Relaxed), 2);
    }
}
