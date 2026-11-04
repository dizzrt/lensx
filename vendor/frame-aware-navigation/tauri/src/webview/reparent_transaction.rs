// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

use super::*;
use std::sync::{
  atomic::{AtomicBool, Ordering},
  Weak,
};
use tauri_runtime::webview::{ReparentOutcome, ReparentOwnership};

/// Native-confirmed ownership of a retained original WebView.
#[doc(hidden)]
pub enum WebviewReparentOwnership<R: Runtime> {
  Window(Window<R>),
  Destroyed,
  Unknown,
}

pub(super) struct TransactionState<R: Runtime> {
  token: u64,
  dispatcher: R::WebviewDispatcher,
  manager: Weak<AppManager<R>>,
  label: String,
  resource_identity: Arc<Mutex<ResourceTable>>,
  wrapper_owner: Arc<Mutex<Window<R>>>,
  original: Window<R>,
  target: Mutex<Option<Window<R>>>,
  freeze: Arc<super::reparent::ReparentGate>,
  operations: super::reparent::ReparentGate,
  pending: Weak<Mutex<Option<Arc<TransactionState<R>>>>>,
  completed: AtomicBool,
  finished: AtomicBool,
  terminated: AtomicBool,
}

/// Host-private transaction retaining the original native snapshot until explicit
/// publication or verified terminal cleanup. Dropping a handle does not restore,
/// destroy or release it: `Webview::pending_reparent` can reclaim the same state.
#[doc(hidden)]
pub struct WebviewReparentTransaction<R: Runtime> {
  state: Arc<TransactionState<R>>,
}
impl<R: Runtime> Clone for WebviewReparentTransaction<R> {
  fn clone(&self) -> Self {
    Self {
      state: Arc::clone(&self.state),
    }
  }
}

impl<R: Runtime> WebviewReparentTransaction<R> {
  pub(super) fn begin(webview: &Webview<R>) -> crate::Result<Self> {
    if !webview.reparent_gate.claim() {
      return Err(tauri_runtime::Error::FailedToSendMessage.into());
    }
    let token = match webview.webview.dispatcher.begin_reparent() {
      Ok(token) => token,
      Err(error) => {
        webview.reparent_gate.release();
        return Err(error.into());
      }
    };
    let state = Arc::new(TransactionState {
      token,
      dispatcher: webview.webview.dispatcher.clone(),
      manager: Arc::downgrade(&webview.manager),
      label: webview.label().to_owned(),
      resource_identity: Arc::clone(&webview.resources_table),
      wrapper_owner: Arc::clone(&webview.window),
      original: webview.window(),
      target: Mutex::new(None),
      freeze: Arc::clone(&webview.reparent_gate),
      operations: Default::default(),
      pending: Arc::downgrade(&webview.pending_reparent),
      completed: AtomicBool::new(true),
      finished: AtomicBool::new(false),
      terminated: AtomicBool::new(false),
    });
    *webview
      .pending_reparent
      .lock()
      .unwrap_or_else(|error| error.into_inner()) = Some(Arc::clone(&state));
    Ok(Self { state })
  }

  pub(super) fn pending(webview: &Webview<R>) -> Option<Self> {
    webview
      .pending_reparent
      .lock()
      .unwrap_or_else(|error| error.into_inner())
      .as_ref()
      .map(|state| Self {
        state: Arc::clone(state),
      })
  }

  fn remember_owner(&self, owner: ReparentOwnership) -> WebviewReparentOwnership<R> {
    match owner {
      ReparentOwnership::Window(id) => {
        let window = if self.state.original.window.id == id {
          Some(self.state.original.clone())
        } else {
          self
            .state
            .target
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .as_ref()
            .filter(|window| window.window.id == id)
            .cloned()
        };
        if let Some(window) = window {
          *self
            .state
            .wrapper_owner
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = window.clone();
          WebviewReparentOwnership::Window(window)
        } else {
          WebviewReparentOwnership::Unknown
        }
      }
      ReparentOwnership::Destroyed => WebviewReparentOwnership::Destroyed,
      ReparentOwnership::Unknown => WebviewReparentOwnership::Unknown,
    }
  }

  fn operation_result(&self, outcome: ReparentOutcome) -> crate::Result<()> {
    self.remember_owner(outcome.ownership);
    self
      .state
      .completed
      .store(outcome.completed, Ordering::Release);
    if outcome.completed {
      Ok(())
    } else {
      Err(tauri_runtime::Error::FailedToSendMessage.into())
    }
  }

  /// Move the same original to one registered target, retaining its source state.
  pub fn move_to(&self, target: &Window<R>) -> crate::Result<()> {
    self.move_to_guarded(target, Arc::new(|| true))
  }

  /// Apply Host currentness between every native mutation and confirmation.
  pub fn move_to_guarded(
    &self,
    target: &Window<R>,
    current: tauri_runtime::webview::ReparentExecutionGuard,
  ) -> crate::Result<()> {
    let _permit = self
      .state
      .operations
      .try_enter()
      .ok_or(tauri_runtime::Error::FailedToSendMessage)?;
    if self.state.finished.load(Ordering::Acquire) {
      return Err(tauri_runtime::Error::FailedToSendMessage.into());
    }
    {
      let mut bound = self
        .state
        .target
        .lock()
        .unwrap_or_else(|error| error.into_inner());
      if bound
        .as_ref()
        .is_some_and(|window| window.window.id != target.window.id)
      {
        return Err(tauri_runtime::Error::FailedToSendMessage.into());
      }
      *bound = Some(target.clone());
    }
    self.state.completed.store(false, Ordering::Release);
    self.operation_result(self.state.dispatcher.move_reparent(
      self.state.token,
      target.window.id,
      current,
    )?)
  }

  /// Restore the original retained hierarchy, frame, visibility and responder.
  pub fn restore_original(&self) -> crate::Result<()> {
    self.restore_original_guarded(Arc::new(|| true))
  }

  /// Restore only while the supplied Host stage remains current.
  pub fn restore_original_guarded(
    &self,
    current: tauri_runtime::webview::ReparentExecutionGuard,
  ) -> crate::Result<()> {
    let _permit = self
      .state
      .operations
      .try_enter()
      .ok_or(tauri_runtime::Error::FailedToSendMessage)?;
    if self.state.finished.load(Ordering::Acquire) {
      return Err(tauri_runtime::Error::FailedToSendMessage.into());
    }
    self.state.completed.store(false, Ordering::Release);
    self.operation_result(
      self
        .state
        .dispatcher
        .restore_reparent(self.state.token, current)?,
    )
  }

  /// Inspect actual native containment. An unattached live view is Unknown.
  pub fn actual_owner(&self) -> crate::Result<WebviewReparentOwnership<R>> {
    if self.state.finished.load(Ordering::Acquire) {
      return Ok(if self.state.terminated.load(Ordering::Acquire) {
        WebviewReparentOwnership::Destroyed
      } else {
        WebviewReparentOwnership::Unknown
      });
    }
    Ok(self.remember_owner(self.state.dispatcher.reparent_ownership(self.state.token)?))
  }

  /// Hide the retained original for trusted recovery feedback, even if its parent
  /// cannot currently be established. Showing requires a verified native owner.
  pub fn set_visible(&self, visible: bool) -> crate::Result<bool> {
    self.set_visible_guarded(visible, Arc::new(|| true))
  }

  /// Change retained visibility with the current Host stage's execution guard.
  pub fn set_visible_guarded(
    &self,
    visible: bool,
    current: tauri_runtime::webview::ReparentExecutionGuard,
  ) -> crate::Result<bool> {
    if self.state.finished.load(Ordering::Acquire) {
      return Ok(false);
    }
    self
      .state
      .dispatcher
      .set_reparent_visible(self.state.token, visible, current)
      .map_err(Into::into)
  }

  fn cleanup_closed_manager(&self) {
    if let Some(manager) = self.state.manager.upgrade() {
      manager.on_webview_close_exact(&self.state.label, &self.state.resource_identity);
    }
  }

  fn finish_local(&self) {
    if let Some(pending) = self.state.pending.upgrade() {
      super::reparent::finish_once(&self.state.finished, &pending, &self.state, || {
        self.state.freeze.release()
      });
    } else if self
      .state
      .finished
      .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
      .is_ok()
    {
      self.state.freeze.release();
    }
  }

  /// Publish Host ownership while the original snapshot is still retained. The
  /// publisher must perform only bounded pure state mutation and recheck its own
  /// cancellation/deadline after obtaining any Host registry mutex.
  pub fn commit_with(
    &self,
    publish: impl FnOnce() -> bool + Send + 'static,
  ) -> crate::Result<bool> {
    let _permit = self
      .state
      .operations
      .try_enter()
      .ok_or(tauri_runtime::Error::FailedToSendMessage)?;
    if self.state.finished.load(Ordering::Acquire) {
      return Ok(!self.state.terminated.load(Ordering::Acquire));
    }
    if !self.state.completed.load(Ordering::Acquire) {
      return Ok(false);
    }
    let receipt = Arc::new(AtomicBool::new(false));
    let confirmed = Arc::clone(&receipt);
    let transaction = self.clone();
    let result = self.state.dispatcher.commit_reparent(
      self.state.token,
      Box::new(publish),
      Box::new(move || {
        // Native finalization happens before response delivery. Lost replies and
        // dropped caller Contexts cannot strand the shared wrapper freeze.
        transaction.finish_local();
        confirmed.store(true, Ordering::Release);
      }),
    );
    match result {
      Ok(true) => {
        self.finish_local();
        Ok(true)
      }
      Err(_) if receipt.load(Ordering::Acquire) => Ok(true),
      other => other.map_err(Into::into),
    }
  }

  /// Finish a standalone native move without a separate Host registry publisher.
  pub fn commit(&self) -> crate::Result<bool> {
    self.commit_with(|| true)
  }

  /// Perform acknowledged, retryable destruction of this retained original.
  pub fn destroy_original(&self) -> crate::Result<bool> {
    if self.state.finished.load(Ordering::Acquire) {
      return Ok(self.state.terminated.load(Ordering::Acquire));
    }
    let closed = self
      .state
      .dispatcher
      .destroy_reparent_original(self.state.token)?;
    if closed {
      self.cleanup_closed_manager();
    }
    Ok(closed)
  }

  /// Release only after explicit native teardown and confirmed absent containment.
  pub fn finish_terminated(&self) -> crate::Result<bool> {
    let _permit = self
      .state
      .operations
      .try_enter()
      .ok_or(tauri_runtime::Error::FailedToSendMessage)?;
    if self.state.finished.load(Ordering::Acquire) {
      return Ok(self.state.terminated.load(Ordering::Acquire));
    }
    let receipt = Arc::new(AtomicBool::new(false));
    let confirmed = Arc::clone(&receipt);
    let transaction = self.clone();
    let result = self.state.dispatcher.finish_terminated_reparent(
      self.state.token,
      Box::new(move || {
        transaction.state.terminated.store(true, Ordering::Release);
        transaction.cleanup_closed_manager();
        transaction.finish_local();
        confirmed.store(true, Ordering::Release);
      }),
    );
    match result {
      Ok(true) => {
        self.state.terminated.store(true, Ordering::Release);
        self.cleanup_closed_manager();
        self.finish_local();
        Ok(true)
      }
      Err(_) if receipt.load(Ordering::Acquire) => Ok(true),
      other => other.map_err(Into::into),
    }
  }
}
