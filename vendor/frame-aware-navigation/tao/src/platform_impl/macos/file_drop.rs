// Copyright 2014-2021 The winit contributors
// Copyright 2021-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0

use std::path::PathBuf;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Phase {
  Enter,
  Prepare,
  Drop,
  Exit,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum FileDropEvent {
  HoveredFile(PathBuf),
  DroppedFile(PathBuf),
  HoveredFileCancelled,
}

/// Filter native conversion failures without changing file order or reading file contents.
pub(crate) fn dispatch(
  phase: Phase,
  candidates: impl IntoIterator<Item = Option<PathBuf>>,
  mut emit: impl FnMut(FileDropEvent),
) -> bool {
  if phase == Phase::Exit {
    emit(FileDropEvent::HoveredFileCancelled);
    return false;
  }

  let mut accepted = false;
  for path in candidates.into_iter().flatten() {
    accepted = true;
    match phase {
      Phase::Enter => emit(FileDropEvent::HoveredFile(path)),
      Phase::Drop => emit(FileDropEvent::DroppedFile(path)),
      Phase::Prepare | Phase::Exit => {}
    }
  }
  accepted
}

#[cfg(test)]
mod tests {
  use super::*;

  fn run(phase: Phase, candidates: Vec<Option<PathBuf>>) -> (bool, Vec<FileDropEvent>) {
    let mut events = Vec::new();
    let accepted = dispatch(phase, candidates, |event| events.push(event));
    (accepted, events)
  }

  #[test]
  fn multiple_files_keep_order_for_hover_and_drop() {
    let paths = [PathBuf::from("/tmp/second"), PathBuf::from("/tmp/first")];
    for phase in [Phase::Enter, Phase::Drop] {
      let (accepted, events) = run(phase, paths.iter().cloned().map(Some).collect());
      assert!(accepted);
      let expected: Vec<_> = paths
        .iter()
        .cloned()
        .map(|path| match phase {
          Phase::Enter => FileDropEvent::HoveredFile(path),
          _ => FileDropEvent::DroppedFile(path),
        })
        .collect();
      assert_eq!(events, expected);
    }
  }

  #[test]
  fn empty_or_failed_candidates_reject_without_file_events() {
    for phase in [Phase::Enter, Phase::Prepare, Phase::Drop] {
      for candidates in [vec![], vec![None], vec![None, None]] {
        assert_eq!(run(phase, candidates), (false, vec![]));
      }
    }
  }

  #[test]
  fn mixed_conversion_results_skip_failures_and_preserve_order() {
    let first = PathBuf::from("/tmp/first");
    let second = PathBuf::from("/tmp/second");
    for phase in [Phase::Enter, Phase::Prepare, Phase::Drop] {
      let candidates = vec![None, Some(first.clone()), None, Some(second.clone()), None];
      let expected = match phase {
        Phase::Enter => vec![
          FileDropEvent::HoveredFile(first.clone()),
          FileDropEvent::HoveredFile(second.clone()),
        ],
        Phase::Drop => vec![
          FileDropEvent::DroppedFile(first.clone()),
          FileDropEvent::DroppedFile(second.clone()),
        ],
        _ => vec![],
      };
      assert_eq!(run(phase, candidates), (true, expected));
    }
  }

  #[test]
  fn prepare_accepts_current_files_without_emitting_events() {
    assert_eq!(
      run(Phase::Prepare, vec![Some(PathBuf::from("/tmp/file"))]),
      (true, vec![])
    );
    // Each call is independent: an earlier accepted enter cannot authorize an empty prepare/drop.
    assert!(run(Phase::Enter, vec![Some(PathBuf::from("/tmp/file"))]).0);
    assert_eq!(run(Phase::Prepare, vec![]), (false, vec![]));
    assert_eq!(run(Phase::Drop, vec![]), (false, vec![]));
  }

  #[test]
  fn every_exit_emits_exactly_one_cancel_even_after_rejection() {
    assert!(!run(Phase::Enter, vec![None]).0);
    for candidates in [vec![], vec![None], vec![Some(PathBuf::from("/tmp/file"))]] {
      assert_eq!(
        run(Phase::Exit, candidates),
        (false, vec![FileDropEvent::HoveredFileCancelled])
      );
    }
  }

  #[test]
  fn already_resolved_paths_are_preserved_without_url_decoding() {
    let paths = [
      PathBuf::from("/tmp/中文 文件%20.txt"),
      PathBuf::from("/tmp/literal%name"),
    ];
    let (_, events) = run(Phase::Drop, paths.iter().cloned().map(Some).collect());
    assert_eq!(
      events,
      paths
        .into_iter()
        .map(FileDropEvent::DroppedFile)
        .collect::<Vec<_>>()
    );
  }
}
