use std::error::Error;
use std::fmt::{Display, Formatter};

#[cfg(target_os = "macos")]
use tauri::{App, Manager, Runtime};

use crate::launcher_window::MAIN_WINDOW_LABEL;

const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
const FULL_SCREEN_AUXILIARY: usize = 1 << 8;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum MacosLauncherSetupStage {
    ApplicationPolicy,
    WindowCollection,
}

impl Display for MacosLauncherSetupStage {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::ApplicationPolicy => "macos_application_policy",
            Self::WindowCollection => "macos_window_collection",
        })
    }
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct MacosLauncherSetupError {
    pub(crate) stage: MacosLauncherSetupStage,
    operation: &'static str,
    details: &'static str,
}

impl MacosLauncherSetupError {
    fn new(stage: MacosLauncherSetupStage, operation: &'static str, details: &'static str) -> Self {
        Self {
            stage,
            operation,
            details,
        }
    }
}

impl Display for MacosLauncherSetupError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "macOS Launcher setup failed during '{}'/'{}': {}",
            self.stage, self.operation, self.details
        )
    }
}

impl Error for MacosLauncherSetupError {}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ApplicationPolicy {
    Regular,
    Accessory,
    Prohibited,
}

trait ApplicationPolicyAdapter {
    fn is_main_thread(&self) -> bool;
    fn set_accessory(&mut self) -> Result<(), ()>;
    fn policy(&self) -> Result<ApplicationPolicy, ()>;
    fn activate(&mut self) -> Result<(), ()>;
}

fn establish_accessory_policy<A: ApplicationPolicyAdapter>(
    adapter: &mut A,
) -> Result<(), MacosLauncherSetupError> {
    let stage = MacosLauncherSetupStage::ApplicationPolicy;
    if !adapter.is_main_thread() {
        return Err(MacosLauncherSetupError::new(
            stage,
            "main_thread",
            "the application policy must be established on the main thread",
        ));
    }
    adapter.set_accessory().map_err(|()| {
        MacosLauncherSetupError::new(
            stage,
            "set_accessory",
            "the accessory application policy could not be established",
        )
    })?;
    if adapter.policy() != Ok(ApplicationPolicy::Accessory) {
        return Err(MacosLauncherSetupError::new(
            stage,
            "confirm_accessory",
            "the accessory application policy could not be confirmed",
        ));
    }
    Ok(())
}

fn activate_accessory_application<A: ApplicationPolicyAdapter>(
    adapter: &mut A,
) -> Result<(), &'static str> {
    if !adapter.is_main_thread() {
        return Err("macOS accessory activation requires the main thread");
    }
    if adapter.policy() != Ok(ApplicationPolicy::Accessory) {
        return Err("macOS accessory activation policy is not current");
    }
    adapter
        .activate()
        .map_err(|()| "macOS accessory application activation failed")
}

trait WindowCollectionAdapter {
    fn is_main_thread(&self) -> bool;
    fn is_complete_main_window(&self) -> bool;
    fn collection_behavior(&self) -> Result<usize, ()>;
    fn set_collection_behavior(&mut self, behavior: usize) -> Result<(), ()>;
    fn is_always_on_top(&self) -> Result<bool, ()>;
    fn is_fullscreen(&self) -> Result<bool, ()>;
}

fn establish_window_collection<A: WindowCollectionAdapter>(
    adapter: &mut A,
) -> Result<(), MacosLauncherSetupError> {
    let stage = MacosLauncherSetupStage::WindowCollection;
    if !adapter.is_main_thread() {
        return Err(MacosLauncherSetupError::new(
            stage,
            "main_thread",
            "the native Window collection must be established on the main thread",
        ));
    }
    if !adapter.is_complete_main_window() {
        return Err(MacosLauncherSetupError::new(
            stage,
            "resolve_window",
            "the complete native main Window could not be resolved",
        ));
    }
    let previous = adapter.collection_behavior().map_err(|()| {
        MacosLauncherSetupError::new(
            stage,
            "read_collection_behavior",
            "the native Window collection behavior could not be read",
        )
    })?;
    let required = previous | CAN_JOIN_ALL_SPACES | FULL_SCREEN_AUXILIARY;
    adapter.set_collection_behavior(required).map_err(|()| {
        MacosLauncherSetupError::new(
            stage,
            "set_collection_behavior",
            "the native Window collection behavior could not be set",
        )
    })?;
    let confirmed = adapter.collection_behavior().map_err(|()| {
        MacosLauncherSetupError::new(
            stage,
            "confirm_collection_behavior",
            "the native Window collection behavior could not be confirmed",
        )
    })?;
    if confirmed != required || confirmed & previous != previous {
        return Err(MacosLauncherSetupError::new(
            stage,
            "confirm_collection_behavior",
            "the native Window collection behavior did not preserve all existing flags",
        ));
    }
    if adapter.is_always_on_top() != Ok(true) {
        return Err(MacosLauncherSetupError::new(
            stage,
            "confirm_window_level",
            "the Launcher Window is not always on top",
        ));
    }
    if adapter.is_fullscreen() != Ok(false) {
        return Err(MacosLauncherSetupError::new(
            stage,
            "confirm_non_fullscreen",
            "the Launcher Window must remain non-fullscreen",
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
struct AppKitApplicationPolicyAdapter {
    application: objc2::rc::Retained<objc2_app_kit::NSApplication>,
}

#[cfg(target_os = "macos")]
impl AppKitApplicationPolicyAdapter {
    fn new() -> Result<Self, MacosLauncherSetupError> {
        let marker = objc2::MainThreadMarker::new().ok_or_else(|| {
            MacosLauncherSetupError::new(
                MacosLauncherSetupStage::ApplicationPolicy,
                "main_thread",
                "the AppKit application is unavailable off the main thread",
            )
        })?;
        Ok(Self {
            application: objc2_app_kit::NSApplication::sharedApplication(marker),
        })
    }
}

#[cfg(target_os = "macos")]
impl ApplicationPolicyAdapter for AppKitApplicationPolicyAdapter {
    fn is_main_thread(&self) -> bool {
        objc2::MainThreadMarker::new().is_some()
    }

    fn set_accessory(&mut self) -> Result<(), ()> {
        if self.application.activationPolicy()
            == objc2_app_kit::NSApplicationActivationPolicy::Accessory
        {
            return Ok(());
        }
        self.application
            .setActivationPolicy(objc2_app_kit::NSApplicationActivationPolicy::Accessory)
            .then_some(())
            .ok_or(())
    }

    fn policy(&self) -> Result<ApplicationPolicy, ()> {
        let policy = self.application.activationPolicy();
        if policy == objc2_app_kit::NSApplicationActivationPolicy::Accessory {
            Ok(ApplicationPolicy::Accessory)
        } else if policy == objc2_app_kit::NSApplicationActivationPolicy::Regular {
            Ok(ApplicationPolicy::Regular)
        } else if policy == objc2_app_kit::NSApplicationActivationPolicy::Prohibited {
            Ok(ApplicationPolicy::Prohibited)
        } else {
            Err(())
        }
    }

    fn activate(&mut self) -> Result<(), ()> {
        self.application.activate();
        Ok(())
    }
}

#[cfg(target_os = "macos")]
struct AppKitWindowCollectionAdapter<R: Runtime> {
    window: tauri::Window<R>,
    native_window: *mut std::ffi::c_void,
}

#[cfg(target_os = "macos")]
impl<R: Runtime> WindowCollectionAdapter for AppKitWindowCollectionAdapter<R> {
    fn is_main_thread(&self) -> bool {
        objc2::MainThreadMarker::new().is_some()
    }

    fn is_complete_main_window(&self) -> bool {
        self.window.label() == MAIN_WINDOW_LABEL && !self.native_window.is_null()
    }

    fn collection_behavior(&self) -> Result<usize, ()> {
        let native_window: &objc2_app_kit::NSWindow =
            unsafe { &*self.native_window.cast::<objc2_app_kit::NSWindow>() };
        Ok(native_window.collectionBehavior().0)
    }

    fn set_collection_behavior(&mut self, behavior: usize) -> Result<(), ()> {
        let native_window: &objc2_app_kit::NSWindow =
            unsafe { &*self.native_window.cast::<objc2_app_kit::NSWindow>() };
        native_window.setCollectionBehavior(objc2_app_kit::NSWindowCollectionBehavior(behavior));
        Ok(())
    }

    fn is_always_on_top(&self) -> Result<bool, ()> {
        self.window.is_always_on_top().map_err(|_| ())
    }

    fn is_fullscreen(&self) -> Result<bool, ()> {
        self.window.is_fullscreen().map_err(|_| ())
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn setup_macos_accessory_application<R: Runtime>(
    app: &mut App<R>,
) -> Result<(), MacosLauncherSetupError> {
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    establish_accessory_policy(&mut AppKitApplicationPolicyAdapter::new()?)
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn setup_macos_accessory_application<R: tauri::Runtime>(
    _app: &mut tauri::App<R>,
) -> Result<(), MacosLauncherSetupError> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn setup_macos_launcher_window_collection<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), MacosLauncherSetupError> {
    let window = app.get_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
        MacosLauncherSetupError::new(
            MacosLauncherSetupStage::WindowCollection,
            "resolve_window",
            "the complete native main Window could not be resolved",
        )
    })?;
    let native_window = window.ns_window().map_err(|_| {
        MacosLauncherSetupError::new(
            MacosLauncherSetupStage::WindowCollection,
            "resolve_window",
            "the complete native main Window identity is unavailable",
        )
    })?;
    establish_window_collection(&mut AppKitWindowCollectionAdapter {
        window,
        native_window,
    })
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn setup_macos_launcher_window_collection<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
) -> Result<(), MacosLauncherSetupError> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn activate_macos_accessory_application() -> Result<(), String> {
    let mut adapter = AppKitApplicationPolicyAdapter::new().map_err(|error| error.to_string())?;
    activate_accessory_application(&mut adapter).map_err(str::to_owned)
}

#[cfg(target_os = "macos")]
pub(crate) fn confirm_visible_macos_accessory_application_active() -> Result<(), String> {
    let adapter = AppKitApplicationPolicyAdapter::new().map_err(|error| error.to_string())?;
    if adapter.application.isActive() {
        return Ok(());
    }
    objc2_app_kit::NSRunningApplication::currentApplication()
        .activateWithOptions(objc2_app_kit::NSApplicationActivationOptions::ActivateAllWindows)
        .then_some(())
        .ok_or_else(|| "macOS visible accessory application activation failed".to_owned())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn confirm_visible_macos_accessory_application_active() -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn activate_macos_accessory_application() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn is_macos_application_active() -> Result<bool, String> {
    let adapter = AppKitApplicationPolicyAdapter::new().map_err(|error| error.to_string())?;
    Ok(adapter.application.isActive())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn is_macos_application_active() -> Result<bool, String> {
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeApplication {
        main_thread: bool,
        set_fails: bool,
        policy: ApplicationPolicy,
        activation_count: usize,
    }

    impl ApplicationPolicyAdapter for FakeApplication {
        fn is_main_thread(&self) -> bool {
            self.main_thread
        }

        fn set_accessory(&mut self) -> Result<(), ()> {
            if self.set_fails {
                Err(())
            } else {
                self.policy = ApplicationPolicy::Accessory;
                Ok(())
            }
        }

        fn policy(&self) -> Result<ApplicationPolicy, ()> {
            Ok(self.policy)
        }

        fn activate(&mut self) -> Result<(), ()> {
            self.activation_count += 1;
            Ok(())
        }
    }

    struct FakeWindowCollection {
        main_thread: bool,
        complete_main_window: bool,
        behavior: usize,
        setter_fails: bool,
        confirmation_override: Option<usize>,
        always_on_top: bool,
        fullscreen: bool,
        setter_count: usize,
    }

    impl WindowCollectionAdapter for FakeWindowCollection {
        fn is_main_thread(&self) -> bool {
            self.main_thread
        }

        fn is_complete_main_window(&self) -> bool {
            self.complete_main_window
        }

        fn collection_behavior(&self) -> Result<usize, ()> {
            Ok(self.confirmation_override.unwrap_or(self.behavior))
        }

        fn set_collection_behavior(&mut self, behavior: usize) -> Result<(), ()> {
            self.setter_count += 1;
            if self.setter_fails {
                Err(())
            } else {
                self.behavior = behavior;
                Ok(())
            }
        }

        fn is_always_on_top(&self) -> Result<bool, ()> {
            Ok(self.always_on_top)
        }

        fn is_fullscreen(&self) -> Result<bool, ()> {
            Ok(self.fullscreen)
        }
    }

    fn application(policy: ApplicationPolicy) -> FakeApplication {
        FakeApplication {
            main_thread: true,
            set_fails: false,
            policy,
            activation_count: 0,
        }
    }

    fn window(behavior: usize) -> FakeWindowCollection {
        FakeWindowCollection {
            main_thread: true,
            complete_main_window: true,
            behavior,
            setter_fails: false,
            confirmation_override: None,
            always_on_top: true,
            fullscreen: false,
            setter_count: 0,
        }
    }

    #[test]
    fn accessory_setup_never_accepts_regular_or_prohibited_fallbacks() {
        for policy in [ApplicationPolicy::Regular, ApplicationPolicy::Prohibited] {
            let mut adapter = application(policy);
            adapter.set_fails = true;
            let error = establish_accessory_policy(&mut adapter)
                .expect_err("a failed Accessory setter must not accept another policy");
            assert_eq!(error.stage, MacosLauncherSetupStage::ApplicationPolicy);
            assert_eq!(error.operation, "set_accessory");
            assert!(!error.to_string().contains("Regular"));
            assert!(!error.to_string().contains("Prohibited"));
        }
    }

    #[test]
    fn accessory_setup_and_activation_are_main_thread_bound_and_repeatable() {
        let mut adapter = application(ApplicationPolicy::Regular);
        establish_accessory_policy(&mut adapter).expect("Accessory setup should succeed");
        assert_eq!(adapter.policy, ApplicationPolicy::Accessory);
        activate_accessory_application(&mut adapter).expect("first activation should succeed");
        activate_accessory_application(&mut adapter).expect("repeat activation should succeed");
        assert_eq!(adapter.activation_count, 2);

        adapter.main_thread = false;
        let error = activate_accessory_application(&mut adapter)
            .expect_err("off-main-thread activation must fail closed");
        assert!(error.contains("main thread"));
    }

    #[test]
    fn collection_setup_preserves_existing_flags_and_is_idempotent() {
        let existing = 1 << 5;
        let mut adapter = window(existing);
        establish_window_collection(&mut adapter).expect("collection setup should succeed");
        assert_eq!(
            adapter.behavior,
            existing | CAN_JOIN_ALL_SPACES | FULL_SCREEN_AUXILIARY
        );
        establish_window_collection(&mut adapter).expect("repeat setup should be idempotent");
        assert_eq!(adapter.setter_count, 2);
        assert_eq!(
            adapter.behavior,
            existing | CAN_JOIN_ALL_SPACES | FULL_SCREEN_AUXILIARY
        );
    }

    #[test]
    fn collection_setup_fails_safely_for_each_native_precondition() {
        let cases = [
            (false, true, false, None, "main_thread"),
            (true, false, false, None, "resolve_window"),
            (true, true, true, None, "set_collection_behavior"),
            (
                true,
                true,
                false,
                Some(CAN_JOIN_ALL_SPACES),
                "confirm_collection_behavior",
            ),
        ];
        for (main_thread, complete, setter_fails, confirmation_override, operation) in cases {
            let mut adapter = window(1 << 5);
            adapter.main_thread = main_thread;
            adapter.complete_main_window = complete;
            adapter.setter_fails = setter_fails;
            adapter.confirmation_override = confirmation_override;
            let error = establish_window_collection(&mut adapter)
                .expect_err("configured native setup precondition should fail");
            assert_eq!(error.stage, MacosLauncherSetupStage::WindowCollection);
            assert_eq!(error.operation, operation);
            assert!(!error.to_string().contains("0x"));
        }
    }

    #[test]
    fn non_macos_setup_functions_are_explicit_noops_in_source() {
        let source = include_str!("macos_launcher.rs");
        assert!(source.contains("#[cfg(not(target_os = \"macos\"))]"));
        let accessory_setter = [
            "app.set_activation_policy(",
            "tauri::ActivationPolicy::Accessory)",
        ]
        .concat();
        assert_eq!(source.matches(&accessory_setter).count(), 1);
        let regular = ["tauri::ActivationPolicy::", "Regular"].concat();
        let prohibited = ["tauri::ActivationPolicy::", "Prohibited"].concat();
        assert!(!source.contains(&regular));
        assert!(!source.contains(&prohibited));
    }

    #[test]
    fn setup_order_keeps_policy_before_window_and_services() {
        let source = include_str!("lib.rs");
        let policy = source
            .find("setup_macos_accessory_application(app)")
            .expect("application policy setup must be installed");
        let trusted_target = source
            .find("TrustedAppTarget::from_runtime_config")
            .expect("trusted App target must be established");
        let window = source
            .find("setup_frame_aware_navigation_policy(")
            .expect("main Window creation must remain explicit");
        let collection = source
            .find("setup_macos_launcher_window_collection(app.handle())")
            .expect("native Window collection setup must be installed");
        let plugins = source
            .find("setup_plugin_manager(app.handle())")
            .expect("plugin services must remain in setup");
        let launcher = source
            .find("setup_launcher_window(app.handle())")
            .expect("Launcher lifecycle must remain in setup");
        assert!(
            policy < trusted_target
                && trusted_target < window
                && window < collection
                && collection < plugins
                && plugins < launcher
        );
    }
}
