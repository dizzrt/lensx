// Copyright 2019-2026 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

use std::{
  collections::HashMap,
  sync::{Arc, Weak},
};

/// Pending IPC data belongs to the exact recipient object, not its reusable
/// display label, an origin string or the globally guessable fetch sequence.
pub(crate) struct RecipientQueue<O, T> {
  entries: HashMap<u32, (Arc<O>, T)>,
  retired: Vec<Weak<O>>,
}
impl<O, T> Default for RecipientQueue<O, T> {
  fn default() -> Self {
    Self {
      entries: HashMap::new(),
      retired: Vec::new(),
    }
  }
}
impl<O, T> RecipientQueue<O, T> {
  pub(crate) fn insert(&mut self, id: u32, owner: Arc<O>, body: T) -> bool {
    self
      .retired
      .retain(|recipient| recipient.strong_count() != 0);
    let identity = Arc::downgrade(&owner);
    if self
      .retired
      .iter()
      .any(|recipient| recipient.ptr_eq(&identity))
    {
      return false;
    }
    self.entries.insert(id, (owner, body));
    true
  }
  pub(crate) fn take(&mut self, id: u32, owner: &Arc<O>) -> Option<T> {
    if !self
      .entries
      .get(&id)
      .is_some_and(|(recipient, _)| Arc::ptr_eq(recipient, owner))
    {
      return None;
    }
    self.entries.remove(&id).map(|(_, body)| body)
  }
  pub(crate) fn retire(&mut self, owner: &Arc<O>) {
    self
      .entries
      .retain(|_, (recipient, _)| !Arc::ptr_eq(recipient, owner));
    // A retained Channel/InvokeResponse publisher may run after physical close.
    // Keep exact identity revoked until all old publishers release the object;
    // a new view reusing the label receives a distinct Arc and remains live.
    self
      .retired
      .retain(|recipient| recipient.strong_count() != 0);
    let identity = Arc::downgrade(owner);
    if !self
      .retired
      .iter()
      .any(|recipient| recipient.ptr_eq(&identity))
    {
      self.retired.push(identity);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn guessed_fetch_id_cannot_read_or_consume_another_recipient_payload() {
    let main = Arc::new(());
    let sibling = Arc::new(());
    let mut queue = RecipientQueue::default();
    queue.insert(7, main.clone(), vec![1_u8; 16_384]);
    assert!(queue.take(7, &sibling).is_none());
    assert_eq!(queue.take(7, &main).unwrap().len(), 16_384);
    assert!(queue.take(7, &main).is_none());
  }
  #[test]
  fn sender_drop_does_not_remove_final_payload_before_legitimate_fetch() {
    let recipient = Arc::new(());
    let producer = recipient.clone();
    let mut queue = RecipientQueue::default();
    queue.insert(9, producer.clone(), "last large response".repeat(1024));
    drop(producer);
    assert!(queue
      .take(9, &recipient)
      .unwrap()
      .starts_with("last large response"));
  }
  #[test]
  fn recipient_retirement_is_exact_and_same_label_replacement_cannot_inherit_data() {
    let old = Arc::new("same-label");
    let replacement = Arc::new("same-label");
    let other = Arc::new("other");
    let mut queue = RecipientQueue::default();
    queue.insert(1, old.clone(), "old");
    queue.insert(2, replacement.clone(), "new");
    queue.insert(3, other.clone(), "other");
    assert!(queue.take(1, &replacement).is_none());
    queue.retire(&old);
    assert!(queue.take(1, &old).is_none());
    assert_eq!(queue.take(2, &replacement), Some("new"));
    assert_eq!(queue.take(3, &other), Some("other"));
  }
  #[test]
  fn actual_window_retirement_clears_captured_views_and_preserves_same_label_successor() {
    let shell = Arc::new("shell-label");
    let sibling = Arc::new("child-label");
    let successor = Arc::new("shell-label");
    let mut queue = RecipientQueue::default();
    queue.insert(1, shell.clone(), vec![1_u8; 16_384]);
    queue.insert(2, sibling.clone(), vec![2_u8; 16_384]);
    queue.insert(3, successor.clone(), vec![3_u8; 16_384]);
    queue.retire(&shell);
    queue.retire(&sibling);
    queue.retire(&shell); // Repeated late original cleanup is harmless.
    assert_eq!(queue.entries.len(), 1);
    assert_eq!(queue.take(3, &successor).unwrap(), vec![3_u8; 16_384]);
    assert!(queue.entries.is_empty());
  }
  #[test]
  fn retired_recipient_rejects_late_publishers_but_not_same_label_replacement() {
    let old = Arc::new("shell-label");
    let retained_channel = old.clone();
    let retained_callback = old.clone();
    let replacement = Arc::new("shell-label");
    let mut queue = RecipientQueue::default();
    assert!(queue.insert(1, old.clone(), vec![1_u8; 16_384]));
    queue.retire(&old);
    assert!(!queue.insert(2, retained_channel, vec![2_u8; 16_384]));
    assert!(!queue.insert(3, retained_callback, vec![3_u8; 16_384]));
    assert!(queue.entries.is_empty());
    assert!(queue.insert(4, replacement.clone(), vec![4_u8; 16_384]));
    queue.retire(&old);
    assert_eq!(queue.take(4, &replacement), Some(vec![4_u8; 16_384]));
  }
  #[test]
  fn retirement_tombstones_do_not_retain_destroyed_recipient_objects() {
    let old = Arc::new("old");
    let identity = Arc::downgrade(&old);
    let mut queue = RecipientQueue::default();
    assert!(queue.insert(1, old.clone(), "old payload"));
    queue.retire(&old);
    queue.retire(&old);
    assert_eq!(queue.retired.len(), 1);
    drop(old);
    assert!(identity.upgrade().is_none());
    assert!(queue.insert(2, Arc::new("new"), "new payload"));
    assert!(queue.retired.is_empty());
  }
}
