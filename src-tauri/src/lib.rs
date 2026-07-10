mod launcher_actions;
mod menu;
mod shortcut;
use launcher_actions::{execute_window_action, LauncherAction};
use tauri::{Manager, WindowEvent};

pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // create tray menu
      menu::create_tray_menu(app)?;

      // register global shortcut
      shortcut::install_global_shortcut_plugin(app)?;
      shortcut::register_default_shortcuts(app.handle())?;

      // get main window and set close behavior
      if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.set_always_on_top(true) {
          eprint!("set always on top failed: {:?}", e);
        }

        // clone window object to avoid ownership problem
        let window_clone = window.clone();

        // use window event listener to handle close event
        window.on_window_event(move |event| {
          match event {
            // listen close event
            WindowEvent::CloseRequested { api, .. } => {
              // prevent default close behavior
              println!("close requested");
              api.prevent_close();

              if let Err(e) = execute_window_action(&window_clone, LauncherAction::Hide) {
                eprintln!("hide window on close failed: {:?}", e);
              }
            }
            WindowEvent::Focused(false) => {
              if let Err(e) = execute_window_action(&window_clone, LauncherAction::Hide) {
                eprintln!("hide window on blur failed: {:?}", e);
              }
            }
            _ => {}
          }
        });
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
