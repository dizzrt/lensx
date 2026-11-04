//! Application-local physical gesture ownership. Native targets are captured by
//! the admission callback; this policy never looks up a replacement target.
use std::collections::BTreeMap;

pub(crate) const COMMAND: u8 = 1;
#[derive(Clone, Copy)]
pub(crate) struct DetachSourceFacts {
    pub(crate) native_input_valid: bool,
    pub(crate) source_ready_and_current: bool,
    pub(crate) trusted_responder: bool,
    pub(crate) host_unblocked: bool,
    pub(crate) recovery_available: bool,
}
impl DetachSourceFacts {
    pub(crate) fn eligible(self) -> bool {
        self.native_input_valid
            && self.source_ready_and_current
            && self.trusted_responder
            && self.host_unblocked
            && self.recovery_available
    }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum KeyKind {
    Down,
    Up,
    Flags,
}
#[derive(Clone, Copy, Debug)]
pub(crate) struct KeyInput {
    pub(crate) kind: KeyKind,
    pub(crate) physical: u16,
    pub(crate) modifiers: u8,
    pub(crate) repeat: bool,
    pub(crate) stamp: u64,
    pub(crate) foreground: bool,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LocalCommand {
    Detach,
    Close,
    Quit,
}
#[derive(Clone, Copy)]
struct Press {
    stamp: u64,
    owned: bool,
}
#[derive(Default)]
pub(crate) struct LocalGestures {
    pressed: BTreeMap<u16, Press>,
}
impl LocalGestures {
    pub(crate) fn held_keys(&self) -> Vec<u16> {
        self.pressed.keys().copied().collect()
    }
    pub(crate) fn recording_owned(&mut self, input: KeyInput) {
        if input.kind == KeyKind::Down && input.foreground && input.physical < 128 {
            self.pressed
                .entry(input.physical)
                .and_modify(|press| press.owned = true)
                .or_insert(Press {
                    stamp: input.stamp,
                    owned: true,
                });
        }
    }
    pub(crate) fn is_fresh_replacement(&self, input: KeyInput) -> bool {
        input.kind == KeyKind::Down
            && !input.repeat
            && self
                .pressed
                .get(&input.physical)
                .is_some_and(|press| input.stamp > press.stamp)
    }
    pub(crate) fn input(
        &mut self,
        input: KeyInput,
        recording_or_tail: bool,
        detach_matches: bool,
        mut admit: impl FnMut(LocalCommand) -> bool,
    ) -> bool {
        if input.kind == KeyKind::Flags || input.physical >= 128 {
            return false;
        }
        if input.kind == KeyKind::Up {
            return self
                .pressed
                .remove(&input.physical)
                .is_some_and(|press| press.owned)
                && input.foreground;
        }
        if !input.foreground {
            return false;
        }
        if let Some(press) = self.pressed.get(&input.physical) {
            // A new non-repeat hardware timestamp proves a fresh press even if
            // key-up occurred while another application was foreground. Duplicate
            // delivery keeps the original timestamp and never re-admits.
            if input.repeat || input.stamp <= press.stamp {
                return press.owned;
            }
        }
        if input.repeat {
            return false;
        }
        let command = if input.modifiers == COMMAND && input.physical == 12 {
            Some(LocalCommand::Quit)
        } else if input.modifiers == COMMAND && input.physical == 13 {
            Some(LocalCommand::Close)
        } else if !recording_or_tail && detach_matches {
            Some(LocalCommand::Detach)
        } else {
            None
        };
        let owned = command.is_some_and(|command| admit(command));
        self.pressed.insert(
            input.physical,
            Press {
                stamp: input.stamp,
                owned,
            },
        );
        owned
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_native_source_condition_is_required_before_admission() {
        let allowed = DetachSourceFacts {
            native_input_valid: true,
            source_ready_and_current: true,
            trusted_responder: true,
            host_unblocked: true,
            recovery_available: true,
        };
        assert!(allowed.eligible());
        for denied in [
            DetachSourceFacts {
                native_input_valid: false,
                ..allowed
            },
            DetachSourceFacts {
                source_ready_and_current: false,
                ..allowed
            },
            DetachSourceFacts {
                trusted_responder: false,
                ..allowed
            },
            DetachSourceFacts {
                host_unblocked: false,
                ..allowed
            },
            DetachSourceFacts {
                recovery_available: false,
                ..allowed
            },
        ] {
            let mut gestures = LocalGestures::default();
            assert!(!gestures.input(down(2, 1), false, true, |_| denied.eligible()));
        }
    }
    fn down(key: u16, stamp: u64) -> KeyInput {
        KeyInput {
            kind: KeyKind::Down,
            physical: key,
            modifiers: COMMAND,
            repeat: false,
            stamp,
            foreground: true,
        }
    }
    #[test]
    fn accepted_detach_owns_repeats_and_release_after_focus_moves() {
        let mut policy = LocalGestures::default();
        assert!(policy.input(down(2, 1), false, true, |c| c == LocalCommand::Detach));
        for repeat in [false, true] {
            assert!(policy.input(
                KeyInput {
                    repeat,
                    ..down(2, 1)
                },
                false,
                false,
                |_| panic!("must not retarget")
            ));
        }
        assert!(policy.input(
            KeyInput {
                kind: KeyKind::Up,
                ..down(2, 2)
            },
            false,
            false,
            |_| panic!()
        ));
        assert!(!policy.input(down(2, 3), false, false, |_| panic!()));
    }
    #[test]
    fn fresh_ineligible_events_and_other_app_events_remain_original() {
        let mut policy = LocalGestures::default();
        assert!(!policy.input(down(2, 1), false, true, |_| false));
        assert!(!policy.input(
            KeyInput {
                repeat: true,
                ..down(2, 2)
            },
            false,
            true,
            |_| panic!()
        ));
        assert!(!policy.input(
            KeyInput {
                foreground: false,
                ..down(12, 3)
            },
            false,
            false,
            |_| panic!()
        ));
        assert!(!policy.input(down(2, 4), false, false, |_| panic!()));
    }
    #[test]
    fn recording_and_its_tail_block_detach_but_not_reserved_close_and_quit() {
        let mut policy = LocalGestures::default();
        assert!(!policy.input(down(2, 1), true, true, |_| panic!()));
        assert!(!policy.input(
            KeyInput {
                repeat: true,
                ..down(2, 2)
            },
            false,
            true,
            |_| panic!()
        ));
        assert!(policy.input(down(13, 3), true, false, |c| c == LocalCommand::Close));
        assert!(policy.input(down(12, 4), true, false, |c| c == LocalCommand::Quit));
    }
    #[test]
    fn a_missed_background_release_does_not_consume_a_new_ineligible_gesture() {
        let mut policy = LocalGestures::default();
        assert!(policy.input(down(2, 1), false, true, |_| true));
        assert!(!policy.input(down(2, 5), false, false, |_| panic!()));
        assert!(!policy.input(
            KeyInput {
                repeat: true,
                ..down(2, 6)
            },
            false,
            true,
            |_| panic!()
        ));
    }
    #[test]
    fn recorded_tail_stays_consumed_after_bookkeeping_release_without_replaying_a_command() {
        let mut policy = LocalGestures::default();
        assert!(!policy.input(down(2, 1), true, true, |_| panic!()));
        policy.recording_owned(down(2, 1));
        assert_eq!(policy.held_keys(), [2]);
        assert!(policy.input(
            KeyInput {
                repeat: true,
                ..down(2, 2)
            },
            false,
            true,
            |_| panic!()
        ));
        assert!(!policy.input(down(2, 3), false, false, |_| panic!()));
    }
    #[test]
    fn failed_admission_never_consumes_or_retargets_the_next_repeat() {
        let mut policy = LocalGestures::default();
        let mut attempts = Vec::new();
        assert!(!policy.input(down(13, 1), false, false, |c| {
            attempts.push(c);
            false
        }));
        assert!(!policy.input(down(13, 1), false, false, |_| panic!()));
        assert_eq!(attempts, [LocalCommand::Close]);
    }
}
