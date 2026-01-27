use tauri::{Manager, Runtime};

pub fn register_global_shortcut<R: Runtime>(app: &tauri::App<R>) -> Result<(), tauri_plugin_global_shortcut::Error> {
  use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

  let shortcut_show_window = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

  app.handle().plugin(
    tauri_plugin_global_shortcut::Builder::new()
      .with_handler(move |app, shortcut, _evnet| {
        if shortcut == &shortcut_show_window {
          if let Some(window) = app.get_webview_window("main") {
            window.show().unwrap();
          }
        }
      })
      .build(),
  )?;

  app.global_shortcut().register(shortcut_show_window)?;
  Ok(())
}
