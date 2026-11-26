use super::*;
use crate::launcher_shortcuts::gesture::{Gesture, Input};
use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    panic::{catch_unwind, AssertUnwindSafe},
};

type Log = Rc<RefCell<Ledger>>;

#[derive(Default)]
struct Ledger {
    operations: Vec<(&'static str, usize)>,
    registrations: BTreeSet<usize>,
    tap_refs: BTreeSet<usize>,
    source_refs: BTreeSet<usize>,
    attached: BTreeMap<usize, (usize, usize)>,
    attempts: usize,
    tap_allocations: usize,
    source_allocations: usize,
    tap_releases: usize,
    source_releases: usize,
    invalidations: usize,
    context_live: bool,
    admitted: bool,
}

impl Ledger {
    fn bounded(&self) {
        assert!(
            self.registrations.len() <= 1,
            "system registrations accumulated"
        );
        assert!(self.tap_refs.len() <= 1, "tap references accumulated");
        assert!(self.source_refs.len() <= 1, "source references accumulated");
        assert!(self.attached.len() <= 1, "attached sources accumulated");
    }

    fn empty(&self) {
        self.bounded();
        assert!(self.registrations.is_empty());
        assert!(self.tap_refs.is_empty());
        assert!(self.source_refs.is_empty());
        assert!(self.attached.is_empty());
        assert_eq!(self.tap_allocations, self.tap_releases);
        assert_eq!(self.source_allocations, self.source_releases);
    }
}

#[derive(Clone, Copy)]
enum Failure {
    None,
    Tap,
    Source,
    Disabled,
}

// Handles deliberately cannot be copied. System registration is independent of
// owned references, so CFRelease alone never makes the fake unregister a tap.
struct Tap(usize);
struct Source(usize);

struct Fake {
    log: Log,
    failure: Failure,
    enabled: bool,
    // A native backend retains this original borrowed RunLoop/mode pair.
    route: (usize, usize),
}

impl Fake {
    fn new(log: &Log) -> Self {
        let mut ledger = log.borrow_mut();
        ledger.context_live = true;
        drop(ledger);
        Self {
            log: Rc::clone(log),
            failure: Failure::None,
            enabled: true,
            route: (73, 19),
        }
    }
}

impl Backend for Fake {
    type Tap = Tap;
    type Source = Source;

    fn create_tap(&mut self) -> Option<Tap> {
        let mut ledger = self.log.borrow_mut();
        assert!(ledger.context_live);
        assert!(
            ledger.registrations.is_empty(),
            "replacement preceded invalidation"
        );
        ledger.attempts += 1;
        let id = ledger.attempts;
        ledger.operations.push(("create", id));
        if matches!(self.failure, Failure::Tap) {
            return None;
        }
        self.enabled = !matches!(self.failure, Failure::Disabled);
        ledger.registrations.insert(id);
        ledger.tap_refs.insert(id);
        ledger.tap_allocations += 1;
        ledger.bounded();
        Some(Tap(id))
    }

    fn create_source(&mut self, tap: &Tap) -> Option<Source> {
        let mut ledger = self.log.borrow_mut();
        assert!(ledger.registrations.contains(&tap.0));
        if matches!(self.failure, Failure::Source) {
            return None;
        }
        ledger.source_refs.insert(tap.0);
        ledger.source_allocations += 1;
        ledger.operations.push(("source", tap.0));
        ledger.bounded();
        Some(Source(tap.0))
    }

    fn attach(&mut self, source: &Source) {
        let mut ledger = self.log.borrow_mut();
        assert!(ledger.source_refs.contains(&source.0));
        assert_eq!(ledger.attached.insert(source.0, self.route), None);
        ledger.operations.push(("attach", source.0));
        ledger.bounded();
    }

    fn enabled(&self, _tap: &Tap) -> bool {
        self.enabled
    }

    fn invalidate(&mut self, tap: &Tap) {
        let mut ledger = self.log.borrow_mut();
        assert!(
            ledger.context_live,
            "callback context died before invalidation"
        );
        assert!(ledger.registrations.remove(&tap.0), "tap invalidated twice");
        assert!(ledger.tap_refs.contains(&tap.0));
        ledger.invalidations += 1;
        ledger.operations.push(("invalidate", tap.0));
    }

    fn remove(&mut self, source: &Source) {
        let mut ledger = self.log.borrow_mut();
        assert!(!ledger.registrations.contains(&source.0));
        assert_eq!(ledger.attached.remove(&source.0), Some(self.route));
        ledger.operations.push(("remove", source.0));
    }

    fn release_source(&mut self, source: Source) {
        let mut ledger = self.log.borrow_mut();
        assert!(
            !ledger.registrations.contains(&source.0),
            "release before invalidate"
        );
        assert!(
            !ledger.attached.contains_key(&source.0),
            "release before remove"
        );
        assert!(
            ledger.source_refs.remove(&source.0),
            "source released twice"
        );
        ledger.source_releases += 1;
        ledger.operations.push(("release_source", source.0));
    }

    fn release_tap(&mut self, tap: Tap) {
        let mut ledger = self.log.borrow_mut();
        assert!(
            !ledger.registrations.contains(&tap.0),
            "release before invalidate"
        );
        assert!(
            !ledger.source_refs.contains(&tap.0),
            "tap released before source"
        );
        assert!(ledger.tap_refs.remove(&tap.0), "tap released twice");
        ledger.tap_releases += 1;
        ledger.operations.push(("release_tap", tap.0));
    }
}

impl Drop for Fake {
    fn drop(&mut self) {
        let mut ledger = self.log.borrow_mut();
        ledger.empty();
        ledger.context_live = false;
        ledger.operations.push(("context_drop", 0));
    }
}

struct Observer {
    log: Log,
    gesture: Gesture,
    now: u64,
    physical: BTreeSet<u16>,
    seeds: usize,
}

impl Observer {
    fn new(log: &Log) -> Self {
        Self {
            log: Rc::clone(log),
            gesture: Gesture::default(),
            now: 0,
            physical: BTreeSet::new(),
            seeds: 0,
        }
    }

    fn poll(&mut self, monitor: &mut Monitor<Fake>, facts: Facts, now: u64) -> MonitorStatus {
        self.now = now;
        let status = monitor.poll(facts, Duration::from_millis(now), self);
        let mut ledger = self.log.borrow_mut();
        ledger.admitted = status == MonitorStatus::Active;
        if ledger.admitted {
            ledger.operations.push(("active", 0));
        }
        ledger.bounded();
        status
    }

    fn callback(&mut self, tap: usize, input: Input, now: u64) -> Option<&'static str> {
        let ledger = self.log.borrow();
        if !ledger.registrations.contains(&tap) || !ledger.admitted {
            return None;
        }
        assert!(ledger.context_live);
        self.gesture.input(input, now)
    }
}

impl Recognition for Observer {
    fn revoke(&mut self) {
        let mut ledger = self.log.borrow_mut();
        ledger.admitted = false;
        ledger.operations.push(("revoke", 0));
    }

    fn reset(&mut self) {
        self.log.borrow_mut().operations.push(("reset", 0));
        self.gesture.reset(self.now);
    }

    fn seed(&mut self) {
        let mut ledger = self.log.borrow_mut();
        assert_eq!(ledger.registrations.len(), 1);
        assert_eq!(ledger.source_refs.len(), 1);
        assert_eq!(ledger.attached.len(), 1);
        ledger.operations.push(("seed", 0));
        drop(ledger);
        self.gesture
            .synchronize(self.physical.clone(), BTreeSet::new(), self.now);
        self.seeds += 1;
    }
}

fn ready() -> Facts {
    Facts {
        configuration_revision: 0,
        permitted: true,
        sleeping: false,
        secure_input: false,
        wanted: true,
        interrupted: false,
        reset: false,
        stopped: false,
    }
}

fn fixture() -> (Log, Monitor<Fake>, Observer) {
    let log = Log::default();
    let monitor = Monitor::new(Fake::new(&log));
    let observer = Observer::new(&log);
    (log, monitor, observer)
}

fn pair(observer: &mut Observer, id: usize, start: u64) {
    for offset in [0, 200] {
        assert_eq!(
            observer.callback(
                id,
                Input::ModifierDown {
                    physical: 55,
                    modifier: "cmd",
                    repeat: false,
                },
                start + offset
            ),
            None
        );
        assert_eq!(
            observer.callback(id, Input::ModifierUp { physical: 55 }, start + offset + 100),
            None
        );
    }
}

#[test]
fn empty_owner_drops_context_and_subscriptions_without_native_operations() {
    let (log, monitor, _) = fixture();
    drop(monitor);
    let ledger = log.borrow();
    ledger.empty();
    assert_eq!(ledger.attempts, 0);
    assert!(!ledger.context_live);
    assert_eq!(ledger.operations, [("context_drop", 0)]);
}

#[test]
fn partial_creation_and_disabled_taps_never_become_active_or_leave_resources() {
    for failure in [
        Failure::None,
        Failure::Tap,
        Failure::Source,
        Failure::Disabled,
    ] {
        let (log, mut monitor, mut observer) = fixture();
        monitor.backend_mut().failure = failure;
        let status = observer.poll(&mut monitor, ready(), 0);
        assert_eq!(
            status,
            if matches!(failure, Failure::None) {
                MonitorStatus::Active
            } else {
                MonitorStatus::EstablishmentFailed
            }
        );
        if status != MonitorStatus::Active {
            log.borrow().empty();
            assert_eq!(observer.seeds, 0);
        } else {
            assert_eq!(observer.seeds, 1);
            assert_eq!(log.borrow().registrations.len(), 1);
        }
        monitor.stop(&mut observer);
        log.borrow().empty();
        drop(monitor);
        assert!(!log.borrow().context_live);
    }
}

#[test]
fn empty_and_repeated_cleanup_are_idempotent_and_preserve_teardown_order() {
    let (log, mut monitor, mut observer) = fixture();
    monitor.cleanup();
    assert_eq!(
        observer.poll(&mut monitor, ready(), 0),
        MonitorStatus::Active
    );
    assert_eq!(monitor.backend().route, (73, 19));
    assert_eq!(log.borrow().attached.get(&1), Some(&(73, 19)));
    log.borrow_mut().operations.clear();
    monitor.stop(&mut observer);
    monitor.stop(&mut observer);
    monitor.cleanup();
    drop(monitor);
    assert_eq!(log.borrow().invalidations, 1);
    assert_eq!(
        log.borrow().operations,
        [
            ("revoke", 0),
            ("reset", 0),
            ("invalidate", 1),
            ("remove", 1),
            ("release_source", 1),
            ("release_tap", 1),
            ("revoke", 0),
            ("reset", 0),
            ("context_drop", 0),
        ]
    );
    log.borrow().empty();
}

#[test]
fn healthy_configuration_recording_hide_and_gesture_resets_keep_resource_identity() {
    let (log, mut monitor, mut observer) = fixture();
    observer.poll(&mut monitor, ready(), 0);
    let identity = monitor.tap.as_ref().unwrap().0;
    for (index, reason) in ["configuration", "recording", "hide", "gesture"]
        .iter()
        .enumerate()
    {
        let facts = Facts {
            reset: true,
            ..ready()
        };
        assert_eq!(
            observer.poll(&mut monitor, facts, 1000 + index as u64),
            MonitorStatus::Active,
            "{reason}"
        );
        assert_eq!(monitor.tap.as_ref().unwrap().0, identity);
        assert_eq!(log.borrow().attempts, 1);
        assert_eq!(log.borrow().invalidations, 0);
    }
    assert_eq!(observer.seeds, 1);
}

#[test]
fn all_loss_facts_revoke_and_clear_before_retiring_or_replacing() {
    for facts in [
        Facts {
            permitted: false,
            ..ready()
        },
        Facts {
            secure_input: true,
            ..ready()
        },
        Facts {
            sleeping: true,
            ..ready()
        },
        Facts {
            wanted: false,
            ..ready()
        },
        Facts {
            interrupted: true,
            ..ready()
        },
    ] {
        let (log, mut monitor, mut observer) = fixture();
        observer.poll(&mut monitor, ready(), 0);
        log.borrow_mut().operations.clear();
        let status = observer.poll(&mut monitor, facts, 1000);
        let ledger = log.borrow();
        assert!(ledger.operations.starts_with(&[
            ("revoke", 0),
            ("reset", 0),
            ("invalidate", 1),
            ("remove", 1),
            ("release_source", 1),
            ("release_tap", 1),
        ]));
        if facts.interrupted {
            assert_eq!(status, MonitorStatus::Active);
            assert_eq!(ledger.registrations, [2].into());
        } else {
            ledger.empty();
            assert_eq!(
                status,
                if facts.permitted {
                    MonitorStatus::Unavailable
                } else {
                    MonitorStatus::PermissionRequired
                }
            );
        }
    }
}

#[test]
fn disabled_tap_and_callback_or_run_gap_interruptions_share_the_retirement_path() {
    for disabled in [false, true] {
        let (log, mut monitor, mut observer) = fixture();
        observer.poll(&mut monitor, ready(), 0);
        if disabled {
            monitor.backend_mut().enabled = false;
        }
        assert_eq!(
            observer.poll(
                &mut monitor,
                Facts {
                    interrupted: !disabled,
                    ..ready()
                },
                500
            ),
            MonitorStatus::Unavailable
        );
        log.borrow().empty();
        assert_eq!(
            observer.poll(&mut monitor, ready(), 1000),
            MonitorStatus::Active
        );
        assert_eq!(log.borrow().attempts, 2);
    }
}

#[test]
fn workspace_sleep_facts_retire_before_the_notification_can_obtain_the_service_lock() {
    let (log, mut monitor, mut observer) = fixture();
    use crate::launcher_shortcuts::macos::{Interruption::Sleep, WorkspaceSession};
    let workspace = WorkspaceSession::default();
    let callback_workspace = workspace.clone();
    let mut admitted_epoch = workspace.snapshot().epoch;
    assert!(workspace.allows(admitted_epoch));
    observer.poll(&mut monitor, ready(), 0);

    callback_workspace.set(Sleep, true);
    // The notification has published its facts but is blocked behind the
    // observer's service lock, so the service-owned sleeping value is stale.
    let service_sleeping = false;
    let sleep_epoch = workspace.snapshot().epoch;
    let sleeping = workspace.snapshot().interrupted;
    assert!(sleeping);
    assert_ne!(sleep_epoch, admitted_epoch);
    assert!(!workspace.allows(admitted_epoch));
    assert!(!workspace.allows(sleep_epoch));
    assert_eq!(
        observer.poll(
            &mut monitor,
            Facts {
                sleeping: service_sleeping || sleeping,
                interrupted: sleep_epoch != admitted_epoch,
                ..ready()
            },
            1000,
        ),
        MonitorStatus::Unavailable
    );
    log.borrow().empty();
    assert_eq!(
        log.borrow().attempts,
        1,
        "sleep cannot create a replacement"
    );
    admitted_epoch = sleep_epoch;

    callback_workspace.set(Sleep, false);
    let wake_epoch = workspace.snapshot().epoch;
    let sleeping = workspace.snapshot().interrupted;
    assert!(!sleeping);
    assert_ne!(wake_epoch, admitted_epoch);
    assert!(!workspace.allows(admitted_epoch));
    assert!(workspace.allows(wake_epoch));
    assert_eq!(
        observer.poll(
            &mut monitor,
            Facts {
                sleeping,
                interrupted: wake_epoch != admitted_epoch,
                ..ready()
            },
            2000,
        ),
        MonitorStatus::Active
    );
    assert_eq!(log.borrow().attempts, 2);
    admitted_epoch = wake_epoch;

    // A full sleep/wake pair between polls still invalidates the old stream;
    // the final false sleeping bit must not hide either transition.
    callback_workspace.set(Sleep, true);
    callback_workspace.set(Sleep, false);
    let coalesced_epoch = workspace.snapshot().epoch;
    let sleeping = workspace.snapshot().interrupted;
    assert!(!sleeping);
    assert_ne!(coalesced_epoch, admitted_epoch);
    assert!(!workspace.allows(admitted_epoch));
    assert!(workspace.allows(coalesced_epoch));
    assert_eq!(
        observer.poll(
            &mut monitor,
            Facts {
                sleeping,
                interrupted: coalesced_epoch != admitted_epoch,
                ..ready()
            },
            3000,
        ),
        MonitorStatus::Active
    );
    assert_eq!(log.borrow().attempts, 3);
    assert_eq!(log.borrow().invalidations, 2);
}

#[test]
fn monotonic_retry_attempts_are_immediate_then_at_least_one_second_apart() {
    let (log, mut monitor, mut observer) = fixture();
    monitor.backend_mut().failure = Failure::Tap;
    assert_eq!(
        observer.poll(&mut monitor, ready(), 50),
        MonitorStatus::EstablishmentFailed
    );
    assert_eq!(log.borrow().attempts, 1);
    for now in 51..1050 {
        assert_eq!(
            observer.poll(&mut monitor, ready(), now),
            MonitorStatus::EstablishmentFailed
        );
    }
    assert_eq!(log.borrow().attempts, 1, "999 ms must not retry");
    for _ in 0..100 {
        observer.poll(&mut monitor, ready(), 1050);
    }
    assert_eq!(
        log.borrow().attempts,
        2,
        "1000 ms allows at most one synchronous attempt"
    );
    for second in 2..100 {
        observer.poll(&mut monitor, ready(), second * 1000 + 50);
        log.borrow().empty();
    }
    assert_eq!(log.borrow().attempts, 100);
    // A regressing injected timestamp cannot bypass monotonic spacing.
    observer.poll(&mut monitor, ready(), 0);
    assert_eq!(log.borrow().attempts, 100);
}

#[test]
fn a_new_configuration_or_session_requires_its_own_eligible_failed_attempt() {
    let (_, mut monitor, mut observer) = fixture();
    monitor.backend_mut().failure = Failure::Source;
    assert_eq!(
        observer.poll(&mut monitor, ready(), 0),
        MonitorStatus::EstablishmentFailed
    );
    let current = Facts {
        configuration_revision: 1,
        ..ready()
    };
    assert_eq!(
        observer.poll(&mut monitor, current, 999),
        MonitorStatus::Unavailable
    );
    assert_eq!(
        observer.poll(&mut monitor, current, 1000),
        MonitorStatus::EstablishmentFailed
    );
    let suspended = Facts {
        sleeping: true,
        permitted: false,
        ..current
    };
    assert_eq!(
        observer.poll(&mut monitor, suspended, 1100),
        MonitorStatus::Unavailable
    );
    assert_eq!(
        observer.poll(&mut monitor, current, 1999),
        MonitorStatus::Unavailable
    );
    monitor.backend_mut().failure = Failure::None;
    assert_eq!(
        observer.poll(&mut monitor, current, 2000),
        MonitorStatus::Active
    );
    assert_eq!(
        observer.poll(
            &mut monitor,
            Facts {
                permitted: false,
                ..current
            },
            2001
        ),
        MonitorStatus::PermissionRequired
    );
}

#[test]
fn recovery_seeds_current_physical_state_and_discards_old_candidates_and_callbacks() {
    let (log, mut monitor, mut observer) = fixture();
    observer.poll(&mut monitor, ready(), 0);
    observer.gesture.tick(301);
    pair(&mut observer, 1, 400);
    observer.poll(
        &mut monitor,
        Facts {
            interrupted: true,
            ..ready()
        },
        800,
    );
    assert_eq!(
        observer.gesture.tick(1100),
        None,
        "old pending pair must not confirm"
    );
    observer.physical.insert(55);
    assert_eq!(
        observer.poll(&mut monitor, ready(), 1200),
        MonitorStatus::Active
    );
    pair(&mut observer, 1, 1300); // Invalidated registration cannot call back.
    assert_eq!(observer.gesture.tick(1700), None);
    assert_eq!(
        observer.callback(2, Input::ModifierUp { physical: 55 }, 1800),
        None
    );
    assert_eq!(observer.gesture.tick(2101), None);
    pair(&mut observer, 2, 2200);
    assert_eq!(observer.gesture.tick(2801), Some("cmd"));
    assert_eq!(observer.gesture.tick(4000), None);
    assert_eq!(observer.seeds, 2);
    assert_eq!(log.borrow().registrations, [2].into());
}

#[test]
fn stopped_monitor_never_recreates_even_when_observation_recovers() {
    let (log, mut monitor, mut observer) = fixture();
    observer.poll(&mut monitor, ready(), 0);
    assert_eq!(
        observer.poll(
            &mut monitor,
            Facts {
                stopped: true,
                ..ready()
            },
            100
        ),
        MonitorStatus::Unavailable
    );
    for now in [1000, 10_000, 100_000] {
        assert_eq!(
            observer.poll(&mut monitor, ready(), now),
            MonitorStatus::Unavailable
        );
        log.borrow().empty();
    }
    assert_eq!(log.borrow().attempts, 1);
    assert!(!log.borrow().admitted);
}

#[test]
fn normal_early_return_and_rust_unwind_revoke_before_native_and_context_teardown() {
    for unwind in [false, true] {
        let log = Log::default();
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            let mut monitor = Monitor::new(Fake::new(&log));
            let cleanup_log = Rc::clone(&log);
            let _exit = OnExit::new(move || {
                let mut ledger = cleanup_log.borrow_mut();
                ledger.admitted = false;
                ledger.operations.push(("exit_revoke", 0));
            });
            let mut observer = Observer::new(&log);
            observer.poll(&mut monitor, ready(), 0);
            log.borrow_mut().operations.clear();
            if unwind {
                panic!("controlled observer unwind");
            }
            // The ordinary early return follows the exact same scope ownership.
        }));
        assert_eq!(outcome.is_err(), unwind);
        let ledger = log.borrow();
        ledger.empty();
        assert!(!ledger.admitted);
        assert!(!ledger.context_live);
        assert_eq!(
            ledger.operations,
            [
                ("exit_revoke", 0),
                ("invalidate", 1),
                ("remove", 1),
                ("release_source", 1),
                ("release_tap", 1),
                ("context_drop", 0),
            ]
        );
    }
}

#[test]
fn fake_detects_missing_invalidation_and_release_before_source_removal() {
    let log = Log::default();
    let mut backend = Fake::new(&log);
    let tap = backend.create_tap().unwrap();
    let source = backend.create_source(&tap).unwrap();
    backend.attach(&source);
    assert!(catch_unwind(AssertUnwindSafe(|| backend.release_tap(Tap(tap.0)))).is_err());
    assert_eq!(
        log.borrow().registrations.len(),
        1,
        "release must not unregister implicitly"
    );
    assert!(catch_unwind(AssertUnwindSafe(|| backend.release_source(Source(source.0)))).is_err());
    backend.invalidate(&tap);
    assert!(catch_unwind(AssertUnwindSafe(|| backend.release_source(Source(source.0)))).is_err());
    backend.remove(&source);
    backend.release_source(source);
    backend.release_tap(tap);
    log.borrow().empty();
}

#[test]
fn more_than_one_thousand_mixed_failures_and_recoveries_keep_registrations_and_refs_bounded() {
    let (log, mut monitor, mut observer) = fixture();
    let mut now = 0;
    observer.poll(&mut monitor, ready(), now);
    for cycle in 0..1200 {
        let old = monitor.tap.as_ref().unwrap().0;
        observer.gesture.tick(now + 301);
        pair(&mut observer, old, now + 400);
        now += 800;
        let facts = match cycle % 6 {
            0 => Facts {
                interrupted: true,
                ..ready()
            },
            1 => Facts {
                permitted: false,
                ..ready()
            },
            2 => Facts {
                secure_input: true,
                ..ready()
            },
            3 => Facts {
                sleeping: true,
                ..ready()
            },
            4 => Facts {
                wanted: false,
                ..ready()
            },
            _ => {
                monitor.backend_mut().enabled = false;
                ready()
            }
        };
        // All retire before the first retry threshold; no old pair survives.
        observer.poll(&mut monitor, facts, now);
        log.borrow().empty();
        pair(&mut observer, old, now + 1);
        assert_eq!(observer.gesture.tick(now + 400), None);
        now += 1000;
        monitor.backend_mut().failure = match cycle % 3 {
            0 => Failure::Tap,
            1 => Failure::Source,
            _ => Failure::Disabled,
        };
        assert_eq!(
            observer.poll(&mut monitor, ready(), now),
            MonitorStatus::EstablishmentFailed
        );
        log.borrow().empty();
        monitor.backend_mut().failure = Failure::None;
        now += 1000;
        assert_eq!(
            observer.poll(&mut monitor, ready(), now),
            MonitorStatus::Active
        );
        assert_eq!(observer.gesture.tick(now + 301), None);
        assert_eq!(observer.callback(old, Input::PointerMove, now + 302), None);
        log.borrow().bounded();
    }
    monitor.stop(&mut observer);
    log.borrow().empty();
    assert_eq!(log.borrow().attempts, 2401);
    drop(monitor);
    assert!(!log.borrow().context_live);
}
