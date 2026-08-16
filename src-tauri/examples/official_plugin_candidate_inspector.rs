use lensx_lib::{
    plugin_installation_contract::{
        LocalPluginInstallationRequest, LocalPluginInstallationResult,
        LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION,
    },
    plugin_installer::PluginInstaller,
    plugin_manager::PluginManager,
    plugin_manifest::PluginHostVersions,
    plugin_package_format::{inspect_plugin_package, PackageInspectionResult},
    plugin_registration::{PluginRegistrationChangedEvent, PluginRegistrationEventEmitter},
};
use serde_json::json;
use std::{env, fs, path::PathBuf, process};

struct InspectorEmitter;

impl PluginRegistrationEventEmitter for InspectorEmitter {
    fn emit_registration_changed(
        &self,
        _payload: &PluginRegistrationChangedEvent,
    ) -> Result<(), ()> {
        Ok(())
    }
}

fn main() {
    let paths: Vec<PathBuf> = env::args_os().skip(1).map(PathBuf::from).collect();
    assert_eq!(paths.len(), 1, "expected one candidate package path");
    let path = &paths[0];
    let bytes = fs::read(path).expect("read candidate package");
    let versions = PluginHostVersions {
        lensx: "0.1.0".to_owned(),
        host_api: "0.2.0".to_owned(),
    };
    let (manifest, facts) = match inspect_plugin_package(&bytes, &versions) {
        PackageInspectionResult::Compatible {
            manifest, facts, ..
        } => (manifest, facts),
        result => panic!("Rust inspector rejected candidate package: {result:?}"),
    };
    let root = env::temp_dir().join(format!("lensx-official-plugin-candidate-{}", process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("create candidate inspection root");
    let manager = PluginManager::recover(root.join("manager"), versions);
    let installer = PluginInstaller::initialize(Ok(root.join("installer")), manager.clone());
    let (preparation_token, candidate) = match installer
        .prepare_installation_source(path)
        .expect("ordinary installation preparation accepts candidate")
    {
        LocalPluginInstallationResult::Prepared {
            preparation_token,
            candidate,
            ..
        } => (preparation_token, candidate),
        result => panic!("unexpected installation preparation result: {result:?}"),
    };
    assert_eq!(candidate.plugin_id, manifest.plugin_id);
    assert_eq!(candidate.version, manifest.version);
    let installed = installer
        .commit_installation(
            &LocalPluginInstallationRequest {
                contract_version: LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION.to_owned(),
                preparation_token,
            },
            &InspectorEmitter,
        )
        .expect("ordinary installation commit accepts candidate");
    assert!(matches!(
        installed,
        LocalPluginInstallationResult::Installed { .. }
    ));
    let registration_count = manager.read_registration_snapshot().entries.len();
    assert_eq!(registration_count, 1);
    drop(installer);
    drop(manager);
    fs::remove_dir_all(&root).expect("clean candidate inspection root");
    let inspection_cleanup_completed = !root.exists();
    println!(
        "{}",
        serde_json::to_string(&json!({
            "digest": facts.package_digest.value,
            "installer_prepared": true,
            "installation_committed": true,
            "registration_count": registration_count,
            "inspection_cleanup_completed": inspection_cleanup_completed,
            "package_format_version": facts.package_format_version,
            "plugin_id": manifest.plugin_id,
            "runtime_kind": manifest.runtime.kind,
            "version": manifest.version,
        }))
        .expect("serialize candidate evidence")
    );
}
