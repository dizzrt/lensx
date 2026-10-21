// Copyright 2014-2021 The winit contributors
// Copyright 2021-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0

//! Private command propagation policy for a native view with focused descendants.
//! Native ownership is read at each call; no event or responder is retained.

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct DescendantFocus {
  pub(crate) attached_to_window: bool,
  pub(crate) window_visible: bool,
  pub(crate) window_is_key: bool,
  pub(crate) view_visible: bool,
  pub(crate) owns_focused_descendant: bool,
}

pub(crate) trait CommandResponder {
  type Command;

  fn descendant_focus(&self) -> DescendantFocus;
  fn perform_super(&mut self, command: &Self::Command);
}

pub(crate) fn do_command<A: CommandResponder>(adapter: &mut A, command: &A::Command) {
  let focus = adapter.descendant_focus();
  if focus.attached_to_window
    && focus.window_visible
    && focus.window_is_key
    && focus.view_visible
    && focus.owns_focused_descendant
  {
    adapter.perform_super(command);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  struct FakeResponder {
    focus: DescendantFocus,
    commands: Vec<*const &'static str>,
  }

  impl CommandResponder for FakeResponder {
    type Command = &'static str;

    fn descendant_focus(&self) -> DescendantFocus {
      self.focus
    }

    fn perform_super(&mut self, command: &Self::Command) {
      self.commands.push(command);
    }
  }

  fn focused() -> DescendantFocus {
    DescendantFocus {
      attached_to_window: true,
      window_visible: true,
      window_is_key: true,
      view_visible: true,
      owns_focused_descendant: true,
    }
  }

  #[test]
  fn descendant_commands_reach_native_super_once_without_selector_mapping() {
    for command in ["noop:", "selectAll:", "copy:", "customCommand:"] {
      let mut adapter = FakeResponder {
        focus: focused(),
        commands: vec![],
      };
      do_command(&mut adapter, &command);
      assert_eq!(adapter.commands, vec![&command as *const _], "{command}");
    }
  }

  #[test]
  fn only_attached_visible_key_window_owned_descendant_focus_can_forward() {
    for mask in 0..32 {
      let mut adapter = FakeResponder {
        focus: DescendantFocus {
          attached_to_window: mask & 1 != 0,
          window_visible: mask & 2 != 0,
          window_is_key: mask & 4 != 0,
          view_visible: mask & 8 != 0,
          owns_focused_descendant: mask & 16 != 0,
        },
        commands: vec![],
      };
      do_command(&mut adapter, &"noop:");
      assert_eq!(adapter.commands.len(), usize::from(mask == 31), "{mask}");
    }
  }

  #[test]
  fn raw_view_focus_keeps_existing_input_command_behavior() {
    let mut adapter = FakeResponder {
      focus: DescendantFocus {
        owns_focused_descendant: false,
        ..focused()
      },
      commands: vec![],
    };
    do_command(&mut adapter, &"insertTab:");
    do_command(&mut adapter, &"cancelOperation:");
    assert!(adapter.commands.is_empty());
  }

  #[test]
  fn every_command_rechecks_focus_without_retaining_or_reviving_a_target() {
    let command = "noop:";
    let mut adapter = FakeResponder {
      focus: focused(),
      commands: vec![],
    };
    do_command(&mut adapter, &command);
    adapter.focus = DescendantFocus::default();
    do_command(&mut adapter, &command);
    adapter.focus = focused();
    do_command(&mut adapter, &command);
    assert_eq!(adapter.commands, vec![&command as *const _; 2]);
  }
}
