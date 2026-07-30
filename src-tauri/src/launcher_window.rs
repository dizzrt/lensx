use serde::Serialize;
use std::error::Error;
use std::fmt::{Display, Formatter};
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const LAUNCHER_ACTIVATED_EVENT: &str = "launcher://activated";
pub const DEFAULT_SHORTCUT_LABEL: &str = "Ctrl+Shift+Space";
const DEFAULT_SHORTCUT_BINDINGS: [&str; 1] = [DEFAULT_SHORTCUT_LABEL];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LauncherActivationReason {
    Startup,
    GlobalShortcut,
    Programmatic,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LauncherWindowAction {
    Show(LauncherActivationReason),
    Hide,
    Toggle(LauncherActivationReason),
}

impl LauncherWindowAction {
    fn name(self) -> &'static str {
        match self {
            Self::Show(_) => "show",
            Self::Hide => "hide",
            Self::Toggle(_) => "toggle",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LauncherWindowOperation {
    ResolveWindow,
    ReadVisibility,
    Restore,
    Show,
    Hide,
    Focus,
    EmitActivation,
}

impl Display for LauncherWindowOperation {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        let operation = match self {
            Self::ResolveWindow => "resolve_window",
            Self::ReadVisibility => "read_visibility",
            Self::Restore => "restore",
            Self::Show => "show",
            Self::Hide => "hide",
            Self::Focus => "focus",
            Self::EmitActivation => "emit_activation",
        };

        formatter.write_str(operation)
    }
}

#[derive(Debug, Eq, PartialEq)]
pub struct LauncherWindowActionError {
    pub action: LauncherWindowAction,
    pub operation: LauncherWindowOperation,
    details: String,
}

impl LauncherWindowActionError {
    fn new(
        action: LauncherWindowAction,
        operation: LauncherWindowOperation,
        details: impl Into<String>,
    ) -> Self {
        Self {
            action,
            operation,
            details: details.into(),
        }
    }
}

impl Display for LauncherWindowActionError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "launcher action '{}' failed during '{}': {}",
            self.action.name(),
            self.operation,
            self.details
        )
    }
}

impl Error for LauncherWindowActionError {}

const LAUNCHER_WINDOW_ACTION_FAILED: &str = "launcher_window_action_failed";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct LauncherCommandError {
    pub code: &'static str,
    pub action: &'static str,
    pub operation: String,
    pub message: String,
}

impl From<LauncherWindowActionError> for LauncherCommandError {
    fn from(error: LauncherWindowActionError) -> Self {
        Self {
            code: LAUNCHER_WINDOW_ACTION_FAILED,
            action: error.action.name(),
            operation: error.operation.to_string(),
            message: error.to_string(),
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
struct LauncherActivationPayload {
    reason: LauncherActivationReason,
}

trait LauncherWindowAdapter {
    fn is_visible(&mut self) -> Result<bool, String>;
    fn restore(&mut self) -> Result<(), String>;
    fn show(&mut self) -> Result<(), String>;
    fn hide(&mut self) -> Result<(), String>;
    fn focus(&mut self) -> Result<(), String>;
    fn emit_activation(&mut self, reason: LauncherActivationReason) -> Result<(), String>;
}

trait LauncherWindowResolver {
    type Window: LauncherWindowAdapter;

    fn resolve(&self) -> Result<Self::Window, String>;
}

fn execute_with_resolver<R: LauncherWindowResolver>(
    resolver: &R,
    action: LauncherWindowAction,
) -> Result<(), LauncherWindowActionError> {
    let mut window = resolver.resolve().map_err(|details| {
        LauncherWindowActionError::new(action, LauncherWindowOperation::ResolveWindow, details)
    })?;

    execute_with_adapter(&mut window, action)
}

fn execute_with_adapter<A: LauncherWindowAdapter>(
    window: &mut A,
    action: LauncherWindowAction,
) -> Result<(), LauncherWindowActionError> {
    match action {
        LauncherWindowAction::Show(reason) => show(window, action, reason),
        LauncherWindowAction::Hide => hide(window, action),
        LauncherWindowAction::Toggle(reason) => {
            let is_visible = window.is_visible().map_err(|details| {
                LauncherWindowActionError::new(
                    action,
                    LauncherWindowOperation::ReadVisibility,
                    details,
                )
            })?;

            if is_visible {
                hide(window, action)
            } else {
                show(window, action, reason)
            }
        }
    }
}

fn show<A: LauncherWindowAdapter>(
    window: &mut A,
    action: LauncherWindowAction,
    reason: LauncherActivationReason,
) -> Result<(), LauncherWindowActionError> {
    run_operation(window.restore(), action, LauncherWindowOperation::Restore)?;
    run_operation(window.show(), action, LauncherWindowOperation::Show)?;
    run_operation(window.focus(), action, LauncherWindowOperation::Focus)?;
    run_operation(
        window.emit_activation(reason),
        action,
        LauncherWindowOperation::EmitActivation,
    )
}

fn hide<A: LauncherWindowAdapter>(
    window: &mut A,
    action: LauncherWindowAction,
) -> Result<(), LauncherWindowActionError> {
    run_operation(window.hide(), action, LauncherWindowOperation::Hide)
}

fn run_operation(
    result: Result<(), String>,
    action: LauncherWindowAction,
    operation: LauncherWindowOperation,
) -> Result<(), LauncherWindowActionError> {
    result.map_err(|details| LauncherWindowActionError::new(action, operation, details))
}

struct TauriLauncherWindowAdapter<R: Runtime> {
    window: WebviewWindow<R>,
}

impl<R: Runtime> LauncherWindowAdapter for TauriLauncherWindowAdapter<R> {
    fn is_visible(&mut self) -> Result<bool, String> {
        self.window.is_visible().map_err(|error| error.to_string())
    }

    fn restore(&mut self) -> Result<(), String> {
        self.window.unminimize().map_err(|error| error.to_string())
    }

    fn show(&mut self) -> Result<(), String> {
        self.window.show().map_err(|error| error.to_string())
    }

    fn hide(&mut self) -> Result<(), String> {
        self.window.hide().map_err(|error| error.to_string())
    }

    fn focus(&mut self) -> Result<(), String> {
        self.window.set_focus().map_err(|error| error.to_string())
    }

    fn emit_activation(&mut self, reason: LauncherActivationReason) -> Result<(), String> {
        self.window
            .emit(
                LAUNCHER_ACTIVATED_EVENT,
                LauncherActivationPayload { reason },
            )
            .map_err(|error| error.to_string())
    }
}

struct TauriLauncherWindowResolver<'app, R: Runtime> {
    app: &'app AppHandle<R>,
}

impl<R: Runtime> LauncherWindowResolver for TauriLauncherWindowResolver<'_, R> {
    type Window = TauriLauncherWindowAdapter<R>;

    fn resolve(&self) -> Result<Self::Window, String> {
        self.app
            .get_webview_window(MAIN_WINDOW_LABEL)
            .map(|window| TauriLauncherWindowAdapter { window })
            .ok_or_else(|| format!("webview window '{MAIN_WINDOW_LABEL}' was not found"))
    }
}

#[derive(Default)]
pub struct LauncherWindowActions;

impl LauncherWindowActions {
    pub fn dispatch<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        action: LauncherWindowAction,
    ) -> Result<(), LauncherWindowActionError> {
        execute_with_resolver(&TauriLauncherWindowResolver { app }, action)
    }
}

fn dispatch_hide_command<F>(dispatch: F) -> Result<(), LauncherCommandError>
where
    F: FnOnce(LauncherWindowAction) -> Result<(), LauncherWindowActionError>,
{
    dispatch(LauncherWindowAction::Hide).map_err(LauncherCommandError::from)
}

#[tauri::command]
pub fn hide_launcher(
    app: AppHandle,
    actions: State<'_, LauncherWindowActions>,
) -> Result<(), LauncherCommandError> {
    dispatch_hide_command(|action| actions.dispatch(&app, action))
}

fn default_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
}

fn route_shortcut_event(
    is_default_shortcut: bool,
    state: ShortcutEventState,
) -> Option<LauncherWindowAction> {
    match (is_default_shortcut, state) {
        (true, ShortcutEventState::Pressed) => Some(LauncherWindowAction::Toggle(
            LauncherActivationReason::GlobalShortcut,
        )),
        (false, _) | (true, ShortcutEventState::Released) => None,
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ShortcutEventState {
    Pressed,
    Released,
}

pub fn global_shortcut_plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            let event_state = match event.state() {
                ShortcutState::Pressed => ShortcutEventState::Pressed,
                ShortcutState::Released => ShortcutEventState::Released,
            };

            if let Some(action) = route_shortcut_event(shortcut == &default_shortcut(), event_state)
            {
                let actions = app.state::<LauncherWindowActions>();
                if let Err(error) = actions.dispatch(app, action) {
                    eprintln!("{error}");
                }
            }
        })
        .build()
}

trait ShortcutRegistrar {
    fn register_default(&self) -> Result<(), String>;
}

trait ShortcutPluginInstaller {
    fn install(&self) -> Result<(), String>;
}

struct TauriShortcutPluginInstaller<'app, R: Runtime> {
    app: &'app AppHandle<R>,
}

impl<R: Runtime> ShortcutPluginInstaller for TauriShortcutPluginInstaller<'_, R> {
    fn install(&self) -> Result<(), String> {
        self.app
            .plugin(global_shortcut_plugin())
            .map_err(|error| error.to_string())
    }
}

struct TauriShortcutRegistrar<'app, R: Runtime> {
    app: &'app AppHandle<R>,
}

impl<R: Runtime> ShortcutRegistrar for TauriShortcutRegistrar<'_, R> {
    fn register_default(&self) -> Result<(), String> {
        self.app
            .global_shortcut()
            .register(default_shortcut())
            .map_err(|error| error.to_string())
    }
}

#[derive(Debug, Eq, PartialEq)]
struct ShortcutRegistrationError {
    binding: &'static str,
    details: String,
}

impl Display for ShortcutRegistrationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "failed to register launcher shortcut '{}': {}",
            self.binding, self.details
        )
    }
}

impl Error for ShortcutRegistrationError {}

#[derive(Debug)]
enum LauncherLifecycleSetupError {
    PluginInstallation(String),
    ShortcutRegistration(ShortcutRegistrationError),
    WindowListener(LauncherWindowActionError),
}

impl Display for LauncherLifecycleSetupError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PluginInstallation(details) => {
                write!(
                    formatter,
                    "failed to install global shortcut plugin: {details}"
                )
            }
            Self::ShortcutRegistration(error) => Display::fmt(error, formatter),
            Self::WindowListener(error) => {
                write!(
                    formatter,
                    "failed to install launcher lifecycle listener: {error}"
                )
            }
        }
    }
}

fn initialize_launcher_lifecycle<I, R, F>(
    plugin_installer: &I,
    registrar: &R,
    install_window_listener: F,
) -> Result<(), LauncherLifecycleSetupError>
where
    I: ShortcutPluginInstaller,
    R: ShortcutRegistrar,
    F: FnOnce() -> Result<(), LauncherWindowActionError>,
{
    debug_assert_eq!(DEFAULT_SHORTCUT_BINDINGS.len(), 1);
    plugin_installer
        .install()
        .map_err(LauncherLifecycleSetupError::PluginInstallation)?;
    registrar.register_default().map_err(|details| {
        LauncherLifecycleSetupError::ShortcutRegistration(ShortcutRegistrationError {
            binding: DEFAULT_SHORTCUT_LABEL,
            details,
        })
    })?;

    install_window_listener().map_err(LauncherLifecycleSetupError::WindowListener)
}

fn resolve_main_window<R: Runtime>(
    app: &AppHandle<R>,
    action: LauncherWindowAction,
) -> Result<WebviewWindow<R>, LauncherWindowActionError> {
    app.get_webview_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
        LauncherWindowActionError::new(
            action,
            LauncherWindowOperation::ResolveWindow,
            format!("webview window '{MAIN_WINDOW_LABEL}' was not found"),
        )
    })
}

fn dispatch_hide<R: Runtime>(app: &AppHandle<R>, trigger: &str) {
    let actions = app.state::<LauncherWindowActions>();
    if let Err(error) = actions.dispatch(app, LauncherWindowAction::Hide) {
        eprintln!("launcher hide triggered by {trigger} failed: {error}");
    }
}

fn install_window_lifecycle_listener<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), LauncherWindowActionError> {
    let action = LauncherWindowAction::Hide;
    let window = resolve_main_window(app, action)?;
    let app = app.clone();

    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            dispatch_hide(&app, "close request");
        }
        WindowEvent::Focused(false) => {
            dispatch_hide(&app, "focus loss");
        }
        _ => {}
    });

    Ok(())
}

pub fn setup_launcher_window<R: Runtime>(app: &AppHandle<R>) {
    app.manage(LauncherWindowActions);

    let plugin_installer = TauriShortcutPluginInstaller { app };
    let registrar = TauriShortcutRegistrar { app };
    match initialize_launcher_lifecycle(&plugin_installer, &registrar, || {
        install_window_lifecycle_listener(app)
    }) {
        Ok(()) => {}
        Err(LauncherLifecycleSetupError::PluginInstallation(details)) => {
            eprintln!(
                "failed to install global shortcut plugin: {details}; launcher hide-on-close and hide-on-blur remain disabled so the visible window can close normally"
            );
        }
        Err(LauncherLifecycleSetupError::ShortcutRegistration(error)) => {
            eprintln!(
                "{error}; launcher hide-on-close and hide-on-blur remain disabled so the visible window can close normally"
            );
        }
        Err(LauncherLifecycleSetupError::WindowListener(error)) => {
            eprintln!("{error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::rc::Rc;

    #[derive(Default)]
    struct FakeWindow {
        calls: Vec<LauncherWindowOperation>,
        fail_at: Option<LauncherWindowOperation>,
        visible: bool,
        activation_reasons: Vec<LauncherActivationReason>,
    }

    impl FakeWindow {
        fn record(&mut self, operation: LauncherWindowOperation) -> Result<(), String> {
            self.calls.push(operation);
            if self.fail_at == Some(operation) {
                Err(format!("{operation} failed"))
            } else {
                Ok(())
            }
        }
    }

    impl LauncherWindowAdapter for FakeWindow {
        fn is_visible(&mut self) -> Result<bool, String> {
            self.record(LauncherWindowOperation::ReadVisibility)?;
            Ok(self.visible)
        }

        fn restore(&mut self) -> Result<(), String> {
            self.record(LauncherWindowOperation::Restore)
        }

        fn show(&mut self) -> Result<(), String> {
            self.record(LauncherWindowOperation::Show)
        }

        fn hide(&mut self) -> Result<(), String> {
            self.record(LauncherWindowOperation::Hide)
        }

        fn focus(&mut self) -> Result<(), String> {
            self.record(LauncherWindowOperation::Focus)
        }

        fn emit_activation(&mut self, reason: LauncherActivationReason) -> Result<(), String> {
            self.record(LauncherWindowOperation::EmitActivation)?;
            self.activation_reasons.push(reason);
            Ok(())
        }
    }

    struct FakeResolver {
        fail: bool,
        visible: bool,
    }

    impl LauncherWindowResolver for FakeResolver {
        type Window = FakeWindow;

        fn resolve(&self) -> Result<Self::Window, String> {
            if self.fail {
                Err("main window missing".to_owned())
            } else {
                Ok(FakeWindow {
                    visible: self.visible,
                    ..FakeWindow::default()
                })
            }
        }
    }

    #[test]
    fn show_runs_native_operations_in_contract_order() {
        let mut window = FakeWindow::default();

        execute_with_adapter(
            &mut window,
            LauncherWindowAction::Show(LauncherActivationReason::Programmatic),
        )
        .expect("show should succeed");

        assert_eq!(
            window.calls,
            vec![
                LauncherWindowOperation::Restore,
                LauncherWindowOperation::Show,
                LauncherWindowOperation::Focus,
                LauncherWindowOperation::EmitActivation,
            ]
        );
        assert_eq!(
            window.activation_reasons,
            vec![LauncherActivationReason::Programmatic]
        );
    }

    #[test]
    fn hide_only_hides_the_window() {
        let mut window = FakeWindow::default();

        execute_with_adapter(&mut window, LauncherWindowAction::Hide).expect("hide should succeed");

        assert_eq!(window.calls, vec![LauncherWindowOperation::Hide]);
    }

    #[test]
    fn hide_launcher_command_routes_to_the_shared_hide_action() {
        let requested_action = Cell::new(None);

        dispatch_hide_command(|action| {
            requested_action.set(Some(action));
            Ok(())
        })
        .expect("hide command should succeed");

        assert_eq!(requested_action.get(), Some(LauncherWindowAction::Hide));
    }

    #[test]
    fn hide_launcher_command_returns_structured_failure_fields() {
        let error = dispatch_hide_command(|action| {
            Err(LauncherWindowActionError::new(
                action,
                LauncherWindowOperation::Hide,
                "native hide failed",
            ))
        })
        .expect_err("hide command should preserve a structured failure");

        assert_eq!(error.code, LAUNCHER_WINDOW_ACTION_FAILED);
        assert_eq!(error.action, "hide");
        assert_eq!(error.operation, "hide");
        assert!(error.message.contains("native hide failed"));
        assert_eq!(
            serde_json::to_value(&error).expect("command error should serialize"),
            serde_json::json!({
                "code": "launcher_window_action_failed",
                "action": "hide",
                "operation": "hide",
                "message": "launcher action 'hide' failed during 'hide': native hide failed"
            })
        );
    }

    #[test]
    fn toggle_routes_visible_and_hidden_windows_through_shared_paths() {
        let mut visible = FakeWindow {
            visible: true,
            ..FakeWindow::default()
        };
        execute_with_adapter(
            &mut visible,
            LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut),
        )
        .expect("visible toggle should hide");
        assert_eq!(
            visible.calls,
            vec![
                LauncherWindowOperation::ReadVisibility,
                LauncherWindowOperation::Hide,
            ]
        );

        let mut hidden = FakeWindow::default();
        execute_with_adapter(
            &mut hidden,
            LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut),
        )
        .expect("hidden toggle should show");
        assert_eq!(
            hidden.calls,
            vec![
                LauncherWindowOperation::ReadVisibility,
                LauncherWindowOperation::Restore,
                LauncherWindowOperation::Show,
                LauncherWindowOperation::Focus,
                LauncherWindowOperation::EmitActivation,
            ]
        );
    }

    #[test]
    fn failures_preserve_the_requested_action_and_operation_stage() {
        let action = LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut);
        let operations = [
            LauncherWindowOperation::ReadVisibility,
            LauncherWindowOperation::Restore,
            LauncherWindowOperation::Show,
            LauncherWindowOperation::Focus,
            LauncherWindowOperation::EmitActivation,
        ];

        for operation in operations {
            let mut window = FakeWindow {
                fail_at: Some(operation),
                ..FakeWindow::default()
            };
            let error = execute_with_adapter(&mut window, action)
                .expect_err("configured operation should fail");

            assert_eq!(error.action, action);
            assert_eq!(error.operation, operation);
            assert!(error.to_string().contains(action.name()));
            assert!(error.to_string().contains(&operation.to_string()));
        }

        let mut window = FakeWindow {
            fail_at: Some(LauncherWindowOperation::Hide),
            ..FakeWindow::default()
        };
        let error = execute_with_adapter(&mut window, LauncherWindowAction::Hide)
            .expect_err("hide should fail");
        assert_eq!(error.operation, LauncherWindowOperation::Hide);
    }

    #[test]
    fn resolver_failures_are_reported_as_window_lookup_failures() {
        let action = LauncherWindowAction::Show(LauncherActivationReason::Programmatic);
        let error = execute_with_resolver(
            &FakeResolver {
                fail: true,
                visible: false,
            },
            action,
        )
        .expect_err("resolver should fail");

        assert_eq!(error.action, action);
        assert_eq!(error.operation, LauncherWindowOperation::ResolveWindow);
        assert!(error.to_string().contains("main window missing"));
    }

    #[test]
    fn shortcut_routes_only_default_key_presses() {
        let toggle = LauncherWindowAction::Toggle(LauncherActivationReason::GlobalShortcut);

        assert_eq!(
            route_shortcut_event(true, ShortcutEventState::Pressed),
            Some(toggle)
        );
        assert_eq!(
            route_shortcut_event(true, ShortcutEventState::Released),
            None
        );
        assert_eq!(
            route_shortcut_event(false, ShortcutEventState::Pressed),
            None
        );
    }

    struct FakeRegistrar {
        attempts: Cell<usize>,
        fail: bool,
        order: Option<Rc<RefCell<Vec<&'static str>>>>,
    }

    impl ShortcutRegistrar for FakeRegistrar {
        fn register_default(&self) -> Result<(), String> {
            self.attempts.set(self.attempts.get() + 1);
            if let Some(order) = &self.order {
                order.borrow_mut().push("register");
            }
            if self.fail {
                Err("shortcut already in use".to_owned())
            } else {
                Ok(())
            }
        }
    }

    struct FakePluginInstaller {
        attempts: Cell<usize>,
        fail: bool,
        order: Option<Rc<RefCell<Vec<&'static str>>>>,
    }

    impl ShortcutPluginInstaller for FakePluginInstaller {
        fn install(&self) -> Result<(), String> {
            self.attempts.set(self.attempts.get() + 1);
            if let Some(order) = &self.order {
                order.borrow_mut().push("plugin");
            }
            if self.fail {
                Err("global shortcut backend unavailable".to_owned())
            } else {
                Ok(())
            }
        }
    }

    #[test]
    fn initialization_installs_plugin_and_registers_one_binding_before_listeners() {
        assert_eq!(DEFAULT_SHORTCUT_BINDINGS, [DEFAULT_SHORTCUT_LABEL]);
        let order = Rc::new(RefCell::new(Vec::new()));
        let plugin_installer = FakePluginInstaller {
            attempts: Cell::new(0),
            fail: false,
            order: Some(Rc::clone(&order)),
        };
        let registrar = FakeRegistrar {
            attempts: Cell::new(0),
            fail: false,
            order: Some(Rc::clone(&order)),
        };

        initialize_launcher_lifecycle(&plugin_installer, &registrar, || {
            order.borrow_mut().push("listener");
            Ok(())
        })
        .expect("initialization should succeed");

        assert_eq!(plugin_installer.attempts.get(), 1);
        assert_eq!(registrar.attempts.get(), 1);
        assert_eq!(*order.borrow(), vec!["plugin", "register", "listener"]);
    }

    #[test]
    fn plugin_failure_keeps_shortcut_and_hide_lifecycle_disabled() {
        let plugin_installer = FakePluginInstaller {
            attempts: Cell::new(0),
            fail: true,
            order: None,
        };
        let registrar = FakeRegistrar {
            attempts: Cell::new(0),
            fail: false,
            order: None,
        };
        let listener_installed = Cell::new(false);

        let error = initialize_launcher_lifecycle(&plugin_installer, &registrar, || {
            listener_installed.set(true);
            Ok(())
        })
        .expect_err("plugin installation should fail");

        assert_eq!(plugin_installer.attempts.get(), 1);
        assert_eq!(registrar.attempts.get(), 0);
        assert!(!listener_installed.get());
        assert!(matches!(
            error,
            LauncherLifecycleSetupError::PluginInstallation(_)
        ));
        assert!(error
            .to_string()
            .contains("global shortcut backend unavailable"));
    }

    #[test]
    fn registration_failure_keeps_hide_lifecycle_disabled() {
        let plugin_installer = FakePluginInstaller {
            attempts: Cell::new(0),
            fail: false,
            order: None,
        };
        let registrar = FakeRegistrar {
            attempts: Cell::new(0),
            fail: true,
            order: None,
        };
        let listener_installed = Cell::new(false);

        let error = initialize_launcher_lifecycle(&plugin_installer, &registrar, || {
            listener_installed.set(true);
            Ok(())
        })
        .expect_err("registration should fail");

        assert_eq!(plugin_installer.attempts.get(), 1);
        assert_eq!(registrar.attempts.get(), 1);
        assert!(!listener_installed.get());
        assert!(matches!(
            error,
            LauncherLifecycleSetupError::ShortcutRegistration(_)
        ));
        assert!(error.to_string().contains(DEFAULT_SHORTCUT_LABEL));
        assert!(error.to_string().contains("shortcut already in use"));
    }
}
