// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! Serialize wrapper commits without retaining the window mutex across native work.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub(crate) struct ReparentGate(AtomicBool);
pub(crate) struct Permit<'a>(&'a AtomicBool);
impl ReparentGate {
  pub(crate) fn claim(&self) -> bool {
    self
      .0
      .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
      .is_ok()
  }
  pub(crate) fn release(&self) {
    self.0.store(false, Ordering::Release);
  }
  pub(crate) fn try_enter(&self) -> Option<Permit<'_>> {
    self.claim().then_some(Permit(&self.0))
  }
}
impl Drop for Permit<'_> {
  fn drop(&mut self) {
    self.0.store(false, Ordering::Release);
  }
}

#[cfg(any(not(target_os = "macos"), test))]
pub(crate) fn transfer<T, E>(
  gate: &ReparentGate,
  owner: &Mutex<T>,
  target: T,
  native: impl FnOnce() -> Result<(), E>,
  busy: impl FnOnce() -> E,
) -> Result<(), E> {
  gate
    .0
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
    .map_err(|_| busy())?;
  let _permit = Permit(&gate.0);
  native()?;
  *owner
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner()) = target;
  Ok(())
}

pub(crate) fn finish_once<T>(
  finished: &AtomicBool,
  pending: &Mutex<Option<Arc<T>>>,
  expected: &Arc<T>,
  release: impl FnOnce(),
) -> bool {
  if finished
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
    .is_err()
  {
    return false;
  }
  let mut pending = pending.lock().unwrap_or_else(|error| error.into_inner());
  if !pending
    .as_ref()
    .is_some_and(|value| Arc::ptr_eq(value, expected))
  {
    return false;
  }
  pending.take();
  drop(pending);
  release();
  true
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::{mpsc, Arc};

  #[test]
  fn retained_transaction_gate_can_be_released_only_explicitly() {
    let gate = ReparentGate::default();
    assert!(gate.claim());
    assert!(!gate.claim());
    assert!(gate.try_enter().is_none());
    gate.release();
    let permit = gate.try_enter().unwrap();
    assert!(!gate.claim());
    drop(permit);
    assert!(gate.claim());
    gate.release();
  }

  #[test]
  fn native_failure_leaves_wrapper_owner_and_allows_retry() {
    let gate = ReparentGate::default();
    let owner = Mutex::new(1);
    assert_eq!(
      transfer(&gate, &owner, 2, || Err("native"), || "busy"),
      Err("native")
    );
    assert_eq!(*owner.lock().unwrap(), 1);
    assert!(transfer(&gate, &owner, 2, || Ok::<_, &str>(()), || "busy").is_ok());
    assert_eq!(*owner.lock().unwrap(), 2);
  }

  #[test]
  fn concurrent_or_reentrant_transfer_is_rejected_without_blocking_window_reads() {
    let gate = Arc::new(ReparentGate::default());
    let owner = Arc::new(Mutex::new(1));
    let (started, wait_started) = mpsc::channel();
    let (release, wait_release) = mpsc::channel();
    let worker_gate = Arc::clone(&gate);
    let worker_owner = Arc::clone(&owner);
    let worker = std::thread::spawn(move || {
      transfer(
        &worker_gate,
        &worker_owner,
        2,
        || {
          assert_eq!(*worker_owner.lock().unwrap(), 1);
          started.send(()).unwrap();
          wait_release.recv().unwrap();
          Ok::<_, &str>(())
        },
        || "busy",
      )
    });
    wait_started.recv().unwrap();
    assert_eq!(*owner.lock().unwrap(), 1);
    assert_eq!(
      transfer(
        &gate,
        &owner,
        3,
        || panic!("busy must not call native"),
        || "busy"
      ),
      Err("busy")
    );
    release.send(()).unwrap();
    worker.join().unwrap().unwrap();
    assert_eq!(*owner.lock().unwrap(), 2);
  }
  #[test]
  fn lost_commit_reply_finishes_locally_and_late_old_callback_cannot_unlock_new_transaction() {
    let gate = Arc::new(ReparentGate::default());
    assert!(gate.claim());
    let original = Arc::new(1);
    let pending = Arc::new(Mutex::new(Some(Arc::clone(&original))));
    let finished = Arc::new(AtomicBool::new(false));
    let (published, wait_published) = mpsc::channel();
    let (release, wait_release) = mpsc::channel();
    let (reply, ignored_reply) = mpsc::channel();
    let native_gate = Arc::clone(&gate);
    let native_pending = Arc::clone(&pending);
    let native_original = Arc::clone(&original);
    let native_finished = Arc::clone(&finished);
    let native = std::thread::spawn(move || {
      // Host publication is complete, then local completion runs before the
      // native reply can be lost. Context ownership is not needed for cleanup.
      assert!(finish_once(
        &native_finished,
        &native_pending,
        &native_original,
        || native_gate.release()
      ));
      published.send(()).unwrap();
      wait_release.recv().unwrap();
      reply.send(true).unwrap();
    });
    wait_published.recv().unwrap();
    release.send(()).unwrap();
    native.join().unwrap();
    drop(ignored_reply);
    assert!(pending.lock().unwrap().is_none());
    assert!(gate.claim());
    let newer = Arc::new(2);
    *pending.lock().unwrap() = Some(Arc::clone(&newer));
    assert!(!finish_once(&finished, &pending, &original, || gate.release()));
    assert!(Arc::ptr_eq(
      pending.lock().unwrap().as_ref().unwrap(),
      &newer
    ));
    assert!(!gate.claim());
    gate.release();
  }
}
