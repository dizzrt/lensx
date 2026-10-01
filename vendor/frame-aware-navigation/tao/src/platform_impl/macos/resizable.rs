// Copyright 2014-2021 The winit contributors
// Copyright 2021-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0

//! Private resizable style policy. This module deliberately has no AppKit
//! dependency so its real operation sequence can be tested with a fake adapter.

pub(crate) trait ResizableStyle {
  type Mask: Copy + Eq;
  type Responder;

  /// Store the desired state even when native fullscreen defers the style edit.
  /// Return whether the window is currently in native fullscreen.
  fn record_resizable(&mut self, resizable: bool) -> bool;
  fn style_mask(&self) -> Self::Mask;
  fn resizable_mask(&self, current: Self::Mask, resizable: bool) -> Self::Mask;
  fn first_responder(&self) -> Option<Self::Responder>;
  fn responder_is_current(&self, responder: &Self::Responder) -> bool;
  fn responder_belongs_to_window(&self, responder: &Self::Responder) -> bool;
  fn set_style_mask(&mut self, mask: Self::Mask);
  fn restore_responder(&mut self, responder: &Self::Responder) -> bool;
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum StyleChange {
  DeferredFullscreen,
  Unchanged,
  Changed,
  Restored,
  RestoreRefused,
}

/// The native caller must execute this whole operation on the main thread.
/// Responders are captured only at execution time and never held across messages.
pub(crate) fn set_resizable<W: ResizableStyle>(window: &mut W, resizable: bool) -> StyleChange {
  if window.record_resizable(resizable) {
    return StyleChange::DeferredFullscreen;
  }

  let current = window.style_mask();
  let target = window.resizable_mask(current, resizable);
  if current == target {
    return StyleChange::Unchanged;
  }

  let original = window
    .first_responder()
    .filter(|responder| window.responder_belongs_to_window(responder));
  window.set_style_mask(target);

  if let Some(original) = original {
    if !window.responder_is_current(&original) && window.responder_belongs_to_window(&original) {
      return if window.restore_responder(&original) {
        StyleChange::Restored
      } else {
        StyleChange::RestoreRefused
      };
    }
  }
  StyleChange::Changed
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::cell::RefCell;

  const RESIZABLE: u16 = 1 << 3;
  const OTHER_STYLE: u16 = 1 << 6;
  const ORIGINAL: u32 = 7;
  const REPLACEMENT: u32 = 9;

  struct FakeWindow {
    mask: u16,
    resizable: bool,
    fullscreen: bool,
    responder: Option<u32>,
    original_attached: bool,
    remove_during_style: bool,
    responder_after_style: Option<u32>,
    accept_restoration: bool,
    calls: RefCell<Vec<&'static str>>,
  }

  impl Default for FakeWindow {
    fn default() -> Self {
      Self {
        mask: OTHER_STYLE,
        resizable: false,
        fullscreen: false,
        responder: Some(ORIGINAL),
        original_attached: true,
        remove_during_style: false,
        responder_after_style: Some(ORIGINAL),
        accept_restoration: true,
        calls: RefCell::new(Vec::new()),
      }
    }
  }

  impl FakeWindow {
    fn note(&self, call: &'static str) {
      self.calls.borrow_mut().push(call);
    }

    // Mirrors the original fullscreen exit contract: consume the stored desired
    // resizable state instead of the temporary fullscreen style's resizable bit.
    fn leave_fullscreen(&mut self, saved_style: u16) {
      self.fullscreen = false;
      self.mask = self.resizable_mask(saved_style, self.resizable);
    }
  }

  impl ResizableStyle for FakeWindow {
    type Mask = u16;
    type Responder = u32;

    fn record_resizable(&mut self, resizable: bool) -> bool {
      self.note("record_state");
      self.resizable = resizable;
      self.fullscreen
    }

    fn style_mask(&self) -> Self::Mask {
      self.note("read_mask");
      self.mask
    }

    fn resizable_mask(&self, current: Self::Mask, resizable: bool) -> Self::Mask {
      if resizable {
        current | RESIZABLE
      } else {
        current & !RESIZABLE
      }
    }

    fn first_responder(&self) -> Option<Self::Responder> {
      self.note("capture_responder");
      self.responder
    }

    fn responder_is_current(&self, responder: &Self::Responder) -> bool {
      self.note("compare_responder");
      self.responder == Some(*responder)
    }

    fn responder_belongs_to_window(&self, responder: &Self::Responder) -> bool {
      self.note("validate_responder");
      *responder == ORIGINAL && self.original_attached
    }

    fn set_style_mask(&mut self, mask: Self::Mask) {
      self.note("set_mask");
      self.mask = mask;
      self.responder = self.responder_after_style;
      if self.remove_during_style {
        self.original_attached = false;
      }
    }

    fn restore_responder(&mut self, responder: &Self::Responder) -> bool {
      self.note("restore_responder");
      if self.accept_restoration {
        self.responder = Some(*responder);
      }
      self.accept_restoration
    }
  }

  #[test]
  fn unchanged_mask_records_state_without_touching_the_responder() {
    let mut window = FakeWindow {
      resizable: true, // Native mask, rather than this cached field, is authoritative.
      ..FakeWindow::default()
    };
    assert_eq!(set_resizable(&mut window, false), StyleChange::Unchanged);
    assert!(!window.resizable);
    assert_eq!(window.responder, Some(ORIGINAL));
    assert_eq!(*window.calls.borrow(), ["record_state", "read_mask"]);
  }

  #[test]
  fn changed_mask_preserves_other_bits_and_does_not_refocus_an_unchanged_responder() {
    let mut window = FakeWindow::default();
    assert_eq!(set_resizable(&mut window, true), StyleChange::Changed);
    assert_eq!(window.mask, OTHER_STYLE | RESIZABLE);
    assert!(window.resizable);
    assert_eq!(window.responder, Some(ORIGINAL));
    assert_eq!(
      *window.calls.borrow(),
      [
        "record_state",
        "read_mask",
        "capture_responder",
        "validate_responder",
        "set_mask",
        "compare_responder"
      ]
    );
  }

  #[test]
  fn valid_original_responder_is_revalidated_then_restored() {
    let mut window = FakeWindow {
      responder_after_style: Some(REPLACEMENT),
      ..FakeWindow::default()
    };
    assert_eq!(set_resizable(&mut window, true), StyleChange::Restored);
    assert_eq!(window.responder, Some(ORIGINAL));
    assert_eq!(
      &window.calls.borrow()[5..],
      [
        "compare_responder",
        "validate_responder",
        "restore_responder"
      ]
    );
  }

  #[test]
  fn nil_responder_never_creates_a_focus_target() {
    let mut window = FakeWindow {
      responder: None,
      responder_after_style: None,
      ..FakeWindow::default()
    };
    assert_eq!(set_resizable(&mut window, true), StyleChange::Changed);
    assert_eq!(window.responder, None);
    assert!(!window.calls.borrow().contains(&"restore_responder"));
  }

  #[test]
  fn detached_original_is_not_captured_as_a_restoration_target() {
    let mut window = FakeWindow {
      original_attached: false,
      responder_after_style: None,
      ..FakeWindow::default()
    };
    assert_eq!(set_resizable(&mut window, true), StyleChange::Changed);
    assert_eq!(window.responder, None);
    assert!(!window.calls.borrow().contains(&"restore_responder"));
  }

  #[test]
  fn removed_original_during_style_change_is_not_restored_over_a_replacement() {
    let mut window = FakeWindow {
      remove_during_style: true,
      responder_after_style: Some(REPLACEMENT),
      ..FakeWindow::default()
    };
    assert_eq!(set_resizable(&mut window, true), StyleChange::Changed);
    assert_eq!(window.responder, Some(REPLACEMENT));
    assert!(!window.calls.borrow().contains(&"restore_responder"));
  }

  #[test]
  fn refused_restoration_is_reported_without_fallback_or_retry() {
    let mut window = FakeWindow {
      responder_after_style: Some(REPLACEMENT),
      accept_restoration: false,
      ..FakeWindow::default()
    };
    assert_eq!(
      set_resizable(&mut window, true),
      StyleChange::RestoreRefused
    );
    assert_eq!(window.responder, Some(REPLACEMENT));
    assert_eq!(
      window
        .calls
        .borrow()
        .iter()
        .filter(|call| **call == "restore_responder")
        .count(),
      1
    );
  }

  #[test]
  fn disabling_resizable_preserves_the_valid_input_target() {
    let mut window = FakeWindow {
      mask: OTHER_STYLE | RESIZABLE,
      resizable: true,
      responder_after_style: None,
      ..FakeWindow::default()
    };
    assert_eq!(set_resizable(&mut window, false), StyleChange::Restored);
    assert_eq!(window.mask, OTHER_STYLE);
    assert!(!window.resizable);
    assert_eq!(window.responder, Some(ORIGINAL));
  }

  #[test]
  fn repeated_execution_reads_the_current_mask_before_skipping() {
    let mut window = FakeWindow::default();
    assert_eq!(set_resizable(&mut window, true), StyleChange::Changed);
    window.calls.borrow_mut().clear();
    assert_eq!(set_resizable(&mut window, true), StyleChange::Unchanged);
    assert_eq!(*window.calls.borrow(), ["record_state", "read_mask"]);

    // A native edit between messages must still be repaired even though the
    // stored desired state already equals the next request.
    window.mask = OTHER_STYLE;
    assert_eq!(set_resizable(&mut window, true), StyleChange::Changed);
    assert_eq!(window.mask, OTHER_STYLE | RESIZABLE);
  }

  #[test]
  fn fullscreen_defers_native_edit_but_exit_uses_the_latest_desired_state() {
    let mut window = FakeWindow {
      fullscreen: true,
      mask: OTHER_STYLE | RESIZABLE,
      resizable: true,
      ..FakeWindow::default()
    };
    assert_eq!(
      set_resizable(&mut window, false),
      StyleChange::DeferredFullscreen
    );
    assert!(!window.resizable);
    assert_eq!(window.mask, OTHER_STYLE | RESIZABLE);
    assert_eq!(*window.calls.borrow(), ["record_state"]);
    window.leave_fullscreen(OTHER_STYLE | RESIZABLE);
    assert_eq!(window.mask, OTHER_STYLE);
    assert_eq!(set_resizable(&mut window, false), StyleChange::Unchanged);
  }

  #[test]
  fn multiple_fullscreen_requests_retain_the_final_state_for_exit() {
    let mut window = FakeWindow {
      fullscreen: true,
      ..FakeWindow::default()
    };
    set_resizable(&mut window, true);
    set_resizable(&mut window, false);
    set_resizable(&mut window, true);
    assert_eq!(*window.calls.borrow(), ["record_state"; 3]);
    window.leave_fullscreen(OTHER_STYLE);
    assert_eq!(window.mask, OTHER_STYLE | RESIZABLE);
    assert!(window.resizable);
    assert_eq!(set_resizable(&mut window, true), StyleChange::Unchanged);
  }
}
