use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HostApiMethod {
  pub id: String,
  pub permission: Option<String>,
  pub params_schema: Option<Value>,
  pub result_schema: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HostApiRequest {
  pub plugin_id: String,
  pub method: String,
  pub params: Option<Value>,
  pub declared_permissions: Vec<String>,
  pub granted_permissions: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct HostApiError {
  pub code: String,
  pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum HostApiResult {
  Ok { ok: bool, result: Value },
  Err { ok: bool, error: HostApiError },
}

type HostApiHandler = fn(Option<Value>) -> Result<Value, HostApiError>;

#[derive(Clone)]
struct HostApiRegistration {
  method: HostApiMethod,
  handler: HostApiHandler,
}

#[derive(Clone, Default)]
pub struct HostApiDispatcher {
  methods: HashMap<String, HostApiRegistration>,
}

impl HostApiDispatcher {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn with_default_methods() -> Self {
    let mut dispatcher = Self::new();
    dispatcher.register(
      HostApiMethod {
        id: "lensx.runtime.get_context".to_string(),
        permission: None,
        params_schema: None,
        result_schema: None,
      },
      runtime_context,
    );
    dispatcher.register(
      HostApiMethod {
        id: "lensx.actions.open".to_string(),
        permission: None,
        params_schema: Some(json!({
          "type": "object",
          "required": ["action_id"],
          "properties": {
            "action_id": { "type": "string" }
          }
        })),
        result_schema: None,
      },
      acknowledge,
    );
    dispatcher.register(
      HostApiMethod {
        id: "lensx.preferences.get".to_string(),
        permission: Some("lensx.preferences.read".to_string()),
        params_schema: Some(json!({
          "type": "object",
          "required": ["key"],
          "properties": {
            "key": { "type": "string" }
          }
        })),
        result_schema: None,
      },
      null_result,
    );
    dispatcher
  }

  pub fn register(&mut self, method: HostApiMethod, handler: HostApiHandler) {
    self.methods.insert(
      method.id.clone(),
      HostApiRegistration {
        method,
        handler,
      },
    );
  }

  pub fn methods(&self) -> Vec<HostApiMethod> {
    self
      .methods
      .values()
      .map(|registration| registration.method.clone())
      .collect()
  }

  pub fn call(&self, request: HostApiRequest) -> HostApiResult {
    let Some(registration) = self.methods.get(&request.method) else {
      return HostApiResult::Err {
        ok: false,
        error: HostApiError {
          code: "method_not_found".to_string(),
          message: format!("unknown Host API method {}", request.method),
        },
      };
    };

    if let Some(permission) = &registration.method.permission {
      let declared_permissions: HashSet<&str> = request.declared_permissions.iter().map(String::as_str).collect();
      let granted_permissions: HashSet<&str> = request.granted_permissions.iter().map(String::as_str).collect();

      if !declared_permissions.contains(permission.as_str()) {
        return permission_error(format!("plugin did not declare permission {permission}"));
      }

      if !granted_permissions.contains(permission.as_str()) {
        return permission_error(format!("permission not granted {permission}"));
      }
    }

    match (registration.handler)(request.params) {
      Ok(result) => HostApiResult::Ok { ok: true, result },
      Err(error) => HostApiResult::Err { ok: false, error },
    }
  }
}

fn permission_error(message: String) -> HostApiResult {
  HostApiResult::Err {
    ok: false,
    error: HostApiError {
      code: "permission_denied".to_string(),
      message,
    },
  }
}

fn runtime_context(_params: Option<Value>) -> Result<Value, HostApiError> {
  Ok(json!({
    "host_version": "0.1.0"
  }))
}

fn acknowledge(_params: Option<Value>) -> Result<Value, HostApiError> {
  Ok(json!({ "ok": true }))
}

fn null_result(_params: Option<Value>) -> Result<Value, HostApiError> {
  Ok(Value::Null)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn denies_missing_permission() {
    let result = HostApiDispatcher::with_default_methods().call(HostApiRequest {
      plugin_id: "lensx.test.plugin".to_string(),
      method: "lensx.preferences.get".to_string(),
      params: None,
      declared_permissions: Vec::new(),
      granted_permissions: Vec::new(),
    });

    assert!(matches!(result, HostApiResult::Err { .. }));
  }
}
