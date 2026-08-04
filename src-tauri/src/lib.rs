pub mod app_preferences;
pub mod launcher_action_collections;
pub mod launcher_surface;
pub mod launcher_window;
pub(crate) mod plugin_identity;
pub mod plugin_installation_contract;
pub mod plugin_installer;
pub mod plugin_lifecycle;
pub mod plugin_manager;
pub mod plugin_manifest;
#[doc(hidden)]
pub mod plugin_package_format;
pub mod plugin_registration;
pub mod plugin_replacement_contract;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_preferences::read_app_preferences,
            app_preferences::write_app_preferences,
            launcher_action_collections::read_launcher_action_collections,
            launcher_action_collections::record_launcher_action_use,
            launcher_action_collections::set_launcher_action_pinned,
            launcher_surface::set_launcher_surface_mode,
            launcher_window::hide_launcher,
            plugin_installer::cancel_plugin_replacement,
            plugin_installer::commit_local_plugin_replacement,
            plugin_installer::install_local_plugin,
            plugin_installer::prepare_local_plugin_replacement,
            plugin_lifecycle::set_plugin_enabled,
            plugin_lifecycle::uninstall_plugin,
            plugin_registration::read_plugin_registration_detail,
            plugin_registration::read_plugin_registration_snapshot
        ])
        .setup(|app| {
            let plugin_manager = plugin_manager::setup_plugin_manager(app.handle());
            let plugin_installer =
                plugin_installer::setup_plugin_installer(app.handle(), plugin_manager);
            plugin_lifecycle::setup_plugin_lifecycle(app.handle(), plugin_installer);
            launcher_window::setup_launcher_window(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
