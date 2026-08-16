use jsonschema::Validator;
use serde_json::Value;
use std::sync::OnceLock;

const HOST_API_SCHEMA: &str =
    include_str!("../../packages/plugin-contract/schema/host-api.schema.json");

fn validator(definition: &'static str, slot: &'static OnceLock<Validator>) -> &'static Validator {
    slot.get_or_init(|| {
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
    })
}

fn is_valid(definition: &'static str, slot: &'static OnceLock<Validator>, value: &Value) -> bool {
    validator(definition, slot).is_valid(value)
}

pub(crate) fn host_api_method(value: &Value) -> Option<&str> {
    value.get("method")?.as_str()
}

pub(crate) fn is_known_host_api_method(method: &str) -> bool {
    matches!(
        method,
        "actions.open"
            | "runtime.get_context"
            | "storage.delete"
            | "storage.get"
            | "storage.get_quota"
            | "storage.list"
            | "storage.set"
            | "ui.close"
    )
}

pub(crate) fn validate_host_api_request(value: &Value) -> bool {
    static VALIDATOR: OnceLock<Validator> = OnceLock::new();
    is_valid("HostApiRequestInput", &VALIDATOR, value)
}

pub(crate) fn validate_host_api_result(value: &Value, expected_method: &str) -> bool {
    static VALIDATOR: OnceLock<Validator> = OnceLock::new();
    host_api_method(value) == Some(expected_method)
        && is_valid("HostApiResultInput", &VALIDATOR, value)
}

pub(crate) fn validate_host_api_error(value: &Value) -> bool {
    static VALIDATOR: OnceLock<Validator> = OnceLock::new();
    is_valid("HostApiErrorInput", &VALIDATOR, value)
}

pub(crate) fn validate_host_api_event(value: &Value) -> bool {
    static VALIDATOR: OnceLock<Validator> = OnceLock::new();
    is_valid("HostApiEventInput", &VALIDATOR, value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn runtime_validators_share_the_public_semantic_schema() {
        assert!(validate_host_api_request(
            &json!({"method":"runtime.get_context","params":{}})
        ));
        assert!(!validate_host_api_request(
            &json!({"method":"runtime.get_context","params":{},"identity":"forged"})
        ));
        assert!(validate_host_api_result(
            &json!({
                "method":"runtime.get_context",
                "result":{
                    "hostApiVersion":"0.2.0",
                    "locale":"en-US",
                    "theme":"light",
                    "capabilities":[]
                }
            }),
            "runtime.get_context"
        ));
        assert!(!validate_host_api_result(
            &json!({"method":"ui.close","result":{"accepted":true}}),
            "runtime.get_context"
        ));
        assert!(validate_host_api_error(
            &json!({"code":"timeout","message":"The Host API request timed out."})
        ));
        assert!(validate_host_api_event(&json!({
            "event":"runtime.context_changed",
            "payload":{
                "hostApiVersion":"0.2.0",
                "locale":"zh-CN",
                "theme":"dark",
                "capabilities":[]
            }
        })));
    }
}
