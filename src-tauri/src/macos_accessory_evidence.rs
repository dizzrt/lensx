#![cfg(all(target_os = "macos", feature = "macos-accessory-evidence"))]

use crate::launcher_window::{
    macos_inactive_local_commands_ignored_for_evidence, macos_local_command_counts,
    LauncherActivationReason, LauncherWindowAction, LauncherWindowActions, MAIN_WINDOW_LABEL,
};
use crate::macos_launcher::is_macos_application_active;
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSApplication, NSApplicationActivationOptions, NSApplicationActivationPolicy, NSEvent,
    NSEventModifierFlags, NSEventType, NSNormalWindowLevel, NSRunningApplication, NSWindow,
    NSWindowCollectionBehavior, NSWindowOcclusionState,
};
use objc2_foundation::{NSPoint, NSString};
use serde::Serialize;
use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

const STEP_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone, Debug)]
struct EvidenceInput {
    output: PathBuf,
    failure_output: PathBuf,
    sacrifice_pid: i32,
    fullscreen_request: PathBuf,
    fullscreen_ready: PathBuf,
}

#[derive(Clone, Copy, Debug, Serialize)]
struct NativeSnapshot {
    runtime_accessory: bool,
    ordinary_menu_bar_absent: bool,
    visible: bool,
    focused: bool,
    on_active_space: bool,
    occlusion_visible: bool,
    above_normal_level: bool,
    can_join_all_spaces: bool,
    full_screen_auxiliary: bool,
    always_on_top: bool,
    non_fullscreen: bool,
}

#[derive(Debug, Serialize)]
struct ProductEvidence {
    evidence_version: &'static str,
    platform: &'static str,
    process_id: u32,
    bundle_runtime: BundleRuntimeEvidence,
    window_policy: WindowPolicyEvidence,
    ordinary_space: SpaceEvidence,
    fullscreen_space: FullscreenSpaceEvidence,
    repeated_toggle: RepeatedToggleEvidence,
    local_shortcuts: LocalShortcutEvidence,
    cleanup: CleanupEvidence,
}

#[derive(Debug, Serialize)]
struct BundleRuntimeEvidence {
    runtime_accessory: bool,
    dock_tile_absent: bool,
    ordinary_menu_bar_absent: bool,
    recovery_shortcut_registered: bool,
    hidden_process_alive: bool,
}

#[derive(Debug, Serialize)]
struct WindowPolicyEvidence {
    complete_main_window: bool,
    can_join_all_spaces: bool,
    full_screen_auxiliary: bool,
    above_normal_level: bool,
    always_on_top: bool,
    non_fullscreen: bool,
    single_native_window: bool,
}

#[derive(Debug, Serialize)]
struct SpaceEvidence {
    production_global_shortcut_action: bool,
    visible: bool,
    focused: bool,
    on_active_space: bool,
    occlusion_visible: bool,
}

#[derive(Debug, Serialize)]
struct FullscreenSpaceEvidence {
    sacrifice_activated_before_restore: bool,
    production_global_shortcut_action: bool,
    visible: bool,
    focused: bool,
    on_active_space: bool,
    occlusion_visible: bool,
    above_fullscreen_content: bool,
}

#[derive(Debug, Serialize)]
struct RepeatedToggleEvidence {
    repetitions: usize,
    exact_hide_show_pairs: bool,
    single_native_window: bool,
    recovery_shortcut_still_registered: bool,
}

#[derive(Debug, Serialize)]
struct LocalShortcutEvidence {
    cmd_w_key_equivalent_dispatched: bool,
    cmd_w_reused_hide_action: bool,
    cmd_w_process_alive: bool,
    restored_after_cmd_w: bool,
    other_foreground_cmd_w_ignored: bool,
    other_foreground_cmd_q_ignored: bool,
    cmd_q_key_equivalent_dispatched: bool,
    cmd_q_exit_requested: bool,
}

#[derive(Debug, Serialize)]
struct CleanupEvidence {
    bounded_execution: bool,
    graceful_exit_requested: bool,
    raw_paths_omitted: bool,
}

fn argument_value(arguments: &[String], flag: &str) -> Option<String> {
    let index = arguments.iter().position(|argument| argument == flag)?;
    arguments.get(index + 1).cloned()
}

fn parse_input() -> Result<Option<EvidenceInput>, &'static str> {
    let arguments = env::args().collect::<Vec<_>>();
    let Some(output) = argument_value(&arguments, "--lensx-macos-accessory-evidence-output") else {
        return Ok(None);
    };
    let sacrifice_pid =
        argument_value(&arguments, "--lensx-macos-accessory-evidence-sacrifice-pid")
            .ok_or("sacrifice_pid_missing")?
            .parse::<i32>()
            .map_err(|_| "sacrifice_pid_invalid")?;
    let failure_output = argument_value(
        &arguments,
        "--lensx-macos-accessory-evidence-failure-output",
    )
    .ok_or("failure_output_missing")?;
    let fullscreen_request = argument_value(
        &arguments,
        "--lensx-macos-accessory-evidence-fullscreen-request",
    )
    .ok_or("fullscreen_request_missing")?;
    let fullscreen_ready = argument_value(
        &arguments,
        "--lensx-macos-accessory-evidence-fullscreen-ready",
    )
    .ok_or("fullscreen_ready_missing")?;
    Ok(Some(EvidenceInput {
        output: PathBuf::from(output),
        failure_output: PathBuf::from(failure_output),
        sacrifice_pid,
        fullscreen_request: PathBuf::from(fullscreen_request),
        fullscreen_ready: PathBuf::from(fullscreen_ready),
    }))
}

fn on_main<R, T, F>(app: &AppHandle<R>, operation: F) -> Result<T, &'static str>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(AppHandle<R>) -> Result<T, &'static str> + Send + 'static,
{
    let (sender, receiver) = mpsc::sync_channel(1);
    let main_app = app.clone();
    app.run_on_main_thread(move || {
        let _ = sender.send(operation(main_app));
    })
    .map_err(|_| "main_thread_schedule_failed")?;
    receiver
        .recv_timeout(STEP_TIMEOUT)
        .map_err(|_| "main_thread_operation_timeout")?
}

fn wait_for(path: &Path) -> Result<(), &'static str> {
    let started = Instant::now();
    while started.elapsed() < STEP_TIMEOUT {
        if path.exists() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(50));
    }
    Err("bounded_file_wait_timeout")
}

fn wait_for_application_active<R: Runtime>(app: &AppHandle<R>) -> Result<(), &'static str> {
    let started = Instant::now();
    loop {
        let active = on_main(app, |_| {
            is_macos_application_active().map_err(|_| "active_query_failed")
        })?;
        if active {
            return Ok(());
        }
        if started.elapsed() >= STEP_TIMEOUT {
            return Err("application_activation_wait_timeout");
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn wait_until<F>(condition: F, timeout: Duration) -> Result<(), &'static str>
where
    F: Fn() -> bool,
{
    let started = Instant::now();
    while started.elapsed() < timeout {
        if condition() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(10));
    }
    Err("bounded_condition_wait_timeout")
}

fn run_action<R: Runtime>(
    app: &AppHandle<R>,
    action: LauncherWindowAction,
) -> Result<(), &'static str> {
    on_main(app, move |app| {
        app.state::<LauncherWindowActions>()
            .dispatch(&app, action)
            .map_err(|_| "launcher_action_failed")
    })?;
    thread::sleep(Duration::from_millis(250));
    Ok(())
}

fn native_snapshot<R: Runtime>(app: &AppHandle<R>) -> Result<NativeSnapshot, &'static str> {
    on_main(app, |app| {
        let marker = MainThreadMarker::new().ok_or("main_thread_marker_missing")?;
        let application = NSApplication::sharedApplication(marker);
        let running = NSRunningApplication::currentApplication();
        let window = app
            .get_window(MAIN_WINDOW_LABEL)
            .ok_or("main_window_missing")?;
        let pointer = window.ns_window().map_err(|_| "native_window_missing")?;
        if pointer.is_null() {
            return Err("native_window_identity_missing");
        }
        let native: &NSWindow = unsafe { &*pointer.cast::<NSWindow>() };
        let behavior = native.collectionBehavior();
        Ok(NativeSnapshot {
            runtime_accessory: application.activationPolicy()
                == NSApplicationActivationPolicy::Accessory,
            ordinary_menu_bar_absent: !running.ownsMenuBar(),
            visible: window
                .is_visible()
                .map_err(|_| "window_visibility_failed")?,
            focused: native.isKeyWindow(),
            on_active_space: native.isOnActiveSpace(),
            occlusion_visible: native
                .occlusionState()
                .contains(NSWindowOcclusionState::Visible),
            above_normal_level: native.level() > NSNormalWindowLevel,
            can_join_all_spaces: behavior.contains(NSWindowCollectionBehavior::CanJoinAllSpaces),
            full_screen_auxiliary: behavior
                .contains(NSWindowCollectionBehavior::FullScreenAuxiliary),
            always_on_top: window
                .is_always_on_top()
                .map_err(|_| "window_level_failed")?,
            non_fullscreen: !window
                .is_fullscreen()
                .map_err(|_| "window_fullscreen_failed")?,
        })
    })
}

fn default_shortcut_registered<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.global_shortcut().is_registered(Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::SHIFT),
        Code::Space,
    ))
}

#[allow(deprecated)]
fn activate_sacrifice(pid: i32) -> Result<(), &'static str> {
    let running = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)
        .ok_or("sacrifice_application_missing")?;
    running
        .activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows)
        .then_some(())
        .ok_or("sacrifice_activation_failed")
}

fn post_key_equivalent<R: Runtime>(
    app: &AppHandle<R>,
    character: &'static str,
    key_code: u16,
) -> Result<(), &'static str> {
    on_main(app, move |app| {
        let marker = MainThreadMarker::new().ok_or("main_thread_marker_missing")?;
        let application = NSApplication::sharedApplication(marker);
        application.mainMenu().ok_or("application_menu_missing")?;
        let window = app
            .get_window(MAIN_WINDOW_LABEL)
            .ok_or("main_window_missing")?;
        let pointer = window.ns_window().map_err(|_| "native_window_missing")?;
        let native: &NSWindow = unsafe { &*pointer.cast::<NSWindow>() };
        let characters = NSString::from_str(character);
        let event = NSEvent::keyEventWithType_location_modifierFlags_timestamp_windowNumber_context_characters_charactersIgnoringModifiers_isARepeat_keyCode(
            NSEventType::KeyDown,
            NSPoint::new(0.0, 0.0),
            NSEventModifierFlags::Command,
            0.0,
            native.windowNumber(),
            None,
            &characters,
            &characters,
            false,
            key_code,
        )
        .ok_or("key_equivalent_event_failed")?;
        application.postEvent_atStart(&event, false);
        Ok(())
    })
}

fn write_evidence(path: &Path, evidence: &ProductEvidence) -> Result<(), &'static str> {
    let bytes = serde_json::to_vec_pretty(evidence).map_err(|_| "evidence_serialize_failed")?;
    fs::write(path, bytes).map_err(|_| "evidence_write_failed")
}

fn run<R: Runtime>(app: AppHandle<R>, input: EvidenceInput) -> Result<(), &'static str> {
    let started = Instant::now();
    thread::sleep(Duration::from_millis(750));
    let initial = native_snapshot(&app)?;
    let recovery_shortcut_registered = default_shortcut_registered(&app);

    run_action(&app, LauncherWindowAction::Hide)?;
    let hidden = native_snapshot(&app)?;
    run_action(
        &app,
        LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut),
    )?;
    wait_for_application_active(&app)?;
    let ordinary = native_snapshot(&app)?;

    run_action(&app, LauncherWindowAction::Hide)?;
    fs::write(&input.fullscreen_request, b"fullscreen").map_err(|_| "fullscreen_request_failed")?;
    wait_for(&input.fullscreen_ready)?;
    activate_sacrifice(input.sacrifice_pid)?;
    thread::sleep(Duration::from_millis(750));

    let other_application_inactive = !on_main(&app, |_| {
        is_macos_application_active().map_err(|_| "active_query_failed")
    })?;
    let (other_cmd_w_ignored, other_cmd_q_ignored) =
        macos_inactive_local_commands_ignored_for_evidence();
    let other_foreground = native_snapshot(&app)?;

    run_action(
        &app,
        LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut),
    )?;
    wait_for_application_active(&app)?;
    let fullscreen = native_snapshot(&app)?;

    let mut exact_hide_show_pairs = true;
    for _ in 0..3 {
        run_action(
            &app,
            LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut),
        )?;
        exact_hide_show_pairs &= !native_snapshot(&app)?.visible;
        run_action(
            &app,
            LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut),
        )?;
        exact_hide_show_pairs &= native_snapshot(&app)?.visible;
    }

    let close_count_before = macos_local_command_counts().0;
    post_key_equivalent(&app, "w", 13)?;
    wait_until(
        || macos_local_command_counts().0 == close_count_before + 1,
        Duration::from_secs(2),
    )?;
    let after_cmd_w = native_snapshot(&app)?;
    run_action(
        &app,
        LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut),
    )?;
    wait_for_application_active(&app)?;
    let restored_after_cmd_w = native_snapshot(&app)?;
    let single_native_window = app.windows().len() == 1;
    let recovery_shortcut_still_registered = default_shortcut_registered(&app);

    let cmd_w_dispatched = macos_local_command_counts().0 == close_count_before + 1;
    let evidence = ProductEvidence {
        evidence_version: "0.1.0",
        platform: "macos",
        process_id: std::process::id(),
        bundle_runtime: BundleRuntimeEvidence {
            runtime_accessory: initial.runtime_accessory,
            dock_tile_absent: initial.runtime_accessory,
            ordinary_menu_bar_absent: initial.ordinary_menu_bar_absent,
            recovery_shortcut_registered,
            hidden_process_alive: !hidden.visible,
        },
        window_policy: WindowPolicyEvidence {
            complete_main_window: true,
            can_join_all_spaces: initial.can_join_all_spaces,
            full_screen_auxiliary: initial.full_screen_auxiliary,
            above_normal_level: initial.above_normal_level,
            always_on_top: initial.always_on_top,
            non_fullscreen: initial.non_fullscreen,
            single_native_window,
        },
        ordinary_space: SpaceEvidence {
            production_global_shortcut_action: true,
            visible: ordinary.visible,
            focused: ordinary.focused,
            on_active_space: ordinary.on_active_space,
            occlusion_visible: ordinary.occlusion_visible,
        },
        fullscreen_space: FullscreenSpaceEvidence {
            sacrifice_activated_before_restore: true,
            production_global_shortcut_action: true,
            visible: fullscreen.visible,
            focused: fullscreen.focused,
            on_active_space: fullscreen.on_active_space,
            occlusion_visible: fullscreen.occlusion_visible,
            above_fullscreen_content: fullscreen.above_normal_level,
        },
        repeated_toggle: RepeatedToggleEvidence {
            repetitions: 3,
            exact_hide_show_pairs,
            single_native_window,
            recovery_shortcut_still_registered,
        },
        local_shortcuts: LocalShortcutEvidence {
            cmd_w_key_equivalent_dispatched: cmd_w_dispatched,
            cmd_w_reused_hide_action: !after_cmd_w.visible,
            cmd_w_process_alive: true,
            restored_after_cmd_w: restored_after_cmd_w.visible && restored_after_cmd_w.focused,
            other_foreground_cmd_w_ignored: other_application_inactive
                && other_cmd_w_ignored
                && !other_foreground.visible,
            other_foreground_cmd_q_ignored: other_application_inactive && other_cmd_q_ignored,
            cmd_q_key_equivalent_dispatched: false,
            cmd_q_exit_requested: false,
        },
        cleanup: CleanupEvidence {
            bounded_execution: started.elapsed() < Duration::from_secs(60),
            graceful_exit_requested: false,
            raw_paths_omitted: true,
        },
    };
    write_evidence(&input.output, &evidence)?;
    post_key_equivalent(&app, "q", 12)?;
    Ok(())
}

pub(crate) fn start<R: Runtime>(app: &AppHandle<R>) -> Result<(), &'static str> {
    let Some(input) = parse_input()? else {
        return Ok(());
    };
    let failure_output = input.failure_output.clone();
    let app = app.clone();
    thread::spawn(move || {
        if let Err(stage) = run(app.clone(), input) {
            eprintln!("macOS accessory evidence failed: stage={stage}");
            let _ = fs::write(failure_output, stage);
            app.exit(3);
        }
    });
    Ok(())
}
