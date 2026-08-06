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
    let package_paths: Vec<PathBuf> = env::args_os().skip(1).map(PathBuf::from).collect();
    assert_eq!(
        package_paths.len(),
        2,
        "expected two template package paths"
    );
    let root = env::temp_dir().join(format!(
        "lensx-plugin-template-rust-smoke-{}",
        process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("create Host smoke root");

    let versions = PluginHostVersions {
        lensx: "0.1.0".to_owned(),
        host_api: "0.1.0".to_owned(),
    };
    let mut evidence = Vec::new();
    for (index, path) in package_paths.iter().enumerate() {
        let bytes = fs::read(path).expect("read template package");
        let (manifest, facts) = match inspect_plugin_package(&bytes, &versions) {
            PackageInspectionResult::Compatible {
                manifest, facts, ..
            } => (manifest, facts),
            result => panic!("Host inspector rejected template package: {result:?}"),
        };
        let manager =
            PluginManager::recover(root.join(format!("manager-{index}")), versions.clone());
        let installer =
            PluginInstaller::initialize(Ok(root.join(format!("installer-{index}"))), manager);
        let candidate = match installer
            .prepare_installation_source(path)
            .expect("controlled installer boundary accepts template package")
        {
            LocalPluginInstallationResult::Prepared { candidate, .. } => candidate,
            result => panic!("unexpected installer result: {result:?}"),
        };
        assert_eq!(candidate.plugin_id, manifest.plugin_id);
        assert_eq!(candidate.version, manifest.version);
        evidence.push(json!({
            "pluginId": manifest.plugin_id,
            "version": manifest.version,
            "digest": facts.package_digest.value,
            "fileCount": facts.file_count,
            "files": facts.files.iter().map(|file| &file.path).collect::<Vec<_>>(),
            "compatible": true,
            "installerPrepared": true,
        }));
    }

    fs::remove_dir_all(&root).expect("clean Host smoke root");
    println!(
        "{}",
        serde_json::to_string(&evidence).expect("serialize evidence")
    );
}
