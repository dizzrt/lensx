#![allow(dead_code)] // Task 4.1 wires the Host React adapter into the product presentation root.

use crate::{
    plugin_child_webview_adapter::{PluginChildWebviewHandle, PluginChildWebviewNativeHandle},
    plugin_child_webview_rpc::PluginChildWebviewRpcIngressResult,
    plugin_child_webview_service::{
        PluginChildWebviewAttempt, PluginChildWebviewReadyDispatcher, PluginChildWebviewReadyFacts,
        PluginChildWebviewRegistry, PluginChildWebviewRpcCancellationFacts,
        PluginChildWebviewRpcDispatchFacts, PluginChildWebviewRpcDispatcher,
        PluginChildWebviewService,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime, State};

pub(crate) const PLUGIN_CHILD_WEBVIEW_HOST_DISPATCH_EVENT: &str =
    "plugin-child-webview-host-dispatch";
pub(crate) const PLUGIN_CHILD_WEBVIEW_HOST_CANCEL_EVENT: &str = "plugin-child-webview-host-cancel";
pub(crate) const PLUGIN_CHILD_WEBVIEW_HOST_DISCONNECT_EVENT: &str =
    "plugin-child-webview-host-disconnect";
pub(crate) const PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION: &str = "0.1.0";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PluginChildWebviewHostAuthorityIdentity {
    pub(crate) entry_id: String,
    pub(crate) plugin_id: String,
    pub(crate) version: String,
    pub(crate) page_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PluginChildWebviewHostDispatchEvent {
    pub(crate) contract_version: &'static str,
    pub(crate) session_id: String,
    pub(crate) dispatch_id: String,
    pub(crate) identity: PluginChildWebviewHostAuthorityIdentity,
    pub(crate) request: Value,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PluginChildWebviewHostCancelEvent {
    pub(crate) contract_version: &'static str,
    pub(crate) session_id: String,
    pub(crate) dispatch_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PluginChildWebviewHostDisconnectEvent {
    pub(crate) contract_version: &'static str,
    pub(crate) session_id: String,
}

pub(crate) trait PluginChildWebviewHostEmitter: Send + Sync + 'static {
    fn dispatch(&self, payload: &PluginChildWebviewHostDispatchEvent) -> bool;
    fn cancel(&self, payload: &PluginChildWebviewHostCancelEvent);
    fn disconnect(&self, payload: &PluginChildWebviewHostDisconnectEvent);
}

struct TauriPluginChildWebviewHostEmitter<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> PluginChildWebviewHostEmitter for TauriPluginChildWebviewHostEmitter<R> {
    fn dispatch(&self, payload: &PluginChildWebviewHostDispatchEvent) -> bool {
        self.app
            .emit_to(
                EventTarget::webview("main"),
                PLUGIN_CHILD_WEBVIEW_HOST_DISPATCH_EVENT,
                payload,
            )
            .is_ok()
    }

    fn cancel(&self, payload: &PluginChildWebviewHostCancelEvent) {
        let _ = self.app.emit_to(
            EventTarget::webview("main"),
            PLUGIN_CHILD_WEBVIEW_HOST_CANCEL_EVENT,
            payload,
        );
    }

    fn disconnect(&self, payload: &PluginChildWebviewHostDisconnectEvent) {
        let _ = self.app.emit_to(
            EventTarget::webview("main"),
            PLUGIN_CHILD_WEBVIEW_HOST_DISCONNECT_EVENT,
            payload,
        );
    }
}

#[derive(Clone, Debug)]
struct HostSessionBinding {
    attempt: PluginChildWebviewAttempt,
    source_label: String,
    plugin_id: String,
}

#[derive(Clone, Debug)]
struct HostDispatchBinding {
    session_id: String,
    request_id: String,
    method: String,
}

#[derive(Default)]
struct HostDispatcherState {
    sessions: HashMap<String, HostSessionBinding>,
    dispatches: HashMap<String, HostDispatchBinding>,
}

pub(crate) struct PluginChildWebviewHostDispatcher<H: PluginChildWebviewNativeHandle> {
    service: Arc<PluginChildWebviewRegistry<H>>,
    emitter: Arc<dyn PluginChildWebviewHostEmitter>,
    state: Mutex<HostDispatcherState>,
}

impl<H: PluginChildWebviewNativeHandle> PluginChildWebviewHostDispatcher<H> {
    fn new(
        service: Arc<PluginChildWebviewRegistry<H>>,
        emitter: Arc<dyn PluginChildWebviewHostEmitter>,
    ) -> Self {
        Self {
            service,
            emitter,
            state: Mutex::new(HostDispatcherState::default()),
        }
    }

    pub(crate) fn settle(&self, dispatch_id: &str, output: Value) -> bool {
        let binding = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .dispatches
            .remove(dispatch_id);
        let Some(binding) = binding else {
            return false;
        };
        let session = self.session(&binding.session_id);
        let Some(session) = session else {
            return false;
        };
        self.service.settle_rpc_dispatch(
            session.attempt,
            &session.source_label,
            &binding.request_id,
            output,
        ) == PluginChildWebviewRpcIngressResult::Responded
    }

    pub(crate) fn fail(&self, dispatch_id: &str) -> bool {
        let binding = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .dispatches
            .remove(dispatch_id);
        let Some(binding) = binding else {
            return false;
        };
        let Some(session) = self.session(&binding.session_id) else {
            return false;
        };
        self.service
            .fail_rpc_dispatch(session.attempt, &session.source_label, &binding.request_id)
            == PluginChildWebviewRpcIngressResult::Responded
    }

    pub(crate) fn emit_event(&self, session_id: &str, event: Value) -> bool {
        let Some(session) = self.session(session_id) else {
            return false;
        };
        self.service
            .emit_rpc_event(session.attempt, &session.source_label, event)
            == PluginChildWebviewRpcIngressResult::Responded
    }

    fn session(&self, session_id: &str) -> Option<HostSessionBinding> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .sessions
            .get(session_id)
            .cloned()
    }
}

impl<H: PluginChildWebviewNativeHandle> PluginChildWebviewRpcDispatcher
    for PluginChildWebviewHostDispatcher<H>
{
    fn dispatch(&self, facts: &PluginChildWebviewRpcDispatchFacts) -> bool {
        let session_id = opaque_identifier(
            b"lensx-plugin-child-webview-host-session-v1\0",
            &[
                facts.attempt.opaque_id().as_bytes(),
                facts.plugin_id.as_bytes(),
                facts.registration_entry_id.as_bytes(),
            ],
        );
        let dispatch_id = opaque_identifier(
            b"lensx-plugin-child-webview-host-dispatch-v1\0",
            &[session_id.as_bytes(), facts.request_id.as_bytes()],
        );
        let payload = PluginChildWebviewHostDispatchEvent {
            contract_version: PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION,
            session_id: session_id.clone(),
            dispatch_id: dispatch_id.clone(),
            identity: PluginChildWebviewHostAuthorityIdentity {
                entry_id: facts.registration_entry_id.clone(),
                plugin_id: facts.plugin_id.clone(),
                version: facts.plugin_version.clone(),
                page_id: facts.page_id.clone(),
            },
            request: facts.request.clone(),
        };
        {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state.sessions.insert(
                session_id.clone(),
                HostSessionBinding {
                    attempt: facts.attempt,
                    source_label: facts.source_label.clone(),
                    plugin_id: facts.plugin_id.clone(),
                },
            );
            state.dispatches.insert(
                dispatch_id.clone(),
                HostDispatchBinding {
                    session_id: session_id.clone(),
                    request_id: facts.request_id.clone(),
                    method: facts.method.clone(),
                },
            );
        }
        if self.emitter.dispatch(&payload) {
            true
        } else {
            self.state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .dispatches
                .remove(&dispatch_id);
            false
        }
    }

    fn cancel(&self, facts: &PluginChildWebviewRpcCancellationFacts) {
        let removed = {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let dispatch_id = state.dispatches.iter().find_map(|(dispatch_id, binding)| {
                state.sessions.get(&binding.session_id).and_then(|session| {
                    (session.attempt == facts.attempt && binding.request_id == facts.request_id)
                        .then(|| dispatch_id.clone())
                })
            });
            dispatch_id.and_then(|dispatch_id| {
                state
                    .dispatches
                    .remove(&dispatch_id)
                    .map(|binding| (dispatch_id, binding))
            })
        };
        if let Some((dispatch_id, binding)) = removed {
            self.emitter.cancel(&PluginChildWebviewHostCancelEvent {
                contract_version: PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION,
                session_id: binding.session_id,
                dispatch_id,
            });
        }
    }

    fn disconnect(&self, attempt: PluginChildWebviewAttempt, plugin_id: &str) {
        let session_ids = {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let session_ids = state
                .sessions
                .iter()
                .filter(|(_, session)| session.attempt == attempt && session.plugin_id == plugin_id)
                .map(|(session_id, _)| session_id.clone())
                .collect::<Vec<_>>();
            for session_id in &session_ids {
                state.sessions.remove(session_id);
            }
            state
                .dispatches
                .retain(|_, binding| !session_ids.contains(&binding.session_id));
            session_ids
        };
        for session_id in session_ids {
            self.emitter
                .disconnect(&PluginChildWebviewHostDisconnectEvent {
                    contract_version: PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION,
                    session_id,
                });
        }
    }
}

impl<H: PluginChildWebviewNativeHandle> PluginChildWebviewReadyDispatcher
    for PluginChildWebviewHostDispatcher<H>
{
    fn accept_ready(&self, _facts: &PluginChildWebviewReadyFacts) -> bool {
        true
    }
}

fn opaque_identifier(domain: &[u8], parts: &[&[u8]]) -> String {
    let mut hash = Sha256::new();
    hash.update(domain);
    for part in parts {
        hash.update((part.len() as u64).to_le_bytes());
        hash.update(part);
    }
    hash.finalize()[..16]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SettlePluginChildWebviewHostDispatchRequest {
    contract_version: String,
    dispatch_id: String,
    output: Value,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct FailPluginChildWebviewHostDispatchRequest {
    contract_version: String,
    dispatch_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EmitPluginChildWebviewHostEventRequest {
    contract_version: String,
    session_id: String,
    event: Value,
}

fn valid_adapter_request(version: &str, opaque_id: &str) -> bool {
    version == PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION
        && opaque_id.len() == 32
        && opaque_id
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

#[tauri::command]
pub(crate) fn settle_plugin_child_webview_host_dispatch<R: Runtime>(
    _app: AppHandle<R>,
    dispatcher: State<'_, Arc<PluginChildWebviewHostDispatcher<PluginChildWebviewHandle<R>>>>,
    request: SettlePluginChildWebviewHostDispatchRequest,
) -> bool {
    valid_adapter_request(&request.contract_version, &request.dispatch_id)
        && dispatcher.settle(&request.dispatch_id, request.output)
}

#[tauri::command]
pub(crate) fn fail_plugin_child_webview_host_dispatch<R: Runtime>(
    _app: AppHandle<R>,
    dispatcher: State<'_, Arc<PluginChildWebviewHostDispatcher<PluginChildWebviewHandle<R>>>>,
    request: FailPluginChildWebviewHostDispatchRequest,
) -> bool {
    valid_adapter_request(&request.contract_version, &request.dispatch_id)
        && dispatcher.fail(&request.dispatch_id)
}

#[tauri::command]
pub(crate) fn emit_plugin_child_webview_host_event<R: Runtime>(
    _app: AppHandle<R>,
    dispatcher: State<'_, Arc<PluginChildWebviewHostDispatcher<PluginChildWebviewHandle<R>>>>,
    request: EmitPluginChildWebviewHostEventRequest,
) -> bool {
    valid_adapter_request(&request.contract_version, &request.session_id)
        && dispatcher.emit_event(&request.session_id, request.event)
}

pub(crate) fn setup_plugin_child_webview_host_dispatcher<R: Runtime>(
    app: &AppHandle<R>,
    service: Arc<PluginChildWebviewService<R>>,
) -> Arc<PluginChildWebviewHostDispatcher<PluginChildWebviewHandle<R>>> {
    let emitter = Arc::new(TauriPluginChildWebviewHostEmitter { app: app.clone() });
    let dispatcher = Arc::new(PluginChildWebviewHostDispatcher::new(
        Arc::clone(&service),
        emitter,
    ));
    debug_assert!(service.attach_ready_dispatcher(dispatcher.clone()));
    debug_assert!(service.attach_rpc_dispatcher(dispatcher.clone()));
    debug_assert!(app.manage(Arc::clone(&dispatcher)));
    dispatcher
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_child_webview_service::{
        PluginChildWebviewIdentity, PluginChildWebviewReadyDispatcher,
        PluginChildWebviewReadyFacts, PluginChildWebviewReadyResult,
        PluginChildWebviewSessionErrorCode,
    };
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Clone, Default)]
    struct FakeHandle {
        deliveries: Arc<Mutex<Vec<Value>>>,
    }

    impl PluginChildWebviewNativeHandle for FakeHandle {
        fn source_label(&self) -> String {
            "child".to_owned()
        }
        fn update_bounds(&self, _x: i32, _y: i32, _width: u32, _height: u32) -> Result<(), ()> {
            Ok(())
        }
        fn show(&self) -> Result<(), ()> {
            Ok(())
        }
        fn hide(&self) -> Result<(), ()> {
            Ok(())
        }
        fn focus(&self) -> Result<(), ()> {
            Ok(())
        }
        fn deliver_bridge_frame(&self, frame: &Value) -> Result<(), ()> {
            self.deliveries
                .lock()
                .expect("deliveries should lock")
                .push(frame.clone());
            Ok(())
        }
        fn destroy(&self) -> Result<(), ()> {
            Ok(())
        }
    }

    struct AcceptReady;

    impl PluginChildWebviewReadyDispatcher for AcceptReady {
        fn accept_ready(&self, _facts: &PluginChildWebviewReadyFacts) -> bool {
            true
        }
    }

    #[derive(Default)]
    struct FakeEmitter {
        dispatches: Mutex<Vec<PluginChildWebviewHostDispatchEvent>>,
        cancels: Mutex<Vec<PluginChildWebviewHostCancelEvent>>,
        disconnects: Mutex<Vec<PluginChildWebviewHostDisconnectEvent>>,
        dispatch_calls: AtomicUsize,
    }

    impl PluginChildWebviewHostEmitter for FakeEmitter {
        fn dispatch(&self, payload: &PluginChildWebviewHostDispatchEvent) -> bool {
            self.dispatch_calls.fetch_add(1, Ordering::SeqCst);
            self.dispatches
                .lock()
                .expect("dispatches should lock")
                .push(payload.clone());
            true
        }
        fn cancel(&self, payload: &PluginChildWebviewHostCancelEvent) {
            self.cancels
                .lock()
                .expect("cancels should lock")
                .push(payload.clone());
        }
        fn disconnect(&self, payload: &PluginChildWebviewHostDisconnectEvent) {
            self.disconnects
                .lock()
                .expect("disconnects should lock")
                .push(payload.clone());
        }
    }

    fn ready_body(freshness: &str) -> String {
        serde_json::json!({
            "contract_version":"0.2.0",
            "type":"lensx.plugin_bridge.ready",
            "freshness":freshness,
        })
        .to_string()
    }

    fn rpc_request(sequence: u64, method: &str, params: Value) -> String {
        serde_json::json!({
            "contract_version":"0.2.0",
            "type":"lensx.plugin_bridge.request",
            "request_id":format!("request_{sequence:016x}"),
            "request":{"method":method,"params":params},
        })
        .to_string()
    }

    fn setup() -> (
        Arc<PluginChildWebviewRegistry<FakeHandle>>,
        Arc<PluginChildWebviewHostDispatcher<FakeHandle>>,
        Arc<FakeEmitter>,
        PluginChildWebviewAttempt,
        Arc<Mutex<Vec<Value>>>,
    ) {
        let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
        assert!(service.attach_ready_dispatcher(Arc::new(AcceptReady)));
        let emitter = Arc::new(FakeEmitter::default());
        let dispatcher = Arc::new(PluginChildWebviewHostDispatcher::new(
            Arc::clone(&service),
            emitter.clone(),
        ));
        assert!(service.attach_rpc_dispatcher(dispatcher.clone()));
        let identity = PluginChildWebviewIdentity::new(
            "plugin-a",
            "page-a",
            "entry_plugin-a",
            "1.2.3",
            7,
            "lensx-plugin://plugin-a.runtime.localhost/index.html"
                .parse()
                .expect("entry URL"),
            "/",
        )
        .expect("identity");
        let attempt = service
            .reserve_current(identity, "child")
            .expect("reservation");
        let deliveries = Arc::new(Mutex::new(Vec::new()));
        assert!(service.attach_current(
            attempt,
            FakeHandle {
                deliveries: Arc::clone(&deliveries),
            }
        ));
        assert!(service.mark_native_loaded(attempt, "child"));
        let creation = service.creation_facts(attempt).expect("creation");
        assert_eq!(
            service.accept_ready_ingress(attempt, "child", &ready_body(&creation.freshness),),
            PluginChildWebviewReadyResult::Accepted
        );
        (service, dispatcher, emitter, attempt, deliveries)
    }

    #[test]
    fn host_event_exposes_only_minimal_authority_and_settles_current_request() {
        let (service, dispatcher, emitter, attempt, deliveries) = setup();
        assert_eq!(
            service.accept_rpc_ingress(
                attempt,
                "child",
                &rpc_request(1, "runtime.get_context", serde_json::json!({})),
            ),
            PluginChildWebviewRpcIngressResult::Dispatched
        );
        let event = emitter.dispatches.lock().expect("dispatches should lock")[0].clone();
        assert_eq!(event.identity.entry_id, "entry_plugin-a");
        assert_eq!(event.identity.plugin_id, "plugin-a");
        assert_eq!(event.identity.version, "1.2.3");
        assert_eq!(event.identity.page_id, "page-a");
        let serialized = serde_json::to_string(&event).expect("event serializes");
        for private in [
            "source_label",
            "resource_generation",
            "attempt_",
            "entry_url",
        ] {
            assert!(!serialized.contains(private));
        }
        assert!(dispatcher.settle(
            &event.dispatch_id,
            serde_json::json!({
                "method":"runtime.get_context",
                "result":{
                    "hostApiVersion":"0.2.0",
                    "locale":"en-US",
                    "theme":"light",
                    "capabilities":[]
                }
            }),
        ));
        assert_eq!(deliveries.lock().expect("deliveries should lock").len(), 1);
        assert!(!dispatcher.settle(&event.dispatch_id, serde_json::json!({})));
    }

    #[test]
    fn cancel_and_disconnect_abort_only_the_current_opaque_session() {
        let (service, _dispatcher, emitter, attempt, _deliveries) = setup();
        assert_eq!(
            service.accept_rpc_ingress(
                attempt,
                "child",
                &rpc_request(1, "ui.close", serde_json::json!({})),
            ),
            PluginChildWebviewRpcIngressResult::Dispatched
        );
        let cancel = serde_json::json!({
            "contract_version":"0.2.0",
            "type":"lensx.plugin_bridge.cancel",
            "request_id":"request_0000000000000001",
        })
        .to_string();
        assert_eq!(
            service.accept_rpc_ingress(attempt, "child", &cancel),
            PluginChildWebviewRpcIngressResult::Cancelled
        );
        assert_eq!(
            emitter.cancels.lock().expect("cancels should lock").len(),
            1
        );
        assert!(service.disconnect_current(
            attempt,
            PluginChildWebviewSessionErrorCode::RuntimeSessionDisconnected,
        ));
        assert_eq!(
            emitter
                .disconnects
                .lock()
                .expect("disconnects should lock")
                .len(),
            1
        );
    }

    #[test]
    fn native_teardown_removes_host_session_and_rejects_late_settlement() {
        let (service, dispatcher, emitter, attempt, deliveries) = setup();
        assert_eq!(
            service.accept_rpc_ingress(
                attempt,
                "child",
                &rpc_request(1, "storage.get", serde_json::json!({"key":"slow"})),
            ),
            PluginChildWebviewRpcIngressResult::Dispatched
        );
        let event = emitter.dispatches.lock().expect("dispatches should lock")[0].clone();

        assert!(service
            .compare_current_teardown(attempt)
            .expect("teardown succeeds"));
        assert_eq!(
            emitter.cancels.lock().expect("cancels should lock").len(),
            1
        );
        assert_eq!(
            emitter
                .disconnects
                .lock()
                .expect("disconnects should lock")
                .len(),
            1
        );
        assert!(!dispatcher.settle(
            &event.dispatch_id,
            serde_json::json!({"method":"storage.get","result":{"found":false}}),
        ));
        assert!(!dispatcher.emit_event(
            &event.session_id,
            serde_json::json!({
                "event":"runtime.context_changed",
                "payload":{
                    "hostApiVersion":"0.2.0",
                    "locale":"en-US",
                    "theme":"light",
                    "capabilities":[]
                }
            }),
        ));
        assert_eq!(deliveries.lock().expect("deliveries should lock").len(), 1);
    }
}
