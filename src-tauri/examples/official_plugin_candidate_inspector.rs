use lensx_lib::{
    plugin_installation_contract::LocalPluginInstallationResult,
    plugin_installer::PluginInstaller,
    plugin_manager::PluginManager,
    plugin_manifest::PluginHostVersions,
    plugin_package_format::{inspect_plugin_package, PackageInspectionResult},
};
use serde_json::json;
use std::{env, fs, path::PathBuf, process};

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
    let installer = PluginInstaller::initialize(Ok(root.join("installer")), manager);
    let candidate = match installer
        .prepare_installation_source(path)
        .expect("ordinary installation preparation accepts candidate")
    {
        LocalPluginInstallationResult::Prepared { candidate, .. } => candidate,
        result => panic!("unexpected installation preparation result: {result:?}"),
    };
    assert_eq!(candidate.plugin_id, manifest.plugin_id);
    assert_eq!(candidate.version, manifest.version);
    fs::remove_dir_all(&root).expect("clean candidate inspection root");
    println!(
        "{}",
        serde_json::to_string(&json!({
            "digest": facts.package_digest.value,
            "installer_prepared": true,
            "package_format_version": facts.package_format_version,
            "plugin_id": manifest.plugin_id,
            "version": manifest.version,
        }))
        .expect("serialize candidate evidence")
    );
}
