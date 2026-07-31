use crate::launcher_window::MAIN_WINDOW_LABEL;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, LogicalSize, Manager, Runtime, WebviewWindow};

const LAUNCHER_SURFACE_RESIZE_FAILED: &str = "launcher_surface_resize_failed";
pub const LAUNCHER_WIDTH: f64 = 650.0;
pub const HOME_HEIGHT: f64 = 240.0;
pub const SEARCH_HEIGHT: f64 = 480.0;
pub const PAGE_HEIGHT: f64 = 600.0;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LauncherSurfaceMode {
    Home,
    Search,
    Page,
}

impl LauncherSurfaceMode {
    fn name(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::Search => "search",
            Self::Page => "page",
        }
    }

    fn height(self) -> f64 {
        match self {
            Self::Home => HOME_HEIGHT,
            Self::Search => SEARCH_HEIGHT,
            Self::Page => PAGE_HEIGHT,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct LauncherSurfaceError {
    pub code: &'static str,
    pub mode: &'static str,
    pub operation: &'static str,
    pub message: &'static str,
}

impl LauncherSurfaceError {
    fn new(mode: LauncherSurfaceMode, operation: &'static str) -> Self {
        Self {
            code: LAUNCHER_SURFACE_RESIZE_FAILED,
            mode: mode.name(),
            operation,
            message: "The launcher window could not change presentation size.",
        }
    }
}

trait LauncherSurfaceWindow {
    fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String>;
}

impl<R: Runtime> LauncherSurfaceWindow for WebviewWindow<R> {
    fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String> {
        self.set_size(LogicalSize::new(width, height))
            .map_err(|error| error.to_string())
    }
}

fn set_surface_mode<W: LauncherSurfaceWindow>(
    window: &W,
    mode: LauncherSurfaceMode,
) -> Result<(), LauncherSurfaceError> {
    window
        .set_logical_size(LAUNCHER_WIDTH, mode.height())
        .map_err(|_| LauncherSurfaceError::new(mode, "set_size"))
}

#[tauri::command]
pub fn set_launcher_surface_mode(
    app: AppHandle,
    mode: LauncherSurfaceMode,
) -> Result<(), LauncherSurfaceError> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| LauncherSurfaceError::new(mode, "window_lookup"))?;
    set_surface_mode(&window, mode)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct FakeWindow {
        requested_sizes: RefCell<Vec<(f64, f64)>>,
        fail: bool,
    }

    impl LauncherSurfaceWindow for FakeWindow {
        fn set_logical_size(&self, width: f64, height: f64) -> Result<(), String> {
            self.requested_sizes.borrow_mut().push((width, height));
            if self.fail {
                Err("native resize detail".to_owned())
            } else {
                Ok(())
            }
        }
    }

    #[test]
    fn presentation_modes_map_to_fixed_logical_sizes() {
        let window = FakeWindow::default();

        set_surface_mode(&window, LauncherSurfaceMode::Home).expect("home size should succeed");
        set_surface_mode(&window, LauncherSurfaceMode::Search).expect("search size should succeed");
        set_surface_mode(&window, LauncherSurfaceMode::Page).expect("page size should succeed");

        assert_eq!(
            window.requested_sizes.into_inner(),
            vec![
                (LAUNCHER_WIDTH, HOME_HEIGHT),
                (LAUNCHER_WIDTH, SEARCH_HEIGHT),
                (LAUNCHER_WIDTH, PAGE_HEIGHT),
            ]
        );
    }

    #[test]
    fn native_resize_failures_serialize_safe_stable_fields() {
        let window = FakeWindow {
            fail: true,
            ..FakeWindow::default()
        };

        let error = set_surface_mode(&window, LauncherSurfaceMode::Page)
            .expect_err("native resize should fail");

        assert_eq!(
            serde_json::to_value(&error).expect("error should serialize"),
            serde_json::json!({
                "code": "launcher_surface_resize_failed",
                "mode": "page",
                "operation": "set_size",
                "message": "The launcher window could not change presentation size."
            })
        );
        assert!(!error.message.contains("native resize detail"));
    }
}
