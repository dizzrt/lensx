use tauri::{
  menu::{Menu, PredefinedMenuItem},
  tray::TrayIconBuilder,
  Runtime,
};

use crate::launcher_actions::{execute_launcher_action, LauncherAction};

fn build_menu<R: Runtime>(app: &tauri::App<R>) -> Result<Menu<R>, tauri::Error> {
  let hide_item = PredefinedMenuItem::hide(app, Some("Hide"))?;
  let close_item = PredefinedMenuItem::close_window(app, Some("Close"))?;
  let quit_item = PredefinedMenuItem::quit(app, Some("Quit"))?;

  let menu = Menu::with_items(app, &[&hide_item, &close_item, &quit_item])?;
  Ok(menu)
}

pub fn create_tray_menu<R: Runtime>(app: &tauri::App<R>) -> Result<(), tauri::Error> {
  let menu = &build_menu(app)?;

  TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .menu(menu)
    .show_menu_on_left_click(true)
    .on_menu_event(|app, event| match event.id.as_ref() {
      "show" => {
        if let Err(e) = execute_launcher_action(app, LauncherAction::Show) {
          eprintln!("show window from tray menu failed: {:?}", e);
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
