// Copyright 2020-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! Private synchronous key-equivalent policy, without an AppKit dependency.
//! The adapter reads native ownership at dispatch time; no target is retained.

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct ChildFocus {
  pub(crate) attached_to_window: bool,
  pub(crate) window_visible: bool,
  pub(crate) window_is_key: bool,
  pub(crate) view_visible: bool,
  pub(crate) owns_first_responder: bool,
}

pub(crate) trait KeyEquivalent {
  type Event;

  fn is_child(&self) -> bool;
  fn child_focus(&self) -> ChildFocus;
  fn perform_super(&mut self, event: &Self::Event) -> bool;
}

pub(crate) fn perform<A: KeyEquivalent>(adapter: &mut A, event: &A::Event) -> bool {
  if adapter.is_child() {
    let focus = adapter.child_focus();
    if !focus.attached_to_window
      || !focus.window_visible
      || !focus.window_is_key
      || !focus.view_visible
      || !focus.owns_first_responder
    {
      return false;
    }
  }
  adapter.perform_super(event)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[derive(Debug, PartialEq)]
  struct Event {
    key: &'static str,
    modifiers: u64,
  }

  struct FakeAdapter {
    child: bool,
    focus: ChildFocus,
    result: bool,
    events: Vec<*const Event>,
  }

  impl KeyEquivalent for FakeAdapter {
    type Event = Event;

    fn is_child(&self) -> bool {
      self.child
    }

    fn child_focus(&self) -> ChildFocus {
      assert!(self.child, "non-child must not inspect child focus");
      self.focus
    }

    fn perform_super(&mut self, event: &Event) -> bool {
      self.events.push(event);
      self.result
    }
  }

  fn focused() -> ChildFocus {
    ChildFocus {
      attached_to_window: true,
      window_visible: true,
      window_is_key: true,
      view_visible: true,
      owns_first_responder: true,
    }
  }

  #[test]
  fn original_events_modifiers_and_both_results_are_preserved_once() {
    for child in [false, true] {
      for result in [false, true] {
        for key in ["A", "F", "C", "X", "V", "Z", "Enter", "W", "Q"] {
          for modifiers in [0, 1 << 20, (1 << 20) | (1 << 17)] {
            let event = Event { key, modifiers };
            let mut adapter = FakeAdapter {
              child,
              focus: if child {
                focused()
              } else {
                ChildFocus::default()
              },
              result,
              events: vec![],
            };
            assert_eq!(perform(&mut adapter, &event), result);
            assert_eq!(adapter.events, vec![&event as *const Event]);
            assert_eq!(event, Event { key, modifiers });
          }
        }
      }
    }
  }

  #[test]
  fn only_current_visible_owned_focus_can_delegate() {
    for attached_to_window in [false, true] {
      for window_visible in [false, true] {
        for view_visible in [false, true] {
          for owns_first_responder in [false, true] {
            let focus = ChildFocus {
              attached_to_window,
              window_visible,
              window_is_key: true,
              view_visible,
              owns_first_responder,
            };
            let mut adapter = FakeAdapter {
              child: true,
              focus,
              result: true,
              events: vec![],
            };
            let expected =
              attached_to_window && window_visible && view_visible && owns_first_responder;
            assert_eq!(
              perform(
                &mut adapter,
                &Event {
                  key: "A",
                  modifiers: 1 << 20
                }
              ),
              expected
            );
            assert_eq!(adapter.events.len(), usize::from(expected));
          }
        }
      }
    }
  }

  #[test]
  fn hidden_detached_replaced_host_sibling_and_missing_responder_never_revive_old_child() {
    for invalidation in [
      "hidden",
      "window hidden",
      "window inactive",
      "detached",
      "replaced",
      "host",
      "sibling",
      "missing",
    ] {
      let event = Event {
        key: "F",
        modifiers: 1 << 20,
      };
      let mut old = FakeAdapter {
        child: true,
        focus: focused(),
        result: true,
        events: vec![],
      };
      assert!(perform(&mut old, &event));
      match invalidation {
        "hidden" => old.focus.view_visible = false,
        "window hidden" => old.focus.window_visible = false,
        "window inactive" => old.focus.window_is_key = false,
        "detached" | "replaced" => old.focus.attached_to_window = false,
        _ => old.focus.owns_first_responder = false,
      }
      assert!(!perform(&mut old, &event), "{invalidation}");
      assert_eq!(old.events.len(), 1);
    }
  }
}
