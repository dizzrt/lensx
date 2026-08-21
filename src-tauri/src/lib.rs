pub mod app_preferences;
pub mod launcher_action_collections;
pub mod launcher_surface;
pub mod launcher_window;
pub(crate) mod macos_launcher;
use std::sync::Arc;
use tauri::Manager;
pub(crate) mod frame_aware_navigation_policy;
#[cfg(target_os = "macos")]
pub(crate) mod frame_aware_navigation_setup;
#[doc(hidden)]
pub mod plugin_child_webview_adapter;
pub(crate) mod plugin_child_webview_host_dispatcher;
pub(crate) mod plugin_child_webview_presentation;
pub(crate) mod plugin_child_webview_rpc;
pub(crate) mod plugin_child_webview_service;
pub(crate) mod plugin_child_webview_slot;
pub mod plugin_data_management;
#[cfg(feature = "plugin-development-mode")]
pub(crate) mod plugin_development;
#[cfg(feature = "plugin-development-mode")]
pub(crate) mod plugin_development_directory;
#[cfg(feature = "plugin-development-mode")]
pub(crate) mod plugin_development_snapshot;
#[cfg(test)]
mod plugin_host_api_contract;
pub(crate) mod plugin_host_api_validation;
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
pub mod plugin_resource_contract;
pub mod plugin_resource_service;
pub(crate) mod plugin_resource_url;
pub(crate) mod plugin_runtime_security_policy;
pub mod plugin_scoped_storage;
pub(crate) mod trusted_app_target;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(
            "lensx-plugin",
            plugin_resource_service::handle_plugin_resource_protocol,
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    #[cfg(not(feature = "plugin-development-mode"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_preferences::read_app_preferences,
        app_preferences::write_app_preferences,
        launcher_action_collections::read_launcher_action_collections,
        launcher_action_collections::record_launcher_action_use,
        launcher_action_collections::set_launcher_action_pinned,
        launcher_surface::set_launcher_surface_mode,
        launcher_window::hide_launcher,
        plugin_installer::cancel_plugin_replacement,
        plugin_installer::cancel_local_plugin_installation,
        plugin_installer::commit_local_plugin_installation,
        plugin_installer::commit_local_plugin_replacement,
        plugin_installer::prepare_local_plugin_installation,
        plugin_installer::prepare_local_plugin_replacement,
        plugin_data_management::clear_plugin_data,
        plugin_lifecycle::set_plugin_enabled,
        plugin_lifecycle::uninstall_plugin,
        plugin_registration::read_plugin_registration_detail,
        plugin_registration::read_plugin_registration_snapshot,
        plugin_resource_service::resolve_plugin_resource_entry,
        plugin_scoped_storage::plugin_scoped_storage,
        plugin_child_webview_host_dispatcher::settle_plugin_child_webview_host_dispatch,
        plugin_child_webview_host_dispatcher::fail_plugin_child_webview_host_dispatch,
        plugin_child_webview_host_dispatcher::emit_plugin_child_webview_host_event,
        plugin_child_webview_presentation::create_plugin_child_webview_presentation,
        plugin_child_webview_presentation::read_plugin_child_webview_presentation,
        plugin_child_webview_presentation::wait_plugin_child_webview_presentation,
        plugin_child_webview_presentation::set_plugin_child_webview_presentation_visibility,
        plugin_child_webview_presentation::destroy_plugin_child_webview_presentation,
        plugin_child_webview_slot::update_plugin_child_webview_slot
    ]);
    #[cfg(feature = "plugin-development-mode")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_preferences::read_app_preferences,
        app_preferences::write_app_preferences,
        launcher_action_collections::read_launcher_action_collections,
        launcher_action_collections::record_launcher_action_use,
        launcher_action_collections::set_launcher_action_pinned,
        launcher_surface::set_launcher_surface_mode,
        launcher_window::hide_launcher,
        plugin_installer::cancel_plugin_replacement,
        plugin_installer::cancel_local_plugin_installation,
        plugin_installer::commit_local_plugin_installation,
        plugin_installer::commit_local_plugin_replacement,
        plugin_installer::prepare_local_plugin_installation,
        plugin_installer::prepare_local_plugin_replacement,
        plugin_data_management::clear_plugin_data,
        plugin_development::read_plugin_development_capability,
        plugin_development::set_plugin_development_mode,
        plugin_development::register_plugin_development_directory,
        plugin_development::reload_plugin_development_entry,
        plugin_development::remove_plugin_development_entry,
        plugin_lifecycle::set_plugin_enabled,
        plugin_lifecycle::uninstall_plugin,
        plugin_registration::read_plugin_registration_detail,
        plugin_registration::read_plugin_registration_snapshot,
        plugin_resource_service::resolve_plugin_resource_entry,
        plugin_scoped_storage::plugin_scoped_storage,
        plugin_child_webview_host_dispatcher::settle_plugin_child_webview_host_dispatch,
        plugin_child_webview_host_dispatcher::fail_plugin_child_webview_host_dispatch,
        plugin_child_webview_host_dispatcher::emit_plugin_child_webview_host_event,
        plugin_child_webview_presentation::create_plugin_child_webview_presentation,
        plugin_child_webview_presentation::read_plugin_child_webview_presentation,
        plugin_child_webview_presentation::wait_plugin_child_webview_presentation,
        plugin_child_webview_presentation::set_plugin_child_webview_presentation_visibility,
        plugin_child_webview_presentation::destroy_plugin_child_webview_presentation,
        plugin_child_webview_slot::update_plugin_child_webview_slot
    ]);
    let app = builder
        .setup(|app| {
            macos_launcher::setup_macos_accessory_application(app)?;
            let trusted_app_target =
                Arc::new(trusted_app_target::TrustedAppTarget::from_runtime_config(
                    app.config()
                        .build
                        .dev_url
                        .as_ref()
                        .map(ToString::to_string)
                        .as_deref(),
                )?);
            if !app.manage(Arc::clone(&trusted_app_target)) {
                return Err(
                    std::io::Error::other("trusted App target was already installed").into(),
                );
            }
            #[cfg(target_os = "macos")]
            frame_aware_navigation_setup::setup_frame_aware_navigation_policy(
                app.handle(),
                &trusted_app_target,
            )?;
            macos_launcher::setup_macos_launcher_window_collection(app.handle())?;
            let plugin_manager = plugin_manager::setup_plugin_manager(app.handle());
            let plugin_child_webview_service =
                plugin_child_webview_service::setup_plugin_child_webview_service(app.handle());
            plugin_child_webview_host_dispatcher::setup_plugin_child_webview_host_dispatcher(
                app.handle(),
                Arc::clone(&plugin_child_webview_service),
            );
            #[cfg(feature = "plugin-development-mode")]
            let plugin_development_startup =
                plugin_development::PluginDevelopmentStartupConfig::from_environment()?;
            #[cfg(feature = "plugin-development-mode")]
            let plugin_development_state = plugin_development::setup_plugin_development_mode(
                app.handle(),
                Arc::clone(&plugin_manager),
                plugin_development_startup.as_ref(),
            )?;
            let plugin_installer =
                plugin_installer::setup_plugin_installer(app.handle(), Arc::clone(&plugin_manager));
            let plugin_resource_service = plugin_resource_service::setup_plugin_resource_service(
                app.handle(),
                Arc::clone(&plugin_manager),
                Arc::clone(&plugin_installer),
                &trusted_app_target,
            );
            debug_assert!(
                plugin_child_webview_service.attach_resource_authority(plugin_resource_service)
            );
            plugin_scoped_storage::setup_plugin_scoped_storage(
                app.handle(),
                Arc::clone(&plugin_installer),
                Arc::clone(&plugin_manager),
            );
            plugin_lifecycle::setup_plugin_lifecycle(app.handle(), plugin_installer);
            #[cfg(feature = "plugin-development-mode")]
            if let Some(startup) = plugin_development_startup.as_ref() {
                plugin_development::bootstrap_plugin_development_mode(
                    &plugin_development_state,
                    startup,
                )?;
            }
            launcher_window::setup_launcher_window(app.handle());
            launcher_surface::setup_launcher_surface(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            launcher_window::release_macos_local_command_monitor();
            let Some(service) = app.try_state::<
                Arc<plugin_child_webview_service::PluginChildWebviewService<tauri::Wry>>,
            >() else {
                return;
            };
            if let Some(snapshot) = service.snapshot() {
                let _ = service.compare_current_teardown(snapshot.attempt);
            }
        }
    });
}
