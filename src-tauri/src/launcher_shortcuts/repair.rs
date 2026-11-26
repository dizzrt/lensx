use super::*;

/// A fault can disappear and recur under the same configuration and for the
/// same reason. Its generation keeps the two repair attempts distinct.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Fault {
    revision: u64,
    generation: u64,
    reason: Option<RepairFault>, // None when the shortcut service is poisoned.
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Request {
    fault: Fault,
    session: u64,
}

#[derive(Clone, Copy)]
enum Origin {
    Recheck,
    #[cfg(any(target_os = "macos", test))]
    Reopen,
}

#[derive(Default)]
pub(super) struct RepairQueue {
    pending: Option<Request>,
    shown: Option<(u64, u64)>, // configuration revision and fault generation
}

impl RepairQueue {
    fn reserve(&mut self, request: Request) -> bool {
        if self.pending == Some(request)
            || self.shown == Some((request.fault.revision, request.fault.generation))
        {
            return false;
        }
        self.pending = Some(request);
        true
    }

    fn finish(&mut self, request: Request, shown: bool) {
        if self.pending == Some(request) {
            self.pending = None;
            if shown {
                self.shown = Some((request.fault.revision, request.fault.generation));
            }
        }
    }
}

fn current<R: Runtime>(app: &AppHandle<R>, origin: Origin) -> Option<Request> {
    let service = app.try_state::<State<R>>()?;
    let admission = app.try_state::<ShortcutAdmission>()?;
    let workspace = app.try_state::<macos::WorkspaceSession>()?;
    let service = service.lock();
    let session = workspace.snapshot();
    let permitted = match origin {
        Origin::Recheck => !cfg!(target_os = "macos") || session.desktop,
        #[cfg(any(target_os = "macos", test))]
        Origin::Reopen => true,
    };
    if session.interrupted || !permitted || admission.stopped() {
        return None;
    }
    let fault = match service {
        Ok(service)
            if !service.stopped
                && !service.sleeping
                && service.workspace_epoch == session.epoch =>
        {
            Fault {
                revision: service.inner.configuration_revision(),
                generation: service.inner.repair_generation(),
                reason: Some(service.inner.repair_fault()?),
            }
        }
        Ok(_) => return None,
        Err(_) => Fault {
            revision: 0,
            generation: 0,
            reason: None,
        },
    };
    Some(Request {
        fault,
        session: session.epoch,
    })
}

fn execute(
    queue: &Mutex<RepairQueue>,
    request: Request,
    current: impl FnOnce() -> Option<Request>,
    visible: impl FnOnce() -> Option<bool>,
    show: impl FnOnce() -> bool,
) {
    // Keep the reservation across Show, which may itself cause a workspace
    // activation notification. Never hold either mutex across native calls.
    let reserved = queue.lock().unwrap().pending == Some(request);
    let shown = reserved && visible() == Some(false) && current() == Some(request) && show();
    queue.lock().unwrap().finish(request, shown);
}

fn schedule<R: Runtime>(app: &AppHandle<R>, origin: Origin) {
    let Some(queue) = app.try_state::<Mutex<RepairQueue>>() else {
        return;
    };
    let request = {
        let mut queue = queue.lock().unwrap();
        let Some(request) = current(app, origin) else {
            return;
        };
        if !queue.reserve(request) {
            return;
        }
        request
    };
    let main = app.clone();
    let result = app.run_on_main_thread(move || {
        macos::refresh_session(&main);
        let queue = main.state::<Mutex<RepairQueue>>();
        execute(
            &queue,
            request,
            || current(&main, origin),
            || main.get_window(MAIN_WINDOW_LABEL)?.is_visible().ok(),
            || {
                let Some(actions) = main.try_state::<LauncherWindowActions>() else {
                    return false;
                };
                let action = LauncherWindowAction::Show(LauncherActivationReason::Programmatic);
                match actions.dispatch(&main, action) {
                    Ok(()) => true,
                    Err(error) => {
                        eprintln!("launcher shortcut repair failed: {error}");
                        false
                    }
                }
            },
        );
    });
    if result.is_err() {
        queue.lock().unwrap().finish(request, false);
    }
}

pub(super) fn recheck<R: Runtime>(app: &AppHandle<R>) {
    schedule(app, Origin::Recheck);
}

#[cfg(target_os = "macos")]
pub(crate) fn reopen<R: Runtime>(app: &AppHandle<R>) {
    macos::refresh_session(app);
    schedule(app, Origin::Reopen);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::launcher_shortcuts::{macos::Interruption, monitor_exit_tests::monitored_service};
    use std::cell::RefCell;

    fn change_session<R: Runtime>(state: &State<R>, blocked: bool) {
        let mut service = state.lock().unwrap();
        service.workspace.set(Interruption::Sleep, blocked);
        service.workspace_epoch = service.workspace.snapshot().epoch;
        service.sleeping = blocked;
        service.inner.interrupt_input();
    }

    #[test]
    fn queued_repair_rechecks_the_actual_fault_session_and_hidden_window() {
        let app = tauri::test::mock_app();
        let app = app.handle();
        let (state, _dir) = monitored_service(app);
        let workspace = app.state::<macos::WorkspaceSession>();
        workspace.desktop_activation(0, true);
        let queue = Mutex::new(RepairQueue::default());
        let calls = RefCell::new(Vec::new());
        let present = |request, origin, visible, success| {
            execute(
                &queue,
                request,
                || current(app, origin),
                || visible,
                || {
                    calls.borrow_mut().push("activate");
                    calls.borrow_mut().push("show");
                    if success {
                        calls.borrow_mut().extend(["focus", "restore_child"]);
                    }
                    success
                },
            );
        };

        assert_eq!(current(app, Origin::Recheck), None);
        state
            .lock()
            .unwrap()
            .inner
            .set_monitor(MonitorStatus::PermissionRequired);
        let old = current(app, Origin::Recheck).unwrap();
        assert!(queue.lock().unwrap().reserve(old));
        change_session(&state, true);
        assert_eq!(current(app, Origin::Reopen), None);
        change_session(&state, false);
        present(old, Origin::Recheck, Some(false), true);
        assert!(calls.borrow().is_empty());

        // Permission is still missing. Wake alone gave no desktop evidence;
        // explicit Reopen can expose repair without using the broken shortcut.
        #[cfg(target_os = "macos")]
        assert_eq!(current(app, Origin::Recheck), None);
        let reopened = current(app, Origin::Reopen).unwrap();
        assert!(queue.lock().unwrap().reserve(reopened));
        present(reopened, Origin::Reopen, Some(true), true);
        assert!(calls.borrow().is_empty());
        workspace.desktop_activation(workspace.snapshot().epoch, true);
        let now = current(app, Origin::Recheck).unwrap();
        assert!(queue.lock().unwrap().reserve(now));
        assert!(!queue.lock().unwrap().reserve(now));
        present(now, Origin::Recheck, Some(false), false);
        assert!(queue.lock().unwrap().reserve(now));
        present(now, Origin::Recheck, Some(false), true);
        assert!(!queue.lock().unwrap().reserve(now));
        assert_eq!(
            *calls.borrow(),
            [
                "activate",
                "show",
                "activate",
                "show",
                "focus",
                "restore_child"
            ]
        );

        let mut service = state.lock().unwrap();
        service.inner.set_monitor(MonitorStatus::Active);
        drop(service);
        assert_eq!(current(app, Origin::Reopen), None);
        state
            .lock()
            .unwrap()
            .inner
            .set_monitor(MonitorStatus::PermissionRequired);
        let next_fault = current(app, Origin::Reopen).unwrap();
        assert_ne!(now, next_fault);
        assert!(queue.lock().unwrap().reserve(next_fault));
        state
            .lock()
            .unwrap()
            .inner
            .set_monitor(MonitorStatus::Active);
        present(next_fault, Origin::Reopen, Some(false), true);
        assert_eq!(calls.borrow().len(), 6);
    }

    #[test]
    fn reopen_with_only_a_confirmed_fault_can_restore_a_hidden_window() {
        let app = tauri::test::mock_app();
        let app = app.handle();
        let (state, _dir) = monitored_service(app);
        let queue = Mutex::new(RepairQueue::default());
        assert_eq!(current(app, Origin::Reopen), None);
        state
            .lock()
            .unwrap()
            .inner
            .set_monitor(MonitorStatus::ObserverStopped);
        let ticket = current(app, Origin::Reopen).unwrap();
        assert!(recovery_degraded(app));
        assert!(queue.lock().unwrap().reserve(ticket));
        let mut shows = 0;
        execute(
            &queue,
            ticket,
            || current(app, Origin::Reopen),
            || Some(false),
            || {
                shows += 1;
                true
            },
        );
        assert_eq!(shows, 1);
        assert!(!queue.lock().unwrap().reserve(ticket));
        state.lock().unwrap().inner.admission().stop();
        assert_eq!(current(app, Origin::Reopen), None);
    }

    #[test]
    fn a_configuration_change_or_shutdown_during_visibility_lookup_cancels_repair() {
        let app = tauri::test::mock_app();
        let app = app.handle();
        let (state, _dir) = monitored_service(app);
        state
            .lock()
            .unwrap()
            .inner
            .set_monitor(MonitorStatus::ObserverStopped);
        let queue = Mutex::new(RepairQueue::default());
        for shutdown in [false, true] {
            let ticket = current(app, Origin::Reopen).unwrap();
            assert!(queue.lock().unwrap().reserve(ticket));
            execute(
                &queue,
                ticket,
                || current(app, Origin::Reopen),
                || {
                    let mut service = state.lock().unwrap();
                    if shutdown {
                        service.inner.admission().stop();
                    } else {
                        let mut config = service.inner.snapshot().configuration;
                        config.detach = None;
                        service.inner.save(config.revision, config).unwrap();
                    }
                    Some(false)
                },
                || panic!("stale repair reached the window"),
            );
        }
    }

    #[test]
    fn deferred_window_inputs_do_not_cross_interruptions_configuration_or_host_lifecycle() {
        let app = tauri::test::mock_app();
        let (state, _dir) = monitored_service(app.handle());
        let action = Trigger::ModifierDoubleTap {
            modifier: "shift".into(),
        };
        let launcher = state
            .lock()
            .unwrap()
            .inner
            .snapshot()
            .configuration
            .launcher;
        {
            let mut service = state.lock().unwrap();
            let mut configuration = service.inner.snapshot().configuration;
            configuration.detach = None;
            configuration
                .actions
                .insert("com.test.translate".into(), action.clone());
            service
                .inner
                .update_targets(["com.test.translate".into()].into())
                .unwrap();
            service.inner.save(0, configuration).unwrap();
        }
        let pending = |trigger: &Trigger| {
            let mut service = state.lock().unwrap();
            let effect = service.inner.trigger(trigger, 10);
            assert!(matches!(effect, Effect::Action(_) | Effect::Toggle));
            service.stamp(effect, service.workspace_epoch)
        };
        let actions = RefCell::new(Vec::new());
        let run = |item| {
            dispatch_window_effect(
                &state,
                item,
                || 11,
                |action| {
                    actions.borrow_mut().push(action);
                    true
                },
            )
        };
        let old_toggle = pending(&launcher);
        let old_action = pending(&action);
        assert!(state.lock().unwrap().inner.ready(true, 10).is_empty());
        change_session(&state, true);
        change_session(&state, false);
        change_session(&state, true);
        change_session(&state, false);
        assert!(run(old_toggle).is_none());
        assert!(run(old_action).is_none());

        let before_host_loss = pending(&action);
        {
            let mut service = state.lock().unwrap();
            service.inner.ready(false, 10);
            assert!(service.inner.ready(true, 10).is_empty());
        }
        assert!(run(before_host_loss).is_none());
        let before_change = pending(&launcher);
        {
            let mut service = state.lock().unwrap();
            let mut config = service.inner.snapshot().configuration;
            config.actions.insert(
                "com.test.other".into(),
                Trigger::ModifierDoubleTap {
                    modifier: "ctrl".into(),
                },
            );
            service.inner.save(config.revision, config).unwrap();
        }
        assert!(run(before_change).is_none());
        assert!(actions.borrow().is_empty());
        let fresh = run(pending(&action)).unwrap();
        let mut service = state.lock().unwrap();
        assert!(service.inner.acknowledge(fresh.invocation_id, true, 12));
        assert!(!service.inner.acknowledge(fresh.invocation_id, true, 12));
        drop(service);
        run(pending(&launcher));
        let before_exit = pending(&action);
        state.lock().unwrap().inner.admission().stop();
        assert!(run(before_exit).is_none());
        assert_eq!(
            *actions.borrow(),
            [
                LauncherWindowAction::Show(LauncherActivationReason::GlobalShortcut),
                LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut),
            ]
        );
        assert_eq!(state.lock().unwrap().inner.take_failures().len(), 3);
    }
}
