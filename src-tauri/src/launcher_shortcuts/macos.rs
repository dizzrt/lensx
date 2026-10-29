//! macOS listen-only observation. The adapter never reads text, consumes events,
//! synthesizes input, or changes another application's Secure Input state.
use super::*;

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use block2::RcBlock;
    use objc2_app_kit::{
        NSWorkspace, NSWorkspaceDidWakeNotification, NSWorkspaceWillSleepNotification,
    };
    use objc2_foundation::NSNotification;
    use std::{
        ffi::c_void,
        ptr,
        time::{Duration, SystemTime},
    };

    type Ref = *const c_void;
    type Event = *mut c_void;
    #[repr(C)]
    struct Timebase {
        numerator: u32,
        denominator: u32,
    }
    unsafe extern "C" {
        fn mach_absolute_time() -> u64;
        fn mach_timebase_info(info: *mut Timebase) -> i32;
    }
    pub fn monotonic_millis() -> u64 {
        static TIMEBASE: std::sync::OnceLock<(u32, u32)> = std::sync::OnceLock::new();
        let (numerator, denominator) = *TIMEBASE.get_or_init(|| {
            let mut info = Timebase {
                numerator: 1,
                denominator: 1,
            };
            unsafe {
                mach_timebase_info(&mut info);
            }
            (info.numerator, info.denominator.max(1))
        });
        ((unsafe { mach_absolute_time() } as u128 * numerator as u128 / denominator as u128)
            / 1_000_000) as u64
    }
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
        fn CGEventTapCreate(
            location: u32,
            place: u32,
            options: u32,
            mask: u64,
            callback: unsafe extern "C" fn(Ref, u32, Event, *mut c_void) -> Event,
            context: *mut c_void,
        ) -> Ref;
        fn CGEventTapIsEnabled(tap: Ref) -> bool;
        fn CGEventGetIntegerValueField(event: Event, field: u32) -> i64;
        fn CGEventGetFlags(event: Event) -> u64;
        fn CGEventGetTimestamp(event: Event) -> u64;
        fn CGEventSourceKeyState(state: i32, key: u16) -> bool;
        fn CGEventSourceButtonState(state: i32, button: u32) -> bool;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        static kCFRunLoopDefaultMode: Ref;
        fn CFRelease(value: Ref);
        fn CFMachPortCreateRunLoopSource(allocator: Ref, port: Ref, order: isize) -> Ref;
        fn CFRunLoopGetCurrent() -> Ref;
        fn CFRunLoopAddSource(loop_ref: Ref, source: Ref, mode: Ref);
        fn CFRunLoopRemoveSource(loop_ref: Ref, source: Ref, mode: Ref);
        fn CFRunLoopRunInMode(mode: Ref, seconds: f64, return_after_source: bool) -> i32;
        fn CFDataGetBytePtr(data: Ref) -> *const u8;
    }
    #[link(name = "Carbon", kind = "framework")]
    unsafe extern "C" {
        fn IsSecureEventInputEnabled() -> bool;
        fn TISCopyCurrentKeyboardLayoutInputSource() -> Ref;
        fn TISGetInputSourceProperty(source: Ref, property: Ref) -> Ref;
        static kTISPropertyUnicodeKeyLayoutData: Ref;
        fn UCKeyTranslate(
            layout: Ref,
            key: u16,
            action: u16,
            modifiers: u32,
            keyboard: u32,
            options: u32,
            dead_state: *mut u32,
            max_length: u32,
            actual_length: *mut u32,
            chars: *mut u16,
        ) -> i32;
        fn LMGetKbdType() -> u8;
    }

    pub fn request_permission() {
        unsafe {
            CGRequestListenEventAccess();
        }
    }

    fn modifier(code: u16) -> Option<(&'static str, u64)> {
        match code {
            55 => Some(("cmd", 8)),
            54 => Some(("cmd", 16)),
            59 => Some(("ctrl", 1)),
            62 => Some(("ctrl", 0x2000)),
            58 => Some(("option", 32)),
            61 => Some(("option", 64)),
            56 => Some(("shift", 2)),
            60 => Some(("shift", 4)),
            _ => None,
        }
    }

    // Same physical ANSI/native scan-code identity used by global-hotkey and DOM code.
    const KEYS: &[(u16, &str)] = &[
        (0, "KeyA"),
        (1, "KeyS"),
        (2, "KeyD"),
        (3, "KeyF"),
        (4, "KeyH"),
        (5, "KeyG"),
        (6, "KeyZ"),
        (7, "KeyX"),
        (8, "KeyC"),
        (9, "KeyV"),
        (11, "KeyB"),
        (12, "KeyQ"),
        (13, "KeyW"),
        (14, "KeyE"),
        (15, "KeyR"),
        (16, "KeyY"),
        (17, "KeyT"),
        (18, "Digit1"),
        (19, "Digit2"),
        (20, "Digit3"),
        (21, "Digit4"),
        (22, "Digit6"),
        (23, "Digit5"),
        (25, "Digit9"),
        (26, "Digit7"),
        (28, "Digit8"),
        (29, "Digit0"),
        (31, "KeyO"),
        (32, "KeyU"),
        (34, "KeyI"),
        (35, "KeyP"),
        (36, "Enter"),
        (37, "KeyL"),
        (38, "KeyJ"),
        (40, "KeyK"),
        (45, "KeyN"),
        (46, "KeyM"),
        (48, "Tab"),
        (49, "Space"),
        (50, "Backquote"),
        (51, "Backspace"),
        (53, "Escape"),
        (64, "F17"),
        (79, "F18"),
        (80, "F19"),
        (90, "F20"),
        (96, "F5"),
        (97, "F6"),
        (98, "F7"),
        (99, "F3"),
        (100, "F8"),
        (101, "F9"),
        (103, "F11"),
        (105, "F13"),
        (106, "F16"),
        (107, "F14"),
        (109, "F10"),
        (111, "F12"),
        (113, "F15"),
        (114, "Insert"),
        (115, "Home"),
        (116, "PageUp"),
        (117, "Delete"),
        (118, "F4"),
        (119, "End"),
        (120, "F2"),
        (121, "PageDown"),
        (122, "F1"),
        (123, "ArrowLeft"),
        (124, "ArrowRight"),
        (125, "ArrowDown"),
        (126, "ArrowUp"),
    ];

    fn modifiers(flags: u64) -> Vec<String> {
        [
            ("cmd", 1 << 20),
            ("ctrl", 1 << 18),
            ("option", 1 << 19),
            ("shift", 1 << 17),
        ]
        .into_iter()
        .filter(|(_, mask)| flags & mask != 0)
        .map(|(name, _)| name.to_owned())
        .collect()
    }

    pub fn layout_allows(trigger: &Trigger) -> bool {
        let Trigger::Chord { modifiers, key } = trigger else {
            return true;
        };
        // Non-character keys retain their semantic identity across layouts.
        if !key.starts_with("Key") && !key.starts_with("Digit") && key != "Backquote" {
            return true;
        }
        let Some((code, _)) = KEYS.iter().find(|(_, candidate)| *candidate == key) else {
            return false;
        };
        unsafe {
            let source = TISCopyCurrentKeyboardLayoutInputSource();
            if source.is_null() {
                return false;
            }
            let data = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData);
            if data.is_null() {
                CFRelease(source);
                return false;
            }
            let layout = CFDataGetBytePtr(data);
            let mut dead_state = 0;
            let mut length = 0;
            let mut chars = [0u16; 8];
            // Command-aware translation protects Command-layout variants (e.g. Dvorak-QWERTY).
            let command = if modifiers.iter().any(|value| value == "cmd") {
                1
            } else {
                0
            };
            let result = UCKeyTranslate(
                layout.cast(),
                *code,
                0,
                command,
                LMGetKbdType() as u32,
                1,
                &mut dead_state,
                8,
                &mut length,
                chars.as_mut_ptr(),
            );
            CFRelease(source);
            if result != 0 || length != 1 {
                return false;
            }
            let Some(character) = char::from_u32(chars[0] as u32) else {
                return false;
            };
            let semantic = character.to_lowercase().to_string();
            if let Some(key) = policy().key_aliases.get(&semantic) {
                !policy()
                    .reserved_chords
                    .iter()
                    .any(|reserved| &reserved.modifiers == modifiers && &reserved.key == key)
            } else {
                true
            }
        }
    }

    pub fn key_labels() -> BTreeMap<String, String> {
        let mut labels = BTreeMap::new();
        unsafe {
            let source = TISCopyCurrentKeyboardLayoutInputSource();
            if source.is_null() {
                return labels;
            }
            let data = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData);
            if data.is_null() {
                CFRelease(source);
                return labels;
            }
            let layout = CFDataGetBytePtr(data);
            for (code, key) in KEYS.iter().filter(|(_, key)| {
                key.starts_with("Key") || key.starts_with("Digit") || *key == "Backquote"
            }) {
                for command in [false, true] {
                    let mut dead_state = 0;
                    let mut length = 0;
                    let mut chars = [0u16; 8];
                    let result = UCKeyTranslate(
                        layout.cast(),
                        *code,
                        0,
                        u32::from(command),
                        LMGetKbdType() as u32,
                        1,
                        &mut dead_state,
                        8,
                        &mut length,
                        chars.as_mut_ptr(),
                    );
                    if result != 0 || length == 0 || length > 8 {
                        continue;
                    }
                    if let Ok(label) = String::from_utf16(&chars[..length as usize]) {
                        let label = label.to_uppercase();
                        if !label.is_empty()
                            && label.encode_utf16().count() <= 16
                            && !label.chars().any(char::is_control)
                        {
                            labels.insert(
                                if command {
                                    format!("cmd:{key}")
                                } else {
                                    (*key).into()
                                },
                                label,
                            );
                        }
                    }
                }
            }
            CFRelease(source);
        }
        labels
    }

    struct Context<R: Runtime> {
        app: AppHandle<R>,
        state: State<R>,
        interrupted: bool,
    }

    fn seed_physical_state(gesture: &mut gesture::Gesture, now: u64) {
        let keys = (0..128u16)
            // Caps Lock is a latched lock state, not a held physical modifier.
            .filter(|key| *key != 57 && unsafe { CGEventSourceKeyState(0, *key) })
            .collect();
        let buttons = (0..32u16)
            .filter(|button| unsafe { CGEventSourceButtonState(0, u32::from(*button)) })
            .collect();
        gesture.synchronize(keys, buttons, now);
    }

    fn input_fact(
        kind: u32,
        code: u16,
        flags: u64,
        repeat: bool,
        button: u16,
        observed_down: bool,
    ) -> gesture::Input {
        match kind {
            12 => {
                if let Some((modifier, mask)) = modifier(code) {
                    if flags & mask != 0 {
                        gesture::Input::ModifierDown {
                            physical: code,
                            modifier,
                            repeat,
                        }
                    } else {
                        gesture::Input::ModifierUp { physical: code }
                    }
                } else if code == 57 {
                    gesture::Input::Interrupt
                } else if (code == 63 && flags & (1 << 23) != 0) || (code != 63 && observed_down) {
                    gesture::Input::KeyDown(code)
                } else {
                    gesture::Input::KeyUp(code)
                }
            }
            10 => gesture::Input::KeyDown(code),
            11 => gesture::Input::KeyUp(code),
            1 | 3 | 25 => gesture::Input::MouseDown(button),
            2 | 4 | 26 => gesture::Input::MouseUp(button),
            22 => gesture::Input::Wheel,
            _ => gesture::Input::PointerMove,
        }
    }

    unsafe extern "C" fn callback<R: Runtime>(
        _proxy: Ref,
        kind: u32,
        event: Event,
        context: *mut c_void,
    ) -> Event {
        // Unwind must never cross the C event-tap ABI. Poisoned state simply disables recognition.
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let context = unsafe { &mut *(context as *mut Context<R>) };
            if kind >= u32::MAX - 1
                || unsafe { IsSecureEventInputEnabled() }
                || !unsafe { CGPreflightListenEventAccess() }
            {
                context.interrupted = true;
                let snapshot = if let Ok(mut service) = context.state.lock() {
                    let now = macos::monotonic_millis();
                    service.gesture.reset(now);
                    service
                        .inner
                        .set_monitor(MonitorStatus::Unavailable)
                        .then(|| service.inner.snapshot())
                } else {
                    None
                };
                if let Some(snapshot) = snapshot {
                    publish_monitor_snapshot(&context.app, snapshot);
                }
                return;
            }
            let code = unsafe { CGEventGetIntegerValueField(event, 9) } as u16;
            let flags = unsafe { CGEventGetFlags(event) };
            let input = input_fact(
                kind,
                code,
                flags,
                unsafe { CGEventGetIntegerValueField(event, 8) } != 0,
                unsafe { CGEventGetIntegerValueField(event, 3) } as u16,
                kind == 12 && unsafe { CGEventSourceKeyState(0, code) },
            );
            let mut service = match context.state.lock() {
                Ok(service) => service,
                Err(_) => return,
            };
            let now = unsafe { CGEventGetTimestamp(event) } / 1_000_000;
            service.synchronize_recording(macos::monotonic_millis());
            let confirmed = service.gesture.input(input, now);
            let mut effect = confirmed
                .map(|modifier| {
                    service.inner.trigger(
                        &Trigger::ModifierDoubleTap {
                            modifier: modifier.into(),
                        },
                        now,
                    )
                })
                .unwrap_or(Effect::None);
            let mut cancelled = None;
            if kind == 10 && service.inner.recording().is_some() {
                let modifiers = modifiers(flags);
                if (code == 53 && modifiers.is_empty())
                    || (modifiers == ["cmd"] && matches!(code, 12 | 13))
                {
                    cancelled = service.inner.end_recording();
                    service.gesture.reset(now);
                } else if unsafe { CGEventGetIntegerValueField(event, 8) } == 0 {
                    if let Some((_, key)) = KEYS.iter().find(|(key, _)| *key == code) {
                        if modifiers.iter().any(|modifier| modifier != "shift") {
                            let lease = service.inner.recording().unwrap();
                            effect = Effect::Candidate {
                                lease_id: lease.lease_id.clone(),
                                trigger: Trigger::Chord {
                                    modifiers,
                                    key: (*key).into(),
                                },
                            };
                        }
                    }
                }
            }
            drop(service);
            if let Some(lease) = cancelled {
                emit(
                    &context.app,
                    RECORDING,
                    RecordingEvent {
                        lease_id: lease.lease_id,
                        trigger: None,
                        cancelled: true,
                    },
                );
            }
            deliver(&context.app, effect);
        }));
        event // Every original input is always passed through unchanged.
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn adapter_preserves_physical_sides_and_cancels_other_input_without_characters() {
            for (key, name, flag) in [
                (55, "cmd", 8),
                (54, "cmd", 16),
                (59, "ctrl", 1),
                (62, "ctrl", 0x2000),
                (58, "option", 32),
                (61, "option", 64),
                (56, "shift", 2),
                (60, "shift", 4),
            ] {
                assert_eq!(
                    input_fact(12, key, flag, false, 0, false),
                    gesture::Input::ModifierDown {
                        physical: key,
                        modifier: name,
                        repeat: false
                    }
                );
                assert_eq!(
                    input_fact(12, key, 0, false, 0, false),
                    gesture::Input::ModifierUp { physical: key }
                );
            }
            assert_eq!(
                input_fact(12, 55, 8, true, 0, false),
                gesture::Input::ModifierDown {
                    physical: 55,
                    modifier: "cmd",
                    repeat: true
                }
            );
            assert_eq!(
                input_fact(10, 8, 1 << 20, false, 0, false),
                gesture::Input::KeyDown(8)
            );
            assert_eq!(
                input_fact(11, 8, 1 << 20, false, 0, false),
                gesture::Input::KeyUp(8)
            );
            for (down, up, button) in [(1, 2, 0), (3, 4, 1), (25, 26, 2), (25, 26, 3), (25, 26, 4)]
            {
                assert_eq!(
                    input_fact(down, 0, 0, false, button, false),
                    gesture::Input::MouseDown(button)
                );
                assert_eq!(
                    input_fact(up, 0, 0, false, button, false),
                    gesture::Input::MouseUp(button)
                );
            }
            assert_eq!(input_fact(22, 0, 0, false, 0, false), gesture::Input::Wheel);
            assert_eq!(
                input_fact(5, 0, 0, false, 0, false),
                gesture::Input::PointerMove
            );
            assert_eq!(
                input_fact(12, 57, 0, false, 0, false),
                gesture::Input::Interrupt
            );
        }
        #[test]
        fn every_reserved_chord_cancels_a_pending_double_tap_through_native_facts() {
            for reserved in &policy().reserved_chords {
                let mut gesture = gesture::Gesture::default();
                for (at, kind, flags) in [(0, 12, 8), (100, 12, 0), (200, 12, 8), (300, 12, 0)] {
                    assert_eq!(
                        gesture.input(input_fact(kind, 55, flags, false, 0, false), at),
                        None
                    );
                }
                let code = KEYS.iter().find(|(_, key)| *key == reserved.key).unwrap().0;
                assert_eq!(
                    gesture.input(input_fact(10, code, 0, false, 0, false), 400),
                    None
                );
                assert_eq!(
                    gesture.input(input_fact(11, code, 0, false, 0, false), 450),
                    None
                );
                assert_eq!(gesture.tick(1000), None, "{:?}", reserved);
            }
        }
        #[test]
        fn fn_held_state_blocks_other_double_taps_and_release_recovers_without_caps_lock_latching()
        {
            let mut gesture = gesture::Gesture::default();
            gesture.input(input_fact(12, 63, 1 << 23, false, 0, true), 0);
            gesture.synchronize([63].into(), Default::default(), 10);
            gesture.tick(1000);
            for (at, flags) in [(1100, 8), (1200, 0), (1300, 8), (1400, 0)] {
                assert_eq!(
                    gesture.input(input_fact(12, 55, flags, false, 0, false), at),
                    None
                );
            }
            assert_eq!(gesture.tick(1800), None);
            gesture.input(input_fact(12, 63, 0, false, 0, false), 1900);
            gesture.input(input_fact(12, 57, 1 << 16, false, 0, true), 2000);
            gesture.tick(2301);
            for (at, flags) in [(2400, 8), (2500, 0), (2600, 8), (2700, 0)] {
                assert_eq!(
                    gesture.input(input_fact(12, 55, flags, false, 0, false), at),
                    None
                );
            }
            assert_eq!(gesture.tick(3001), Some("cmd"));
        }
    }

    pub fn start<R: Runtime>(app: AppHandle<R>, state: State<R>) {
        std::thread::spawn(move || {
            let notification_center = NSWorkspace::sharedWorkspace().notificationCenter();
            let mut observers = Vec::new();
            for (name, sleeping) in [
                (unsafe { NSWorkspaceWillSleepNotification }, true),
                (unsafe { NSWorkspaceDidWakeNotification }, false),
            ] {
                let state = Arc::clone(&state);
                let notification_app = app.clone();
                let block = RcBlock::new(move |_: std::ptr::NonNull<NSNotification>| {
                    let snapshot = if let Ok(mut service) = state.lock() {
                        let now = macos::monotonic_millis();
                        service.sleeping = sleeping;
                        service.monitor_epoch += 1;
                        service.gesture.reset(now);
                        service.inner.end_recording();
                        service
                            .inner
                            .set_monitor(MonitorStatus::Unavailable)
                            .then(|| service.inner.snapshot())
                    } else {
                        None
                    };
                    if let Some(snapshot) = snapshot {
                        publish_monitor_snapshot(&notification_app, snapshot);
                    }
                });
                observers.push(unsafe {
                    notification_center.addObserverForName_object_queue_usingBlock(
                        Some(name),
                        None,
                        None,
                        &block,
                    )
                });
            }
            let mut context = Box::new(Context {
                app: app.clone(),
                state: Arc::clone(&state),
                interrupted: false,
            });
            let mut tap: Ref = ptr::null();
            let mut source: Ref = ptr::null();
            let mut previous_status = MonitorStatus::PermissionRequired;
            let mut epoch = 0;
            let mut wall = SystemTime::now();
            let mut last_attempt = Instant::now() - Duration::from_secs(2);
            let mut last_layout_check = Instant::now();
            let loop_ref = unsafe { CFRunLoopGetCurrent() };
            loop {
                // All currently queued source-stamped input is processed before
                // time-only confirmation. A busy source postpones confirmation.
                let mut drained = false;
                for _ in 0..256 {
                    if unsafe { CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.0, true) } != 4 {
                        drained = true;
                        break;
                    }
                }
                if !drained {
                    continue;
                }
                let visible = foreground(&app);
                let mut service = match state.lock() {
                    Ok(service) => service,
                    Err(_) => break,
                };
                if service.stopped {
                    break;
                }
                let now = macos::monotonic_millis();
                let previous_lease = service.inner.recording().cloned();
                service.synchronize_recording(now);
                if !visible {
                    service.inner.end_recording();
                }
                let cancelled = previous_lease.filter(|_| service.inner.recording().is_none());
                let elapsed = wall.elapsed().unwrap_or(Duration::from_secs(1));
                wall = SystemTime::now();
                let permitted = unsafe { CGPreflightListenEventAccess() };
                let observable =
                    permitted && !service.sleeping && !unsafe { IsSecureEventInputEnabled() };
                let wanted = service.inner.wants_monitor();
                let restart_monitor = context.interrupted
                    || elapsed > Duration::from_millis(500)
                    || (!tap.is_null() && !unsafe { CGEventTapIsEnabled(tap) });
                let interrupted =
                    restart_monitor || epoch != service.monitor_epoch || cancelled.is_some();
                if interrupted || !observable || !wanted {
                    service.gesture.reset(now);
                }
                epoch = service.monitor_epoch;
                context.interrupted = false;
                // Configuration/recording transitions reset recognition while the
                // healthy passive tap stays attached. Recreating it would briefly
                // remove a sole double-tap recovery entry after every ordinary hide.
                if (!observable || !wanted || restart_monitor) && !tap.is_null() {
                    unsafe {
                        CFRunLoopRemoveSource(loop_ref, source, kCFRunLoopDefaultMode);
                        CFRelease(source);
                        CFRelease(tap);
                    }
                    tap = ptr::null();
                    source = ptr::null();
                }
                if observable
                    && wanted
                    && tap.is_null()
                    && last_attempt.elapsed() >= Duration::from_secs(1)
                {
                    last_attempt = Instant::now();
                    seed_physical_state(&mut service.gesture, now);
                    let mask = [1, 2, 3, 4, 10, 11, 12, 22, 25, 26]
                        .into_iter()
                        .fold(0u64, |mask, event| mask | (1 << event));
                    // Session-level, head insertion, listen-only. No root/HID tap or active filter.
                    tap = unsafe {
                        CGEventTapCreate(
                            1,
                            0,
                            1,
                            mask,
                            callback::<R>,
                            (&mut *context as *mut Context<R>).cast(),
                        )
                    };
                    if !tap.is_null() {
                        source = unsafe { CFMachPortCreateRunLoopSource(ptr::null(), tap, 0) };
                        if source.is_null() {
                            unsafe {
                                CFRelease(tap);
                            }
                            tap = ptr::null();
                        } else {
                            unsafe {
                                CFRunLoopAddSource(loop_ref, source, kCFRunLoopDefaultMode);
                            }
                        }
                    }
                }
                let status = if !permitted {
                    MonitorStatus::PermissionRequired
                } else if observable && !tap.is_null() && unsafe { CGEventTapIsEnabled(tap) } {
                    MonitorStatus::Active
                } else {
                    MonitorStatus::Unavailable
                };
                if status != previous_status {
                    service.gesture.reset(now);
                }
                service.inner.set_monitor(status);
                let effect = if status == MonitorStatus::Active {
                    service
                        .gesture
                        .tick(now)
                        .map(|modifier| {
                            service.inner.trigger(
                                &Trigger::ModifierDoubleTap {
                                    modifier: modifier.into(),
                                },
                                now,
                            )
                        })
                        .unwrap_or(Effect::None)
                } else {
                    Effect::None
                };
                let snapshot = (status != previous_status).then(|| service.inner.snapshot());
                previous_status = status;
                drop(service);
                if last_layout_check.elapsed() >= Duration::from_secs(1) {
                    last_layout_check = Instant::now();
                    let layout_app = app.clone();
                    let layout_state = Arc::clone(&state);
                    let _ = app.run_on_main_thread(move || {
                        let (before, after) = if let Ok(mut service) = layout_state.lock() {
                            let before = service.inner.snapshot();
                            service.inner.refresh_layout();
                            (before, service.inner.snapshot())
                        } else {
                            return;
                        };
                        if before != after {
                            emit(&layout_app, CHANGED, after);
                            ensure_recovery_visible(&layout_app);
                        }
                    });
                }
                if let Some(lease) = cancelled {
                    emit(
                        &app,
                        RECORDING,
                        RecordingEvent {
                            lease_id: lease.lease_id,
                            trigger: None,
                            cancelled: true,
                        },
                    );
                }
                if let Some(snapshot) = snapshot {
                    publish_monitor_snapshot(&app, snapshot);
                }
                deliver(&app, effect);
                publish_failures(&app);
                // Drain queued input before the next timer tick. Equal-time inputs win.
                unsafe {
                    CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.01, false);
                }
            }
            if !tap.is_null() {
                unsafe {
                    CFRunLoopRemoveSource(loop_ref, source, kCFRunLoopDefaultMode);
                    CFRelease(source);
                    CFRelease(tap);
                }
            }
            for observer in observers {
                unsafe {
                    notification_center.removeObserver((*observer).as_ref());
                }
            }
        });
    }
}

#[cfg(target_os = "macos")]
pub use platform::{key_labels, layout_allows, monotonic_millis, request_permission, start};

#[cfg(not(target_os = "macos"))]
pub fn key_labels() -> BTreeMap<String, String> {
    BTreeMap::new()
}

#[cfg(not(target_os = "macos"))]
pub fn monotonic_millis() -> u64 {
    static ORIGIN: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    ORIGIN.get_or_init(Instant::now).elapsed().as_millis() as u64
}

#[cfg(not(target_os = "macos"))]
pub fn layout_allows(_trigger: &Trigger) -> bool {
    true
}
#[cfg(not(target_os = "macos"))]
pub fn request_permission() {}
#[cfg(not(target_os = "macos"))]
pub fn start<R: Runtime>(app: AppHandle<R>, state: State<R>) {
    std::thread::spawn(move || loop {
        if let Ok(mut service) = state.lock() {
            if service.stopped {
                break;
            }
            let now = macos::monotonic_millis();
            service.inner.expire(now);
            service.inner.set_monitor(MonitorStatus::Unavailable);
        }
        publish_failures(&app);
        std::thread::sleep(std::time::Duration::from_millis(25));
    });
}
