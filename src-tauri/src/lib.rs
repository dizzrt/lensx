mod menu;
mod shortcut;
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
      shortcut::register_global_shortcut(app)?;

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

              // hide window
              window_clone.hide().unwrap();
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
