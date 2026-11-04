// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! Main-thread retained transactions, independent of source/target Window records.
pub use super::reparent::ExecutionPermit;
use super::reparent::RetainedState;
use super::*;
use tauri_runtime::webview::{ReparentOutcome, ReparentOwnership};
use wry::WebViewExtMacOS;

#[derive(Clone)]
struct Transaction {
  token: u64,
  source_id: WindowId,
  source: Arc<Window>,
  original: Rc<wry::NativeReparentSnapshot>,
  view: Option<WebviewWrapper>,
  policy: RetainedState,
}

#[derive(Default)]
pub(crate) struct Transactions {
  next_token: u64,
  entries: BTreeMap<WebviewId, Transaction>,
  finished: BTreeMap<WebviewId, (u64, bool)>,
  closed: HashSet<WebviewId>,
}
impl fmt::Debug for Transactions {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("ReparentTransactions")
      .field("count", &self.entries.len())
      .finish()
  }
}

fn transaction(windows: &WindowsStore, view: WebviewId, token: u64) -> Option<Transaction> {
  windows
    .1
    .borrow()
    .entries
    .get(&view)
    .filter(|entry| entry.token == token)
    .cloned()
}

pub(crate) fn data_view(windows: &WindowsStore, view_id: WebviewId) -> Option<WebviewWrapper> {
  let current = windows.0.borrow().values().find_map(|window| {
    window
      .webviews
      .iter()
      .find(|view| view.id == view_id)
      .cloned()
  });
  let (closed, retained) = {
    let state = windows.1.borrow();
    (
      state.closed.contains(&view_id),
      state
        .entries
        .get(&view_id)
        .filter(|entry| !entry.policy.terminated())
        .and_then(|entry| entry.view.clone()),
    )
  };
  let identity = |view: &WebviewWrapper| (view.id, Rc::as_ptr(&view.inner) as usize);
  match super::data_delivery::select_data_source(
    view_id,
    current.as_ref().map(identity),
    retained.as_ref().map(identity),
    closed,
  ) {
    Some(super::data_delivery::DataLocation::Current) => current,
    Some(super::data_delivery::DataLocation::Retained) => retained,
    None => None,
  }
}

pub(crate) fn contains(windows: &WindowsStore, view: WebviewId) -> bool {
  windows.1.borrow().entries.contains_key(&view)
}

pub(crate) fn begin(
  windows: &WindowsStore,
  source_id: WindowId,
  view_id: WebviewId,
  current: &dyn Fn() -> bool,
) -> Result<u64> {
  if !current() {
    return Err(Error::FailedToSendMessage);
  }
  let existing = windows.1.borrow().entries.get(&view_id).cloned();
  if let Some(existing) = existing {
    let source_matches = existing.source_id == source_id
      && windows
        .0
        .borrow()
        .get(&source_id)
        .and_then(|source| source.inner.as_ref())
        .is_some_and(|source| Arc::ptr_eq(source, &existing.source));
    let view_matches = existing.view.as_ref().is_some_and(|held| {
      windows.0.borrow().get(&source_id).is_some_and(|source| {
        source
          .webviews
          .iter()
          .any(|view| view.id == view_id && Rc::ptr_eq(&view.inner, &held.inner))
      })
    });
    let owner_matches = actual_owner(windows, &existing) == ReparentOwnership::Window(source_id);
    return existing
      .policy
      .can_reclaim(source_matches, view_matches, owner_matches, current())
      .then_some(existing.token)
      .ok_or(Error::FailedToSendMessage);
  }
  let (view, source) = {
    let registry = windows.0.borrow();
    let source = registry.get(&source_id).ok_or(Error::WindowNotFound)?;
    (
      source
        .webviews
        .iter()
        .find(|view| view.id == view_id)
        .cloned()
        .ok_or(Error::FailedToSendMessage)?,
      source.inner.clone().ok_or(Error::WindowNotFound)?,
    )
  };
  // This initial snapshot retains identity only. Its frame/responder is refreshed
  // at the first actual mutation, so target readiness cannot stale rollback input.
  let original = view
    .inner
    .capture_reparent_snapshot()
    .map_err(|_| Error::FailedToSendMessage)?;
  if !current()
    || original.actual_window().map(|pointer| pointer as usize) != Some(source.ns_window() as usize)
  {
    return Err(Error::FailedToSendMessage);
  }
  let mut transactions = windows.1.borrow_mut();
  if !current() || transactions.entries.contains_key(&view_id) {
    return Err(Error::FailedToSendMessage);
  }
  transactions.next_token = transactions
    .next_token
    .checked_add(1)
    .ok_or(Error::FailedToSendMessage)?;
  let token = transactions.next_token;
  transactions.finished.remove(&view_id);
  transactions.entries.insert(
    view_id,
    Transaction {
      token,
      source_id,
      source,
      original: Rc::new(original),
      view: Some(view),
      policy: RetainedState::default(),
    },
  );
  Ok(token)
}

fn actual_window(windows: &WindowsStore, pointer: Option<usize>) -> ReparentOwnership {
  let Some(pointer) = pointer else {
    return ReparentOwnership::Unknown;
  };
  let candidates = windows
    .0
    .borrow()
    .iter()
    .filter_map(|(id, window)| window.inner.clone().map(|window| (*id, window)))
    .collect::<Vec<_>>();
  candidates
    .into_iter()
    .find(|(_, window)| window.ns_window() as usize == pointer)
    .map_or(ReparentOwnership::Unknown, |(id, _)| {
      ReparentOwnership::Window(id)
    })
}

fn actual_owner(windows: &WindowsStore, entry: &Transaction) -> ReparentOwnership {
  if entry.policy.terminated() {
    return if entry.view.is_none() && entry.original.is_detached() {
      ReparentOwnership::Destroyed
    } else {
      ReparentOwnership::Unknown
    };
  }
  actual_window(
    windows,
    entry
      .original
      .actual_window()
      .map(|pointer| pointer as usize),
  )
}

fn align_registry(
  windows: &WindowsStore,
  view_id: WebviewId,
  entry: &Transaction,
) -> ReparentOwnership {
  let owner = actual_owner(windows, entry);
  let ReparentOwnership::Window(owner_id) = owner else {
    return owner;
  };
  let Some(view) = &entry.view else {
    return ReparentOwnership::Unknown;
  };
  let mut registry = windows.0.borrow_mut();
  if !registry
    .get(&owner_id)
    .is_some_and(|window| window.inner.is_some())
  {
    return ReparentOwnership::Unknown;
  }
  // A retained wrapper prevents native destruction while registry clones move.
  // No AppKit operation crosses this short non-reentrant registry borrow.
  for window in registry.values_mut() {
    window.webviews.retain(|candidate| candidate.id != view_id);
  }
  let target = registry.get_mut(&owner_id).expect("validated owner");
  target.webviews.push(view.clone());
  target.has_children.store(true, Ordering::Relaxed);
  owner
}

fn refresh_before_mutation(
  windows: &WindowsStore,
  view_id: WebviewId,
  token: u64,
  current: &dyn Fn() -> bool,
) -> Result<Transaction> {
  let mut entry = transaction(windows, view_id, token).ok_or(Error::FailedToSendMessage)?;
  if entry.policy.terminated() || !current() {
    return Err(Error::FailedToSendMessage);
  }
  if !entry.policy.mutation_started() {
    let view = entry.view.as_ref().ok_or(Error::FailedToSendMessage)?;
    let original = view
      .inner
      .capture_reparent_snapshot()
      .map_err(|_| Error::FailedToSendMessage)?;
    if !current() {
      return Err(Error::FailedToSendMessage);
    }
    entry.original = Rc::new(original);
    windows
      .1
      .borrow_mut()
      .entries
      .get_mut(&view_id)
      .filter(|value| value.token == token)
      .ok_or(Error::FailedToSendMessage)?
      .original = Rc::clone(&entry.original);
  }
  Ok(entry)
}

fn mark_mutation(windows: &WindowsStore, view_id: WebviewId, token: u64) {
  if let Some(entry) = windows
    .1
    .borrow_mut()
    .entries
    .get_mut(&view_id)
    .filter(|entry| entry.token == token)
  {
    entry.policy.note_mutation();
  }
}

pub(crate) fn move_to(
  windows: &WindowsStore,
  view_id: WebviewId,
  token: u64,
  target_id: WindowId,
  current: &dyn Fn() -> bool,
) -> Result<ReparentOutcome> {
  let target = windows
    .0
    .borrow()
    .get(&target_id)
    .and_then(|window| window.inner.clone());
  let Some(target) = target else {
    return Ok(ReparentOutcome {
      ownership: ownership(windows, view_id, token)?,
      completed: false,
    });
  };
  let entry = refresh_before_mutation(windows, view_id, token, current)?;
  let completed = entry
    .original
    .move_to(target.ns_window() as _, current, &|| {
      mark_mutation(windows, view_id, token)
    })
    .is_ok();
  let ownership = align_registry(windows, view_id, &entry);
  Ok(ReparentOutcome {
    ownership,
    completed: completed && ownership == ReparentOwnership::Window(target_id),
  })
}

pub(crate) fn restore(
  windows: &WindowsStore,
  view_id: WebviewId,
  token: u64,
  current: &dyn Fn() -> bool,
) -> Result<ReparentOutcome> {
  let entry = transaction(windows, view_id, token).ok_or(Error::FailedToSendMessage)?;
  let source_alive = windows
    .0
    .borrow()
    .get(&entry.source_id)
    .and_then(|window| window.inner.as_ref())
    .is_some_and(|source| Arc::ptr_eq(source, &entry.source));
  // Pre-move failure must never restore an early snapshot over newer user input.
  let completed = !entry.policy.terminated()
    && current()
    && source_alive
    && (!entry.policy.mutation_started() || entry.original.restore(current).is_ok());
  let ownership = align_registry(windows, view_id, &entry);
  Ok(ReparentOutcome {
    ownership,
    completed: completed && ownership == ReparentOwnership::Window(entry.source_id),
  })
}

pub(crate) fn ownership(
  windows: &WindowsStore,
  view_id: WebviewId,
  token: u64,
) -> Result<ReparentOwnership> {
  if let Some(entry) = transaction(windows, view_id, token) {
    return Ok(actual_owner(windows, &entry));
  }
  let finished = windows.1.borrow().finished.get(&view_id).copied();
  if !finished.is_some_and(|(finished_token, _)| finished_token == token) {
    return Err(Error::FailedToSendMessage);
  }
  if windows.1.borrow().closed.contains(&view_id) {
    return Ok(ReparentOwnership::Destroyed);
  }
  let view = windows.0.borrow().values().find_map(|window| {
    window
      .webviews
      .iter()
      .find(|view| view.id == view_id)
      .cloned()
  });
  Ok(view.map_or(ReparentOwnership::Unknown, |view| {
    actual_window(
      windows,
      view
        .inner
        .webview()
        .window()
        .map(|window| &*window as *const objc2_app_kit::NSWindow as usize),
    )
  }))
}

pub(crate) fn set_visible(
  windows: &WindowsStore,
  view_id: WebviewId,
  token: u64,
  visible: bool,
  current: &dyn Fn() -> bool,
) -> Result<bool> {
  let entry = refresh_before_mutation(windows, view_id, token, current)?;
  if visible && !matches!(actual_owner(windows, &entry), ReparentOwnership::Window(_)) {
    return Ok(false);
  }
  Ok(
    entry
      .original
      .set_visible(visible, current, &|| mark_mutation(windows, view_id, token))
      .is_ok(),
  )
}

pub(crate) fn commit(
  windows: &WindowsStore,
  view_id: WebviewId,
  token: u64,
  publish: Box<dyn FnOnce() -> bool + Send>,
  current: &dyn Fn() -> bool,
) -> Result<bool> {
  if windows.1.borrow().finished.get(&view_id) == Some(&(token, false)) {
    return Ok(true);
  }
  let entry = transaction(windows, view_id, token).ok_or(Error::FailedToSendMessage)?;
  if !current()
    || !matches!(
      align_registry(windows, view_id, &entry),
      ReparentOwnership::Window(_)
    )
  {
    return Ok(false);
  }
  // Original state survives publication. The publisher rechecks its own expiry
  // under the Host registry lock; no RefCell borrow crosses that callback.
  let mut publication = entry.policy.clone();
  if !publication.publish(true, current, publish) {
    return Ok(false);
  }
  let retired = {
    let mut state = windows.1.borrow_mut();
    state.finished.insert(view_id, (token, false));
    state.entries.remove(&view_id)
  };
  drop(retired);
  Ok(true)
}

pub(crate) fn close(
  windows: &WindowsStore,
  view_id: WebviewId,
  current: &dyn Fn() -> bool,
) -> bool {
  if windows.1.borrow().closed.contains(&view_id) {
    return true;
  }
  let entry = windows.1.borrow().entries.get(&view_id).cloned();
  let view = entry
    .as_ref()
    .and_then(|entry| entry.view.clone())
    .or_else(|| {
      windows.0.borrow().values().find_map(|window| {
        window
          .webviews
          .iter()
          .find(|view| view.id == view_id)
          .cloned()
      })
    });
  let Some(view) = view else {
    return false;
  };
  if view.inner.close_confirmed(current).is_err() {
    return false;
  }
  let removed = {
    let mut registry = windows.0.borrow_mut();
    let mut removed = Vec::new();
    for window in registry.values_mut() {
      let mut index = 0;
      while index < window.webviews.len() {
        if window.webviews[index].id == view_id {
          removed.push(window.webviews.remove(index));
        } else {
          index += 1;
        }
      }
    }
    removed
  };
  let held = windows
    .1
    .borrow_mut()
    .entries
    .get_mut(&view_id)
    .and_then(|entry| entry.view.take());
  let evidence = entry.as_ref().map(|entry| Rc::clone(&entry.original));
  // Complete Wry runtime destruction outside every registry borrow before
  // publishing terminal proof. A reentrant observer still sees Unknown until now.
  drop(held);
  drop(removed);
  drop(view);
  drop(entry);
  let absent = evidence
    .as_ref()
    .is_none_or(|original| original.is_detached());
  let mut state = windows.1.borrow_mut();
  if !absent {
    return false;
  }
  let token = state.entries.get_mut(&view_id).map(|entry| {
    entry.policy.confirm_terminated(true, true);
    entry.token
  });
  state.closed.insert(view_id);
  if let Some(token) = token {
    state.finished.insert(view_id, (token, true));
  }
  let retired = state.entries.remove(&view_id);
  drop(state);
  drop(retired);
  true
}

pub(crate) fn destroy_original(
  windows: &WindowsStore,
  view_id: WebviewId,
  token: u64,
  current: &dyn Fn() -> bool,
) -> Result<bool> {
  if transaction(windows, view_id, token).is_none() {
    return if windows.1.borrow().finished.get(&view_id) == Some(&(token, true))
      && windows.1.borrow().closed.contains(&view_id)
    {
      Ok(true)
    } else {
      Err(Error::FailedToSendMessage)
    };
  }
  Ok(close(windows, view_id, current))
}

pub(crate) fn finish_terminated(
  windows: &WindowsStore,
  view_id: WebviewId,
  token: u64,
) -> Result<bool> {
  if windows.1.borrow().finished.get(&view_id) == Some(&(token, true)) {
    return Ok(true);
  }
  let entry = transaction(windows, view_id, token).ok_or(Error::FailedToSendMessage)?;
  if actual_owner(windows, &entry) != ReparentOwnership::Destroyed {
    return Ok(false);
  }
  let retired = {
    let mut state = windows.1.borrow_mut();
    state.finished.insert(view_id, (token, true));
    state.entries.remove(&view_id)
  };
  drop(retired);
  Ok(true)
}
