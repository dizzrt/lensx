use crate::plugin_host_api_validation::{
    host_api_method, is_known_host_api_method, validate_host_api_error, validate_host_api_event,
    validate_host_api_request, validate_host_api_result,
};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, VecDeque};

pub(crate) const PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_BYTES: usize = 5_242_880;
pub(crate) const PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_DEPTH: usize = 36;
pub(crate) const PLUGIN_CHILD_WEBVIEW_RPC_MAX_SEMANTIC_DEPTH: usize = 32;
pub(crate) const PLUGIN_CHILD_WEBVIEW_RPC_MAX_VISITED_NODES: usize = 16_384;
pub(crate) const PLUGIN_CHILD_WEBVIEW_RPC_MAX_IN_FLIGHT: usize = 32;
pub(crate) const PLUGIN_CHILD_WEBVIEW_RPC_HOST_DEADLINE_MS: u64 = 10_000;
const MAX_DIAGNOSTICS: usize = 64;
const CONTRACT_VERSION: &str = "0.2.0";
const REQUEST_TYPE: &str = "lensx.plugin_bridge.request";
const RESPONSE_TYPE: &str = "lensx.plugin_bridge.response";
const EVENT_TYPE: &str = "lensx.plugin_bridge.event";
const CANCEL_TYPE: &str = "lensx.plugin_bridge.cancel";
const DISCONNECT_TYPE: &str = "lensx.plugin_bridge.disconnect";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewRpcDiagnosticStage {
    Ingress,
    Execution,
    Egress,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewRpcDiagnosticCode {
    ProtocolViolation,
    FrameLimitExceeded,
    ConcurrencyLimitExceeded,
    ExecutionTimeout,
    HandlerFailed,
    InvalidHandlerOutput,
    InvalidEvent,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewRpcDiagnostic {
    pub(crate) stage: PluginChildWebviewRpcDiagnosticStage,
    pub(crate) code: PluginChildWebviewRpcDiagnosticCode,
    pub(crate) method: Option<String>,
    pub(crate) message: &'static str,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PluginChildWebviewRpcDispatch {
    pub(crate) request_id: String,
    pub(crate) method: String,
    pub(crate) request: Value,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewRpcCancellation {
    pub(crate) request_id: String,
    pub(crate) method: String,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum PluginChildWebviewRpcEffect {
    Dispatch(PluginChildWebviewRpcDispatch),
    Cancel(PluginChildWebviewRpcCancellation),
    Deliver(Value),
    Disconnect,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewRpcIngressResult {
    Dispatched,
    Cancelled,
    Disconnected,
    Responded,
    Ignored,
    ProtocolViolation,
    SessionUnavailable,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PluginChildWebviewRpcOutcome {
    pub(crate) result: PluginChildWebviewRpcIngressResult,
    pub(crate) effects: Vec<PluginChildWebviewRpcEffect>,
}

#[derive(Clone, Debug)]
struct PendingRequest {
    method: String,
    deadline_at_ms: u64,
}

#[derive(Debug, Default)]
pub(crate) struct PluginChildWebviewRpcSession {
    connected: bool,
    terminal: bool,
    request_high_water: Option<u64>,
    pending: HashMap<String, PendingRequest>,
    diagnostics: VecDeque<PluginChildWebviewRpcDiagnostic>,
}

impl PluginChildWebviewRpcSession {
    pub(crate) fn connect(&mut self) -> bool {
        if self.connected || self.terminal {
            return false;
        }
        self.connected = true;
        true
    }

    pub(crate) fn receive(&mut self, body: &str, now_ms: u64) -> PluginChildWebviewRpcOutcome {
        if !self.connected || self.terminal {
            return outcome(
                PluginChildWebviewRpcIngressResult::SessionUnavailable,
                vec![],
            );
        }
        let Ok(frame) = serde_json::from_str::<Value>(body) else {
            return self.protocol_violation();
        };
        let Some(object) = frame.as_object() else {
            return self.protocol_violation();
        };
        if object.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION) {
            return self.protocol_violation();
        }
        match object.get("type").and_then(Value::as_str) {
            Some(REQUEST_TYPE) => self.receive_request(object, body.len(), now_ms),
            Some(CANCEL_TYPE) => self.receive_cancel(object),
            Some(DISCONNECT_TYPE) if exact_keys(object, &["contract_version", "type"]) => {
                self.disconnect(false)
            }
            _ => self.protocol_violation(),
        }
    }

    pub(crate) fn settle(
        &mut self,
        request_id: &str,
        output: Value,
    ) -> PluginChildWebviewRpcOutcome {
        if !self.connected || self.terminal {
            return outcome(
                PluginChildWebviewRpcIngressResult::SessionUnavailable,
                vec![],
            );
        }
        let Some(pending) = self.pending.remove(request_id) else {
            return outcome(PluginChildWebviewRpcIngressResult::Ignored, vec![]);
        };
        let response = if validate_host_api_error(&output) {
            response_error(request_id, output)
        } else if validate_host_api_result(&output, &pending.method)
            && within_value_budget(&output, PLUGIN_CHILD_WEBVIEW_RPC_MAX_SEMANTIC_DEPTH)
        {
            response_result(request_id, output)
        } else {
            self.diagnose(
                PluginChildWebviewRpcDiagnosticStage::Egress,
                PluginChildWebviewRpcDiagnosticCode::InvalidHandlerOutput,
                Some(&pending.method),
            );
            response_error(request_id, internal_error())
        };
        if !within_value_budget(&response, PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_DEPTH) {
            self.diagnose(
                PluginChildWebviewRpcDiagnosticStage::Egress,
                PluginChildWebviewRpcDiagnosticCode::InvalidHandlerOutput,
                Some(&pending.method),
            );
            return outcome(
                PluginChildWebviewRpcIngressResult::Responded,
                vec![PluginChildWebviewRpcEffect::Deliver(response_error(
                    request_id,
                    internal_error(),
                ))],
            );
        }
        outcome(
            PluginChildWebviewRpcIngressResult::Responded,
            vec![PluginChildWebviewRpcEffect::Deliver(response)],
        )
    }

    pub(crate) fn fail_handler(&mut self, request_id: &str) -> PluginChildWebviewRpcOutcome {
        let Some(pending) = self.pending.remove(request_id) else {
            return outcome(PluginChildWebviewRpcIngressResult::Ignored, vec![]);
        };
        self.diagnose(
            PluginChildWebviewRpcDiagnosticStage::Execution,
            PluginChildWebviewRpcDiagnosticCode::HandlerFailed,
            Some(&pending.method),
        );
        outcome(
            PluginChildWebviewRpcIngressResult::Responded,
            vec![PluginChildWebviewRpcEffect::Deliver(response_error(
                request_id,
                internal_error(),
            ))],
        )
    }

    pub(crate) fn expire(&mut self, now_ms: u64) -> Vec<PluginChildWebviewRpcEffect> {
        if !self.connected || self.terminal {
            return Vec::new();
        }
        let mut expired = self
            .pending
            .iter()
            .filter(|(_, pending)| now_ms >= pending.deadline_at_ms)
            .map(|(request_id, pending)| (request_id.clone(), pending.method.clone()))
            .collect::<Vec<_>>();
        expired.sort_by(|left, right| left.0.cmp(&right.0));
        let mut effects = Vec::with_capacity(expired.len() * 2);
        for (request_id, method) in expired {
            self.pending.remove(&request_id);
            self.diagnose(
                PluginChildWebviewRpcDiagnosticStage::Execution,
                PluginChildWebviewRpcDiagnosticCode::ExecutionTimeout,
                Some(&method),
            );
            effects.push(PluginChildWebviewRpcEffect::Cancel(
                PluginChildWebviewRpcCancellation {
                    request_id: request_id.clone(),
                    method,
                },
            ));
            effects.push(PluginChildWebviewRpcEffect::Deliver(response_error(
                &request_id,
                timeout_error(),
            )));
        }
        effects
    }

    pub(crate) fn emit_event(&mut self, event: Value) -> PluginChildWebviewRpcOutcome {
        if !self.connected || self.terminal {
            return outcome(
                PluginChildWebviewRpcIngressResult::SessionUnavailable,
                vec![],
            );
        }
        let frame = json!({
            "contract_version": CONTRACT_VERSION,
            "type": EVENT_TYPE,
            "event": event,
        });
        if !validate_host_api_event(&frame["event"])
            || !within_value_budget(&frame["event"], PLUGIN_CHILD_WEBVIEW_RPC_MAX_SEMANTIC_DEPTH)
            || !within_value_budget(&frame, PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_DEPTH)
        {
            self.diagnose(
                PluginChildWebviewRpcDiagnosticStage::Egress,
                PluginChildWebviewRpcDiagnosticCode::InvalidEvent,
                None,
            );
            return outcome(PluginChildWebviewRpcIngressResult::Ignored, vec![]);
        }
        outcome(
            PluginChildWebviewRpcIngressResult::Responded,
            vec![PluginChildWebviewRpcEffect::Deliver(frame)],
        )
    }

    pub(crate) fn terminate(&mut self, notify_peer: bool) -> Vec<PluginChildWebviewRpcEffect> {
        if self.terminal {
            return Vec::new();
        }
        self.disconnect(notify_peer).effects
    }

    #[cfg(test)]
    pub(crate) fn diagnostics(&self) -> Vec<PluginChildWebviewRpcDiagnostic> {
        self.diagnostics.iter().cloned().collect()
    }

    pub(crate) fn pending_count(&self) -> usize {
        self.pending.len()
    }

    fn receive_request(
        &mut self,
        object: &Map<String, Value>,
        raw_bytes: usize,
        now_ms: u64,
    ) -> PluginChildWebviewRpcOutcome {
        if !exact_keys(
            object,
            &["contract_version", "type", "request_id", "request"],
        ) {
            return self.protocol_violation();
        }
        let Some(request_id) = object.get("request_id").and_then(Value::as_str) else {
            return self.protocol_violation();
        };
        let Some(sequence) = request_sequence(request_id) else {
            return self.protocol_violation();
        };
        if self.request_high_water.is_some_and(|high| sequence <= high) {
            return self.protocol_violation();
        }
        self.request_high_water = Some(sequence);
        let request = &object["request"];
        let method = host_api_method(request).filter(|method| is_known_host_api_method(method));
        if raw_bytes > PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_BYTES
            || !within_value_budget(
                &Value::Object(object.clone()),
                PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_DEPTH,
            )
            || request.get("params").is_some_and(|params| {
                !within_value_budget(params, PLUGIN_CHILD_WEBVIEW_RPC_MAX_SEMANTIC_DEPTH)
            })
        {
            self.diagnose(
                PluginChildWebviewRpcDiagnosticStage::Ingress,
                PluginChildWebviewRpcDiagnosticCode::FrameLimitExceeded,
                method,
            );
            return outcome(
                PluginChildWebviewRpcIngressResult::Responded,
                vec![PluginChildWebviewRpcEffect::Deliver(response_error(
                    request_id,
                    limit_error(),
                ))],
            );
        }
        let Some(request_object) = request.as_object() else {
            return self.request_error(request_id, invalid_request_error());
        };
        if !exact_keys(request_object, &["method", "params"])
            || request_object
                .get("method")
                .and_then(Value::as_str)
                .is_none()
        {
            return self.request_error(request_id, invalid_request_error());
        }
        let method_text = request_object["method"]
            .as_str()
            .expect("checked method string");
        if !is_known_host_api_method(method_text) {
            return self.request_error(request_id, method_not_found_error());
        }
        if !validate_host_api_request(request) {
            return self.request_error(request_id, invalid_params_error());
        }
        if self.pending.len() >= PLUGIN_CHILD_WEBVIEW_RPC_MAX_IN_FLIGHT {
            self.diagnose(
                PluginChildWebviewRpcDiagnosticStage::Ingress,
                PluginChildWebviewRpcDiagnosticCode::ConcurrencyLimitExceeded,
                Some(method_text),
            );
            return self.request_error(request_id, limit_error());
        }
        let Some(deadline_at_ms) = now_ms.checked_add(PLUGIN_CHILD_WEBVIEW_RPC_HOST_DEADLINE_MS)
        else {
            return self.request_error(request_id, internal_error());
        };
        self.pending.insert(
            request_id.to_owned(),
            PendingRequest {
                method: method_text.to_owned(),
                deadline_at_ms,
            },
        );
        outcome(
            PluginChildWebviewRpcIngressResult::Dispatched,
            vec![PluginChildWebviewRpcEffect::Dispatch(
                PluginChildWebviewRpcDispatch {
                    request_id: request_id.to_owned(),
                    method: method_text.to_owned(),
                    request: request.clone(),
                },
            )],
        )
    }

    fn receive_cancel(&mut self, object: &Map<String, Value>) -> PluginChildWebviewRpcOutcome {
        if !exact_keys(object, &["contract_version", "type", "request_id"]) {
            return self.protocol_violation();
        }
        let Some(request_id) = object.get("request_id").and_then(Value::as_str) else {
            return self.protocol_violation();
        };
        if request_sequence(request_id).is_none() {
            return self.protocol_violation();
        }
        let Some(pending) = self.pending.remove(request_id) else {
            return outcome(PluginChildWebviewRpcIngressResult::Ignored, vec![]);
        };
        outcome(
            PluginChildWebviewRpcIngressResult::Cancelled,
            vec![PluginChildWebviewRpcEffect::Cancel(
                PluginChildWebviewRpcCancellation {
                    request_id: request_id.to_owned(),
                    method: pending.method,
                },
            )],
        )
    }

    fn request_error(&self, request_id: &str, error: Value) -> PluginChildWebviewRpcOutcome {
        outcome(
            PluginChildWebviewRpcIngressResult::Responded,
            vec![PluginChildWebviewRpcEffect::Deliver(response_error(
                request_id, error,
            ))],
        )
    }

    fn protocol_violation(&mut self) -> PluginChildWebviewRpcOutcome {
        self.diagnose(
            PluginChildWebviewRpcDiagnosticStage::Ingress,
            PluginChildWebviewRpcDiagnosticCode::ProtocolViolation,
            None,
        );
        self.disconnect(true)
            .with_result(PluginChildWebviewRpcIngressResult::ProtocolViolation)
    }

    fn disconnect(&mut self, notify_peer: bool) -> PluginChildWebviewRpcOutcome {
        if self.terminal {
            return outcome(PluginChildWebviewRpcIngressResult::Ignored, vec![]);
        }
        self.connected = false;
        self.terminal = true;
        let mut pending = self.pending.drain().collect::<Vec<_>>();
        pending.sort_by(|left, right| left.0.cmp(&right.0));
        let mut effects = pending
            .into_iter()
            .map(|(request_id, pending)| {
                PluginChildWebviewRpcEffect::Cancel(PluginChildWebviewRpcCancellation {
                    request_id,
                    method: pending.method,
                })
            })
            .collect::<Vec<_>>();
        if notify_peer {
            effects.push(PluginChildWebviewRpcEffect::Deliver(json!({
                "contract_version": CONTRACT_VERSION,
                "type": DISCONNECT_TYPE,
            })));
        }
        effects.push(PluginChildWebviewRpcEffect::Disconnect);
        outcome(PluginChildWebviewRpcIngressResult::Disconnected, effects)
    }

    fn diagnose(
        &mut self,
        stage: PluginChildWebviewRpcDiagnosticStage,
        code: PluginChildWebviewRpcDiagnosticCode,
        method: Option<&str>,
    ) {
        if self.diagnostics.len() == MAX_DIAGNOSTICS {
            self.diagnostics.pop_front();
        }
        self.diagnostics.push_back(PluginChildWebviewRpcDiagnostic {
            stage,
            code,
            method: method.map(str::to_owned),
            message: diagnostic_message(code),
        });
    }
}

impl PluginChildWebviewRpcOutcome {
    fn with_result(mut self, result: PluginChildWebviewRpcIngressResult) -> Self {
        self.result = result;
        self
    }
}

fn outcome(
    result: PluginChildWebviewRpcIngressResult,
    effects: Vec<PluginChildWebviewRpcEffect>,
) -> PluginChildWebviewRpcOutcome {
    PluginChildWebviewRpcOutcome { result, effects }
}

fn exact_keys(object: &Map<String, Value>, expected: &[&str]) -> bool {
    object.len() == expected.len() && expected.iter().all(|key| object.contains_key(*key))
}

fn request_sequence(request_id: &str) -> Option<u64> {
    let hexadecimal = request_id.strip_prefix("request_")?;
    if hexadecimal.len() != 16
        || !hexadecimal
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return None;
    }
    u64::from_str_radix(hexadecimal, 16).ok()
}

fn within_value_budget(value: &Value, max_depth: usize) -> bool {
    let mut visited_nodes = 0usize;
    let mut stack = vec![(value, 0usize)];
    while let Some((current, depth)) = stack.pop() {
        if depth > max_depth {
            return false;
        }
        visited_nodes = match visited_nodes.checked_add(1) {
            Some(count) if count <= PLUGIN_CHILD_WEBVIEW_RPC_MAX_VISITED_NODES => count,
            _ => return false,
        };
        match current {
            Value::Array(values) => {
                stack.extend(values.iter().map(|child| (child, depth + 1)));
            }
            Value::Object(values) => {
                visited_nodes = match visited_nodes.checked_add(values.len()) {
                    Some(count) if count <= PLUGIN_CHILD_WEBVIEW_RPC_MAX_VISITED_NODES => count,
                    _ => return false,
                };
                stack.extend(values.values().map(|child| (child, depth + 1)));
            }
            _ => {}
        }
    }
    serde_json::to_vec(value)
        .is_ok_and(|encoded| encoded.len() <= PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_BYTES)
}

fn response_result(request_id: &str, result: Value) -> Value {
    json!({
        "contract_version": CONTRACT_VERSION,
        "type": RESPONSE_TYPE,
        "request_id": request_id,
        "result": result,
    })
}

fn response_error(request_id: &str, error: Value) -> Value {
    json!({
        "contract_version": CONTRACT_VERSION,
        "type": RESPONSE_TYPE,
        "request_id": request_id,
        "error": error,
    })
}

fn host_error(code: &str, message: &str) -> Value {
    json!({"code": code, "message": message})
}

fn internal_error() -> Value {
    host_error("internal_error", "The Host API request failed.")
}

fn invalid_params_error() -> Value {
    host_error("invalid_params", "The Host API parameters are invalid.")
}

fn invalid_request_error() -> Value {
    host_error("invalid_request", "The Host API request is invalid.")
}

fn limit_error() -> Value {
    host_error("limit_exceeded", "The Host API limit was exceeded.")
}

fn method_not_found_error() -> Value {
    host_error("method_not_found", "The Host API method was not found.")
}

fn timeout_error() -> Value {
    host_error("timeout", "The Host API request timed out.")
}

fn diagnostic_message(code: PluginChildWebviewRpcDiagnosticCode) -> &'static str {
    match code {
        PluginChildWebviewRpcDiagnosticCode::ProtocolViolation => {
            "The plugin RPC frame violated the private protocol."
        }
        PluginChildWebviewRpcDiagnosticCode::FrameLimitExceeded => {
            "The plugin RPC frame exceeded a fixed limit."
        }
        PluginChildWebviewRpcDiagnosticCode::ConcurrencyLimitExceeded => {
            "The plugin RPC concurrency limit was exceeded."
        }
        PluginChildWebviewRpcDiagnosticCode::ExecutionTimeout => {
            "The plugin RPC handler exceeded its execution deadline."
        }
        PluginChildWebviewRpcDiagnosticCode::HandlerFailed => "The plugin RPC handler failed.",
        PluginChildWebviewRpcDiagnosticCode::InvalidHandlerOutput => {
            "The plugin RPC handler returned invalid output."
        }
        PluginChildWebviewRpcDiagnosticCode::InvalidEvent => {
            "The Host produced an invalid plugin RPC event."
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(sequence: u64, method: &str, params: Value) -> String {
        json!({
            "contract_version": CONTRACT_VERSION,
            "type": REQUEST_TYPE,
            "request_id": format!("request_{sequence:016x}"),
            "request": {"method": method, "params": params},
        })
        .to_string()
    }

    fn dispatch(effect: &PluginChildWebviewRpcEffect) -> &PluginChildWebviewRpcDispatch {
        let PluginChildWebviewRpcEffect::Dispatch(dispatch) = effect else {
            panic!("expected dispatch effect")
        };
        dispatch
    }

    #[test]
    fn request_ids_are_strict_and_semantics_use_the_public_schema() {
        let mut session = PluginChildWebviewRpcSession::default();
        assert!(session.connect());
        let first = session.receive(&request(1, "storage.get", json!({"key":"theme"})), 10);
        assert_eq!(first.result, PluginChildWebviewRpcIngressResult::Dispatched);
        assert_eq!(dispatch(&first.effects[0]).method, "storage.get");

        let duplicate = session.receive(&request(1, "storage.get", json!({"key":"other"})), 11);
        assert_eq!(
            duplicate.result,
            PluginChildWebviewRpcIngressResult::ProtocolViolation
        );
        assert!(duplicate
            .effects
            .iter()
            .any(|effect| matches!(effect, PluginChildWebviewRpcEffect::Disconnect)));

        let mut invalid = PluginChildWebviewRpcSession::default();
        invalid.connect();
        let response = invalid.receive(&request(1, "storage.get", json!({"key":""})), 0);
        assert_eq!(
            response.result,
            PluginChildWebviewRpcIngressResult::Responded
        );
        assert_eq!(
            response.effects[0],
            PluginChildWebviewRpcEffect::Deliver(response_error(
                "request_0000000000000001",
                invalid_params_error(),
            ))
        );
    }

    #[test]
    fn thirty_two_in_flight_limit_and_host_deadline_are_preserved() {
        let mut session = PluginChildWebviewRpcSession::default();
        session.connect();
        for sequence in 0..PLUGIN_CHILD_WEBVIEW_RPC_MAX_IN_FLIGHT as u64 {
            assert_eq!(
                session
                    .receive(&request(sequence, "runtime.get_context", json!({})), 100)
                    .result,
                PluginChildWebviewRpcIngressResult::Dispatched
            );
        }
        let limited = session.receive(&request(32, "runtime.get_context", json!({})), 100);
        assert_eq!(
            limited.result,
            PluginChildWebviewRpcIngressResult::Responded
        );
        assert_eq!(session.pending_count(), 32);
        let expired = session.expire(10_100);
        assert_eq!(expired.len(), 64);
        assert_eq!(session.pending_count(), 0);
        assert_eq!(
            session
                .diagnostics()
                .last()
                .map(|diagnostic| diagnostic.code),
            Some(PluginChildWebviewRpcDiagnosticCode::ExecutionTimeout)
        );
    }

    #[test]
    fn cancellation_removes_only_the_correlated_request() {
        let mut session = PluginChildWebviewRpcSession::default();
        session.connect();
        session.receive(&request(1, "runtime.get_context", json!({})), 0);
        session.receive(&request(2, "ui.close", json!({})), 0);
        let cancel = json!({
            "contract_version": CONTRACT_VERSION,
            "type": CANCEL_TYPE,
            "request_id": "request_0000000000000001",
        })
        .to_string();
        let outcome = session.receive(&cancel, 1);
        assert_eq!(
            outcome.result,
            PluginChildWebviewRpcIngressResult::Cancelled
        );
        assert_eq!(session.pending_count(), 1);
        assert_eq!(
            outcome.effects[0],
            PluginChildWebviewRpcEffect::Cancel(PluginChildWebviewRpcCancellation {
                request_id: "request_0000000000000001".to_owned(),
                method: "runtime.get_context".to_owned(),
            })
        );
    }

    #[test]
    fn concurrent_requests_settle_out_of_order_and_exactly_once() {
        let mut session = PluginChildWebviewRpcSession::default();
        session.connect();
        session.receive(&request(1, "runtime.get_context", json!({})), 0);
        session.receive(&request(2, "ui.close", json!({})), 0);
        let second = session.settle(
            "request_0000000000000002",
            json!({"method":"ui.close","result":{"accepted":true}}),
        );
        let first = session.settle(
            "request_0000000000000001",
            json!({
                "method":"runtime.get_context",
                "result":{
                    "hostApiVersion":"0.2.0",
                    "locale":"en-US",
                    "theme":"light",
                    "capabilities":[]
                }
            }),
        );
        assert_eq!(second.result, PluginChildWebviewRpcIngressResult::Responded);
        assert_eq!(first.result, PluginChildWebviewRpcIngressResult::Responded);
        assert_eq!(
            session
                .settle("request_0000000000000002", internal_error())
                .result,
            PluginChildWebviewRpcIngressResult::Ignored
        );
    }

    #[test]
    fn invalid_egress_becomes_closed_internal_error() {
        let mut session = PluginChildWebviewRpcSession::default();
        session.connect();
        session.receive(&request(1, "ui.close", json!({})), 0);
        let outcome = session.settle(
            "request_0000000000000001",
            json!({"method":"runtime.get_context","result":{}}),
        );
        assert_eq!(
            outcome.effects[0],
            PluginChildWebviewRpcEffect::Deliver(response_error(
                "request_0000000000000001",
                internal_error(),
            ))
        );
        assert_eq!(
            session.diagnostics()[0].code,
            PluginChildWebviewRpcDiagnosticCode::InvalidHandlerOutput
        );
    }

    #[test]
    fn unicode_html_and_script_shaped_results_remain_structured_data() {
        let mut session = PluginChildWebviewRpcSession::default();
        session.connect();
        session.receive(&request(1, "storage.get", json!({"key":"payload"})), 0);
        let payload = "雪❄️</script><script>globalThis.injected=true</script>\u{2028}\u{2029}";
        let outcome = session.settle(
            "request_0000000000000001",
            json!({
                "method":"storage.get",
                "result":{"found":true,"value":payload}
            }),
        );
        let PluginChildWebviewRpcEffect::Deliver(frame) = &outcome.effects[0] else {
            panic!("expected structured delivery")
        };
        assert_eq!(frame["result"]["result"]["value"], payload);
        assert_eq!(
            session
                .settle(
                    "request_0000000000000001",
                    json!({"method":"storage.get","result":{"found":false}}),
                )
                .result,
            PluginChildWebviewRpcIngressResult::Ignored
        );
    }

    #[test]
    fn frame_budget_and_diagnostics_are_bounded_without_payloads() {
        let mut session = PluginChildWebviewRpcSession::default();
        session.connect();
        let oversized = request(
            1,
            "storage.set",
            json!({"key":"large","value":"x".repeat(PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_BYTES)}),
        );
        assert_eq!(
            session.receive(&oversized, 0).result,
            PluginChildWebviewRpcIngressResult::Responded
        );
        for _ in 0..80 {
            session.diagnose(
                PluginChildWebviewRpcDiagnosticStage::Ingress,
                PluginChildWebviewRpcDiagnosticCode::FrameLimitExceeded,
                Some("storage.set"),
            );
        }
        let diagnostics = session.diagnostics();
        assert_eq!(diagnostics.len(), MAX_DIAGNOSTICS);
        assert!(diagnostics.iter().all(|diagnostic| {
            diagnostic.method.as_deref() == Some("storage.set")
                && !diagnostic.message.contains("large")
                && !diagnostic.message.contains("request_")
        }));
    }

    #[test]
    fn disconnect_aborts_every_pending_operation_and_is_terminal() {
        let mut session = PluginChildWebviewRpcSession::default();
        session.connect();
        session.receive(&request(1, "runtime.get_context", json!({})), 0);
        session.receive(&request(2, "ui.close", json!({})), 0);
        let disconnect = json!({
            "contract_version": CONTRACT_VERSION,
            "type": DISCONNECT_TYPE,
        })
        .to_string();
        let outcome = session.receive(&disconnect, 1);
        assert_eq!(
            outcome.result,
            PluginChildWebviewRpcIngressResult::Disconnected
        );
        assert_eq!(
            outcome
                .effects
                .iter()
                .filter(|effect| matches!(effect, PluginChildWebviewRpcEffect::Cancel(_)))
                .count(),
            2
        );
        assert_eq!(
            session
                .receive(&request(3, "ui.close", json!({})), 2)
                .result,
            PluginChildWebviewRpcIngressResult::SessionUnavailable
        );
    }
}
