use jsonschema::error::ValidationErrorKind;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::OnceLock;
use url::Url;

const MANIFEST_SCHEMA: &str =
    include_str!("../../packages/plugin-contract/schema/manifest.schema.json");
pub const PLUGIN_HOST_API_VERSION: &str = "0.2.0";

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginManifestInput {
    pub manifest_version: String,
    pub plugin_id: String,
    pub version: String,
    pub display: PluginDisplayInput,
    pub publisher: PublisherInput,
    pub compatibility: CompatibilityInput,
    pub runtime: RuntimeInput,
    pub contributes: ContributesInput,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginDisplayInput {
    pub name: LocalizedTextInput,
    pub description: Option<LocalizedTextInput>,
    pub icon: Option<AssetInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LocalizedTextInput {
    #[serde(rename = "en-US")]
    pub en_us: String,
    #[serde(rename = "zh-CN")]
    pub zh_cn: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssetInput {
    pub kind: AssetKind,
    pub path: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Asset,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublisherInput {
    pub author: String,
    pub homepage: String,
    pub repository: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompatibilityInput {
    pub lensx: VersionRangeInput,
    pub host_api: VersionRangeInput,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VersionRangeInput {
    pub min_version: String,
    pub max_version_exclusive: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeInput {
    pub kind: RuntimeKind,
    pub entry: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeKind {
    Webview,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContributesInput {
    pub pages: Vec<PageInput>,
    pub actions: Option<Vec<ActionInput>>,
    pub launcher: Option<LauncherInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PageInput {
    pub id: String,
    pub title: LocalizedTextInput,
    pub route: String,
    pub parent_page_id: Option<String>,
    pub icon: Option<AssetInput>,
    pub presentation: Option<PagePresentationInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PagePresentationInput {
    pub initial_size: LogicalSizeInput,
    pub resizable: bool,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LogicalSizeInput {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActionInput {
    pub id: String,
    pub title: LocalizedTextInput,
    pub description: Option<LocalizedTextInput>,
    pub default_keywords: Option<LocalizedKeywordsInput>,
    pub icon: Option<AssetInput>,
    pub target: ActionTargetInput,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LocalizedKeywordsInput {
    #[serde(rename = "en-US")]
    pub en_us: Option<Vec<String>>,
    #[serde(rename = "zh-CN")]
    pub zh_cn: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActionTargetInput {
    pub kind: ActionTargetKind,
    pub page_id: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionTargetKind {
    Page,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LauncherInput {
    pub default_action_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedPluginManifest {
    pub manifest_version: String,
    pub plugin_id: String,
    pub version: String,
    pub display: NormalizedPluginDisplay,
    pub publisher: NormalizedPublisher,
    pub compatibility: NormalizedCompatibility,
    pub runtime: NormalizedRuntime,
    pub contributes: NormalizedContributes,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedPluginDisplay {
    pub name: NormalizedLocalizedText,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<NormalizedLocalizedText>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<NormalizedAsset>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedLocalizedText {
    #[serde(rename = "en-US")]
    pub en_us: String,
    #[serde(rename = "zh-CN", skip_serializing_if = "Option::is_none")]
    pub zh_cn: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedAsset {
    pub kind: AssetKind,
    pub path: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedPublisher {
    pub author: String,
    pub homepage: String,
    pub repository: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedCompatibility {
    pub lensx: NormalizedVersionRange,
    pub host_api: NormalizedVersionRange,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedVersionRange {
    pub min_version: String,
    pub max_version_exclusive: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedRuntime {
    pub kind: RuntimeKind,
    pub entry: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedContributes {
    pub pages: Vec<NormalizedPluginPage>,
    pub actions: Vec<NormalizedPluginAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launcher: Option<NormalizedLauncher>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedPluginPage {
    pub id: String,
    pub title: NormalizedLocalizedText,
    pub route: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_page_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<NormalizedAsset>,
    pub presentation: NormalizedPagePresentation,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedPagePresentation {
    pub initial_size: NormalizedLogicalSize,
    pub resizable: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedLogicalSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedLocalizedKeywords {
    #[serde(rename = "en-US", skip_serializing_if = "Option::is_none")]
    pub en_us: Option<Vec<String>>,
    #[serde(rename = "zh-CN", skip_serializing_if = "Option::is_none")]
    pub zh_cn: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedPluginAction {
    pub id: String,
    pub title: NormalizedLocalizedText,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<NormalizedLocalizedText>,
    pub default_keywords: NormalizedLocalizedKeywords,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<NormalizedAsset>,
    pub target: NormalizedActionTarget,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedActionTarget {
    pub kind: ActionTargetKind,
    pub page_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NormalizedLauncher {
    pub default_action_id: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginManifestValidationStatus {
    Invalid,
    Compatible,
    Incompatible,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct PluginManifestDiagnostic {
    pub code: String,
    pub path: String,
    pub message: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct PluginManifestCompatibility {
    pub lensx: bool,
    pub host_api: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PluginManifestValidationResult {
    pub status: PluginManifestValidationStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<NormalizedPluginManifest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compatibility: Option<PluginManifestCompatibility>,
    pub diagnostics: Vec<PluginManifestDiagnostic>,
}

#[derive(Clone, Debug)]
pub struct PluginHostVersions {
    pub lensx: String,
    pub host_api: String,
}

fn schema_validator() -> &'static jsonschema::Validator {
    static VALIDATOR: OnceLock<jsonschema::Validator> = OnceLock::new();
    VALIDATOR.get_or_init(|| {
        let schema: Value = serde_json::from_str(MANIFEST_SCHEMA)
            .expect("plugin Manifest schema should be valid JSON");
        jsonschema::draft202012::new(&schema).expect("plugin Manifest schema should compile")
    })
}

fn escape_json_pointer_segment(segment: &str) -> String {
    segment.replace('~', "~0").replace('/', "~1")
}

fn diagnostic(
    code: &str,
    path: impl Into<String>,
    message: impl Into<String>,
) -> PluginManifestDiagnostic {
    PluginManifestDiagnostic {
        code: code.to_owned(),
        path: path.into(),
        message: message.into(),
    }
}

fn sort_diagnostics(diagnostics: &mut [PluginManifestDiagnostic]) {
    diagnostics.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.code.cmp(&right.code))
    });
}

fn map_schema_diagnostics(value: &Value) -> Vec<PluginManifestDiagnostic> {
    let mut diagnostics = Vec::new();
    for error in schema_validator().iter_errors(value) {
        let path = error.instance_path.to_string();
        let message = error.to_string();
        match &error.kind {
            ValidationErrorKind::AdditionalProperties { unexpected } => {
                for property in unexpected {
                    diagnostics.push(diagnostic(
                        "unknown_field",
                        format!("{path}/{}", escape_json_pointer_segment(property)),
                        message.clone(),
                    ));
                }
            }
            ValidationErrorKind::Required { property } => {
                let property = property.as_str().unwrap_or_default();
                diagnostics.push(diagnostic(
                    "missing_field",
                    format!("{path}/{}", escape_json_pointer_segment(property)),
                    message,
                ));
            }
            ValidationErrorKind::Type { .. } => {
                diagnostics.push(diagnostic("invalid_type", path, message));
            }
            ValidationErrorKind::Constant { .. } | ValidationErrorKind::Enum { .. } => {
                diagnostics.push(diagnostic("invalid_value", path, message));
            }
            ValidationErrorKind::Pattern { .. } | ValidationErrorKind::Format { .. } => {
                let schema_path = error.schema_path.to_string();
                let code = if path.ends_with("/path")
                    || path == "/runtime/entry"
                    || schema_path.contains("/packagePath/")
                    || schema_path.contains("/packageHtmlPath/")
                {
                    "invalid_path"
                } else if path.ends_with("/route") || schema_path.contains("/internalRoute/") {
                    "invalid_route"
                } else {
                    "invalid_format"
                };
                diagnostics.push(diagnostic(code, path, message));
            }
            ValidationErrorKind::MinLength { .. } | ValidationErrorKind::MinItems { .. } => {
                diagnostics.push(diagnostic("invalid_length", path, message));
            }
            ValidationErrorKind::Minimum { .. } | ValidationErrorKind::Maximum { .. } => {
                diagnostics.push(diagnostic("invalid_range", path, message));
            }
            _ => diagnostics.push(diagnostic("schema_validation", path, message)),
        }
    }
    sort_diagnostics(&mut diagnostics);
    diagnostics
}

fn normalize_localized_text(input: LocalizedTextInput) -> NormalizedLocalizedText {
    NormalizedLocalizedText {
        en_us: input.en_us.trim().to_owned(),
        zh_cn: input.zh_cn.map(|value| value.trim().to_owned()),
    }
}

fn normalize_asset(input: AssetInput) -> NormalizedAsset {
    NormalizedAsset {
        kind: input.kind,
        path: input.path.trim().to_owned(),
    }
}

fn normalize_manifest(input: PluginManifestInput) -> NormalizedPluginManifest {
    NormalizedPluginManifest {
        manifest_version: input.manifest_version.trim().to_owned(),
        plugin_id: input.plugin_id.trim().to_owned(),
        version: input.version.trim().to_owned(),
        display: NormalizedPluginDisplay {
            name: normalize_localized_text(input.display.name),
            description: input.display.description.map(normalize_localized_text),
            icon: input.display.icon.map(normalize_asset),
        },
        publisher: NormalizedPublisher {
            author: input.publisher.author.trim().to_owned(),
            homepage: input.publisher.homepage.trim().to_owned(),
            repository: input.publisher.repository.trim().to_owned(),
        },
        compatibility: NormalizedCompatibility {
            lensx: NormalizedVersionRange {
                min_version: input.compatibility.lensx.min_version.trim().to_owned(),
                max_version_exclusive: input
                    .compatibility
                    .lensx
                    .max_version_exclusive
                    .trim()
                    .to_owned(),
            },
            host_api: NormalizedVersionRange {
                min_version: input.compatibility.host_api.min_version.trim().to_owned(),
                max_version_exclusive: input
                    .compatibility
                    .host_api
                    .max_version_exclusive
                    .trim()
                    .to_owned(),
            },
        },
        runtime: NormalizedRuntime {
            kind: input.runtime.kind,
            entry: input.runtime.entry.trim().to_owned(),
        },
        contributes: NormalizedContributes {
            pages: input
                .contributes
                .pages
                .into_iter()
                .map(|page| NormalizedPluginPage {
                    id: page.id.trim().to_owned(),
                    title: normalize_localized_text(page.title),
                    route: page.route.trim().to_owned(),
                    parent_page_id: page.parent_page_id.map(|value| value.trim().to_owned()),
                    icon: page.icon.map(normalize_asset),
                    presentation: page.presentation.map_or_else(
                        || NormalizedPagePresentation {
                            initial_size: NormalizedLogicalSize {
                                width: 650,
                                height: 600,
                            },
                            resizable: false,
                        },
                        |presentation| NormalizedPagePresentation {
                            initial_size: NormalizedLogicalSize {
                                width: presentation.initial_size.width,
                                height: presentation.initial_size.height,
                            },
                            resizable: presentation.resizable,
                        },
                    ),
                })
                .collect(),
            actions: input
                .contributes
                .actions
                .unwrap_or_default()
                .into_iter()
                .map(|action| NormalizedPluginAction {
                    id: action.id.trim().to_owned(),
                    title: normalize_localized_text(action.title),
                    description: action.description.map(normalize_localized_text),
                    default_keywords: action
                        .default_keywords
                        .map(|keywords| NormalizedLocalizedKeywords {
                            en_us: keywords.en_us.map(|values| {
                                values
                                    .into_iter()
                                    .map(|value| value.trim().to_owned())
                                    .collect()
                            }),
                            zh_cn: keywords.zh_cn.map(|values| {
                                values
                                    .into_iter()
                                    .map(|value| value.trim().to_owned())
                                    .collect()
                            }),
                        })
                        .unwrap_or_default(),
                    icon: action.icon.map(normalize_asset),
                    target: NormalizedActionTarget {
                        kind: action.target.kind,
                        page_id: action.target.page_id.trim().to_owned(),
                    },
                })
                .collect(),
            launcher: input
                .contributes
                .launcher
                .map(|launcher| NormalizedLauncher {
                    default_action_id: launcher.default_action_id.trim().to_owned(),
                }),
        },
    }
}

fn validate_localized_text(
    text: &NormalizedLocalizedText,
    path: &str,
    diagnostics: &mut Vec<PluginManifestDiagnostic>,
) {
    if text.en_us.is_empty() {
        diagnostics.push(diagnostic(
            "empty_value",
            format!("{path}/en-US"),
            "Localized text must not be empty.",
        ));
    }
    if text.zh_cn.as_deref() == Some("") {
        diagnostics.push(diagnostic(
            "empty_value",
            format!("{path}/zh-CN"),
            "Localized text must not be empty.",
        ));
    }
}

fn validate_https_url(value: &str, path: &str, diagnostics: &mut Vec<PluginManifestDiagnostic>) {
    let valid = Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https" && url.username().is_empty() && url.password().is_none()
    });
    if !valid {
        diagnostics.push(diagnostic(
            "invalid_url",
            path,
            "Publisher URL must be an absolute HTTPS URL.",
        ));
    }
}

fn is_valid_package_path(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('/')
        && !value.contains(['\\', '?', '#', ':'])
        && value
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

fn validate_package_path(
    value: &str,
    path: &str,
    extension: Option<&str>,
    diagnostics: &mut Vec<PluginManifestDiagnostic>,
) {
    if !is_valid_package_path(value)
        || extension.is_some_and(|suffix| !value.to_ascii_lowercase().ends_with(suffix))
    {
        diagnostics.push(diagnostic(
            "invalid_path",
            path,
            "Path must stay inside the plugin package.",
        ));
    }
}

fn validate_route(value: &str, path: &str, diagnostics: &mut Vec<PluginManifestDiagnostic>) {
    let internal_segments_are_valid = value.strip_prefix('/').is_some_and(|route| {
        let segments: Vec<_> = route.split('/').collect();
        segments.iter().enumerate().all(|(index, segment)| {
            (*segment != "" || index == segments.len() - 1) && *segment != "." && *segment != ".."
        })
    });
    if value.starts_with("//")
        || value.contains(['\\', '?', '#'])
        || value.contains("://")
        || !internal_segments_are_valid
    {
        diagnostics.push(diagnostic(
            "invalid_route",
            path,
            "Route must be an internal plugin path.",
        ));
    }
}

fn validate_compatibility(
    manifest: &NormalizedPluginManifest,
    current_versions: &PluginHostVersions,
    diagnostics: &mut Vec<PluginManifestDiagnostic>,
) -> PluginManifestCompatibility {
    fn dimension(
        range: &NormalizedVersionRange,
        current: &str,
        path: &str,
        diagnostics: &mut Vec<PluginManifestDiagnostic>,
    ) -> bool {
        let minimum = Version::parse(&range.min_version);
        let maximum = Version::parse(&range.max_version_exclusive);
        let current = Version::parse(current);
        let (Ok(minimum), Ok(maximum)) = (minimum, maximum) else {
            diagnostics.push(diagnostic(
                "invalid_semver",
                path,
                "Compatibility range must use SemVer.",
            ));
            return false;
        };
        let Ok(current) = current else {
            diagnostics.push(diagnostic(
                "invalid_current_version",
                path,
                "Current Host version must use SemVer.",
            ));
            return false;
        };
        if minimum >= maximum {
            diagnostics.push(diagnostic(
                "invalid_range",
                path,
                "Compatibility range must not be empty.",
            ));
            return false;
        }
        minimum <= current && current < maximum
    }

    PluginManifestCompatibility {
        lensx: dimension(
            &manifest.compatibility.lensx,
            &current_versions.lensx,
            "/compatibility/lensx",
            diagnostics,
        ),
        host_api: dimension(
            &manifest.compatibility.host_api,
            &current_versions.host_api,
            "/compatibility/host_api",
            diagnostics,
        ),
    }
}

fn validate_semantics(
    manifest: &NormalizedPluginManifest,
    current_versions: &PluginHostVersions,
) -> (Vec<PluginManifestDiagnostic>, PluginManifestCompatibility) {
    let mut diagnostics = Vec::new();
    validate_localized_text(&manifest.display.name, "/display/name", &mut diagnostics);
    if let Some(description) = &manifest.display.description {
        validate_localized_text(description, "/display/description", &mut diagnostics);
    }
    if let Some(icon) = &manifest.display.icon {
        validate_package_path(&icon.path, "/display/icon/path", None, &mut diagnostics);
    }
    if manifest.publisher.author.is_empty() {
        diagnostics.push(diagnostic(
            "empty_value",
            "/publisher/author",
            "Publisher author must not be empty.",
        ));
    }
    validate_https_url(
        &manifest.publisher.homepage,
        "/publisher/homepage",
        &mut diagnostics,
    );
    validate_https_url(
        &manifest.publisher.repository,
        "/publisher/repository",
        &mut diagnostics,
    );
    validate_package_path(
        &manifest.runtime.entry,
        "/runtime/entry",
        Some(".html"),
        &mut diagnostics,
    );

    let mut page_ids = HashSet::new();
    let mut page_indexes = HashMap::new();
    for (index, page) in manifest.contributes.pages.iter().enumerate() {
        if !page_ids.insert(page.id.as_str()) {
            diagnostics.push(diagnostic(
                "duplicate_id",
                format!("/contributes/pages/{index}/id"),
                "Page ID must be unique.",
            ));
        } else {
            page_indexes.insert(page.id.as_str(), index);
        }
        validate_localized_text(
            &page.title,
            &format!("/contributes/pages/{index}/title"),
            &mut diagnostics,
        );
        validate_route(
            &page.route,
            &format!("/contributes/pages/{index}/route"),
            &mut diagnostics,
        );
        if let Some(icon) = &page.icon {
            validate_package_path(
                &icon.path,
                &format!("/contributes/pages/{index}/icon/path"),
                None,
                &mut diagnostics,
            );
        }
    }

    for (index, page) in manifest.contributes.pages.iter().enumerate() {
        if page
            .parent_page_id
            .as_deref()
            .is_some_and(|parent| !page_ids.contains(parent))
        {
            diagnostics.push(diagnostic(
                "unknown_reference",
                format!("/contributes/pages/{index}/parent_page_id"),
                "Parent Page does not exist.",
            ));
        }
    }

    let mut cycle_indexes = BTreeSet::new();
    for (start_index, page) in manifest.contributes.pages.iter().enumerate() {
        let mut path = Vec::new();
        let mut seen = HashMap::new();
        let mut current = Some(page);
        while let Some(current_page) = current {
            let Some(parent_id) = current_page.parent_page_id.as_deref() else {
                break;
            };
            let Some(current_index) = page_indexes.get(current_page.id.as_str()).copied() else {
                break;
            };
            if let Some(cycle_start) = seen.get(current_page.id.as_str()).copied() {
                cycle_indexes.extend(path[cycle_start..].iter().copied());
                break;
            }
            seen.insert(current_page.id.as_str(), path.len());
            path.push(current_index);
            current = page_indexes
                .get(parent_id)
                .and_then(|index| manifest.contributes.pages.get(*index));
        }
        if page.parent_page_id.as_deref() == Some(page.id.as_str()) {
            cycle_indexes.insert(start_index);
        }
    }
    for index in cycle_indexes {
        diagnostics.push(diagnostic(
            "reference_cycle",
            format!("/contributes/pages/{index}/parent_page_id"),
            "Page parent reference participates in a cycle.",
        ));
    }

    let mut action_ids = HashSet::new();
    for (index, action) in manifest.contributes.actions.iter().enumerate() {
        if !action_ids.insert(action.id.as_str()) {
            diagnostics.push(diagnostic(
                "duplicate_id",
                format!("/contributes/actions/{index}/id"),
                "Action ID must be unique.",
            ));
        }
        validate_localized_text(
            &action.title,
            &format!("/contributes/actions/{index}/title"),
            &mut diagnostics,
        );
        if let Some(description) = &action.description {
            validate_localized_text(
                description,
                &format!("/contributes/actions/{index}/description"),
                &mut diagnostics,
            );
        }
        if let Some(icon) = &action.icon {
            validate_package_path(
                &icon.path,
                &format!("/contributes/actions/{index}/icon/path"),
                None,
                &mut diagnostics,
            );
        }
        if !page_ids.contains(action.target.page_id.as_str()) {
            diagnostics.push(diagnostic(
                "unknown_reference",
                format!("/contributes/actions/{index}/target/page_id"),
                "Action target Page does not exist.",
            ));
        }
        for (locale, keywords) in [
            ("en-US", action.default_keywords.en_us.as_deref()),
            ("zh-CN", action.default_keywords.zh_cn.as_deref()),
        ] {
            let mut normalized_keywords = HashSet::new();
            for (keyword_index, keyword) in keywords.unwrap_or_default().iter().enumerate() {
                let path = format!(
                    "/contributes/actions/{index}/default_keywords/{locale}/{keyword_index}"
                );
                if keyword.is_empty() {
                    diagnostics.push(diagnostic(
                        "empty_value",
                        path,
                        "Action keyword must not be empty.",
                    ));
                    continue;
                }
                let comparable = keyword.to_lowercase();
                if !normalized_keywords.insert(comparable) {
                    diagnostics.push(diagnostic(
                        "duplicate_value",
                        path,
                        "Action keyword must be unique.",
                    ));
                }
            }
        }
    }

    if let Some(launcher) = &manifest.contributes.launcher {
        if !action_ids.contains(launcher.default_action_id.as_str()) {
            diagnostics.push(diagnostic(
                "unknown_reference",
                "/contributes/launcher/default_action_id",
                "Launcher default Action does not exist.",
            ));
        }
    }

    let compatibility = validate_compatibility(manifest, current_versions, &mut diagnostics);
    sort_diagnostics(&mut diagnostics);
    (diagnostics, compatibility)
}

fn legacy_protocol_diagnostics(value: &Value) -> Vec<PluginManifestDiagnostic> {
    let Some(object) = value.as_object() else {
        return Vec::new();
    };
    let mut diagnostics = Vec::new();
    if object
        .get("manifest_version")
        .and_then(Value::as_str)
        .is_some_and(|version| {
            let mut parts = version.split('.');
            parts.next() == Some("0")
                && parts
                    .next()
                    .and_then(|minor| minor.parse::<u8>().ok())
                    .is_some_and(|minor| minor <= 3)
                && parts.next().is_some_and(|patch| {
                    !patch.is_empty() && patch.bytes().all(|byte| byte.is_ascii_digit())
                })
                && parts.next().is_none()
        })
    {
        diagnostics.push(diagnostic(
            "incompatible_protocol",
            "/manifest_version",
            "The plugin Manifest protocol is incompatible.",
        ));
    }
    if object
        .get("runtime")
        .and_then(Value::as_object)
        .and_then(|runtime| runtime.get("kind"))
        .and_then(Value::as_str)
        == Some("iframe")
    {
        diagnostics.push(diagnostic(
            "incompatible_protocol",
            "/runtime/kind",
            "The plugin Runtime protocol is incompatible.",
        ));
    }
    sort_diagnostics(&mut diagnostics);
    diagnostics
}

pub fn validate_plugin_manifest(
    value: &Value,
    current_versions: &PluginHostVersions,
) -> PluginManifestValidationResult {
    let incompatible_diagnostics = legacy_protocol_diagnostics(value);
    if !incompatible_diagnostics.is_empty() {
        return PluginManifestValidationResult {
            status: PluginManifestValidationStatus::Incompatible,
            manifest: None,
            compatibility: None,
            diagnostics: incompatible_diagnostics,
        };
    }
    let schema_diagnostics = map_schema_diagnostics(value);
    if !schema_diagnostics.is_empty() {
        return PluginManifestValidationResult {
            status: PluginManifestValidationStatus::Invalid,
            manifest: None,
            compatibility: None,
            diagnostics: schema_diagnostics,
        };
    }

    let input: PluginManifestInput = serde_json::from_value(value.clone())
        .expect("Schema-valid plugin Manifest should deserialize into the author input model");
    let manifest = normalize_manifest(input);
    let (diagnostics, compatibility) = validate_semantics(&manifest, current_versions);
    if !diagnostics.is_empty() {
        return PluginManifestValidationResult {
            status: PluginManifestValidationStatus::Invalid,
            manifest: None,
            compatibility: None,
            diagnostics,
        };
    }

    let status = if compatibility.lensx && compatibility.host_api {
        PluginManifestValidationStatus::Compatible
    } else {
        PluginManifestValidationStatus::Incompatible
    };
    PluginManifestValidationResult {
        status,
        manifest: Some(manifest),
        compatibility: Some(compatibility),
        diagnostics,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::fs;
    use std::path::{Path, PathBuf};

    #[derive(Debug, Deserialize)]
    struct FixtureMutation {
        op: String,
        path: String,
        #[serde(default)]
        value: Value,
    }

    #[derive(Debug, Deserialize)]
    struct ExpectedDiagnostic {
        code: String,
        path: String,
    }

    #[derive(Debug, Deserialize)]
    struct FixtureCase {
        name: String,
        current_versions: Option<FixtureVersions>,
        input: Option<Value>,
        mutations: Option<Vec<FixtureMutation>>,
        expected_status: Option<String>,
        expected_diagnostics: Option<Vec<ExpectedDiagnostic>>,
        expected_normalized: Option<Value>,
    }

    #[derive(Debug, Deserialize)]
    struct FixtureVersions {
        lensx: String,
        host_api: String,
    }

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../packages/plugin-contract/tests/fixtures")
    }

    fn read_json(path: impl AsRef<Path>) -> Value {
        serde_json::from_str(&fs::read_to_string(path.as_ref()).unwrap_or_else(|error| {
            panic!(
                "failed to read fixture '{}': {error}",
                path.as_ref().display()
            )
        }))
        .expect("fixture should contain valid JSON")
    }

    fn read_cases(category: &str) -> Vec<FixtureCase> {
        serde_json::from_value(read_json(fixture_root().join(category).join("cases.json")))
            .expect("fixture cases should match their model")
    }

    fn decode_pointer_segment(segment: &str) -> String {
        segment.replace("~1", "/").replace("~0", "~")
    }

    fn apply_mutations(mut input: Value, mutations: &[FixtureMutation]) -> Value {
        for mutation in mutations {
            let mut segments: Vec<String> = mutation
                .path
                .strip_prefix('/')
                .expect("fixture mutation should use JSON Pointer")
                .split('/')
                .map(decode_pointer_segment)
                .collect();
            let key = segments
                .pop()
                .expect("fixture mutation must not target the document root");
            let parent_pointer = segments.iter().fold(String::new(), |mut pointer, segment| {
                pointer.push('/');
                pointer.push_str(&segment.replace('~', "~0").replace('/', "~1"));
                pointer
            });
            let parent = input.pointer_mut(&parent_pointer).unwrap_or_else(|| {
                panic!("fixture mutation parent '{}' should exist", parent_pointer)
            });
            match (mutation.op.as_str(), parent) {
                ("remove", Value::Object(object)) => {
                    object.remove(&key);
                }
                ("remove", Value::Array(array)) => {
                    array.remove(key.parse().expect("array mutation key should be an index"));
                }
                ("set", Value::Object(object)) => {
                    object.insert(key, mutation.value.clone());
                }
                ("set", Value::Array(array)) => {
                    array[key
                        .parse::<usize>()
                        .expect("array mutation key should be an index")] = mutation.value.clone();
                }
                (operation, _) => panic!("unsupported fixture mutation operation '{operation}'"),
            }
        }
        input
    }

    fn fixture_input(case: &FixtureCase, base: &Value) -> Value {
        case.input.clone().unwrap_or_else(|| {
            apply_mutations(base.clone(), case.mutations.as_deref().unwrap_or_default())
        })
    }

    fn current_versions(case: &FixtureCase) -> PluginHostVersions {
        case.current_versions.as_ref().map_or_else(
            || PluginHostVersions {
                lensx: "0.1.0".to_owned(),
                host_api: "0.2.0".to_owned(),
            },
            |versions| PluginHostVersions {
                lensx: versions.lensx.clone(),
                host_api: versions.host_api.clone(),
            },
        )
    }

    fn status_name(status: PluginManifestValidationStatus) -> &'static str {
        match status {
            PluginManifestValidationStatus::Invalid => "invalid",
            PluginManifestValidationStatus::Compatible => "compatible",
            PluginManifestValidationStatus::Incompatible => "incompatible",
        }
    }

    #[test]
    fn shared_fixtures_match_schema_semantics_normalization_and_compatibility() {
        let base = read_json(fixture_root().join("base.json"));
        for category in ["valid", "incompatible", "invalid", "normalized"] {
            for case in read_cases(category) {
                let input = fixture_input(&case, &base);
                let original = input.clone();
                let result = validate_plugin_manifest(&input, &current_versions(&case));

                if let Some(expected_status) = &case.expected_status {
                    assert_eq!(
                        status_name(result.status),
                        expected_status,
                        "{category}: {}",
                        case.name
                    );
                } else {
                    assert_eq!(
                        result.status,
                        PluginManifestValidationStatus::Invalid,
                        "{category}: {}",
                        case.name
                    );
                }

                if let Some(expected) = &case.expected_diagnostics {
                    let actual: Vec<_> = result
                        .diagnostics
                        .iter()
                        .map(|diagnostic| (diagnostic.code.as_str(), diagnostic.path.as_str()))
                        .collect();
                    let expected: Vec<_> = expected
                        .iter()
                        .map(|diagnostic| (diagnostic.code.as_str(), diagnostic.path.as_str()))
                        .collect();
                    assert_eq!(actual, expected, "{category}: {}", case.name);
                } else {
                    assert!(
                        result.diagnostics.is_empty(),
                        "{category}: {}: {:?}",
                        case.name,
                        result.diagnostics
                    );
                }

                if let Some(expected) = &case.expected_normalized {
                    assert_eq!(
                        serde_json::to_value(result.manifest.as_ref())
                            .expect("normalized manifest should serialize"),
                        *expected,
                        "{category}: {}",
                        case.name
                    );
                }
                assert_eq!(input, original, "{category}: {}", case.name);
            }
        }
    }

    #[test]
    fn normalized_manifest_contains_author_data_only() {
        let result = validate_plugin_manifest(
            &read_json(fixture_root().join("base.json")),
            &PluginHostVersions {
                lensx: "0.1.0".to_owned(),
                host_api: "0.2.0".to_owned(),
            },
        );
        let serialized = serde_json::to_value(result.manifest)
            .expect("normalized manifest should serialize to plain JSON");
        for forbidden in [
            "source",
            "lifecycle",
            "enabled",
            "granted_permissions",
            "executor",
        ] {
            assert!(
                !serialized
                    .as_object()
                    .expect("manifest should be an object")
                    .contains_key(forbidden),
                "normalized manifest must not expose Host-owned field '{forbidden}'"
            );
        }
        assert_eq!(
            serialized.pointer("/contributes/actions/0/target/kind"),
            Some(&Value::String("page".to_owned()))
        );
    }
}
