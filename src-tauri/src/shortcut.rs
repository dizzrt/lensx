use serde::Serialize;
use std::{error::Error, fmt, sync::Mutex};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState};

use crate::launcher_actions::{execute_launcher_action, LauncherAction, LauncherActionError};

#[derive(Clone, Copy, Debug)]
pub struct ShortcutBinding {
  pub id: &'static str,
  pub shortcut: Shortcut,
  pub action: LauncherAction,
  pub enabled: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ShortcutBindingView {
  pub id: String,
  pub shortcut: String,
  pub action_id: String,
  pub enabled: bool,
}

impl ShortcutBinding {
  pub fn shortcut_label(self) -> String {
    self.shortcut.into_string()
  }
}

#[derive(Debug, Default)]
pub struct ShortcutManager {
  registered_bindings: Vec<ShortcutBinding>,
}

impl ShortcutManager {
  #[allow(dead_code)]
  pub fn registered_bindings(&self) -> &[ShortcutBinding] {
    &self.registered_bindings
  }

  pub fn apply_bindings<R: Runtime>(
    &mut self,
    app: &AppHandle<R>,
    bindings: Vec<ShortcutBinding>,
  ) -> Result<(), ShortcutError> {
    self.unregister_all(app)?;

    for binding in bindings {
      if !binding.enabled {
        continue;
      }

      if self.is_shortcut_registered(app, binding.shortcut) {
        return Err(ShortcutError::Unavailable {
          binding_id: binding.id,
          shortcut: binding.shortcut_label(),
        });
      }

      app
        .global_shortcut()
        .register(binding.shortcut)
        .map_err(|source| ShortcutError::Register {
          binding_id: binding.id,
          shortcut: binding.shortcut_label(),
          source,
        })?;

      self.registered_bindings.push(binding);
    }

    Ok(())
  }

  pub fn unregister_all<R: Runtime>(&mut self, app: &AppHandle<R>) -> Result<(), ShortcutError> {
    for binding in self.registered_bindings.drain(..) {
      app
        .global_shortcut()
        .unregister(binding.shortcut)
        .map_err(|source| ShortcutError::Unregister {
          binding_id: binding.id,
          shortcut: binding.shortcut_label(),
          source,
        })?;
    }

    Ok(())
  }

  pub fn is_shortcut_registered<R: Runtime>(&self, app: &AppHandle<R>, shortcut: Shortcut) -> bool {
    app.global_shortcut().is_registered(shortcut)
  }

  #[allow(dead_code)]
  pub fn is_shortcut_available<R: Runtime>(&self, app: &AppHandle<R>, shortcut: Shortcut) -> bool {
    !self.is_shortcut_registered(app, shortcut)
  }

  pub fn action_for_shortcut(&self, shortcut: &Shortcut) -> Option<LauncherAction> {
    self
      .registered_bindings
      .iter()
      .find(|binding| binding.shortcut == *shortcut && binding.enabled)
      .map(|binding| binding.action)
  }
}

#[derive(Debug)]
pub enum ShortcutError {
  LockPoisoned,
  Register {
    binding_id: &'static str,
    shortcut: String,
    source: tauri_plugin_global_shortcut::Error,
  },
  Unregister {
    binding_id: &'static str,
    shortcut: String,
    source: tauri_plugin_global_shortcut::Error,
  },
  Unavailable {
    binding_id: &'static str,
    shortcut: String,
  },
  Action {
    action: &'static str,
    source: LauncherActionError,
  },
  Plugin(tauri::Error),
}

impl fmt::Display for ShortcutError {
  fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::LockPoisoned => write!(formatter, "shortcut manager state lock poisoned"),
      Self::Register {
        binding_id,
        shortcut,
        source,
      } => write!(
        formatter,
        "failed to register shortcut binding {binding_id} ({shortcut}): {source}"
      ),
      Self::Unregister {
        binding_id,
        shortcut,
        source,
      } => write!(
        formatter,
        "failed to unregister shortcut binding {binding_id} ({shortcut}): {source}"
      ),
      Self::Unavailable { binding_id, shortcut } => write!(
        formatter,
        "shortcut binding {binding_id} ({shortcut}) is already registered"
      ),
      Self::Action { action, source } => {
        write!(formatter, "failed to execute shortcut action {action}: {source}")
      }
      Self::Plugin(source) => write!(formatter, "failed to install global shortcut plugin: {source}"),
    }
  }
}

impl Error for ShortcutError {
  fn source(&self) -> Option<&(dyn Error + 'static)> {
    match self {
      Self::Register { source, .. } => Some(source),
      Self::Unregister { source, .. } => Some(source),
      Self::Action { source, .. } => Some(source),
      Self::Plugin(source) => Some(source),
      Self::LockPoisoned | Self::Unavailable { .. } => None,
    }
  }
}

pub fn default_shortcut_bindings() -> Vec<ShortcutBinding> {
  vec![ShortcutBinding {
    id: "launcher.toggle",
    shortcut: Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space),
    action: LauncherAction::Toggle,
    enabled: true,
  }]
}

#[tauri::command]
pub fn get_default_shortcut_bindings() -> Vec<ShortcutBindingView> {
  default_shortcut_bindings()
    .into_iter()
    .map(|binding| ShortcutBindingView {
      id: binding.id.to_string(),
      shortcut: binding.shortcut_label(),
      action_id: binding.action.id().to_string(),
      enabled: binding.enabled,
    })
    .collect()
}

pub fn install_global_shortcut_plugin<R: Runtime>(app: &tauri::App<R>) -> Result<(), ShortcutError> {
  app.manage(Mutex::new(ShortcutManager::default()));

  app
    .handle()
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| handle_shortcut_event(app, shortcut, event))
        .build(),
    )
    .map_err(ShortcutError::Plugin)
}

pub fn register_default_shortcuts<R: Runtime>(app: &AppHandle<R>) -> Result<(), ShortcutError> {
  with_shortcut_manager(app, |manager| manager.apply_bindings(app, default_shortcut_bindings()))
}

fn handle_shortcut_event<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
  if event.state != ShortcutState::Pressed {
    return;
  }

  let action = match with_shortcut_manager(app, |manager| Ok(manager.action_for_shortcut(shortcut)))
    .ok()
    .flatten()
  {
    Some(action) => action,
    None => return,
  };

  if let Err(source) = execute_launcher_action(app, action) {
    eprintln!(
      "{}",
      ShortcutError::Action {
        action: action.id(),
        source,
      }
    );
  }
}

fn with_shortcut_manager<R, T>(
  app: &AppHandle<R>,
  callback: impl FnOnce(&mut ShortcutManager) -> Result<T, ShortcutError>,
) -> Result<T, ShortcutError>
where
  R: Runtime,
{
  let state = app.state::<Mutex<ShortcutManager>>();
  let mut manager = state.lock().map_err(|_| ShortcutError::LockPoisoned)?;
  callback(&mut manager)
}
