// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! Native movement precedes registry publication; snapshots retain the same view.
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Default)]
pub(crate) struct ReparentGate(AtomicBool);
pub(crate) struct ReparentPermit<'a>(&'a AtomicBool);
impl ReparentGate {
  pub(crate) fn try_enter(&self) -> Option<ReparentPermit<'_>> {
    self
      .0
      .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
      .ok()
      .map(|_| ReparentPermit(&self.0))
  }
}
impl Drop for ReparentPermit<'_> {
  fn drop(&mut self) {
    self.0.store(false, Ordering::Release);
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum TransferFailure {
  Preflight,
  Native,
  Commit,
  Rollback,
}

pub(crate) fn transfer<S>(
  prepare: impl FnOnce() -> Option<S>,
  move_native: impl FnOnce(&S) -> Result<(), ()>,
  commit: impl FnOnce(&S) -> Result<(), ()>,
  rollback: impl FnOnce(&S) -> Result<(), ()>,
) -> Result<(), TransferFailure> {
  let snapshot = prepare().ok_or(TransferFailure::Preflight)?;
  move_native(&snapshot).map_err(|_| TransferFailure::Native)?;
  if commit(&snapshot).is_err() {
    rollback(&snapshot).map_err(|_| TransferFailure::Rollback)?;
    return Err(TransferFailure::Commit);
  }
  Ok(())
}

#[derive(Clone)]
#[doc(hidden)]
pub struct ExecutionPermit {
  active: std::sync::Arc<AtomicBool>,
  deadline: std::time::Instant,
  owner: Option<std::sync::Arc<dyn Fn() -> bool + Send + Sync>>,
}
impl ExecutionPermit {
  pub(crate) fn new(timeout: std::time::Duration) -> Self {
    Self {
      active: std::sync::Arc::new(AtomicBool::new(true)),
      deadline: std::time::Instant::now() + timeout,
      owner: None,
    }
  }
  pub(crate) fn with_owner(
    mut self,
    owner: Option<std::sync::Arc<dyn Fn() -> bool + Send + Sync>>,
  ) -> Self {
    self.owner = owner;
    self
  }
  pub(crate) fn current(&self) -> bool {
    let unexpired =
      || self.active.load(Ordering::Acquire) && std::time::Instant::now() < self.deadline;
    unexpired() && self.owner.as_ref().is_none_or(|owner| owner()) && unexpired()
  }
  pub(crate) fn expire(&self) {
    self.active.store(false, Ordering::Release);
  }
}

#[derive(Clone, Default)]
pub(crate) struct RetainedState {
  mutated: bool,
  terminated: bool,
  published: bool,
}
impl RetainedState {
  pub(crate) fn can_reclaim(
    &self,
    source_matches: bool,
    view_matches: bool,
    owner_matches: bool,
    current: bool,
  ) -> bool {
    current
      && source_matches
      && view_matches
      && owner_matches
      && !self.mutated
      && !self.terminated
      && !self.published
  }
  pub(crate) fn mutation_started(&self) -> bool {
    self.mutated
  }
  pub(crate) fn terminated(&self) -> bool {
    self.terminated
  }
  pub(crate) fn note_mutation(&mut self) {
    self.mutated = true;
  }
  pub(crate) fn confirm_terminated(&mut self, native_absent: bool, runtime_released: bool) -> bool {
    if native_absent && runtime_released {
      self.terminated = true;
      true
    } else {
      false
    }
  }
  pub(crate) fn publish(
    &mut self,
    owner_known: bool,
    current: &dyn Fn() -> bool,
    publisher: impl FnOnce() -> bool,
  ) -> bool {
    if self.terminated || self.published || !owner_known || !current() {
      return false;
    }
    if !publisher() {
      return false;
    }
    self.published = true;
    true
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::cell::RefCell;
  use std::rc::Rc;

  #[test]
  fn host_stage_revocation_stops_native_permit_before_its_own_deadline() {
    use std::sync::Arc;
    let host = Arc::new(AtomicBool::new(true));
    let source = host.clone();
    let permit = ExecutionPermit::new(std::time::Duration::from_secs(5))
      .with_owner(Some(Arc::new(move || source.load(Ordering::Acquire))));
    assert!(permit.current());
    host.store(false, Ordering::Release);
    assert!(!permit.current());
    let later = ExecutionPermit::new(std::time::Duration::from_secs(5));
    assert!(later.current());
    assert!(!permit.current());
  }

  #[test]
  fn runtime_expiry_while_host_currentness_blocks_is_rechecked_before_mutation() {
    use std::sync::{mpsc, Arc, Mutex};
    let (started, entered) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let released = Mutex::new(released);
    let permit = ExecutionPermit::new(std::time::Duration::from_secs(5)).with_owner(Some(
      Arc::new(move || {
        started.send(()).unwrap();
        released.lock().unwrap().recv().unwrap();
        true
      }),
    ));
    let callback = permit.clone();
    let worker = std::thread::spawn(move || callback.current());
    entered.recv().unwrap();
    permit.expire();
    release.send(()).unwrap();
    assert!(!worker.join().unwrap());
  }

  #[derive(Default)]
  struct State {
    source: bool,
    target: bool,
    native_owner: u8,
    registry_owner: u8,
    native_failure: bool,
    commit_failure: bool,
    moves: usize,
    restores: usize,
  }
  fn run(state: &RefCell<State>, view: &Rc<u8>) -> Result<(), TransferFailure> {
    transfer(
      || {
        let state = state.borrow();
        (state.source && state.target).then(|| Rc::clone(view))
      },
      |retained| {
        assert!(Rc::ptr_eq(view, retained));
        let mut state = state.borrow_mut();
        state.moves += 1;
        if state.native_failure {
          return Err(());
        }
        state.native_owner = 2;
        Ok(())
      },
      |retained| {
        assert!(Rc::ptr_eq(view, retained));
        let mut state = state.borrow_mut();
        if !state.source || !state.target || state.commit_failure {
          return Err(());
        }
        state.registry_owner = 2;
        Ok(())
      },
      |retained| {
        assert!(Rc::ptr_eq(view, retained));
        let mut state = state.borrow_mut();
        state.restores += 1;
        if !state.source {
          return Err(());
        }
        state.native_owner = 1;
        Ok(())
      },
    )
  }

  #[test]
  fn missing_source_or_target_never_moves_or_loses_view() {
    for (source, target) in [(false, true), (true, false)] {
      let state = RefCell::new(State {
        source,
        target,
        native_owner: 1,
        registry_owner: 1,
        ..State::default()
      });
      let view = Rc::new(9);
      assert_eq!(run(&state, &view), Err(TransferFailure::Preflight));
      assert_eq!(state.borrow().moves, 0);
      assert_eq!(state.borrow().registry_owner, 1);
      assert_eq!(Rc::strong_count(&view), 1);
    }
  }

  #[test]
  fn native_and_registry_failure_restore_original_identity() {
    for native_failure in [true, false] {
      let state = RefCell::new(State {
        source: true,
        target: true,
        native_owner: 1,
        registry_owner: 1,
        native_failure,
        commit_failure: !native_failure,
        ..State::default()
      });
      let view = Rc::new(9);
      assert_eq!(
        run(&state, &view),
        Err(if native_failure {
          TransferFailure::Native
        } else {
          TransferFailure::Commit
        })
      );
      assert_eq!(
        (state.borrow().native_owner, state.borrow().registry_owner),
        (1, 1)
      );
      assert_eq!(state.borrow().restores, usize::from(!native_failure));
      assert_eq!(Rc::strong_count(&view), 1);
    }
  }

  #[test]
  fn target_destruction_during_native_call_rolls_back_without_borrow_across_callback() {
    let state = RefCell::new(State {
      source: true,
      target: true,
      native_owner: 1,
      registry_owner: 1,
      ..State::default()
    });
    assert_eq!(
      transfer(
        || Some(()),
        |_| {
          let mut s = state.borrow_mut();
          s.native_owner = 2;
          s.target = false;
          Ok(())
        },
        |_| {
          if state.borrow().target {
            Ok(())
          } else {
            Err(())
          }
        },
        |_| {
          state.borrow_mut().native_owner = 1;
          Ok(())
        }
      ),
      Err(TransferFailure::Commit)
    );
    assert_eq!(
      (state.borrow().native_owner, state.borrow().registry_owner),
      (1, 1)
    );
  }

  #[test]
  fn success_publishes_once_and_terminal_source_loss_never_claims_rollback() {
    let state = RefCell::new(State {
      source: true,
      target: true,
      native_owner: 1,
      registry_owner: 1,
      ..State::default()
    });
    assert_eq!(run(&state, &Rc::new(9)), Ok(()));
    assert_eq!(
      (state.borrow().native_owner, state.borrow().registry_owner),
      (2, 2)
    );
    assert_eq!(
      transfer(|| Some(()), |_| Ok(()), |_| Err(()), |_| Err(())),
      Err(TransferFailure::Rollback)
    );
  }

  #[test]
  fn reentrant_dispatch_is_nonblocking_and_gate_releases_on_error() {
    let gate = ReparentGate::default();
    let first = gate.try_enter().unwrap();
    assert!(gate.try_enter().is_none());
    drop(first);
    assert!(gate.try_enter().is_some());
  }
  #[test]
  fn retained_snapshot_tracks_first_mutation_not_early_preparation() {
    let mut state = RetainedState::default();
    let mut latest_input = "input at begin";
    let mut snapshot = latest_input;
    latest_input = "input while target loads";
    if !state.mutation_started() {
      snapshot = latest_input;
    }
    state.note_mutation();
    latest_input = "partial target state";
    if !state.mutation_started() {
      snapshot = latest_input;
    }
    assert_eq!(snapshot, "input while target loads");
  }

  #[test]
  fn refused_compensation_and_unknown_parent_keep_original_until_explicit_publication() {
    let original = Rc::new(9);
    let held = Some(Rc::clone(&original));
    let mut state = RetainedState::default();
    state.note_mutation();
    assert!(!state.publish(false, &|| true, || panic!("unknown owner cannot publish")));
    assert!(!state.publish(true, &|| true, || false));
    assert!(!state.terminated());
    assert_eq!(Rc::strong_count(&original), 2);
    assert!(state.publish(true, &|| true, || true));
    assert!(!state.publish(true, &|| true, || panic!("published once")));
    drop(held);
    assert_eq!(Rc::strong_count(&original), 1);
  }

  #[test]
  fn only_explicit_released_and_absent_native_original_is_terminal() {
    let mut state = RetainedState::default();
    assert!(!state.confirm_terminated(true, false));
    assert!(!state.confirm_terminated(false, true));
    assert!(!state.terminated());
    assert!(state.confirm_terminated(true, true));
    assert!(!state.publish(true, &|| true, || panic!(
      "terminal original cannot publish"
    )));
  }

  #[test]
  fn expired_queued_or_running_operation_cannot_publish() {
    let permit = ExecutionPermit::new(std::time::Duration::from_secs(5));
    let retained = permit.clone();
    permit.expire();
    assert!(!retained.current());
    let mut state = RetainedState::default();
    assert!(!state.publish(true, &|| retained.current(), || panic!(
      "late callback cannot commit"
    )));
  }
  #[test]
  fn lost_begin_reply_reclaims_only_the_same_unmutated_original() {
    use std::sync::{mpsc, Arc, Mutex};
    let original = Arc::new(7);
    let retained = Arc::clone(&original);
    let slot = Arc::new(Mutex::new(None::<(u64, RetainedState, Arc<i32>)>));
    let native_slot = Arc::clone(&slot);
    let (inserted, wait_inserted) = mpsc::channel();
    let (release, wait_release) = mpsc::channel();
    let (reply, ignored_reply) = mpsc::channel();
    let native = std::thread::spawn(move || {
      *native_slot.lock().unwrap() = Some((1, RetainedState::default(), retained));
      inserted.send(()).unwrap();
      wait_release.recv().unwrap();
      reply
        .send(1)
        .expect("reply send succeeds before caller abandons it");
    });
    wait_inserted.recv().unwrap();
    release.send(()).unwrap();
    native.join().unwrap();
    // This is the send-Ok/receiver-timeout-before-drop case; send-error cleanup
    // cannot detect it. Only exact-view idempotent reclaim can recover the token.
    drop(ignored_reply);
    let mut slot = slot.lock().unwrap();
    let (token, state, held) = slot.as_mut().unwrap();
    assert_eq!(*token, 1);
    assert!(state.can_reclaim(true, Arc::ptr_eq(&original, held), true, true));
    assert!(!state.can_reclaim(false, true, true, true));
    assert!(!state.can_reclaim(true, false, true, true));
    state.note_mutation();
    assert!(!state.can_reclaim(true, true, true, true));
    assert!(state.confirm_terminated(true, true));
    slot.take();
    assert_eq!(Arc::strong_count(&original), 1);
  }
}
