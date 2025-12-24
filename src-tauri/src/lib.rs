use tauri::{
  menu::{Menu, MenuItem},
  tray::TrayIconBuilder,
  Manager, Runtime, WindowEvent,
};

fn build_menu<R: Runtime>(app: &tauri::App<R>) -> Result<Menu<R>, tauri::Error> {
  let menu_item_show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
  let menu_item_quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

  let menu = Menu::with_items(app, &[&menu_item_show, &menu_item_quit])?;
  Ok(menu)
}

fn create_tray_icon<R: Runtime>(app: &tauri::App<R>, menu: &Menu<R>) -> Result<(), tauri::Error> {
  TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .menu(menu)
    .show_menu_on_left_click(true)
    .on_menu_event(|app, event| match event.id.as_ref() {
      "show" => {
        print!("show menu item was clicked");
        if let Some(window) = app.get_webview_window("main") {
          window.show().unwrap();
        }
      }
      "quit" => {
        print!("quit menu item was clicked");
        app.exit(0);
      }
      _ => {
        print!("menu item {:?} not handled", event.id);
      }
    })
    .build(app)?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
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

      let menu = build_menu(app)?;
      create_tray_icon(app, &menu)?;

      // get main window and set close behavior
      if let Some(window) = app.get_webview_window("main") {
        // clone window object to avoid ownership problem
        let window_clone = window.clone();

        // use window event listener to handle close event
        window.on_window_event(move |event| {
          match event {
            // listen close event
            WindowEvent::CloseRequested { api, .. } => {
              // prevent default close behavior
              api.prevent_close();

              // hide window
              window_clone.hide().unwrap();
            }
            _ => {}
          }
        });
      }

      #[cfg(desktop)]
      {
        use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
        let show_window_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
        app.handle().plugin(
          tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, _event| {
              if shortcut == &show_window_shortcut {
                if let Some(window) = app.get_webview_window("main") {
                  window.show().unwrap();
                }
              }
            })
            .build(),
        )?;

        app.global_shortcut().register(show_window_shortcut)?;
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
