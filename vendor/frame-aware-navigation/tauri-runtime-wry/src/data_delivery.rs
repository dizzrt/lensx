// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! Data follows the original native view identity, independently of its parent.
//! Presentation operations deliberately do not use this policy.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DataLocation {
  Current,
  Retained,
}

pub(crate) fn select_data_source(
  requested: u32,
  current: Option<(u32, usize)>,
  retained: Option<(u32, usize)>,
  confirmed_closed: bool,
) -> Option<DataLocation> {
  if confirmed_closed {
    return None;
  }
  let current = current.filter(|(id, _)| *id == requested);
  let retained = retained.filter(|(id, _)| *id == requested);
  match (current, retained) {
    (Some((_, left)), Some((_, right))) if left != right => None,
    (Some(_), _) => Some(DataLocation::Current),
    (None, Some(_)) => Some(DataLocation::Retained),
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::cell::RefCell;
  use std::rc::Rc;
  #[test]
  fn queued_data_reaches_the_same_view_once_after_parent_transfer() {
    let original = Rc::new(RefCell::new(Vec::new()));
    let pointer = Rc::as_ptr(&original) as usize;
    let queued = (7_u32, "main", "result A");
    let registry = [("detached", 7, pointer)];
    let selected = select_data_source(
      queued.0,
      registry
        .iter()
        .find(|(_, id, _)| *id == queued.0)
        .map(|(_, id, pointer)| (*id, *pointer)),
      Some((7, pointer)),
      false,
    );
    assert_eq!(selected, Some(DataLocation::Current));
    if selected.is_some() {
      original.borrow_mut().push(queued.2);
    }
    assert_eq!(*original.borrow(), ["result A"]);
  }
  #[test]
  fn retained_unknown_owner_accepts_data_but_closed_or_replaced_original_never_does() {
    assert_eq!(
      select_data_source(7, None, Some((7, 70)), false),
      Some(DataLocation::Retained)
    );
    assert_eq!(select_data_source(7, Some((8, 80)), None, false), None);
    assert_eq!(
      select_data_source(7, Some((8, 80)), Some((7, 70)), true),
      None
    );
    assert_eq!(
      select_data_source(7, Some((7, 71)), Some((7, 70)), false),
      None
    );
  }
}
