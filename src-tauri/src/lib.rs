pub mod app_preferences;
pub mod launcher_action_collections;
pub mod launcher_surface;
pub mod launcher_window;
pub mod plugin_manager;
pub mod plugin_manifest;
pub mod plugin_registration;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_preferences::read_app_preferences,
            app_preferences::write_app_preferences,
            launcher_action_collections::read_launcher_action_collections,
            launcher_action_collections::record_launcher_action_use,
            launcher_action_collections::set_launcher_action_pinned,
            launcher_surface::set_launcher_surface_mode,
            launcher_window::hide_launcher,
            plugin_registration::read_plugin_registration_detail,
            plugin_registration::read_plugin_registration_snapshot
        ])
        .setup(|app| {
            plugin_manager::setup_plugin_manager(app.handle());
            launcher_window::setup_launcher_window(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
