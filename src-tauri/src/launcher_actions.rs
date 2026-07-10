use std::{error::Error, fmt};

use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LauncherAction {
  Show,
  Hide,
  Toggle,
}

impl LauncherAction {
  pub fn id(self) -> &'static str {
    match self {
      Self::Show => "launcher.show",
      Self::Hide => "launcher.hide",
      Self::Toggle => "launcher.toggle",
    }
  }
}

#[derive(Debug)]
pub enum LauncherActionError {
  MainWindowMissing,
  WindowOperation {
    action: &'static str,
    operation: &'static str,
    source: tauri::Error,
  },
}

impl fmt::Display for LauncherActionError {
  fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::MainWindowMissing => write!(formatter, "main window not found"),
      Self::WindowOperation {
        action,
        operation,
        source,
      } => write!(formatter, "{action} failed during {operation}: {source}"),
    }
  }
}

impl Error for LauncherActionError {
  fn source(&self) -> Option<&(dyn Error + 'static)> {
    match self {
      Self::MainWindowMissing => None,
      Self::WindowOperation { source, .. } => Some(source),
    }
  }
}

pub fn execute_launcher_action<R: Runtime>(
  app: &AppHandle<R>,
  action: LauncherAction,
) -> Result<(), LauncherActionError> {
  let window = app
    .get_webview_window(MAIN_WINDOW_LABEL)
    .ok_or(LauncherActionError::MainWindowMissing)?;

  execute_window_action(&window, action)
}

pub fn execute_window_action<R: Runtime>(
  window: &WebviewWindow<R>,
  action: LauncherAction,
) -> Result<(), LauncherActionError> {
  match action {
    LauncherAction::Show => show_window(window),
    LauncherAction::Hide => hide_window(window),
    LauncherAction::Toggle => {
      if window
        .is_visible()
        .map_err(|source| LauncherActionError::WindowOperation {
          action: action.id(),
          operation: "is_visible",
          source,
        })?
      {
        hide_window(window)
      } else {
        show_window(window)
      }
    }
  }
}

fn show_window<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), LauncherActionError> {
  window
    .unminimize()
    .map_err(|source| LauncherActionError::WindowOperation {
      action: LauncherAction::Show.id(),
      operation: "unminimize",
      source,
    })?;

  window.show().map_err(|source| LauncherActionError::WindowOperation {
    action: LauncherAction::Show.id(),
    operation: "show",
    source,
  })?;

  window
    .set_focus()
    .map_err(|source| LauncherActionError::WindowOperation {
      action: LauncherAction::Show.id(),
      operation: "set_focus",
      source,
    })
}

fn hide_window<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), LauncherActionError> {
  window.hide().map_err(|source| LauncherActionError::WindowOperation {
    action: LauncherAction::Hide.id(),
    operation: "hide",
    source,
  })
}
