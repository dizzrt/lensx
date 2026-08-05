use jsonschema::error::ValidationErrorKind;
use serde::Deserialize;
use serde_json::Value;

const HOST_API_SCHEMA: &str =
    include_str!("../../packages/plugin-contract/schema/host-api.schema.json");
const VALID_FIXTURES: &str =
    include_str!("../../packages/plugin-contract/tests/fixtures/host-api/valid/cases.json");
const INVALID_FIXTURES: &str =
    include_str!("../../packages/plugin-contract/tests/fixtures/host-api/invalid/cases.json");

const METHODS: [&str; 10] = [
    "actions.open",
    "clipboard.read",
    "clipboard.write",
    "runtime.get_context",
    "storage.delete",
    "storage.get",
    "storage.get_quota",
    "storage.list",
    "storage.set",
    "ui.close",
];
const PERMISSIONS: [&str; 2] = ["clipboard.read", "clipboard.write"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum FixtureKind {
    Context,
    Error,
    Event,
    Permission,
    Request,
    Result,
}

#[derive(Debug, Deserialize)]
struct ExpectedDiagnostic {
    code: String,
    path: String,
}

#[derive(Debug, Deserialize)]
struct FixtureCase {
    name: String,
    kind: FixtureKind,
    value: Value,
    expected: Option<Vec<ExpectedDiagnostic>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Diagnostic {
    code: String,
    path: String,
}

fn escape_pointer(segment: &str) -> String {
    segment.replace('~', "~0").replace('/', "~1")
}

fn method_definition(method: &str, result: bool) -> Option<&'static str> {
    Some(match (method, result) {
        ("actions.open", false) => "ActionsOpenRequest",
        ("actions.open", true) => "ActionsOpenResult",
        ("clipboard.read", false) => "ClipboardReadRequest",
        ("clipboard.read", true) => "ClipboardReadResult",
        ("clipboard.write", false) => "ClipboardWriteRequest",
        ("clipboard.write", true) => "ClipboardWriteResult",
        ("runtime.get_context", false) => "RuntimeGetContextRequest",
        ("runtime.get_context", true) => "RuntimeGetContextResult",
        ("storage.delete", false) => "StorageDeleteRequest",
        ("storage.delete", true) => "StorageDeleteResult",
        ("storage.get", false) => "StorageGetRequest",
        ("storage.get", true) => "StorageGetResult",
        ("storage.get_quota", false) => "StorageGetQuotaRequest",
        ("storage.get_quota", true) => "StorageGetQuotaResult",
        ("storage.list", false) => "StorageListRequest",
        ("storage.list", true) => "StorageListResult",
        ("storage.set", false) => "StorageSetRequest",
        ("storage.set", true) => "StorageSetResult",
        ("ui.close", false) => "UiCloseRequest",
        ("ui.close", true) => "UiCloseResult",
        _ => return None,
    })
}

fn schema_validator(definition: &str) -> jsonschema::Validator {
    let mut schema: Value =
        serde_json::from_str(HOST_API_SCHEMA).expect("Host API schema should be valid JSON");
    let object = schema
        .as_object_mut()
        .expect("Host API schema root should be an object");
    object.remove("oneOf");
    object.insert(
        "$ref".to_owned(),
        Value::String(format!("#/$defs/{definition}")),
    );
    jsonschema::draft202012::new(&schema).expect("Host API schema should compile")
}

fn map_schema_diagnostics(definition: &str, value: &Value) -> Vec<Diagnostic> {
    let validator = schema_validator(definition);
    let mut diagnostics = Vec::new();
    for error in validator.iter_errors(value) {
        let path = error.instance_path.to_string();
        match &error.kind {
            ValidationErrorKind::AdditionalProperties { unexpected } => {
                for property in unexpected {
                    diagnostics.push(Diagnostic {
                        code: "additional_property".to_owned(),
                        path: format!("{path}/{}", escape_pointer(property)),
                    });
                }
            }
            ValidationErrorKind::Required { property } => {
                diagnostics.push(Diagnostic {
                    code: "required".to_owned(),
                    path: format!(
                        "{path}/{}",
                        escape_pointer(property.as_str().unwrap_or_default())
                    ),
                });
            }
            ValidationErrorKind::UniqueItems => diagnostics.push(Diagnostic {
                code: "duplicate_value".to_owned(),
                path,
            }),
            ValidationErrorKind::FalseSchema => {
                if let Some(properties) = value.pointer(&path).and_then(Value::as_object) {
                    for property in properties.keys() {
                        diagnostics.push(Diagnostic {
                            code: "additional_property".to_owned(),
                            path: format!("{path}/{}", escape_pointer(property)),
                        });
                    }
                } else {
                    diagnostics.push(Diagnostic {
                        code: "invalid_value".to_owned(),
                        path,
                    });
                }
            }
            ValidationErrorKind::Type { .. } => diagnostics.push(Diagnostic {
                code: "invalid_type".to_owned(),
                path,
            }),
            ValidationErrorKind::OneOfNotValid { .. } | ValidationErrorKind::AnyOf { .. } => {
                diagnostics.push(Diagnostic {
                    code: "invalid_shape".to_owned(),
                    path,
                })
            }
            _ => diagnostics.push(Diagnostic {
                code: "invalid_value".to_owned(),
                path,
            }),
        }
    }
    diagnostics.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.code.cmp(&right.code))
    });
    diagnostics.dedup();
    diagnostics.truncate(16);
    diagnostics
}

fn sorted_diagnostic(value: &Value, pointer: &str) -> Option<Diagnostic> {
    let values = value.pointer(pointer)?.as_array()?;
    for index in 1..values.len() {
        let previous = values[index - 1].as_str()?;
        let current = values[index].as_str()?;
        if previous >= current {
            return Some(Diagnostic {
                code: "unsorted_value".to_owned(),
                path: format!("{pointer}/{index}"),
            });
        }
    }
    None
}

fn validate_fixture(fixture: &FixtureCase) -> Vec<Diagnostic> {
    let definition = match fixture.kind {
        FixtureKind::Context => "PluginRuntimeContextInput",
        FixtureKind::Error => "HostApiErrorInput",
        FixtureKind::Event => "HostApiEventInput",
        FixtureKind::Permission => {
            return if fixture
                .value
                .as_str()
                .is_some_and(|value| PERMISSIONS.contains(&value))
            {
                Vec::new()
            } else {
                vec![Diagnostic {
                    code: "invalid_value".to_owned(),
                    path: String::new(),
                }]
            };
        }
        FixtureKind::Request | FixtureKind::Result => {
            let method = fixture.value.get("method").and_then(Value::as_str);
            let Some(definition) = method.and_then(|method| {
                method_definition(method, matches!(fixture.kind, FixtureKind::Result))
            }) else {
                return vec![Diagnostic {
                    code: "method_not_found".to_owned(),
                    path: "/method".to_owned(),
                }];
            };
            definition
        }
    };

    let diagnostics = map_schema_diagnostics(definition, &fixture.value);
    if !diagnostics.is_empty() {
        return diagnostics;
    }
    match fixture.kind {
        FixtureKind::Context => sorted_diagnostic(&fixture.value, "/capabilities")
            .into_iter()
            .collect(),
        FixtureKind::Event => sorted_diagnostic(&fixture.value, "/payload/capabilities")
            .into_iter()
            .collect(),
        FixtureKind::Result
            if fixture.value.get("method").and_then(Value::as_str) == Some("storage.list") =>
        {
            sorted_diagnostic(&fixture.value, "/result/keys")
                .into_iter()
                .collect()
        }
        _ => Vec::new(),
    }
}

#[test]
fn rust_accepts_all_package_owned_valid_host_api_fixtures() {
    let fixtures: Vec<FixtureCase> =
        serde_json::from_str(VALID_FIXTURES).expect("valid Host API fixtures should parse");
    assert!(fixtures.len() >= 30);
    for fixture in fixtures {
        assert_eq!(
            validate_fixture(&fixture),
            Vec::<Diagnostic>::new(),
            "valid fixture rejected: {}",
            fixture.name
        );
    }
}

#[test]
fn rust_rejects_package_owned_invalid_host_api_fixtures_with_stable_paths() {
    let fixtures: Vec<FixtureCase> =
        serde_json::from_str(INVALID_FIXTURES).expect("invalid Host API fixtures should parse");
    for fixture in fixtures {
        let expected = fixture
            .expected
            .as_ref()
            .expect("invalid fixture should declare diagnostics")
            .iter()
            .map(|diagnostic| Diagnostic {
                code: diagnostic.code.clone(),
                path: diagnostic.path.clone(),
            })
            .collect::<Vec<_>>();
        assert_eq!(
            validate_fixture(&fixture),
            expected,
            "fixture: {}",
            fixture.name
        );
    }
}

#[test]
fn rust_catalog_and_schema_remain_closed_without_external_placeholder() {
    let schema: Value =
        serde_json::from_str(HOST_API_SCHEMA).expect("Host API schema should be valid JSON");
    let schema_methods = schema
        .pointer("/$defs/HostApiMethodInput/enum")
        .and_then(Value::as_array)
        .expect("method enum should exist")
        .iter()
        .map(|value| value.as_str().expect("method should be a string"))
        .collect::<Vec<_>>();
    assert_eq!(schema_methods, METHODS);
    assert!(!HOST_API_SCHEMA.contains("system.open_external"));
    for forbidden in [
        "requestId",
        "MessagePort",
        "postMessage",
        "pluginIdentity",
        "registrationRevision",
        "tauriCommand",
    ] {
        assert!(!HOST_API_SCHEMA.contains(forbidden));
    }
}

#[test]
fn host_api_contract_adds_no_production_command_or_dispatcher_boundary() {
    let lib_source = include_str!("lib.rs");
    let contract_source = include_str!("plugin_host_api_contract.rs");
    let implementation_source = contract_source
        .split("#[test]")
        .next()
        .expect("test-only implementation prefix should exist");
    assert!(lib_source.contains("#[cfg(test)]\nmod plugin_host_api_contract;"));
    for method in METHODS {
        assert!(!lib_source.contains(method));
    }
    for forbidden in [
        "#[tauri::command]",
        "Dispatcher",
        "MessagePort",
        "request_id",
        "permission_decision",
        "clipboard_handler",
        "storage_handler",
    ] {
        assert!(!implementation_source.contains(forbidden));
    }
}
