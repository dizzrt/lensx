use crate::{launcher_window::MAIN_WINDOW_LABEL, plugin_manager::PluginManager};
use serde::{de::Error as _, Deserialize, Deserializer, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, LogicalSize, Manager, Runtime, State, Window, WindowEvent};

const LAUNCHER_SURFACE_TRANSITION_FAILED: &str = "launcher_surface_transition_failed";
pub const LAUNCHER_WIDTH: f64 = 650.0;
pub const HOME_HEIGHT: f64 = 320.0;
pub const SEARCH_HEIGHT: f64 = 480.0;
pub const PAGE_HEIGHT: f64 = 600.0;
pub const HARD_MIN_WIDTH: f64 = 320.0;
pub const HARD_MIN_HEIGHT: f64 = 180.0;
pub const HARD_MAX_WIDTH: f64 = 4096.0;
pub const HARD_MAX_HEIGHT: f64 = 4096.0;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LauncherLogicalSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LauncherSurfaceTarget {
    Home,
    Search,
    HostPage,
    PluginPage {
        owner_id: String,
        page_id: String,
        page_attempt_id: String,
        initial_size: LauncherLogicalSize,
        resizable: bool,
    },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PluginPageTargetInput {
    kind: String,
    owner_id: String,
    page_id: String,
    page_attempt_id: String,
    initial_size: LauncherLogicalSize,
    resizable: bool,
}

impl<'de> Deserialize<'de> for LauncherSurfaceTarget {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = serde_json::Value::deserialize(deserializer)?;
        let object = value
            .as_object()
            .ok_or_else(|| D::Error::custom("launcher surface target must be an object"))?;
        let kind = object
            .get("kind")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| D::Error::custom("launcher surface target kind is required"))?;
        match kind {
            "home" | "search" | "host_page" if object.len() == 1 => Ok(match kind {
                "home" => Self::Home,
                "search" => Self::Search,
                _ => Self::HostPage,
            }),
            "plugin_page" => {
                let input: PluginPageTargetInput =
                    serde_json::from_value(value).map_err(D::Error::custom)?;
                if input.kind != "plugin_page" {
                    return Err(D::Error::custom("launcher surface target kind is invalid"));
                }
                Ok(Self::PluginPage {
                    owner_id: input.owner_id,
                    page_id: input.page_id,
                    page_attempt_id: input.page_attempt_id,
                    initial_size: input.initial_size,
                    resizable: input.resizable,
                })
            }
            _ => Err(D::Error::custom("launcher surface target is invalid")),
        }
    }
}

impl LauncherSurfaceTarget {
    fn name(&self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::Search => "search",
            Self::HostPage => "host_page",
            Self::PluginPage { .. } => "plugin_page",
        }
    }

    fn key(&self) -> String {
        match self {
            Self::Home => "home".to_owned(),
            Self::Search => "search".to_owned(),
            Self::HostPage => "host_page".to_owned(),
            Self::PluginPage {
                owner_id,
                page_id,
                page_attempt_id,
                initial_size,
                resizable,
            } => format!(
                "plugin_page\0{owner_id}\0{page_id}\0{page_attempt_id}\0{}\0{}\0{resizable}",
                initial_size.width, initial_size.height
            ),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct LauncherSurfaceError {
    pub code: &'static str,
    pub target_kind: &'static str,
    pub operation: &'static str,
    pub message: &'static str,
}

impl LauncherSurfaceError {
    fn new(target: &LauncherSurfaceTarget, operation: &'static str) -> Self {
        Self {
            code: LAUNCHER_SURFACE_TRANSITION_FAILED,
            target_kind: target.name(),
            operation,
            message: "The launcher window could not change presentation.",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct LogicalDimensions {
    width: f64,
    height: f64,
}

impl LogicalDimensions {
    const fn new(width: f64, height: f64) -> Self {
        Self { width, height }
    }

    fn clamp(self, minimum: Self, maximum: Self) -> Self {
        Self::new(
            self.width.clamp(minimum.width, maximum.width),
            self.height.clamp(minimum.height, maximum.height),
        )
    }
}

#[derive(Clone, Debug, PartialEq)]
struct PresentationSnapshot {
    key: String,
    requested: LogicalDimensions,
    size: LogicalDimensions,
    minimum: LogicalDimensions,
    maximum: LogicalDimensions,
    resizable: bool,
}

trait LauncherSurfaceWindow {
    fn current_logical_size(&self) -> Result<LogicalDimensions, String>;
    fn current_work_area(&self) -> Result<LogicalDimensions, String>;
    fn current_resizable(&self) -> Result<bool, String>;
    fn set_resizable(&self, resizable: bool) -> Result<(), String>;
    fn set_min_size(&self, size: LogicalDimensions) -> Result<(), String>;
    fn set_max_size(&self, size: LogicalDimensions) -> Result<(), String>;
    fn set_logical_size(&self, size: LogicalDimensions) -> Result<(), String>;
}

impl<R: Runtime> LauncherSurfaceWindow for Window<R> {
    fn current_resizable(&self) -> Result<bool, String> {
        self.is_resizable().map_err(|error| error.to_string())
    }

    fn current_logical_size(&self) -> Result<LogicalDimensions, String> {
        let scale_factor = self.scale_factor().map_err(|error| error.to_string())?;
        let size = self
            .inner_size()
            .map_err(|error| error.to_string())?
            .to_logical::<f64>(scale_factor);
        Ok(LogicalDimensions::new(size.width, size.height))
    }

    fn current_work_area(&self) -> Result<LogicalDimensions, String> {
        let monitor = self
            .current_monitor()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "current monitor unavailable".to_owned())?;
        let size = monitor
            .work_area()
            .size
            .to_logical::<f64>(monitor.scale_factor());
        Ok(LogicalDimensions::new(size.width, size.height))
    }

    fn set_resizable(&self, resizable: bool) -> Result<(), String> {
        self.set_resizable(resizable)
            .map_err(|error| error.to_string())
    }

    fn set_min_size(&self, size: LogicalDimensions) -> Result<(), String> {
        self.set_min_size(Some(LogicalSize::new(size.width, size.height)))
            .map_err(|error| error.to_string())
    }

    fn set_max_size(&self, size: LogicalDimensions) -> Result<(), String> {
        self.set_max_size(Some(LogicalSize::new(size.width, size.height)))
            .map_err(|error| error.to_string())
    }

    fn set_logical_size(&self, size: LogicalDimensions) -> Result<(), String> {
        self.set_size(LogicalSize::new(size.width, size.height))
            .map_err(|error| error.to_string())
    }
}

trait LauncherSurfaceBindingResolver {
    fn validates(&self, target: &LauncherSurfaceTarget) -> bool;
}

impl LauncherSurfaceBindingResolver for PluginManager {
    fn validates(&self, target: &LauncherSurfaceTarget) -> bool {
        let LauncherSurfaceTarget::PluginPage {
            owner_id,
            page_id,
            initial_size,
            resizable,
            ..
        } = target
        else {
            return true;
        };
        let Some(registration) = self.registration(owner_id) else {
            return false;
        };
        registration.facts.enabled
            && registration.compatibility.lensx
            && registration.compatibility.host_api
            && registration.manifest.contributes.pages.iter().any(|page| {
                page.id == *page_id
                    && page.presentation.initial_size.width == initial_size.width
                    && page.presentation.initial_size.height == initial_size.height
                    && page.presentation.resizable == *resizable
            })
    }
}

#[derive(Default)]
pub struct LauncherSurfaceCoordinator {
    last_successful: Mutex<Option<PresentationSnapshot>>,
    // Read/write only while holding last_successful. Keep uncertain queued
    // enables across a failed rollback, independently of the success cache.
    resizable_uncertain: AtomicBool,
}

fn valid_owner_id(value: &str) -> bool {
    value.split('.').count() >= 2
        && value.split('.').all(|segment| {
            !segment.is_empty()
                && segment.len() <= 64
                && segment.as_bytes()[0].is_ascii_lowercase()
                && segment.bytes().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || byte == b'_'
                        || byte == b'-'
                })
        })
}

fn valid_page_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
        })
}

fn valid_attempt_id(value: &str) -> bool {
    value.strip_prefix("page_attempt_").is_some_and(|suffix| {
        !suffix.starts_with('0') && suffix.bytes().all(|byte| byte.is_ascii_digit())
    })
}

fn validate_target(target: &LauncherSurfaceTarget) -> bool {
    match target {
        LauncherSurfaceTarget::Home
        | LauncherSurfaceTarget::Search
        | LauncherSurfaceTarget::HostPage => true,
        LauncherSurfaceTarget::PluginPage {
            owner_id,
            page_id,
            page_attempt_id,
            initial_size,
            ..
        } => {
            valid_owner_id(owner_id)
                && valid_page_id(page_id)
                && valid_attempt_id(page_attempt_id)
                && (320..=4096).contains(&initial_size.width)
                && (180..=4096).contains(&initial_size.height)
        }
    }
}

fn policy_for_target(
    target: &LauncherSurfaceTarget,
    work_area: LogicalDimensions,
) -> Result<PresentationSnapshot, &'static str> {
    let hard_minimum = LogicalDimensions::new(HARD_MIN_WIDTH, HARD_MIN_HEIGHT);
    let maximum = LogicalDimensions::new(
        work_area.width.min(HARD_MAX_WIDTH),
        work_area.height.min(HARD_MAX_HEIGHT),
    );
    if maximum.width < hard_minimum.width || maximum.height < hard_minimum.height {
        return Err("work_area");
    }
    let (requested, resizable) = match target {
        LauncherSurfaceTarget::Home => (LogicalDimensions::new(LAUNCHER_WIDTH, HOME_HEIGHT), false),
        LauncherSurfaceTarget::Search => {
            (LogicalDimensions::new(LAUNCHER_WIDTH, SEARCH_HEIGHT), false)
        }
        LauncherSurfaceTarget::HostPage => {
            (LogicalDimensions::new(LAUNCHER_WIDTH, PAGE_HEIGHT), false)
        }
        LauncherSurfaceTarget::PluginPage {
            initial_size,
            resizable,
            ..
        } => (
            LogicalDimensions::new(initial_size.width.into(), initial_size.height.into()),
            *resizable,
        ),
    };
    let size = requested.clamp(hard_minimum, maximum);
    let (minimum, maximum) = if resizable {
        (hard_minimum, maximum)
    } else {
        (size, size)
    };
    Ok(PresentationSnapshot {
        key: target.key(),
        requested,
        size,
        minimum,
        maximum,
        resizable,
    })
}

fn apply_snapshot<W: LauncherSurfaceWindow>(
    window: &W,
    snapshot: &PresentationSnapshot,
    work_area: LogicalDimensions,
    submitted_resizable: bool,
    restore_resizable: bool,
) -> Result<(), &'static str> {
    // Read once, then track this operation's ordered message submissions. A setter
    // return confirms delivery, not AppKit completion; an immediate re-read can
    // still observe the state before the guard message executes.
    let mut planned_resizable = window
        .current_resizable()
        .map_err(|_| "current_resizable")?
        || submitted_resizable;
    // A previous successful transition can also have a final enable awaiting
    // execution. Account for it as well as the actual state, so a subsequent
    // fixed target queues its guard behind that enable instead of skipping it.
    let hard_minimum = LogicalDimensions::new(HARD_MIN_WIDTH, HARD_MIN_HEIGHT);
    let hard_maximum = LogicalDimensions::new(
        work_area.width.min(HARD_MAX_WIDTH),
        work_area.height.min(HARD_MAX_HEIGHT),
    );
    if planned_resizable {
        window
            .set_resizable(false)
            .map_err(|_| "set_resizable_guard")?;
        planned_resizable = false;
    }
    window
        .set_min_size(hard_minimum)
        .map_err(|_| "set_wide_min_size")?;
    window
        .set_max_size(hard_maximum)
        .map_err(|_| "set_wide_max_size")?;
    window
        .set_logical_size(snapshot.size)
        .map_err(|_| "set_size")?;
    window
        .set_min_size(snapshot.minimum)
        .map_err(|_| "set_target_min_size")?;
    window
        .set_max_size(snapshot.maximum)
        .map_err(|_| "set_target_max_size")?;
    // Rollback reasserts the final state even if the read saw no change: a
    // failing setter may have partially applied or left an ordered message.
    // Tao's execution-time mask check makes this safe for the current responder.
    if planned_resizable != snapshot.resizable || restore_resizable {
        window
            .set_resizable(snapshot.resizable)
            .map_err(|_| "set_target_resizable")?;
    }
    Ok(())
}

fn transition<W: LauncherSurfaceWindow, B: LauncherSurfaceBindingResolver + ?Sized>(
    coordinator: &LauncherSurfaceCoordinator,
    window: &W,
    bindings: &B,
    target: &LauncherSurfaceTarget,
) -> Result<(), LauncherSurfaceError> {
    if !validate_target(target) || !bindings.validates(target) {
        return Err(LauncherSurfaceError::new(target, "validate_binding"));
    }
    let mut last_successful = coordinator
        .last_successful
        .lock()
        .map_err(|_| LauncherSurfaceError::new(target, "coordinator_lock"))?;
    if last_successful
        .as_ref()
        .is_some_and(|snapshot| snapshot.key == target.key())
    {
        return Ok(());
    }
    let work_area = window
        .current_work_area()
        .map_err(|_| LauncherSurfaceError::new(target, "work_area"))?;
    let next = policy_for_target(target, work_area)
        .map_err(|operation| LauncherSurfaceError::new(target, operation))?;
    let current_size = window
        .current_logical_size()
        .map_err(|_| LauncherSurfaceError::new(target, "current_size"))?;
    let mut previous = last_successful
        .clone()
        .unwrap_or_else(|| PresentationSnapshot {
            key: "home".to_owned(),
            requested: LogicalDimensions::new(LAUNCHER_WIDTH, HOME_HEIGHT),
            size: LogicalDimensions::new(LAUNCHER_WIDTH, HOME_HEIGHT),
            minimum: LogicalDimensions::new(LAUNCHER_WIDTH, HOME_HEIGHT),
            maximum: LogicalDimensions::new(LAUNCHER_WIDTH, HOME_HEIGHT),
            resizable: false,
        });
    previous.size = current_size;

    let submitted_resizable = last_successful
        .as_ref()
        .is_some_and(|state| state.resizable)
        || coordinator.resizable_uncertain.load(Ordering::Relaxed);
    if let Err(operation) = apply_snapshot(window, &next, work_area, submitted_resizable, false) {
        if operation == "current_resizable" {
            return Err(LauncherSurfaceError::new(target, operation));
        }
        if apply_snapshot(
            window,
            &previous,
            work_area,
            submitted_resizable || next.resizable,
            true,
        )
        .is_err()
        {
            // An incomplete rollback must not make a repeated target look done.
            *last_successful = None;
            coordinator
                .resizable_uncertain
                .store(true, Ordering::Relaxed);
            let _ = window.set_resizable(false);
            return Err(LauncherSurfaceError::new(target, "rollback"));
        }
        coordinator
            .resizable_uncertain
            .store(false, Ordering::Relaxed);
        return Err(LauncherSurfaceError::new(target, operation));
    }
    coordinator
        .resizable_uncertain
        .store(false, Ordering::Relaxed);
    *last_successful = Some(next);
    Ok(())
}

fn refresh_environment<W: LauncherSurfaceWindow>(
    coordinator: &LauncherSurfaceCoordinator,
    window: &W,
) -> Result<(), &'static str> {
    let mut last_successful = coordinator
        .last_successful
        .lock()
        .map_err(|_| "coordinator_lock")?;
    let Some(previous) = last_successful.clone() else {
        return Ok(());
    };
    let work_area = window.current_work_area().map_err(|_| "work_area")?;
    let hard_minimum = LogicalDimensions::new(HARD_MIN_WIDTH, HARD_MIN_HEIGHT);
    let maximum = LogicalDimensions::new(
        work_area.width.min(HARD_MAX_WIDTH),
        work_area.height.min(HARD_MAX_HEIGHT),
    );
    if maximum.width < hard_minimum.width || maximum.height < hard_minimum.height {
        return Err("work_area");
    }
    let current_size = window.current_logical_size().map_err(|_| "current_size")?;
    let desired = if previous.resizable {
        current_size
    } else {
        previous.requested
    };
    let size = desired.clamp(hard_minimum, maximum);
    let next = PresentationSnapshot {
        key: previous.key.clone(),
        requested: previous.requested,
        size,
        minimum: if previous.resizable {
            hard_minimum
        } else {
            size
        },
        maximum: if previous.resizable { maximum } else { size },
        resizable: previous.resizable,
    };
    if let Err(operation) = apply_snapshot(window, &next, work_area, previous.resizable, false) {
        if operation == "current_resizable" {
            return Err(operation);
        }
        if apply_snapshot(window, &previous, work_area, previous.resizable, true).is_err() {
            *last_successful = None;
            coordinator
                .resizable_uncertain
                .store(true, Ordering::Relaxed);
            let _ = window.set_resizable(false);
            return Err("rollback");
        }
        coordinator
            .resizable_uncertain
            .store(false, Ordering::Relaxed);
        return Err(operation);
    }
    coordinator
        .resizable_uncertain
        .store(false, Ordering::Relaxed);
    *last_successful = Some(next);
    Ok(())
}

#[tauri::command]
pub fn set_launcher_surface_mode(
    app: AppHandle,
    target: LauncherSurfaceTarget,
) -> Result<(), LauncherSurfaceError> {
    apply_launcher_surface_target(&app, target)
}

pub fn apply_launcher_surface_target<R: Runtime>(
    app: &AppHandle<R>,
    target: LauncherSurfaceTarget,
) -> Result<(), LauncherSurfaceError> {
    let coordinator: State<'_, LauncherSurfaceCoordinator> = app.state();
    let manager: State<'_, Arc<PluginManager>> = app.state();
    let window = app
        .get_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| LauncherSurfaceError::new(&target, "window_lookup"))?;
    transition(&coordinator, &window, manager.inner().as_ref(), &target)
}

pub fn setup_launcher_surface<R: Runtime>(app: &AppHandle<R>) {
    assert!(app.manage(LauncherSurfaceCoordinator::default()));
    let Some(window) = app.get_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let app = app.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::Moved(_) | WindowEvent::ScaleFactorChanged { .. }
        ) {
            let coordinator: State<'_, LauncherSurfaceCoordinator> = app.state();
            let Some(window) = app.get_window(MAIN_WINDOW_LABEL) else {
                return;
            };
            if let Err(operation) = refresh_environment(&coordinator, &window) {
                eprintln!("launcher surface environment refresh failed at {operation}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        cell::{Cell, RefCell},
        collections::{HashMap, VecDeque},
    };

    struct FakeBindings(bool);

    impl LauncherSurfaceBindingResolver for FakeBindings {
        fn validates(&self, target: &LauncherSurfaceTarget) -> bool {
            !matches!(target, LauncherSurfaceTarget::PluginPage { .. }) || self.0
        }
    }

    #[derive(Clone, Copy)]
    enum Mutation {
        Size(LogicalDimensions),
        Minimum(LogicalDimensions),
        Maximum(LogicalDimensions),
        Resizable(bool),
    }

    struct FakeWindow {
        size: RefCell<LogicalDimensions>,
        work_area: RefCell<LogicalDimensions>,
        minimum: RefCell<LogicalDimensions>,
        maximum: RefCell<LogicalDimensions>,
        resizable: Cell<bool>,
        queued: Cell<bool>,
        pending: RefCell<VecDeque<Mutation>>,
        // Surface operations own the complete window, never the Host/Child
        // responder or lifecycle. Removed Child identities stay removed.
        responder: Cell<Option<&'static str>>,
        child_attached: Cell<bool>,
        operations: RefCell<Vec<String>>,
        operation_counts: RefCell<HashMap<&'static str, usize>>,
        failures: RefCell<VecDeque<String>>,
    }

    impl FakeWindow {
        fn new(work_area: LogicalDimensions) -> Self {
            Self {
                size: RefCell::new(LogicalDimensions::new(LAUNCHER_WIDTH, HOME_HEIGHT)),
                work_area: RefCell::new(work_area),
                minimum: RefCell::new(LogicalDimensions::new(LAUNCHER_WIDTH, HOME_HEIGHT)),
                maximum: RefCell::new(LogicalDimensions::new(LAUNCHER_WIDTH, HOME_HEIGHT)),
                resizable: Cell::new(false),
                queued: Cell::new(false),
                pending: RefCell::new(VecDeque::new()),
                responder: Cell::new(Some("host_input")),
                child_attached: Cell::new(false),
                operations: RefCell::new(Vec::new()),
                operation_counts: RefCell::new(HashMap::new()),
                failures: RefCell::new(VecDeque::new()),
            }
        }

        fn record(&self, operation: &'static str) -> Result<(), String> {
            self.operations.borrow_mut().push(operation.to_owned());
            let count = {
                let mut counts = self.operation_counts.borrow_mut();
                let count = counts.entry(operation).or_default();
                *count += 1;
                *count
            };
            let specific = format!("{operation}:{count}");
            if self
                .failures
                .borrow()
                .front()
                .is_some_and(|failure| failure == operation || failure == &specific)
            {
                self.failures.borrow_mut().pop_front();
                Err("private native detail".to_owned())
            } else {
                Ok(())
            }
        }

        fn apply(&self, mutation: Mutation) {
            match mutation {
                Mutation::Size(size) => *self.size.borrow_mut() = size,
                Mutation::Minimum(size) => *self.minimum.borrow_mut() = size,
                Mutation::Maximum(size) => *self.maximum.borrow_mut() = size,
                Mutation::Resizable(value) => self.resizable.set(value),
            }
        }

        fn mutate(&self, operation: &'static str, mutation: Mutation) -> Result<(), String> {
            self.record(operation)?;
            if self.queued.get() {
                self.pending.borrow_mut().push_back(mutation);
            } else {
                self.apply(mutation);
            }
            let count = self.operation_counts.borrow()[operation];
            if self
                .failures
                .borrow()
                .front()
                .is_some_and(|failure| failure == &format!("{operation}:{count}:after"))
            {
                self.failures.borrow_mut().pop_front();
                return Err("private partial native detail".to_owned());
            }
            Ok(())
        }

        fn drain(&self) {
            while let Some(mutation) = self.pending.borrow_mut().pop_front() {
                self.apply(mutation);
            }
        }

        fn reset_operations(&self) {
            self.operations.borrow_mut().clear();
            self.operation_counts.borrow_mut().clear();
        }

        fn assert_snapshot(&self, snapshot: &PresentationSnapshot) {
            assert_eq!(*self.size.borrow(), snapshot.size);
            assert_eq!(*self.minimum.borrow(), snapshot.minimum);
            assert_eq!(*self.maximum.borrow(), snapshot.maximum);
            assert_eq!(self.resizable.get(), snapshot.resizable);
        }
    }

    impl LauncherSurfaceWindow for FakeWindow {
        fn current_resizable(&self) -> Result<bool, String> {
            self.record("current_resizable")?;
            Ok(self.resizable.get())
        }

        fn current_logical_size(&self) -> Result<LogicalDimensions, String> {
            self.record("current_size")?;
            Ok(*self.size.borrow())
        }

        fn current_work_area(&self) -> Result<LogicalDimensions, String> {
            self.record("work_area")?;
            Ok(*self.work_area.borrow())
        }

        fn set_resizable(&self, resizable: bool) -> Result<(), String> {
            self.mutate(
                if resizable {
                    "set_resizable_true"
                } else {
                    "set_resizable_false"
                },
                Mutation::Resizable(resizable),
            )
        }

        fn set_min_size(&self, size: LogicalDimensions) -> Result<(), String> {
            self.mutate("set_min_size", Mutation::Minimum(size))
        }

        fn set_max_size(&self, size: LogicalDimensions) -> Result<(), String> {
            self.mutate("set_max_size", Mutation::Maximum(size))
        }

        fn set_logical_size(&self, size: LogicalDimensions) -> Result<(), String> {
            self.mutate("set_size", Mutation::Size(size))
        }
    }

    fn plugin_target(
        owner: &str,
        page: &str,
        attempt: u32,
        width: u32,
        height: u32,
        resizable: bool,
    ) -> LauncherSurfaceTarget {
        LauncherSurfaceTarget::PluginPage {
            owner_id: owner.to_owned(),
            page_id: page.to_owned(),
            page_attempt_id: format!("page_attempt_{attempt}"),
            initial_size: LauncherLogicalSize { width, height },
            resizable,
        }
    }

    #[test]
    fn tagged_targets_apply_safe_order_and_fixed_host_policies() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &LauncherSurfaceTarget::Search,
        )
        .unwrap();
        assert_eq!(*window.size.borrow(), LogicalDimensions::new(650.0, 480.0));
        assert_eq!(
            &window.operations.borrow()[3..],
            [
                "set_min_size",
                "set_max_size",
                "set_size",
                "set_min_size",
                "set_max_size"
            ]
        );
    }

    #[test]
    fn plugin_size_is_clamped_to_work_area_and_resizable_is_applied_last() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(700.0, 500.0));
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &plugin_target("com.acme.a", "main", 1, 1200, 900, true),
        )
        .unwrap();
        assert_eq!(*window.size.borrow(), LogicalDimensions::new(700.0, 500.0));
        assert_eq!(
            window.operations.borrow().last().map(String::as_str),
            Some("set_resizable_true")
        );
    }

    #[test]
    fn same_attempt_retains_user_size_while_fresh_attempt_and_a_to_b_reset() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        let a = plugin_target("com.acme.a", "main", 1, 800, 600, true);
        transition(&coordinator, &window, &FakeBindings(true), &a).unwrap();
        *window.size.borrow_mut() = LogicalDimensions::new(960.0, 720.0);
        let operation_count = window.operations.borrow().len();
        transition(&coordinator, &window, &FakeBindings(true), &a).unwrap();
        assert_eq!(window.operations.borrow().len(), operation_count);
        assert_eq!(*window.size.borrow(), LogicalDimensions::new(960.0, 720.0));

        let b = plugin_target("com.acme.b", "main", 2, 720, 540, false);
        transition(&coordinator, &window, &FakeBindings(true), &b).unwrap();
        assert_eq!(*window.size.borrow(), LogicalDimensions::new(720.0, 540.0));
        let reopened = plugin_target("com.acme.a", "main", 3, 800, 600, true);
        transition(&coordinator, &window, &FakeBindings(true), &reopened).unwrap();
        assert_eq!(*window.size.borrow(), LogicalDimensions::new(800.0, 600.0));
    }

    #[test]
    fn home_restores_fixed_surface_after_user_resized_plugin() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &plugin_target("com.acme.a", "main", 1, 800, 600, true),
        )
        .unwrap();
        *window.size.borrow_mut() = LogicalDimensions::new(1000.0, 800.0);
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &LauncherSurfaceTarget::Home,
        )
        .unwrap();
        assert_eq!(*window.size.borrow(), LogicalDimensions::new(650.0, 320.0));
        assert!(!window.resizable.get());
        assert_eq!(window.operations.borrow().last().unwrap(), "set_max_size");
    }

    #[test]
    fn monitor_or_scale_refresh_clamps_current_user_size_without_resetting_attempt() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &plugin_target("com.acme.a", "main", 1, 800, 600, true),
        )
        .unwrap();
        *window.size.borrow_mut() = LogicalDimensions::new(960.0, 720.0);
        *window.work_area.borrow_mut() = LogicalDimensions::new(700.0, 500.0);

        refresh_environment(&coordinator, &window).unwrap();
        assert_eq!(*window.size.borrow(), LogicalDimensions::new(700.0, 500.0));
        assert_eq!(
            window.operations.borrow().last().map(String::as_str),
            Some("set_resizable_true")
        );
    }

    #[test]
    fn invalid_or_unbound_plugin_targets_fail_before_native_mutation() {
        for target in [
            plugin_target("invalid", "main", 1, 800, 600, true),
            plugin_target("com.acme.a", "main", 0, 800, 600, true),
            plugin_target("com.acme.a", "main", 1, 319, 600, true),
        ] {
            let coordinator = LauncherSurfaceCoordinator::default();
            let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
            let error =
                transition(&coordinator, &window, &FakeBindings(false), &target).unwrap_err();
            assert_eq!(error.operation, "validate_binding");
            assert!(window.operations.borrow().is_empty());
        }
    }

    #[test]
    fn every_native_setter_failure_rolls_back_and_reports_safe_stage() {
        for (failure, expected_stage) in [
            ("set_min_size:1", "set_wide_min_size"),
            ("set_max_size:1", "set_wide_max_size"),
            ("set_size:1", "set_size"),
            ("set_min_size:2", "set_target_min_size"),
            ("set_max_size:2", "set_target_max_size"),
            ("set_resizable_true:1", "set_target_resizable"),
        ] {
            let coordinator = LauncherSurfaceCoordinator::default();
            let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
            window.failures.borrow_mut().push_back(failure.to_owned());
            let error = transition(
                &coordinator,
                &window,
                &FakeBindings(true),
                &plugin_target("com.acme.a", "main", 1, 800, 600, true),
            )
            .unwrap_err();
            assert_eq!(error.operation, expected_stage);
            window.assert_snapshot(
                &policy_for_target(&LauncherSurfaceTarget::Home, *window.work_area.borrow())
                    .unwrap(),
            );
            assert!(!error.message.contains("private native detail"));
        }
    }

    #[test]
    fn rollback_failure_is_safe_and_explicit() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        window
            .failures
            .borrow_mut()
            .extend(["set_size".to_owned(), "set_resizable_false".to_owned()]);
        let error = transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &plugin_target("com.acme.a", "main", 1, 800, 600, true),
        )
        .unwrap_err();
        assert_eq!(error.operation, "rollback");
        assert_eq!(
            window.operations.borrow().last().map(String::as_str),
            Some("set_resizable_false")
        );
    }

    #[test]
    fn fixed_transitions_and_environment_refresh_never_submit_resizable_messages() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        for target in [
            LauncherSurfaceTarget::Home,
            LauncherSurfaceTarget::Search,
            LauncherSurfaceTarget::HostPage,
            LauncherSurfaceTarget::Home,
        ] {
            transition(&coordinator, &window, &FakeBindings(true), &target).unwrap();
            window.assert_snapshot(
                coordinator
                    .last_successful
                    .lock()
                    .unwrap()
                    .as_ref()
                    .unwrap(),
            );
        }
        *window.work_area.borrow_mut() = LogicalDimensions::new(600.0, 300.0);
        refresh_environment(&coordinator, &window).unwrap();
        window.assert_snapshot(
            coordinator
                .last_successful
                .lock()
                .unwrap()
                .as_ref()
                .unwrap(),
        );
        assert!(!window
            .operations
            .borrow()
            .iter()
            .any(|op| op.starts_with("set_resizable")));
        assert_eq!(window.responder.get(), Some("host_input"));
    }

    #[test]
    fn queued_guard_is_followed_by_required_final_state_without_a_stale_reread() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        let plugin = plugin_target("com.acme.a", "main", 1, 800, 600, true);
        transition(&coordinator, &window, &FakeBindings(true), &plugin).unwrap();
        window.reset_operations();
        window.queued.set(true);
        refresh_environment(&coordinator, &window).unwrap();
        assert!(window.resizable.get());
        assert_eq!(
            window
                .operations
                .borrow()
                .iter()
                .filter(|op| op.starts_with("set_resizable"))
                .cloned()
                .collect::<Vec<_>>(),
            ["set_resizable_false", "set_resizable_true"]
        );
        assert_eq!(window.operation_counts.borrow()["current_resizable"], 1);
        window.drain();
        window.assert_snapshot(
            coordinator
                .last_successful
                .lock()
                .unwrap()
                .as_ref()
                .unwrap(),
        );
    }

    #[test]
    fn queued_plugin_enable_is_guarded_before_a_subsequent_fixed_target() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        window.queued.set(true);
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &plugin_target("com.acme.a", "main", 1, 800, 600, true),
        )
        .unwrap();
        assert!(!window.resizable.get());
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &LauncherSurfaceTarget::Home,
        )
        .unwrap();
        window.drain();
        window.assert_snapshot(
            coordinator
                .last_successful
                .lock()
                .unwrap()
                .as_ref()
                .unwrap(),
        );
        assert_eq!(
            window
                .operations
                .borrow()
                .iter()
                .filter(|op| op.starts_with("set_resizable"))
                .cloned()
                .collect::<Vec<_>>(),
            ["set_resizable_true", "set_resizable_false"]
        );
    }

    #[test]
    fn failed_state_reads_do_not_mutate_window_or_success_cache() {
        for failure in ["work_area", "current_size", "current_resizable"] {
            for refresh in [false, true] {
                let coordinator = LauncherSurfaceCoordinator::default();
                let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
                transition(
                    &coordinator,
                    &window,
                    &FakeBindings(true),
                    &LauncherSurfaceTarget::Home,
                )
                .unwrap();
                let previous = coordinator.last_successful.lock().unwrap().clone().unwrap();
                window.reset_operations();
                window.failures.borrow_mut().push_back(failure.to_owned());
                if refresh {
                    assert_eq!(refresh_environment(&coordinator, &window), Err(failure));
                } else {
                    let error = transition(
                        &coordinator,
                        &window,
                        &FakeBindings(true),
                        &LauncherSurfaceTarget::Search,
                    )
                    .unwrap_err();
                    assert_eq!(error.operation, failure);
                    assert!(!serde_json::to_string(&error).unwrap().contains("private"));
                }
                window.assert_snapshot(&previous);
                assert_eq!(
                    coordinator.last_successful.lock().unwrap().as_ref(),
                    Some(&previous)
                );
                assert!(!window
                    .operations
                    .borrow()
                    .iter()
                    .any(|op| op.starts_with("set_")));
            }
        }
    }

    #[test]
    fn delivery_and_partial_application_failures_restore_complete_snapshot() {
        let stages = [
            ("set_resizable_false:1", "set_resizable_guard"),
            ("set_min_size:1", "set_wide_min_size"),
            ("set_max_size:1", "set_wide_max_size"),
            ("set_size:1", "set_size"),
            ("set_min_size:2", "set_target_min_size"),
            ("set_max_size:2", "set_target_max_size"),
            ("set_resizable_true:1", "set_target_resizable"),
        ];
        for queued in [false, true] {
            for partial in [false, true] {
                for (failure, stage) in stages {
                    let coordinator = LauncherSurfaceCoordinator::default();
                    let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
                    let plugin = plugin_target("com.acme.a", "main", 1, 800, 600, true);
                    transition(&coordinator, &window, &FakeBindings(true), &plugin).unwrap();
                    let previous = coordinator.last_successful.lock().unwrap().clone().unwrap();
                    window.reset_operations();
                    window.queued.set(queued);
                    window.failures.borrow_mut().push_back(if partial {
                        format!("{failure}:after")
                    } else {
                        failure.to_owned()
                    });
                    let error = transition(
                        &coordinator,
                        &window,
                        &FakeBindings(true),
                        &plugin_target("com.acme.b", "main", 2, 720, 540, true),
                    )
                    .unwrap_err();
                    assert_eq!(
                        error.operation, stage,
                        "{failure}, queued={queued}, partial={partial}"
                    );
                    window.drain();
                    window.assert_snapshot(&previous);
                    assert_eq!(
                        coordinator.last_successful.lock().unwrap().as_ref(),
                        Some(&previous)
                    );
                }
            }
        }
    }

    #[test]
    fn queued_partial_final_enable_cannot_escape_fixed_rollback() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &LauncherSurfaceTarget::Home,
        )
        .unwrap();
        let previous = coordinator.last_successful.lock().unwrap().clone().unwrap();
        window.reset_operations();
        window.queued.set(true);
        window
            .failures
            .borrow_mut()
            .push_back("set_resizable_true:1:after".to_owned());
        let error = transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &plugin_target("com.acme.a", "main", 1, 800, 600, true),
        )
        .unwrap_err();
        assert_eq!(error.operation, "set_target_resizable");
        assert_eq!(
            window.operations.borrow().last().unwrap(),
            "set_resizable_false"
        );
        window.drain();
        window.assert_snapshot(&previous);
    }

    #[test]
    fn every_rollback_failure_invalidates_cache_and_allows_the_same_target_to_repair() {
        for (forward, rollback) in [
            ("set_resizable_false:1", "set_resizable_false:2"),
            ("set_size:1", "current_resizable:2"),
            ("set_size:1", "set_min_size:2"),
            ("set_size:1", "set_max_size:2"),
            ("set_size:1", "set_size:2"),
            ("set_size:1", "set_min_size:3"),
            ("set_size:1", "set_max_size:3"),
            ("set_size:1", "set_resizable_true:1"),
        ] {
            for refresh in [false, true] {
                let coordinator = LauncherSurfaceCoordinator::default();
                let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
                let plugin = plugin_target("com.acme.a", "main", 1, 800, 600, true);
                transition(&coordinator, &window, &FakeBindings(true), &plugin).unwrap();
                window.reset_operations();
                window
                    .failures
                    .borrow_mut()
                    .extend([forward.to_owned(), rollback.to_owned()]);
                if refresh {
                    assert_eq!(refresh_environment(&coordinator, &window), Err("rollback"));
                } else {
                    assert_eq!(
                        transition(
                            &coordinator,
                            &window,
                            &FakeBindings(true),
                            &LauncherSurfaceTarget::Home
                        )
                        .unwrap_err()
                        .operation,
                        "rollback"
                    );
                }
                assert!(!window.resizable.get());
                assert!(coordinator.last_successful.lock().unwrap().is_none());
                let count = window.operations.borrow().len();
                transition(&coordinator, &window, &FakeBindings(true), &plugin).unwrap();
                assert!(window.operations.borrow().len() > count);
                window.assert_snapshot(
                    coordinator
                        .last_successful
                        .lock()
                        .unwrap()
                        .as_ref()
                        .unwrap(),
                );
            }
        }
    }

    #[test]
    fn failed_queued_rollback_and_emergency_delivery_are_repaired_after_cache_invalidation() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &LauncherSurfaceTarget::Home,
        )
        .unwrap();
        window.reset_operations();
        window.queued.set(true);
        window.failures.borrow_mut().extend([
            "set_resizable_true:1:after".to_owned(),
            "set_resizable_false:1".to_owned(),
            "set_resizable_false:2".to_owned(),
        ]);
        assert_eq!(
            transition(
                &coordinator,
                &window,
                &FakeBindings(true),
                &plugin_target("com.acme.a", "main", 1, 800, 600, true)
            )
            .unwrap_err()
            .operation,
            "rollback"
        );
        assert!(coordinator.last_successful.lock().unwrap().is_none());
        assert!(!window.resizable.get());
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &LauncherSurfaceTarget::Home,
        )
        .unwrap();
        window.drain();
        window.assert_snapshot(
            coordinator
                .last_successful
                .lock()
                .unwrap()
                .as_ref()
                .unwrap(),
        );
        assert!(!coordinator.resizable_uncertain.load(Ordering::Relaxed));
    }

    #[test]
    fn attached_and_removed_child_identities_are_never_focused_by_surface_configuration() {
        let coordinator = LauncherSurfaceCoordinator::default();
        let window = FakeWindow::new(LogicalDimensions::new(1920.0, 1040.0));
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &plugin_target("com.acme.a", "main", 1, 800, 600, true),
        )
        .unwrap();
        window.child_attached.set(true);
        window.responder.set(Some("current_child_input"));
        transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &LauncherSurfaceTarget::Home,
        )
        .unwrap();
        assert!(window.child_attached.get());
        assert_eq!(window.responder.get(), Some("current_child_input"));
        assert!(!window.resizable.get());
        window.child_attached.set(false);
        window.responder.set(None);
        window.reset_operations();
        window
            .failures
            .borrow_mut()
            .push_back("set_size:1:after".to_owned());
        assert!(transition(
            &coordinator,
            &window,
            &FakeBindings(true),
            &LauncherSurfaceTarget::Search
        )
        .is_err());
        assert_eq!(window.responder.get(), None);
        assert!(!window.child_attached.get());
        window.assert_snapshot(
            coordinator
                .last_successful
                .lock()
                .unwrap()
                .as_ref()
                .unwrap(),
        );
    }

    #[test]
    fn tagged_payload_rejects_unknown_variants_and_fields() {
        assert!(serde_json::from_value::<LauncherSurfaceTarget>(
            serde_json::json!({"kind": "page"})
        )
        .is_err());
        assert!(serde_json::from_value::<LauncherSurfaceTarget>(
            serde_json::json!({"kind": "home", "width": 800})
        )
        .is_err());
        assert!(serde_json::from_value::<LauncherSurfaceTarget>(serde_json::json!({
            "kind": "plugin_page", "owner_id": "com.acme.a", "page_id": "main", "page_attempt_id": "page_attempt_1",
            "initial_size": {"width": 800, "height": 600}, "resizable": true, "monitor": "primary"
        })).is_err());
    }

    #[test]
    fn errors_serialize_only_safe_stable_fields() {
        let error = LauncherSurfaceError::new(
            &plugin_target("com.acme.a", "main", 1, 800, 600, true),
            "set_size",
        );
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "launcher_surface_transition_failed",
                "target_kind": "plugin_page",
                "operation": "set_size",
                "message": "The launcher window could not change presentation."
            })
        );
    }

    #[test]
    fn tauri_main_window_starts_home_with_the_hard_envelope() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let main_window = &config["app"]["windows"][0];
        assert_eq!(main_window["label"], "main");
        assert_eq!(main_window["width"], 650);
        assert_eq!(main_window["height"], 320);
        assert_eq!(main_window["minWidth"], 320);
        assert_eq!(main_window["minHeight"], 180);
        assert_eq!(main_window["maxWidth"], 4096);
        assert_eq!(main_window["maxHeight"], 4096);
        assert_eq!(main_window["resizable"], false);
    }

    #[test]
    fn main_window_capability_grants_no_native_resize_command_to_web_content() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        assert_eq!(capability["windows"], serde_json::json!(["main"]));
        assert_eq!(
            capability["permissions"],
            serde_json::json!([
                "core:default",
                "opener:default",
                "core:window:allow-start-dragging"
            ])
        );
    }
}
