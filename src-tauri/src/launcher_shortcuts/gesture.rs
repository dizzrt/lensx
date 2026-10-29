//! Pure monotonic-time input recognition. No characters or platform handles enter this module.
use std::collections::BTreeSet;

pub const PRESS_LIMIT_MS: u64 = 200;
pub const GAP_LIMIT_MS: u64 = 300;
pub const QUIET_MS: u64 = 300;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Input {
    ModifierDown {
        physical: u16,
        modifier: &'static str,
        repeat: bool,
    },
    ModifierUp {
        physical: u16,
    },
    KeyDown(u16),
    KeyUp(u16),
    MouseDown(u16),
    MouseUp(u16),
    Wheel,
    PointerMove,
    Interrupt,
}

#[derive(Clone, Debug, Default)]
enum Phase {
    #[default]
    Idle,
    FirstDown {
        key: u16,
        modifier: &'static str,
        at: u64,
    },
    FirstUp {
        key: u16,
        modifier: &'static str,
        at: u64,
    },
    SecondDown {
        key: u16,
        modifier: &'static str,
        at: u64,
    },
    Pending {
        modifier: &'static str,
        at: u64,
    },
    Cancelled {
        quiet_since: u64,
    },
}

#[derive(Clone, Debug, Default)]
pub struct Gesture {
    phase: Phase,
    keys: BTreeSet<u16>,
    buttons: BTreeSet<u16>,
    last_time: u64,
    epoch_started: u64,
}

impl Gesture {
    pub fn reset(&mut self, now: u64) {
        self.phase = Phase::Cancelled { quiet_since: now };
        self.last_time = now;
        self.epoch_started = now;
    }

    /// Observation can resume after key-up events were missed. Seed physical facts
    /// before recognizing again; never infer that an interrupted stream is released.
    pub fn synchronize(&mut self, keys: BTreeSet<u16>, buttons: BTreeSet<u16>, now: u64) {
        let unknown_keys = self
            .keys
            .iter()
            .copied()
            .filter(|key| *key >= 128)
            .collect::<BTreeSet<_>>();
        self.keys = keys.union(&unknown_keys).copied().collect();
        // Keep unknown extra button IDs held until their own release is observed;
        // the native snapshot covers the standard macOS 32-button state set.
        let unknown = self
            .buttons
            .iter()
            .copied()
            .filter(|button| *button >= 32)
            .collect::<BTreeSet<_>>();
        self.buttons = buttons.union(&unknown).copied().collect();
        self.reset(now);
    }

    fn all_released(&self) -> bool {
        self.keys.is_empty() && self.buttons.is_empty()
    }

    fn cancel(&mut self, now: u64) {
        self.phase = Phase::Cancelled { quiet_since: now };
    }

    /// Strictly later timers let an input stamped at the deadline take precedence.
    pub fn tick(&mut self, now: u64) -> Option<&'static str> {
        if now < self.last_time {
            return None;
        }
        self.last_time = now;
        match self.phase {
            Phase::Pending { modifier, at } if now > at.saturating_add(QUIET_MS) => {
                self.phase = Phase::Idle;
                Some(modifier)
            }
            Phase::FirstDown { at, .. } | Phase::SecondDown { at, .. }
                if now > at.saturating_add(PRESS_LIMIT_MS) =>
            {
                self.cancel(now);
                None
            }
            Phase::FirstUp { at, .. } if now > at.saturating_add(GAP_LIMIT_MS) => {
                self.cancel(now);
                None
            }
            Phase::Cancelled { quiet_since }
                if self.all_released() && now > quiet_since.saturating_add(QUIET_MS) =>
            {
                self.phase = Phase::Idle;
                None
            }
            _ => None,
        }
    }

    pub fn input(&mut self, input: Input, now: u64) -> Option<&'static str> {
        if now < self.epoch_started {
            return None;
        }
        if now < self.last_time {
            // A source-stamped event delivered after a timer observation can
            // invalidate a pending gesture, but can never confirm or start one.
            match &input {
                Input::ModifierDown { physical, .. } | Input::KeyDown(physical) => {
                    self.keys.insert(*physical);
                }
                Input::ModifierUp { physical } | Input::KeyUp(physical) => {
                    self.keys.remove(physical);
                }
                Input::MouseDown(button) => {
                    self.buttons.insert(*button);
                }
                Input::MouseUp(button) => {
                    self.buttons.remove(button);
                }
                Input::PointerMove => return None,
                Input::Wheel | Input::Interrupt => {}
            }
            self.cancel(self.last_time);
            return None;
        }
        if input == Input::PointerMove {
            return self.tick(now);
        }
        if input == Input::Interrupt {
            self.reset(now);
            return None;
        }
        let confirmed = self.tick(now);
        let was_clear = self.all_released();
        match input {
            Input::ModifierDown {
                physical,
                modifier,
                repeat,
            } => {
                let fresh = self.keys.insert(physical);
                self.phase = if repeat || !fresh || !was_clear {
                    Phase::Cancelled { quiet_since: now }
                } else {
                    match self.phase {
                        Phase::Idle => Phase::FirstDown {
                            key: physical,
                            modifier,
                            at: now,
                        },
                        Phase::FirstUp {
                            key,
                            modifier: expected,
                            at,
                        } if key == physical
                            && expected == modifier
                            && now - at <= GAP_LIMIT_MS =>
                        {
                            Phase::SecondDown {
                                key,
                                modifier,
                                at: now,
                            }
                        }
                        _ => Phase::Cancelled { quiet_since: now },
                    }
                };
            }
            Input::ModifierUp { physical } => {
                let existed = self.keys.remove(&physical);
                self.phase = if !existed || !self.all_released() {
                    Phase::Cancelled { quiet_since: now }
                } else {
                    match self.phase {
                        Phase::FirstDown { key, modifier, at }
                            if key == physical && now - at <= PRESS_LIMIT_MS =>
                        {
                            Phase::FirstUp {
                                key,
                                modifier,
                                at: now,
                            }
                        }
                        Phase::SecondDown { key, modifier, at }
                            if key == physical && now - at <= PRESS_LIMIT_MS =>
                        {
                            Phase::Pending { modifier, at: now }
                        }
                        _ => Phase::Cancelled { quiet_since: now },
                    }
                };
            }
            Input::KeyDown(key) => {
                self.keys.insert(key);
                self.cancel(now);
            }
            Input::KeyUp(key) => {
                self.keys.remove(&key);
                self.cancel(now);
            }
            Input::MouseDown(button) => {
                self.buttons.insert(button);
                self.cancel(now);
            }
            Input::MouseUp(button) => {
                self.buttons.remove(&button);
                self.cancel(now);
            }
            Input::Wheel => self.cancel(now),
            Input::PointerMove | Input::Interrupt => unreachable!(),
        }
        confirmed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn down(key: u16, modifier: &'static str) -> Input {
        Input::ModifierDown {
            physical: key,
            modifier,
            repeat: false,
        }
    }
    fn pair(gesture: &mut Gesture, key: u16, modifier: &'static str, start: u64) {
        for (offset, input) in [
            (0, down(key, modifier)),
            (100, Input::ModifierUp { physical: key }),
            (200, down(key, modifier)),
            (300, Input::ModifierUp { physical: key }),
        ] {
            assert_eq!(gesture.input(input, start + offset), None);
        }
    }

    #[test]
    fn confirms_each_modifier_once_after_quiet_and_prioritizes_deadline_input() {
        for modifier in ["cmd", "ctrl", "option", "shift"] {
            let mut gesture = Gesture::default();
            pair(&mut gesture, 1, modifier, 0);
            assert_eq!(gesture.tick(600), None);
            assert_eq!(gesture.tick(601), Some(modifier));
            assert_eq!(gesture.tick(1000), None);
            pair(&mut gesture, 1, modifier, 1100);
            assert_eq!(gesture.input(down(1, modifier), 1700), None);
            assert_eq!(gesture.input(Input::ModifierUp { physical: 1 }, 1800), None);
            assert_eq!(gesture.tick(2200), None);
        }
    }

    #[test]
    fn three_and_five_presses_never_repair_into_sliding_pairs() {
        for count in [3, 5] {
            for modifier in ["shift", "option"] {
                let mut gesture = Gesture::default();
                for press in 0..count {
                    assert_eq!(gesture.input(down(1, modifier), press * 200), None);
                    assert_eq!(
                        gesture.input(Input::ModifierUp { physical: 1 }, press * 200 + 100),
                        None
                    );
                }
                assert_eq!(gesture.tick(count * 200 + 400), None);
                pair(&mut gesture, 1, modifier, count * 200 + 500);
                assert_eq!(gesture.tick(count * 200 + 1101), Some(modifier));
            }
        }
    }

    #[test]
    fn mixed_sides_overlap_long_press_repeat_and_interruption_cancel() {
        for sequence in [
            vec![
                (0, down(1, "cmd")),
                (100, Input::ModifierUp { physical: 1 }),
                (200, down(2, "cmd")),
                (300, Input::ModifierUp { physical: 2 }),
            ],
            vec![
                (0, down(1, "cmd")),
                (50, down(2, "cmd")),
                (100, Input::ModifierUp { physical: 1 }),
                (200, Input::ModifierUp { physical: 2 }),
            ],
            vec![
                (0, down(1, "cmd")),
                (201, Input::ModifierUp { physical: 1 }),
                (300, down(1, "cmd")),
                (400, Input::ModifierUp { physical: 1 }),
            ],
            vec![
                (0, down(1, "cmd")),
                (
                    50,
                    Input::ModifierDown {
                        physical: 1,
                        modifier: "cmd",
                        repeat: true,
                    },
                ),
                (100, Input::ModifierUp { physical: 1 }),
            ],
        ] {
            let mut gesture = Gesture::default();
            for (time, input) in sequence {
                assert_eq!(gesture.input(input, time), None);
            }
            assert_eq!(gesture.tick(1000), None);
        }
        for interference in [
            Input::KeyDown(20),
            Input::MouseDown(0),
            Input::Wheel,
            Input::Interrupt,
        ] {
            let mut gesture = Gesture::default();
            pair(&mut gesture, 1, "cmd", 0);
            assert_eq!(gesture.input(interference, 400), None);
            assert_eq!(gesture.tick(1000), None);
        }
        let mut gesture = Gesture::default();
        pair(&mut gesture, 1, "cmd", 0);
        assert_eq!(gesture.input(Input::PointerMove, 400), None);
        assert_eq!(gesture.tick(601), Some("cmd"));
    }

    #[test]
    fn exact_hold_and_inter_press_limits_are_inclusive() {
        let mut gesture = Gesture::default();
        for (time, input) in [
            (0, down(1, "ctrl")),
            (200, Input::ModifierUp { physical: 1 }),
            (500, down(1, "ctrl")),
            (700, Input::ModifierUp { physical: 1 }),
        ] {
            assert_eq!(gesture.input(input, time), None);
        }
        assert_eq!(gesture.tick(1001), Some("ctrl"));
    }

    #[test]
    fn interruption_keeps_held_keys_and_restoration_seeds_real_physical_state() {
        let mut gesture = Gesture::default();
        gesture.input(down(55, "cmd"), 0);
        gesture.reset(10);
        gesture.tick(1000);
        pair(&mut gesture, 58, "option", 1100);
        assert_eq!(gesture.tick(1800), None);
        gesture.input(Input::ModifierUp { physical: 55 }, 1900);
        gesture.tick(2201);
        pair(&mut gesture, 58, "option", 2300);
        assert_eq!(gesture.tick(2901), Some("option"));
        // Resuming after missed events starts from an OS snapshot, not empty keys.
        gesture.synchronize([55].into(), [1].into(), 3000);
        pair(&mut gesture, 58, "option", 3400);
        assert_eq!(gesture.tick(4100), None);
        gesture.input(Input::ModifierUp { physical: 55 }, 4200);
        gesture.input(Input::MouseUp(1), 4300);
        gesture.tick(4601);
        pair(&mut gesture, 58, "option", 4700);
        assert_eq!(gesture.tick(5301), Some("option"));
    }

    #[test]
    fn delayed_source_stamps_cancel_before_timer_confirmation_and_never_replay_prior_epochs() {
        let mut gesture = Gesture::default();
        pair(&mut gesture, 55, "cmd", 0);
        // Processing time could be 650: the native adapter supplies source time 550.
        assert_eq!(gesture.input(down(55, "cmd"), 550), None);
        assert_eq!(gesture.tick(650), None);
        let mut gesture = Gesture::default();
        pair(&mut gesture, 55, "cmd", 0);
        gesture.tick(590);
        assert_eq!(gesture.input(down(55, "cmd"), 580), None);
        assert_eq!(gesture.tick(650), None);
        gesture.synchronize(BTreeSet::new(), BTreeSet::new(), 1000);
        assert_eq!(gesture.input(down(55, "cmd"), 900), None);
        gesture.tick(1301);
        pair(&mut gesture, 55, "cmd", 1400);
        assert_eq!(gesture.tick(2001), Some("cmd"));
    }

    #[test]
    fn overlapping_side_buttons_each_require_their_own_release() {
        let mut gesture = Gesture::default();
        gesture.input(Input::MouseDown(3), 0);
        gesture.input(Input::MouseDown(4), 10);
        gesture.input(Input::MouseUp(3), 20);
        gesture.reset(30);
        gesture.tick(1000);
        pair(&mut gesture, 55, "cmd", 1100);
        assert_eq!(gesture.tick(1800), None);
        gesture.input(Input::MouseUp(4), 1900);
        gesture.tick(2201);
        pair(&mut gesture, 55, "cmd", 2300);
        assert_eq!(gesture.tick(2901), Some("cmd"));
        gesture.input(Input::MouseDown(33), 3000);
        gesture.synchronize(BTreeSet::new(), BTreeSet::new(), 3010);
        gesture.tick(3400);
        pair(&mut gesture, 55, "cmd", 3500);
        assert_eq!(gesture.tick(4200), None);
    }
}
