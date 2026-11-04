pub mod app_preferences;
pub mod launcher_action_collections;
pub(crate) mod launcher_rounded_corners;
pub mod launcher_shortcuts;
pub mod launcher_surface;
pub mod launcher_window;
pub(crate) mod macos_launcher;
use std::sync::Arc;
use tauri::Manager;
pub(crate) mod frame_aware_navigation_policy;
#[cfg(target_os = "macos")]
pub(crate) mod frame_aware_navigation_setup;
pub(crate) mod launcher_native_execution;
#[doc(hidden)]
pub mod plugin_child_webview_adapter;
pub(crate) mod plugin_child_webview_execution;
pub(crate) mod plugin_child_webview_host_dispatcher;
pub(crate) mod plugin_child_webview_owner;
pub(crate) mod plugin_child_webview_presentation;
pub(crate) mod plugin_child_webview_rpc;
pub(crate) mod plugin_child_webview_service;
pub(crate) mod plugin_child_webview_slot;
pub mod plugin_data_management;
pub(crate) mod plugin_detached_window_host;
#[cfg(test)]
mod plugin_detached_window_matrix_tests;
pub(crate) mod plugin_detached_window_migration;
pub(crate) mod plugin_detached_window_native;
#[cfg(feature = "plugin-development-mode")]
pub(crate) mod plugin_development;
#[cfg(feature = "plugin-development-mode")]
pub(crate) mod plugin_development_directory;
#[cfg(feature = "plugin-development-mode")]
pub(crate) mod plugin_development_snapshot;
#[cfg(test)]
mod plugin_host_api_contract;
pub(crate) mod plugin_host_api_validation;
pub(crate) mod plugin_http;
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

fn attach_plugin_resource_authority<R: tauri::Runtime>(
    service: &plugin_child_webview_service::PluginChildWebviewService<R>,
    authority: Arc<dyn plugin_child_webview_service::PluginChildWebviewResourceAuthority>,
) {
    let attached = service.attach_resource_authority(authority);
    debug_assert!(
        attached,
        "Child WebView resource authority should only be attached once"
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .on_page_load(|webview, payload| {
            if webview.label() == launcher_window::MAIN_WINDOW_LABEL
                && matches!(payload.event(), tauri::webview::PageLoadEvent::Started)
            {
                launcher_native_execution::fence(webview.app_handle()).reset_host();
                if let Some(host) = webview
                    .app_handle()
                    .try_state::<Arc<plugin_detached_window_host::PluginDetachedWindowHost>>()
                {
                    host.note_host_load("main");
                }
                launcher_shortcuts::invalidate_host(webview.app_handle());
                if let Some(service) = webview.app_handle().try_state::<
                    Arc<plugin_child_webview_service::PluginChildWebviewService<tauri::Wry>>,
                >() {
                    let attempts = service.prepare_host_reload();
                    let service = Arc::clone(service.inner());
                    // Host reload is application-wide termination. Native cleanup may
                    // need the main thread, so never wait inside the load callback.
                    tauri::async_runtime::spawn_blocking(move || {
                        for attempt in attempts {
                            let _ = service.compare_current_teardown(attempt);
                        }
                    });
                }
            } else if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                if let Some(host) = webview
                    .app_handle()
                    .try_state::<Arc<plugin_detached_window_host::PluginDetachedWindowHost>>()
                {
                    host.note_host_load(webview.label());
                }
            }
        })
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
        launcher_shortcuts::read_launcher_shortcuts,
        launcher_shortcuts::write_launcher_shortcuts,
        launcher_shortcuts::update_launcher_shortcut_targets,
        launcher_shortcuts::set_launcher_shortcut_host_ready,
        launcher_shortcuts::ack_launcher_shortcut_invocation,
        launcher_shortcuts::begin_launcher_shortcut_recording,
        launcher_shortcuts::renew_launcher_shortcut_recording,
        launcher_shortcuts::end_launcher_shortcut_recording,
        launcher_shortcuts::request_launcher_shortcut_monitor_permission,
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
        plugin_child_webview_presentation::read_plugin_child_webview_admission,
        plugin_child_webview_presentation::create_plugin_child_webview_presentation,
        plugin_child_webview_presentation::read_plugin_child_webview_presentation,
        plugin_child_webview_presentation::wait_plugin_child_webview_presentation,
        plugin_child_webview_presentation::set_plugin_child_webview_presentation_visibility,
        plugin_child_webview_presentation::destroy_plugin_child_webview_presentation,
        plugin_child_webview_slot::update_plugin_child_webview_slot,
        launcher_surface::read_main_surface_epoch,
        launcher_surface::begin_main_surface_intent,
        plugin_detached_window_host::read_host_window_bootstrap,
        plugin_detached_window_host::subscribe_host_window,
        plugin_detached_window_host::subscribe_host_window_operations,
        plugin_detached_window_host::release_host_window_subscription,
        plugin_detached_window_host::read_host_window_snapshot,
        plugin_detached_window_host::read_host_window_geometry,
        plugin_detached_window_host::ready_host_window,
        plugin_detached_window_host::update_host_window_slot,
        plugin_detached_window_host::read_host_window_operations,
        plugin_detached_window_host::ack_host_window_operation,
        plugin_detached_window_host::publish_host_window_preferences,
        plugin_detached_window_host::publish_main_host_interaction,
        plugin_detached_window_host::publish_main_host_page,
        plugin_detached_window_host::publish_host_window_page,
        plugin_detached_window_host::wait_host_instance_owner,
        plugin_detached_window_host::close_host_instance,
        plugin_detached_window_host::replace_host_instance,
        plugin_detached_window_host::coordinate_plugin_child_webview,
        plugin_detached_window_native::retry_detached_window_recovery,
        plugin_detached_window_native::close_detached_window_recovery,
        plugin_detached_window_native::read_detached_window_state,
        plugin_detached_window_native::quit_plugin_windows,
    ]);
    #[cfg(feature = "plugin-development-mode")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_preferences::read_app_preferences,
        app_preferences::write_app_preferences,
        launcher_shortcuts::read_launcher_shortcuts,
        launcher_shortcuts::write_launcher_shortcuts,
        launcher_shortcuts::update_launcher_shortcut_targets,
        launcher_shortcuts::set_launcher_shortcut_host_ready,
        launcher_shortcuts::ack_launcher_shortcut_invocation,
        launcher_shortcuts::begin_launcher_shortcut_recording,
        launcher_shortcuts::renew_launcher_shortcut_recording,
        launcher_shortcuts::end_launcher_shortcut_recording,
        launcher_shortcuts::request_launcher_shortcut_monitor_permission,
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
        plugin_child_webview_presentation::read_plugin_child_webview_admission,
        plugin_child_webview_presentation::create_plugin_child_webview_presentation,
        plugin_child_webview_presentation::read_plugin_child_webview_presentation,
        plugin_child_webview_presentation::wait_plugin_child_webview_presentation,
        plugin_child_webview_presentation::set_plugin_child_webview_presentation_visibility,
        plugin_child_webview_presentation::destroy_plugin_child_webview_presentation,
        plugin_child_webview_slot::update_plugin_child_webview_slot,
        launcher_surface::read_main_surface_epoch,
        launcher_surface::begin_main_surface_intent,
        plugin_detached_window_host::read_host_window_bootstrap,
        plugin_detached_window_host::subscribe_host_window,
        plugin_detached_window_host::subscribe_host_window_operations,
        plugin_detached_window_host::release_host_window_subscription,
        plugin_detached_window_host::read_host_window_snapshot,
        plugin_detached_window_host::read_host_window_geometry,
        plugin_detached_window_host::ready_host_window,
        plugin_detached_window_host::update_host_window_slot,
        plugin_detached_window_host::read_host_window_operations,
        plugin_detached_window_host::ack_host_window_operation,
        plugin_detached_window_host::publish_host_window_preferences,
        plugin_detached_window_host::publish_main_host_interaction,
        plugin_detached_window_host::publish_main_host_page,
        plugin_detached_window_host::publish_host_window_page,
        plugin_detached_window_host::wait_host_instance_owner,
        plugin_detached_window_host::close_host_instance,
        plugin_detached_window_host::replace_host_instance,
        plugin_detached_window_host::coordinate_plugin_child_webview,
        plugin_detached_window_native::retry_detached_window_recovery,
        plugin_detached_window_native::close_detached_window_recovery,
        plugin_detached_window_native::read_detached_window_state,
        plugin_detached_window_native::quit_plugin_windows,
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
            let plugin_detached_window_host =
                plugin_detached_window_host::setup_plugin_detached_window_host(
                    app.handle(),
                    &trusted_app_target,
                );
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
            attach_plugin_resource_authority(
                plugin_child_webview_service.as_ref(),
                plugin_resource_service,
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
            plugin_detached_window_native::setup_plugin_detached_window_native(
                app.handle(),
                Arc::clone(&plugin_child_webview_service),
                plugin_detached_window_host,
                Arc::clone(&plugin_manager),
            );
            #[cfg(target_os = "macos")]
            launcher_window::schedule_launcher_startup(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            launcher_shortcuts::stop(app);
            launcher_window::release_macos_local_command_monitor();
            let Some(service) = app.try_state::<
                Arc<plugin_child_webview_service::PluginChildWebviewService<tauri::Wry>>,
            >() else {
                return;
            };
            let _ = service.teardown_all();
            if let Some(host) =
                app.try_state::<Arc<plugin_detached_window_host::PluginDetachedWindowHost>>()
            {
                host.close_subscriptions();
            }
            plugin_detached_window_native::shutdown_plugin_detached_windows(app);
        }
    });
}

#[cfg(test)]
#[rustfmt::skip]
#[path = "../../vendor/frame-aware-navigation/tauri/src/ipc/channel_recipient.rs"]
mod channel_recipient_policy;

#[cfg(test)]
mod tests {
    use super::*;
    use plugin_child_webview_service::{
        PluginChildWebviewResourceAuthority, PluginChildWebviewService,
    };

    struct TestResourceAuthority;

    impl PluginChildWebviewResourceAuthority for TestResourceAuthority {
        fn activate(
            &self,
            _attempt_id: &str,
            _webview_label: &str,
            _entry_id: &str,
            _resource_generation: u64,
        ) -> bool {
            true
        }

        fn revoke(&self, _attempt_id: &str) -> bool {
            true
        }
    }

    #[test]
    fn release_setup_binds_plugin_resource_authority() {
        let service = PluginChildWebviewService::<tauri::test::MockRuntime>::default();
        attach_plugin_resource_authority(&service, Arc::new(TestResourceAuthority));

        assert!(
            !service.attach_resource_authority(Arc::new(TestResourceAuthority)),
            "production setup must bind resource authority even without debug assertions"
        );
    }
}
