// Copyright 2020-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! A failed native move restores the retained source hierarchy, frame and responder.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum MoveFailure {
  Prepare,
  Move,
  Rollback,
}

pub(crate) fn transfer<S>(
  prepare: impl FnOnce() -> Option<S>,
  move_and_confirm: impl FnOnce(&S) -> bool,
  restore_and_confirm: impl FnOnce(&S) -> bool,
) -> Result<(), MoveFailure> {
  let snapshot = prepare().ok_or(MoveFailure::Prepare)?;
  if move_and_confirm(&snapshot) {
    return Ok(());
  }
  if restore_and_confirm(&snapshot) {
    Err(MoveFailure::Move)
  } else {
    Err(MoveFailure::Rollback)
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum CloseStep {
  Hide,
  StopLoading,
  Detach,
}

/// The exact original must be hidden before a failed terminal operation can
/// yield to trusted error/retry UI. Only confirmed detachment permits release.
pub(crate) fn close_retained(
  current: &dyn Fn() -> bool,
  mut apply_and_confirm: impl FnMut(CloseStep) -> bool,
) -> bool {
  for step in [CloseStep::Hide, CloseStep::StopLoading, CloseStep::Detach] {
    if !current() || !apply_and_confirm(step) || !current() {
      return false;
    }
  }
  true
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::cell::Cell;
  use std::rc::Rc;

  #[test]
  fn terminal_failure_keeps_the_exact_original_hidden_and_retryable() {
    let original = Rc::new(7);
    for failure in [CloseStep::StopLoading, CloseStep::Detach] {
      let hidden = Cell::new(false);
      let detached = Cell::new(false);
      let mut calls = Vec::new();
      assert!(!close_retained(&|| true, |step| {
        calls.push(step);
        match step {
          CloseStep::Hide => hidden.set(true),
          CloseStep::Detach if failure != step => detached.set(true),
          _ => {}
        }
        step != failure
      }));
      assert!(hidden.get());
      assert!(!detached.get());
      assert_eq!(calls.last(), Some(&failure));
      let retained = Rc::clone(&original);
      assert!(close_retained(&|| true, |step| {
        assert!(Rc::ptr_eq(&retained, &original));
        if step == CloseStep::Detach {
          detached.set(true);
        }
        true
      }));
      assert!(detached.get());
    }
  }

  #[test]
  fn terminal_expiration_after_hide_never_reveals_or_releases_original() {
    let current = Cell::new(true);
    let mut calls = Vec::new();
    assert!(!close_retained(&|| current.get(), |step| {
      calls.push(step);
      current.set(false);
      true
    }));
    assert_eq!(calls, [CloseStep::Hide]);
  }

  #[test]
  fn unavailable_target_never_detaches_source() {
    assert_eq!(
      transfer::<()>(
        || None,
        |_| panic!("must not move"),
        |_| panic!("must not restore")
      ),
      Err(MoveFailure::Prepare)
    );
  }

  #[test]
  fn failed_move_restores_same_object_frame_and_responder() {
    let view = Rc::new(7);
    let owner = Cell::new(1);
    let frame = Cell::new([1, 2, 3, 4]);
    let responder = Cell::new(9);
    let result = transfer(
      || Some((Rc::clone(&view), frame.get(), responder.get())),
      |snapshot| {
        assert!(Rc::ptr_eq(&view, &snapshot.0));
        owner.set(2);
        frame.set([5, 6, 7, 8]);
        responder.set(0);
        false
      },
      |snapshot| {
        owner.set(1);
        frame.set(snapshot.1);
        responder.set(snapshot.2);
        true
      },
    );
    assert_eq!(result, Err(MoveFailure::Move));
    assert_eq!(owner.get(), 1);
    assert_eq!(frame.get(), [1, 2, 3, 4]);
    assert_eq!(responder.get(), 9);
    assert_eq!(Rc::strong_count(&view), 1);
  }

  #[test]
  fn successful_same_object_move_never_runs_restore() {
    assert_eq!(
      transfer(
        || Some(1),
        |_| true,
        |_| panic!("successful move must not restore")
      ),
      Ok(())
    );
    assert_eq!(
      transfer(|| Some(1), |_| false, |_| false),
      Err(MoveFailure::Rollback)
    );
  }
  #[test]
  fn live_source_does_not_make_failed_focus_restoration_a_successful_rollback() {
    let original_view = Rc::new(7);
    let source_alive = Cell::new(true);
    let native_owner = Cell::new(1);
    let responder_restored = Cell::new(false);
    let result = transfer(
      || Some(Rc::clone(&original_view)),
      |retained| {
        assert!(Rc::ptr_eq(retained, &original_view));
        native_owner.set(2);
        false // Target ownership or responder confirmation fails after movement.
      },
      |retained| {
        assert!(source_alive.get());
        assert!(Rc::ptr_eq(retained, &original_view));
        native_owner.set(1); // Hierarchy recovery alone is insufficient.
        responder_restored.get() // AppKit can refuse the original responder.
      },
    );
    assert_eq!(result, Err(MoveFailure::Rollback));
    assert!(source_alive.get());
    assert_eq!(native_owner.get(), 1);
    assert!(!responder_restored.get());
    assert_eq!(Rc::strong_count(&original_view), 1);
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RetainedOperation {
  Move,
  Restore,
  Visibility(bool),
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NativeMutation {
  AttachTarget,
  AttachSource,
  RestoreFrame,
  RestoreVisibility,
  Visibility(bool),
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ResponderStatus {
  Unavailable,
  Current,
  Accepts,
  Refuses,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RetainedFailure {
  Expired,
  Prepare,
  Mutation,
  Confirmation,
  Responder,
}

pub(crate) trait RetainedNativeAdapter {
  fn current(&self) -> bool;
  fn prepare(&self, operation: RetainedOperation) -> bool;
  fn mutate(&mut self, mutation: NativeMutation) -> bool;
  fn confirmed(&self, operation: RetainedOperation) -> bool;
  fn responder(&self, source: bool) -> ResponderStatus;
  fn focus(&mut self, source: bool) -> bool;
  fn focus_confirmed(&self, source: bool) -> bool;
}

/// Production retained-view policy. The adapter contains native getters/setters;
/// admission, mutation order, expiration and focus confirmation remain testable
/// without AppKit. Failure keeps the caller's original snapshot intact.
pub(crate) fn execute_retained(
  adapter: &mut impl RetainedNativeAdapter,
  operation: RetainedOperation,
) -> Result<(), RetainedFailure> {
  if !adapter.current() {
    return Err(RetainedFailure::Expired);
  }
  if !adapter.prepare(operation) {
    return Err(RetainedFailure::Prepare);
  }
  let mutations: &[NativeMutation] = match operation {
    RetainedOperation::Move => &[NativeMutation::AttachTarget],
    RetainedOperation::Restore => &[
      NativeMutation::AttachSource,
      NativeMutation::RestoreFrame,
      NativeMutation::RestoreVisibility,
    ],
    RetainedOperation::Visibility(visible) => return apply_visibility(adapter, visible),
  };
  for mutation in mutations {
    if !adapter.current() {
      return Err(RetainedFailure::Expired);
    }
    if !adapter.mutate(*mutation) {
      return Err(RetainedFailure::Mutation);
    }
    if !adapter.current() {
      return Err(RetainedFailure::Expired);
    }
  }
  if !adapter.confirmed(operation) {
    return Err(RetainedFailure::Confirmation);
  }
  if !adapter.current() {
    return Err(RetainedFailure::Expired);
  }
  let source = operation == RetainedOperation::Restore;
  let responder = adapter.responder(source);
  if !adapter.current() {
    return Err(RetainedFailure::Expired);
  }
  match responder {
    ResponderStatus::Unavailable | ResponderStatus::Current => Ok(()),
    ResponderStatus::Refuses => Err(RetainedFailure::Responder),
    ResponderStatus::Accepts => {
      if !adapter.focus(source) {
        return Err(RetainedFailure::Responder);
      }
      if !adapter.current() {
        return Err(RetainedFailure::Expired);
      }
      if adapter.focus_confirmed(source) {
        Ok(())
      } else {
        Err(RetainedFailure::Responder)
      }
    }
  }
}

fn apply_visibility(
  adapter: &mut impl RetainedNativeAdapter,
  visible: bool,
) -> Result<(), RetainedFailure> {
  if !adapter.current() {
    return Err(RetainedFailure::Expired);
  }
  if !adapter.mutate(NativeMutation::Visibility(visible)) {
    return Err(RetainedFailure::Mutation);
  }
  if !adapter.current() {
    return Err(RetainedFailure::Expired);
  }
  if adapter.confirmed(RetainedOperation::Visibility(visible)) {
    Ok(())
  } else {
    Err(RetainedFailure::Confirmation)
  }
}

#[cfg(test)]
mod retained_tests {
  use super::*;
  use std::cell::{Cell, RefCell};
  use std::rc::Rc;

  struct Original {
    input: String,
    history: Vec<String>,
    parent: Cell<u8>,
    frame: Cell<[i32; 4]>,
    visible: Cell<bool>,
    responder: Cell<u8>,
  }
  struct Adapter {
    original: Rc<Original>,
    current: Cell<bool>,
    source_alive: bool,
    target_alive: bool,
    refuse: bool,
    responder_available: bool,
    confirm_focus: bool,
    expire_after: Option<NativeMutation>,
    snapshot_frame: [i32; 4],
    snapshot_visible: bool,
    snapshot_responder: u8,
    operations: RefCell<Vec<NativeMutation>>,
    focus_calls: usize,
  }
  impl Adapter {
    fn new() -> Self {
      Self {
        original: Rc::new(Original {
          input: "retained input".into(),
          history: vec!["before".into()],
          parent: Cell::new(1),
          frame: Cell::new([1, 2, 3, 4]),
          visible: Cell::new(true),
          responder: Cell::new(9),
        }),
        current: Cell::new(true),
        source_alive: true,
        target_alive: true,
        refuse: false,
        responder_available: true,
        confirm_focus: true,
        expire_after: None,
        snapshot_frame: [1, 2, 3, 4],
        snapshot_visible: true,
        snapshot_responder: 9,
        operations: RefCell::new(vec![]),
        focus_calls: 0,
      }
    }
  }
  impl RetainedNativeAdapter for Adapter {
    fn current(&self) -> bool {
      self.current.get()
    }
    fn prepare(&self, operation: RetainedOperation) -> bool {
      match operation {
        RetainedOperation::Move => self.target_alive,
        RetainedOperation::Restore => self.source_alive,
        RetainedOperation::Visibility(_) => true,
      }
    }
    fn mutate(&mut self, mutation: NativeMutation) -> bool {
      self.operations.borrow_mut().push(mutation);
      match mutation {
        NativeMutation::AttachTarget => {
          self.original.parent.set(2);
          self.original.frame.set([5, 6, 7, 8]);
          self.original.responder.set(0);
        }
        NativeMutation::AttachSource => {
          self.original.parent.set(1);
          self.original.responder.set(0);
        }
        NativeMutation::RestoreFrame => self.original.frame.set(self.snapshot_frame),
        NativeMutation::RestoreVisibility => self.original.visible.set(self.snapshot_visible),
        NativeMutation::Visibility(visible) => self.original.visible.set(visible),
      }
      if self.expire_after == Some(mutation) {
        self.current.set(false);
      }
      true
    }
    fn confirmed(&self, operation: RetainedOperation) -> bool {
      match operation {
        RetainedOperation::Move => self.original.parent.get() == 2,
        RetainedOperation::Restore => {
          self.original.parent.get() == 1
            && self.original.frame.get() == self.snapshot_frame
            && self.original.visible.get() == self.snapshot_visible
        }
        RetainedOperation::Visibility(visible) => self.original.visible.get() == visible,
      }
    }
    fn responder(&self, _: bool) -> ResponderStatus {
      if !self.responder_available {
        ResponderStatus::Unavailable
      } else if self.original.responder.get() == self.snapshot_responder {
        ResponderStatus::Current
      } else if self.refuse {
        ResponderStatus::Refuses
      } else {
        ResponderStatus::Accepts
      }
    }
    fn focus(&mut self, _: bool) -> bool {
      self.focus_calls += 1;
      if self.confirm_focus {
        self.original.responder.set(self.snapshot_responder);
      }
      true
    }
    fn focus_confirmed(&self, _: bool) -> bool {
      self.original.responder.get() == self.snapshot_responder
    }
  }

  #[test]
  fn retained_production_policy_keeps_original_through_refusal_and_retry() {
    let mut adapter = Adapter::new();
    let original = Rc::clone(&adapter.original);
    adapter.refuse = true;
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Move),
      Err(RetainedFailure::Responder)
    );
    assert_eq!(original.parent.get(), 2);
    assert_eq!(adapter.focus_calls, 0);
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Restore),
      Err(RetainedFailure::Responder)
    );
    assert_eq!(original.parent.get(), 1);
    assert_eq!(original.frame.get(), [1, 2, 3, 4]);
    adapter.refuse = false;
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Restore),
      Ok(())
    );
    assert!(Rc::ptr_eq(&original, &adapter.original));
    assert_eq!(original.input, "retained input");
    assert_eq!(original.history, ["before"]);
    assert_eq!(original.responder.get(), 9);
  }

  #[test]
  fn expiration_after_partial_native_movement_stops_later_mutations_and_reuses_snapshot() {
    let mut adapter = Adapter::new();
    adapter.expire_after = Some(NativeMutation::AttachTarget);
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Move),
      Err(RetainedFailure::Expired)
    );
    assert_eq!(*adapter.operations.borrow(), [NativeMutation::AttachTarget]);
    assert_eq!(adapter.focus_calls, 0);
    adapter.current.set(true);
    adapter.expire_after = None;
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Restore),
      Ok(())
    );
    assert_eq!(adapter.original.frame.get(), [1, 2, 3, 4]);
    assert_eq!(adapter.original.responder.get(), 9);
  }

  #[test]
  fn each_restore_stage_checks_expiry_before_the_next_stage() {
    for stage in [
      NativeMutation::AttachSource,
      NativeMutation::RestoreFrame,
      NativeMutation::RestoreVisibility,
    ] {
      let mut adapter = Adapter::new();
      adapter.expire_after = Some(stage);
      assert_eq!(
        execute_retained(&mut adapter, RetainedOperation::Restore),
        Err(RetainedFailure::Expired)
      );
      assert_eq!(adapter.operations.borrow().last(), Some(&stage));
      assert_eq!(adapter.focus_calls, 0);
    }
  }

  #[test]
  fn focus_success_requires_readback_and_missing_source_never_mutates() {
    let mut adapter = Adapter::new();
    adapter.confirm_focus = false;
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Move),
      Err(RetainedFailure::Responder)
    );
    adapter.operations.borrow_mut().clear();
    adapter.source_alive = false;
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Restore),
      Err(RetainedFailure::Prepare)
    );
    assert!(adapter.operations.borrow().is_empty());
  }

  #[test]
  fn identity_bound_repair_hide_works_without_window_ownership_but_not_after_expiry() {
    let mut adapter = Adapter::new();
    adapter.original.parent.set(0);
    adapter.source_alive = false;
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Visibility(false)),
      Ok(())
    );
    assert!(!adapter.original.visible.get());
    adapter.current.set(false);
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Visibility(true)),
      Err(RetainedFailure::Expired)
    );
    assert!(!adapter.original.visible.get());
  }
  #[test]
  fn invalidated_original_responder_is_never_forced_into_another_subtree() {
    let mut adapter = Adapter::new();
    adapter.responder_available = false;
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Move),
      Ok(())
    );
    assert_eq!(
      execute_retained(&mut adapter, RetainedOperation::Restore),
      Ok(())
    );
    assert_eq!(adapter.focus_calls, 0);
    assert_eq!(adapter.original.input, "retained input");
  }
}
