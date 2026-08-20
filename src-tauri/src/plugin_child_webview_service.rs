#![allow(dead_code)] // Tasks 2.2-4.5 connect this task's Host-private registry to presentation and lifecycle.

use crate::plugin_child_webview_adapter::{
    valid_host_route, valid_source_label, PluginChildWebviewBridgeIngress,
    PluginChildWebviewCurrentSource, PluginChildWebviewHandle, PluginChildWebviewLifecycleIngress,
    PluginChildWebviewNativeHandle,
};
use crate::plugin_child_webview_rpc::{
    PluginChildWebviewRpcCancellation, PluginChildWebviewRpcDispatch, PluginChildWebviewRpcEffect,
    PluginChildWebviewRpcIngressResult, PluginChildWebviewRpcSession,
};
use crate::plugin_host_api_validation::validate_host_api_result;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, Runtime};
use url::Url;

const MAX_IDENTITY_TEXT: usize = 512;
const MAX_BRIDGE_FRAME_BYTES: usize =
    crate::plugin_child_webview_rpc::PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_BYTES;
pub(crate) const PLUGIN_CHILD_WEBVIEW_LOAD_DEADLINE_MS: u64 = 10_000;
pub(crate) const PLUGIN_CHILD_WEBVIEW_READY_DEADLINE_MS: u64 = 5_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewAttempt(u64);

impl PluginChildWebviewAttempt {
    pub(crate) fn opaque_id(self) -> String {
        format!("attempt_{:016x}", self.0)
    }

    pub(crate) fn from_opaque_id(value: &str) -> Option<Self> {
        let hexadecimal = value.strip_prefix("attempt_")?;
        if hexadecimal.len() != 16
            || !hexadecimal
                .bytes()
                .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
        {
            return None;
        }
        u64::from_str_radix(hexadecimal, 16).ok().map(Self)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewIdentity {
    plugin_id: String,
    page_id: String,
    registration_entry_id: String,
    plugin_version: String,
    resource_generation: u64,
    entry_url: Url,
    host_route: String,
}

impl PluginChildWebviewIdentity {
    pub(crate) fn new(
        plugin_id: impl Into<String>,
        page_id: impl Into<String>,
        registration_entry_id: impl Into<String>,
        plugin_version: impl Into<String>,
        resource_generation: u64,
        entry_url: Url,
        host_route: impl Into<String>,
    ) -> Option<Self> {
        let plugin_id = plugin_id.into();
        let page_id = page_id.into();
        let registration_entry_id = registration_entry_id.into();
        let plugin_version = plugin_version.into();
        let host_route = host_route.into();
        if resource_generation == 0
            || entry_url.scheme() != "lensx-plugin"
            || !valid_host_route(&host_route)
            || [
                plugin_id.as_str(),
                page_id.as_str(),
                registration_entry_id.as_str(),
                plugin_version.as_str(),
            ]
            .into_iter()
            .any(|value| value.is_empty() || value.len() > MAX_IDENTITY_TEXT)
        {
            return None;
        }
        Some(Self {
            plugin_id,
            page_id,
            registration_entry_id,
            plugin_version,
            resource_generation,
            entry_url,
            host_route,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewBounds {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewState {
    Creating,
    Hidden,
    Visible,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewSessionState {
    Creating,
    Loading,
    Loaded,
    BridgeReady,
    SdkReady,
    Disconnected,
    Disposed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewSessionErrorCode {
    RuntimeLoadTimeout,
    RuntimeHandshakeTimeout,
    RuntimeSessionDisconnected,
    RuntimeUnavailable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewWaitReadiness {
    Ready,
    Failed(PluginChildWebviewSessionErrorCode),
    StaleAttempt,
}

impl PluginChildWebviewSessionErrorCode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::RuntimeLoadTimeout => "runtime_load_timeout",
            Self::RuntimeHandshakeTimeout => "runtime_handshake_timeout",
            Self::RuntimeSessionDisconnected => "runtime_session_disconnected",
            Self::RuntimeUnavailable => "runtime_unavailable",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct PluginChildWebviewSessionMachine {
    state: PluginChildWebviewSessionState,
    load_deadline_at_ms: Option<u64>,
    ready_deadline_at_ms: Option<u64>,
    error: Option<PluginChildWebviewSessionErrorCode>,
}

impl PluginChildWebviewSessionMachine {
    fn new() -> Self {
        Self {
            state: PluginChildWebviewSessionState::Creating,
            load_deadline_at_ms: None,
            ready_deadline_at_ms: None,
            error: None,
        }
    }

    fn begin_loading(&mut self, now_ms: u64) -> bool {
        if self.state != PluginChildWebviewSessionState::Creating {
            return false;
        }
        self.state = PluginChildWebviewSessionState::Loading;
        self.load_deadline_at_ms = now_ms.checked_add(PLUGIN_CHILD_WEBVIEW_LOAD_DEADLINE_MS);
        self.load_deadline_at_ms.is_some()
    }

    fn native_loaded(&mut self, now_ms: u64) -> bool {
        if self.state != PluginChildWebviewSessionState::Loading {
            return false;
        }
        if self
            .load_deadline_at_ms
            .is_none_or(|deadline| now_ms >= deadline)
        {
            self.disconnect(PluginChildWebviewSessionErrorCode::RuntimeLoadTimeout);
            return false;
        }
        self.state = PluginChildWebviewSessionState::Loaded;
        self.load_deadline_at_ms = None;
        self.ready_deadline_at_ms = now_ms.checked_add(PLUGIN_CHILD_WEBVIEW_READY_DEADLINE_MS);
        self.ready_deadline_at_ms.is_some()
    }

    fn bridge_ready(&mut self, now_ms: u64) -> bool {
        if self.state != PluginChildWebviewSessionState::Loaded {
            return false;
        }
        if self
            .ready_deadline_at_ms
            .is_none_or(|deadline| now_ms >= deadline)
        {
            self.disconnect(PluginChildWebviewSessionErrorCode::RuntimeHandshakeTimeout);
            return false;
        }
        self.state = PluginChildWebviewSessionState::BridgeReady;
        self.ready_deadline_at_ms = None;
        true
    }

    fn sdk_ready_after_context(&mut self, method: &str, succeeded: bool) -> bool {
        if self.state != PluginChildWebviewSessionState::BridgeReady
            || method != "runtime.get_context"
            || !succeeded
        {
            return false;
        }
        self.state = PluginChildWebviewSessionState::SdkReady;
        true
    }

    fn expire(&mut self, now_ms: u64) -> Option<PluginChildWebviewSessionErrorCode> {
        let error = match self.state {
            PluginChildWebviewSessionState::Loading
                if self
                    .load_deadline_at_ms
                    .is_some_and(|deadline| now_ms >= deadline) =>
            {
                Some(PluginChildWebviewSessionErrorCode::RuntimeLoadTimeout)
            }
            PluginChildWebviewSessionState::Loaded
                if self
                    .ready_deadline_at_ms
                    .is_some_and(|deadline| now_ms >= deadline) =>
            {
                Some(PluginChildWebviewSessionErrorCode::RuntimeHandshakeTimeout)
            }
            _ => None,
        };
        if let Some(error) = error {
            self.disconnect(error);
        }
        error
    }

    fn disconnect(&mut self, error: PluginChildWebviewSessionErrorCode) -> bool {
        if matches!(
            self.state,
            PluginChildWebviewSessionState::Disconnected | PluginChildWebviewSessionState::Disposed
        ) {
            return false;
        }
        self.state = PluginChildWebviewSessionState::Disconnected;
        self.load_deadline_at_ms = None;
        self.ready_deadline_at_ms = None;
        self.error = Some(error);
        true
    }

    fn dispose(&mut self) -> bool {
        if self.state == PluginChildWebviewSessionState::Disposed {
            return false;
        }
        self.state = PluginChildWebviewSessionState::Disposed;
        self.load_deadline_at_ms = None;
        self.ready_deadline_at_ms = None;
        self.error = None;
        true
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewSnapshot {
    pub(crate) attempt: PluginChildWebviewAttempt,
    pub(crate) identity: PluginChildWebviewIdentity,
    pub(crate) source_label: String,
    pub(crate) state: PluginChildWebviewState,
    pub(crate) bounds: Option<PluginChildWebviewBounds>,
    pub(crate) native_attached: bool,
    pub(crate) presentation_revision: u64,
    pub(crate) bridge_ready: bool,
    pub(crate) session_state: PluginChildWebviewSessionState,
    pub(crate) session_error: Option<PluginChildWebviewSessionErrorCode>,
    pub(crate) rpc_pending_requests: usize,
    pub(crate) data_store_identifier: [u8; 16],
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewCreationFacts {
    pub(crate) attempt: PluginChildWebviewAttempt,
    pub(crate) entry_url: Url,
    pub(crate) host_route: String,
    pub(crate) source_label: String,
    pub(crate) freshness: String,
    pub(crate) data_store_identifier: [u8; 16],
}

struct CurrentEntry<H> {
    attempt: PluginChildWebviewAttempt,
    identity: PluginChildWebviewIdentity,
    source_label: String,
    state: PluginChildWebviewState,
    bounds: Option<PluginChildWebviewBounds>,
    handle: Option<H>,
    presentation_revision: u64,
    freshness: String,
    bridge_ready: bool,
    session: PluginChildWebviewSessionMachine,
    rpc: PluginChildWebviewRpcSession,
    data_store_identifier: [u8; 16],
    resource_authority_active: bool,
    load_started_at_ms: Option<u64>,
}

struct RegistryState<H> {
    next_attempt: u64,
    current: Option<CurrentEntry<H>>,
}

#[derive(Clone, Debug)]
struct RpcEffectContext {
    attempt: PluginChildWebviewAttempt,
    source_label: String,
    plugin_id: String,
    page_id: String,
    registration_entry_id: String,
    plugin_version: String,
    resource_generation: u64,
}

impl RpcEffectContext {
    fn from_current<H>(current: &CurrentEntry<H>) -> Self {
        Self {
            attempt: current.attempt,
            source_label: current.source_label.clone(),
            plugin_id: current.identity.plugin_id.clone(),
            page_id: current.identity.page_id.clone(),
            registration_entry_id: current.identity.registration_entry_id.clone(),
            plugin_version: current.identity.plugin_version.clone(),
            resource_generation: current.identity.resource_generation,
        }
    }

    fn dispatch_facts(
        &self,
        dispatch: PluginChildWebviewRpcDispatch,
    ) -> PluginChildWebviewRpcDispatchFacts {
        PluginChildWebviewRpcDispatchFacts {
            attempt: self.attempt,
            source_label: self.source_label.clone(),
            plugin_id: self.plugin_id.clone(),
            page_id: self.page_id.clone(),
            registration_entry_id: self.registration_entry_id.clone(),
            plugin_version: self.plugin_version.clone(),
            resource_generation: self.resource_generation,
            request_id: dispatch.request_id,
            method: dispatch.method,
            request: dispatch.request,
        }
    }

    fn cancellation_facts(
        &self,
        cancellation: PluginChildWebviewRpcCancellation,
    ) -> PluginChildWebviewRpcCancellationFacts {
        PluginChildWebviewRpcCancellationFacts {
            attempt: self.attempt,
            plugin_id: self.plugin_id.clone(),
            request_id: cancellation.request_id,
            method: cancellation.method,
        }
    }
}

fn attach_once<T: ?Sized>(slot: &Mutex<Option<Arc<T>>>, value: Arc<T>) -> bool {
    let mut current = slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if current.is_some() {
        false
    } else {
        *current = Some(value);
        true
    }
}

fn cloned_attachment<T: ?Sized>(slot: &Mutex<Option<Arc<T>>>) -> Option<Arc<T>> {
    slot.lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

impl<H> Default for RegistryState<H> {
    fn default() -> Self {
        Self {
            next_attempt: 0,
            current: None,
        }
    }
}

pub(crate) struct PluginChildWebviewRegistry<H: PluginChildWebviewNativeHandle> {
    state: Mutex<RegistryState<H>>,
    readiness_changed: Condvar,
    resource_authority: Mutex<Option<Arc<dyn PluginChildWebviewResourceAuthority>>>,
    ready_dispatcher: Mutex<Option<Arc<dyn PluginChildWebviewReadyDispatcher>>>,
    rpc_dispatcher: Mutex<Option<Arc<dyn PluginChildWebviewRpcDispatcher>>>,
}

pub(crate) trait PluginChildWebviewResourceAuthority: Send + Sync + 'static {
    fn activate(
        &self,
        attempt_id: &str,
        webview_label: &str,
        entry_id: &str,
        resource_generation: u64,
    ) -> bool;
    fn revoke(&self, attempt_id: &str) -> bool;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewReadyFacts {
    pub(crate) attempt: PluginChildWebviewAttempt,
    pub(crate) source_label: String,
    pub(crate) plugin_id: String,
    pub(crate) page_id: String,
    pub(crate) registration_entry_id: String,
    pub(crate) resource_generation: u64,
}

pub(crate) trait PluginChildWebviewReadyDispatcher: Send + Sync + 'static {
    fn accept_ready(&self, facts: &PluginChildWebviewReadyFacts) -> bool;
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PluginChildWebviewRpcDispatchFacts {
    pub(crate) attempt: PluginChildWebviewAttempt,
    pub(crate) source_label: String,
    pub(crate) plugin_id: String,
    pub(crate) page_id: String,
    pub(crate) registration_entry_id: String,
    pub(crate) plugin_version: String,
    pub(crate) resource_generation: u64,
    pub(crate) request_id: String,
    pub(crate) method: String,
    pub(crate) request: Value,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewRpcCancellationFacts {
    pub(crate) attempt: PluginChildWebviewAttempt,
    pub(crate) plugin_id: String,
    pub(crate) request_id: String,
    pub(crate) method: String,
}

pub(crate) trait PluginChildWebviewRpcDispatcher: Send + Sync + 'static {
    fn dispatch(&self, facts: &PluginChildWebviewRpcDispatchFacts) -> bool;
    fn cancel(&self, facts: &PluginChildWebviewRpcCancellationFacts);
    fn disconnect(&self, attempt: PluginChildWebviewAttempt, plugin_id: &str);
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewReadyResult {
    Accepted,
    Malformed,
    StaleSource,
    FreshnessMismatch,
    Duplicate,
    SessionUnavailable,
    DispatcherUnavailable,
    DispatcherRejected,
}

impl<H: PluginChildWebviewNativeHandle> Default for PluginChildWebviewRegistry<H> {
    fn default() -> Self {
        Self {
            state: Mutex::new(RegistryState::default()),
            readiness_changed: Condvar::new(),
            resource_authority: Mutex::new(None),
            ready_dispatcher: Mutex::new(None),
            rpc_dispatcher: Mutex::new(None),
        }
    }
}

impl<H: PluginChildWebviewNativeHandle> PluginChildWebviewRegistry<H> {
    pub(crate) fn attach_resource_authority(
        &self,
        authority: Arc<dyn PluginChildWebviewResourceAuthority>,
    ) -> bool {
        let mut current = self
            .resource_authority
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if current.is_some() {
            false
        } else {
            *current = Some(authority);
            true
        }
    }

    pub(crate) fn attach_ready_dispatcher(
        &self,
        dispatcher: Arc<dyn PluginChildWebviewReadyDispatcher>,
    ) -> bool {
        let mut current = self
            .ready_dispatcher
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if current.is_some() {
            false
        } else {
            *current = Some(dispatcher);
            true
        }
    }

    pub(crate) fn attach_rpc_dispatcher(
        &self,
        dispatcher: Arc<dyn PluginChildWebviewRpcDispatcher>,
    ) -> bool {
        attach_once(&self.rpc_dispatcher, dispatcher)
    }

    pub(crate) fn reserve_current(
        &self,
        identity: PluginChildWebviewIdentity,
        source_label: impl Into<String>,
    ) -> Option<PluginChildWebviewAttempt> {
        let source_label = source_label.into();
        if !valid_source_label(&source_label) {
            return None;
        }
        let mut state = self.lock_state();
        if state.current.is_some() {
            return None;
        }
        state.next_attempt = state
            .next_attempt
            .checked_add(1)
            .expect("Child WebView attempt should not overflow during one process");
        let attempt = PluginChildWebviewAttempt(state.next_attempt);
        let data_store_identifier = derive_data_store_identifier(attempt, &identity);
        let freshness = derive_bridge_freshness(attempt, &identity, &source_label);
        state.current = Some(CurrentEntry {
            attempt,
            identity,
            source_label,
            state: PluginChildWebviewState::Creating,
            bounds: None,
            handle: None,
            presentation_revision: 0,
            freshness,
            bridge_ready: false,
            session: PluginChildWebviewSessionMachine::new(),
            rpc: PluginChildWebviewRpcSession::default(),
            data_store_identifier,
            resource_authority_active: false,
            load_started_at_ms: None,
        });
        Some(attempt)
    }

    pub(crate) fn reserve_current_with_derived_label(
        &self,
        identity: PluginChildWebviewIdentity,
    ) -> Option<PluginChildWebviewAttempt> {
        let mut state = self.lock_state();
        if state.current.is_some() {
            return None;
        }
        state.next_attempt = state
            .next_attempt
            .checked_add(1)
            .expect("Child WebView attempt should not overflow during one process");
        let attempt = PluginChildWebviewAttempt(state.next_attempt);
        let source_label = format!("plugin-child-{:016x}", attempt.0);
        let data_store_identifier = derive_data_store_identifier(attempt, &identity);
        let freshness = derive_bridge_freshness(attempt, &identity, &source_label);
        state.current = Some(CurrentEntry {
            attempt,
            identity,
            source_label,
            state: PluginChildWebviewState::Creating,
            bounds: None,
            handle: None,
            presentation_revision: 0,
            freshness,
            bridge_ready: false,
            session: PluginChildWebviewSessionMachine::new(),
            rpc: PluginChildWebviewRpcSession::default(),
            data_store_identifier,
            resource_authority_active: false,
            load_started_at_ms: None,
        });
        Some(attempt)
    }

    pub(crate) fn prepare_current_creation(&self, attempt: PluginChildWebviewAttempt) -> bool {
        let mut state = self.lock_state();
        let Some(current) = state.current.as_mut().filter(|current| {
            current.attempt == attempt
                && current.handle.is_none()
                && current.session.state == PluginChildWebviewSessionState::Creating
        }) else {
            return false;
        };
        let resource_authority = self.resource_authority();
        if let Some(resource_authority) = &resource_authority {
            if !resource_authority.activate(
                &current.attempt.opaque_id(),
                &current.source_label,
                &current.identity.registration_entry_id,
                current.identity.resource_generation,
            ) {
                return false;
            }
        }
        let now_ms = monotonic_now_ms();
        if !current.session.begin_loading(now_ms) {
            if let Some(resource_authority) = resource_authority {
                resource_authority.revoke(&current.attempt.opaque_id());
            }
            return false;
        }
        current.load_started_at_ms = Some(now_ms);
        current.resource_authority_active = resource_authority.is_some();
        true
    }

    pub(crate) fn attach_current(&self, attempt: PluginChildWebviewAttempt, handle: H) -> bool {
        self.attach_current_at(attempt, handle, monotonic_now_ms())
    }

    fn attach_current_at(
        &self,
        attempt: PluginChildWebviewAttempt,
        handle: H,
        now_ms: u64,
    ) -> bool {
        let mut state = self.lock_state();
        let attach = state
            .current
            .as_mut()
            .filter(|current| current.attempt == attempt && current.handle.is_none());
        if let Some(current) = attach {
            let source_label = handle.source_label();
            if source_label != current.source_label {
                let _ = handle.destroy();
                return false;
            }
            if current.session.state == PluginChildWebviewSessionState::Creating {
                let resource_authority = self.resource_authority();
                if let Some(resource_authority) = &resource_authority {
                    if !resource_authority.activate(
                        &current.attempt.opaque_id(),
                        &source_label,
                        &current.identity.registration_entry_id,
                        current.identity.resource_generation,
                    ) {
                        let _ = handle.destroy();
                        return false;
                    }
                }
                if !current.session.begin_loading(now_ms) {
                    if let Some(resource_authority) = resource_authority {
                        resource_authority.revoke(&current.attempt.opaque_id());
                    }
                    let _ = handle.destroy();
                    return false;
                }
                current.load_started_at_ms = Some(now_ms);
                current.resource_authority_active = resource_authority.is_some();
            } else if matches!(
                current.session.state,
                PluginChildWebviewSessionState::Disconnected
                    | PluginChildWebviewSessionState::Disposed
            ) {
                let _ = handle.destroy();
                return false;
            }
            current.handle = Some(handle);
            true
        } else {
            let _ = handle.destroy();
            false
        }
    }

    pub(crate) fn mark_native_loaded(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
    ) -> bool {
        self.mark_native_loaded_at(attempt, actual_source_label, monotonic_now_ms())
    }

    fn mark_native_loaded_at(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        now_ms: u64,
    ) -> bool {
        let mut state = self.lock_state();
        let changed = state
            .current
            .as_mut()
            .filter(|current| {
                current.attempt == attempt && current.source_label == actual_source_label
            })
            .is_some_and(|current| current.session.native_loaded(now_ms));
        drop(state);
        if changed {
            self.readiness_changed.notify_all();
        }
        changed
    }

    pub(crate) fn apply_slot_update(
        &self,
        attempt: PluginChildWebviewAttempt,
        presentation_revision: u64,
        bounds: PluginChildWebviewBounds,
    ) -> PluginChildWebviewSlotUpdateResult {
        let mut state = self.lock_state();
        let Some(current) = state
            .current
            .as_mut()
            .filter(|current| current.attempt == attempt)
        else {
            return PluginChildWebviewSlotUpdateResult::StaleAttempt;
        };
        if presentation_revision <= current.presentation_revision {
            return PluginChildWebviewSlotUpdateResult::StaleRevision;
        }
        if let Some(handle) = &current.handle {
            if handle
                .update_bounds(bounds.x, bounds.y, bounds.width, bounds.height)
                .is_err()
            {
                return PluginChildWebviewSlotUpdateResult::NativeUpdateFailed;
            }
        }
        current.presentation_revision = presentation_revision;
        current.bounds = Some(bounds);
        PluginChildWebviewSlotUpdateResult::Applied
    }

    pub(crate) fn show_current(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> PluginChildWebviewPresentationResult {
        let mut state = self.lock_state();
        let Some(current) = state
            .current
            .as_mut()
            .filter(|current| current.attempt == attempt)
        else {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        };
        if !matches!(
            current.session.state,
            PluginChildWebviewSessionState::BridgeReady | PluginChildWebviewSessionState::SdkReady
        ) {
            return PluginChildWebviewPresentationResult::NotReady;
        }
        let Some(handle) = &current.handle else {
            return PluginChildWebviewPresentationResult::NativeUnavailable;
        };
        if handle.show().is_err() {
            return PluginChildWebviewPresentationResult::NativeFailed;
        }
        current.state = PluginChildWebviewState::Visible;
        PluginChildWebviewPresentationResult::Applied
    }

    pub(crate) fn hide_current(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> PluginChildWebviewPresentationResult {
        let mut state = self.lock_state();
        let Some(current) = state
            .current
            .as_mut()
            .filter(|current| current.attempt == attempt)
        else {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        };
        let Some(handle) = &current.handle else {
            return PluginChildWebviewPresentationResult::NativeUnavailable;
        };
        if handle.hide().is_err() {
            return PluginChildWebviewPresentationResult::NativeFailed;
        }
        current.state = PluginChildWebviewState::Hidden;
        PluginChildWebviewPresentationResult::Applied
    }

    pub(crate) fn focus_current(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> PluginChildWebviewPresentationResult {
        let state = self.lock_state();
        let Some(current) = state
            .current
            .as_ref()
            .filter(|current| current.attempt == attempt)
        else {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        };
        if current.state != PluginChildWebviewState::Visible {
            return PluginChildWebviewPresentationResult::NotVisible;
        }
        let Some(handle) = &current.handle else {
            return PluginChildWebviewPresentationResult::NativeUnavailable;
        };
        if handle.focus().is_err() {
            PluginChildWebviewPresentationResult::NativeFailed
        } else {
            PluginChildWebviewPresentationResult::Applied
        }
    }

    pub(crate) fn compare_current_teardown(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> Result<bool, ()> {
        let (effects, context) = {
            let mut state = self.lock_state();
            let Some(current) = state
                .current
                .as_mut()
                .filter(|current| current.attempt == attempt)
            else {
                return Ok(false);
            };
            current.session.dispose();
            (
                current.rpc.terminate(true),
                RpcEffectContext::from_current(current),
            )
        };
        self.apply_rpc_effects(context, effects);
        self.revoke_current_resource_authority(attempt);
        let mut state = self.lock_state();
        let Some(current) = state
            .current
            .as_ref()
            .filter(|current| current.attempt == attempt)
        else {
            return Ok(false);
        };
        if let Some(handle) = &current.handle {
            handle.destroy().map_err(|_| ())?;
        }
        state.current = None;
        drop(state);
        self.readiness_changed.notify_all();
        Ok(true)
    }

    pub(crate) fn snapshot(&self) -> Option<PluginChildWebviewSnapshot> {
        self.lock_state()
            .current
            .as_ref()
            .map(|current| PluginChildWebviewSnapshot {
                attempt: current.attempt,
                identity: current.identity.clone(),
                source_label: current.source_label.clone(),
                state: current.state,
                bounds: current.bounds,
                native_attached: current.handle.is_some(),
                presentation_revision: current.presentation_revision,
                bridge_ready: current.bridge_ready,
                session_state: current.session.state,
                session_error: current.session.error,
                rpc_pending_requests: current.rpc.pending_count(),
                data_store_identifier: current.data_store_identifier,
            })
    }

    pub(crate) fn creation_facts(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> Option<PluginChildWebviewCreationFacts> {
        self.lock_state()
            .current
            .as_ref()
            .filter(|current| current.attempt == attempt)
            .map(|current| PluginChildWebviewCreationFacts {
                attempt,
                entry_url: current.identity.entry_url.clone(),
                host_route: current.identity.host_route.clone(),
                source_label: current.source_label.clone(),
                freshness: current.freshness.clone(),
                data_store_identifier: current.data_store_identifier,
            })
    }

    pub(crate) fn accept_ready_ingress(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        body: &str,
    ) -> PluginChildWebviewReadyResult {
        self.accept_ready_ingress_at(attempt, actual_source_label, body, monotonic_now_ms())
    }

    fn accept_ready_ingress_at(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        body: &str,
        now_ms: u64,
    ) -> PluginChildWebviewReadyResult {
        let Some(freshness) = parse_ready_freshness(body) else {
            return PluginChildWebviewReadyResult::Malformed;
        };
        let Some(dispatcher) = self
            .ready_dispatcher
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
        else {
            return PluginChildWebviewReadyResult::DispatcherUnavailable;
        };
        let mut state = self.lock_state();
        let Some(current) = state.current.as_mut().filter(|current| {
            current.attempt == attempt && current.source_label == actual_source_label
        }) else {
            return PluginChildWebviewReadyResult::StaleSource;
        };
        if freshness != current.freshness {
            return PluginChildWebviewReadyResult::FreshnessMismatch;
        }
        if current.bridge_ready {
            return PluginChildWebviewReadyResult::Duplicate;
        }
        if !current.session.bridge_ready(now_ms) {
            return PluginChildWebviewReadyResult::SessionUnavailable;
        }
        let facts = PluginChildWebviewReadyFacts {
            attempt,
            source_label: current.source_label.clone(),
            plugin_id: current.identity.plugin_id.clone(),
            page_id: current.identity.page_id.clone(),
            registration_entry_id: current.identity.registration_entry_id.clone(),
            resource_generation: current.identity.resource_generation,
        };
        current.bridge_ready = true;
        drop(state);
        if !dispatcher.accept_ready(&facts) {
            return PluginChildWebviewReadyResult::DispatcherRejected;
        }
        let mut state = self.lock_state();
        let connected = state
            .current
            .as_mut()
            .filter(|current| {
                current.attempt == attempt && current.source_label == actual_source_label
            })
            .is_some_and(|current| current.rpc.connect());
        let result = if connected {
            PluginChildWebviewReadyResult::Accepted
        } else {
            PluginChildWebviewReadyResult::SessionUnavailable
        };
        self.readiness_changed.notify_all();
        result
    }

    pub(crate) fn accept_rpc_ingress(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        body: &str,
    ) -> PluginChildWebviewRpcIngressResult {
        self.accept_rpc_ingress_at(attempt, actual_source_label, body, monotonic_now_ms())
    }

    fn accept_rpc_ingress_at(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        body: &str,
        now_ms: u64,
    ) -> PluginChildWebviewRpcIngressResult {
        let (outcome, context) = {
            let mut state = self.lock_state();
            let Some(current) = state.current.as_mut().filter(|current| {
                current.attempt == attempt && current.source_label == actual_source_label
            }) else {
                return PluginChildWebviewRpcIngressResult::SessionUnavailable;
            };
            if !current.bridge_ready {
                return PluginChildWebviewRpcIngressResult::SessionUnavailable;
            }
            (
                current.rpc.receive(body, now_ms),
                RpcEffectContext::from_current(current),
            )
        };
        let result = outcome.result;
        self.apply_rpc_effects(context, outcome.effects);
        result
    }

    pub(crate) fn settle_rpc_dispatch(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        request_id: &str,
        output: Value,
    ) -> PluginChildWebviewRpcIngressResult {
        let sdk_ready = validate_host_api_result(&output, "runtime.get_context");
        let (outcome, context) = {
            let mut state = self.lock_state();
            let Some(current) = state.current.as_mut().filter(|current| {
                current.attempt == attempt && current.source_label == actual_source_label
            }) else {
                return PluginChildWebviewRpcIngressResult::SessionUnavailable;
            };
            (
                current.rpc.settle(request_id, output),
                RpcEffectContext::from_current(current),
            )
        };
        let result = outcome.result;
        let delivered = self.apply_rpc_effects(context, outcome.effects);
        if sdk_ready && delivered {
            let _ = self.mark_sdk_ready_after_context(
                attempt,
                actual_source_label,
                "runtime.get_context",
                true,
            );
        }
        result
    }

    pub(crate) fn fail_rpc_dispatch(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        request_id: &str,
    ) -> PluginChildWebviewRpcIngressResult {
        let (outcome, context) = {
            let mut state = self.lock_state();
            let Some(current) = state.current.as_mut().filter(|current| {
                current.attempt == attempt && current.source_label == actual_source_label
            }) else {
                return PluginChildWebviewRpcIngressResult::SessionUnavailable;
            };
            (
                current.rpc.fail_handler(request_id),
                RpcEffectContext::from_current(current),
            )
        };
        let result = outcome.result;
        self.apply_rpc_effects(context, outcome.effects);
        result
    }

    pub(crate) fn emit_rpc_event(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        event: Value,
    ) -> PluginChildWebviewRpcIngressResult {
        let (outcome, context) = {
            let mut state = self.lock_state();
            let Some(current) = state.current.as_mut().filter(|current| {
                current.attempt == attempt && current.source_label == actual_source_label
            }) else {
                return PluginChildWebviewRpcIngressResult::SessionUnavailable;
            };
            (
                current.rpc.emit_event(event),
                RpcEffectContext::from_current(current),
            )
        };
        let result = outcome.result;
        self.apply_rpc_effects(context, outcome.effects);
        result
    }

    pub(crate) fn expire_rpc_deadlines(
        &self,
        attempt: PluginChildWebviewAttempt,
        now_ms: u64,
    ) -> usize {
        let (effects, context) = {
            let mut state = self.lock_state();
            let Some(current) = state
                .current
                .as_mut()
                .filter(|current| current.attempt == attempt)
            else {
                return 0;
            };
            (
                current.rpc.expire(now_ms),
                RpcEffectContext::from_current(current),
            )
        };
        let expired = effects
            .iter()
            .filter(|effect| matches!(effect, PluginChildWebviewRpcEffect::Cancel(_)))
            .count();
        self.apply_rpc_effects(context, effects);
        expired
    }

    pub(crate) fn mark_sdk_ready_after_context(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        method: &str,
        succeeded: bool,
    ) -> bool {
        let mut state = self.lock_state();
        let accepted = state
            .current
            .as_mut()
            .filter(|current| {
                current.attempt == attempt && current.source_label == actual_source_label
            })
            .is_some_and(|current| current.session.sdk_ready_after_context(method, succeeded));
        drop(state);
        accepted
    }

    pub(crate) fn disconnect_current(
        &self,
        attempt: PluginChildWebviewAttempt,
        error: PluginChildWebviewSessionErrorCode,
    ) -> bool {
        let (changed, effects, context) = {
            let mut state = self.lock_state();
            let Some(current) = state
                .current
                .as_mut()
                .filter(|current| current.attempt == attempt)
            else {
                return false;
            };
            let changed = current.session.disconnect(error);
            let effects = current.rpc.terminate(true);
            (changed, effects, RpcEffectContext::from_current(current))
        };
        self.apply_rpc_effects(context, effects);
        if changed {
            self.revoke_current_resource_authority(attempt);
            self.readiness_changed.notify_all();
        }
        changed
    }

    pub(crate) fn expire_session_deadline(
        &self,
        attempt: PluginChildWebviewAttempt,
        now_ms: u64,
    ) -> Option<PluginChildWebviewSessionErrorCode> {
        let (error, effects, context) = {
            let mut state = self.lock_state();
            let current = state
                .current
                .as_mut()
                .filter(|current| current.attempt == attempt)?;
            let error = current.session.expire(now_ms)?;
            (
                error,
                current.rpc.terminate(true),
                RpcEffectContext::from_current(current),
            )
        };
        self.apply_rpc_effects(context, effects);
        self.revoke_current_resource_authority(attempt);
        self.readiness_changed.notify_all();
        Some(error)
    }

    pub(crate) fn wait_presentation_readiness(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> PluginChildWebviewWaitReadiness {
        loop {
            let state = self.lock_state();
            let Some(current) = state
                .current
                .as_ref()
                .filter(|current| current.attempt == attempt)
            else {
                return PluginChildWebviewWaitReadiness::StaleAttempt;
            };
            match current.session.state {
                PluginChildWebviewSessionState::BridgeReady
                | PluginChildWebviewSessionState::SdkReady => {
                    return PluginChildWebviewWaitReadiness::Ready;
                }
                PluginChildWebviewSessionState::Disconnected => {
                    return PluginChildWebviewWaitReadiness::Failed(
                        current
                            .session
                            .error
                            .unwrap_or(PluginChildWebviewSessionErrorCode::RuntimeUnavailable),
                    );
                }
                PluginChildWebviewSessionState::Disposed => {
                    return PluginChildWebviewWaitReadiness::Failed(
                        PluginChildWebviewSessionErrorCode::RuntimeUnavailable,
                    );
                }
                PluginChildWebviewSessionState::Creating
                | PluginChildWebviewSessionState::Loading
                | PluginChildWebviewSessionState::Loaded => {}
            }
            let deadline = current
                .session
                .load_deadline_at_ms
                .or(current.session.ready_deadline_at_ms);
            if let Some(deadline) = deadline {
                let now = monotonic_now_ms();
                if now >= deadline {
                    drop(state);
                    let error = self
                        .expire_session_deadline(attempt, now)
                        .unwrap_or(PluginChildWebviewSessionErrorCode::RuntimeUnavailable);
                    return PluginChildWebviewWaitReadiness::Failed(error);
                }
                let wait = Duration::from_millis(deadline - now);
                let (state, _) = self
                    .readiness_changed
                    .wait_timeout(state, wait)
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                drop(state);
            } else {
                let state = self
                    .readiness_changed
                    .wait(state)
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                drop(state);
            }
        }
    }

    pub(crate) fn expire_current_session_deadline(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> Option<PluginChildWebviewSessionErrorCode> {
        self.expire_session_deadline(attempt, monotonic_now_ms())
    }

    fn lock_state(&self) -> MutexGuard<'_, RegistryState<H>> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn resource_authority(&self) -> Option<Arc<dyn PluginChildWebviewResourceAuthority>> {
        self.resource_authority
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    fn revoke_current_resource_authority(&self, attempt: PluginChildWebviewAttempt) {
        let revoke = {
            let mut state = self.lock_state();
            state
                .current
                .as_mut()
                .filter(|current| current.attempt == attempt)
                .is_some_and(|current| {
                    if !current.resource_authority_active {
                        return false;
                    }
                    current.resource_authority_active = false;
                    true
                })
        };
        if revoke {
            if let Some(resource_authority) = self.resource_authority() {
                resource_authority.revoke(&attempt.opaque_id());
            }
        }
    }

    fn apply_rpc_effects(
        &self,
        context: RpcEffectContext,
        effects: Vec<PluginChildWebviewRpcEffect>,
    ) -> bool {
        let dispatcher = cloned_attachment(&self.rpc_dispatcher);
        let mut all_delivered = true;
        let mut delivery_failed = false;
        for effect in effects {
            if !self.is_current_source(&context.attempt.opaque_id(), &context.source_label) {
                return false;
            }
            match effect {
                PluginChildWebviewRpcEffect::Dispatch(request) => {
                    let accepted = dispatcher.as_ref().is_some_and(|dispatcher| {
                        dispatcher.dispatch(&context.dispatch_facts(request.clone()))
                    });
                    if !accepted {
                        let _ = self.fail_rpc_dispatch(
                            context.attempt,
                            &context.source_label,
                            &request.request_id,
                        );
                        all_delivered = false;
                    }
                }
                PluginChildWebviewRpcEffect::Cancel(cancellation) => {
                    if let Some(dispatcher) = &dispatcher {
                        dispatcher.cancel(&context.cancellation_facts(cancellation));
                    }
                }
                PluginChildWebviewRpcEffect::Deliver(frame) => {
                    let delivered = self
                        .lock_state()
                        .current
                        .as_ref()
                        .filter(|current| {
                            current.attempt == context.attempt
                                && current.source_label == context.source_label
                        })
                        .and_then(|current| current.handle.as_ref())
                        .is_some_and(|handle| handle.deliver_bridge_frame(&frame).is_ok());
                    all_delivered &= delivered;
                    delivery_failed |= !delivered;
                }
                PluginChildWebviewRpcEffect::Disconnect => {
                    if let Some(dispatcher) = &dispatcher {
                        dispatcher.disconnect(context.attempt, &context.plugin_id);
                    }
                    let mut state = self.lock_state();
                    if let Some(current) = state.current.as_mut().filter(|current| {
                        current.attempt == context.attempt
                            && current.source_label == context.source_label
                    }) {
                        current.session.disconnect(
                            PluginChildWebviewSessionErrorCode::RuntimeSessionDisconnected,
                        );
                    }
                    drop(state);
                    self.revoke_current_resource_authority(context.attempt);
                }
            }
        }
        if delivery_failed {
            let _ = self.disconnect_current(
                context.attempt,
                PluginChildWebviewSessionErrorCode::RuntimeSessionDisconnected,
            );
        }
        all_delivered
    }
}

impl<H: PluginChildWebviewNativeHandle> PluginChildWebviewCurrentSource
    for PluginChildWebviewRegistry<H>
{
    fn is_current_source(&self, attempt_id: &str, source_label: &str) -> bool {
        let state = self.lock_state();
        let current = state.current.as_ref().filter(|current| {
            current.attempt.opaque_id() == attempt_id && current.source_label == source_label
        });
        current.is_some()
    }
}

impl<H: PluginChildWebviewNativeHandle> PluginChildWebviewBridgeIngress
    for PluginChildWebviewRegistry<H>
{
    fn receive(&self, attempt_id: &str, actual_source_label: &str, body: &str) {
        let Some(attempt) = PluginChildWebviewAttempt::from_opaque_id(attempt_id) else {
            return;
        };
        if is_ready_bridge_frame(body) {
            let _ = self.accept_ready_ingress(attempt, actual_source_label, body);
        } else {
            let _ = self.accept_rpc_ingress(attempt, actual_source_label, body);
        }
    }
}

impl<H: PluginChildWebviewNativeHandle> PluginChildWebviewLifecycleIngress
    for PluginChildWebviewRegistry<H>
{
    fn native_loaded(&self, attempt_id: &str, actual_source_label: &str) {
        let Some(attempt) = PluginChildWebviewAttempt::from_opaque_id(attempt_id) else {
            return;
        };
        let _ = self.mark_native_loaded(attempt, actual_source_label);
    }
}

fn derive_data_store_identifier(
    attempt: PluginChildWebviewAttempt,
    identity: &PluginChildWebviewIdentity,
) -> [u8; 16] {
    let mut hash = Sha256::new();
    hash.update(b"lensx-plugin-child-webview-data-store-v1\0");
    hash.update(attempt.0.to_le_bytes());
    hash.update(identity.resource_generation.to_le_bytes());
    for value in [
        identity.plugin_id.as_bytes(),
        identity.page_id.as_bytes(),
        identity.registration_entry_id.as_bytes(),
        identity.plugin_version.as_bytes(),
        identity.entry_url.as_str().as_bytes(),
        identity.host_route.as_bytes(),
    ] {
        hash.update((value.len() as u64).to_le_bytes());
        hash.update(value);
    }
    let digest = hash.finalize();
    let mut identifier = [0_u8; 16];
    identifier.copy_from_slice(&digest[..16]);
    identifier[6] = (identifier[6] & 0x0f) | 0x40;
    identifier[8] = (identifier[8] & 0x3f) | 0x80;
    identifier
}

fn is_ready_bridge_frame(body: &str) -> bool {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| value.get("type").and_then(Value::as_str).map(str::to_owned))
        .as_deref()
        == Some("lensx.plugin_bridge.ready")
}

fn derive_bridge_freshness(
    attempt: PluginChildWebviewAttempt,
    identity: &PluginChildWebviewIdentity,
    source_label: &str,
) -> String {
    let mut hash = Sha256::new();
    hash.update(b"lensx-plugin-child-webview-bridge-freshness-v1\0");
    hash.update(attempt.0.to_le_bytes());
    hash.update(identity.resource_generation.to_le_bytes());
    for value in [
        identity.plugin_id.as_bytes(),
        identity.page_id.as_bytes(),
        identity.registration_entry_id.as_bytes(),
        identity.entry_url.as_str().as_bytes(),
        identity.host_route.as_bytes(),
        source_label.as_bytes(),
    ] {
        hash.update((value.len() as u64).to_le_bytes());
        hash.update(value);
    }
    let digest = hash.finalize();
    digest[..16]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn parse_ready_freshness(body: &str) -> Option<String> {
    if body.is_empty() || body.len() > MAX_BRIDGE_FRAME_BYTES {
        return None;
    }
    let value = serde_json::from_str::<serde_json::Value>(body).ok()?;
    let object = value.as_object()?;
    if object.len() != 3
        || object.get("contract_version")?.as_str()? != "0.2.0"
        || object.get("type")?.as_str()? != "lensx.plugin_bridge.ready"
    {
        return None;
    }
    let freshness = object.get("freshness")?.as_str()?;
    (freshness.len() == 32
        && freshness
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')))
    .then(|| freshness.to_owned())
}

fn monotonic_now_ms() -> u64 {
    static PROCESS_EPOCH: OnceLock<Instant> = OnceLock::new();
    u64::try_from(
        PROCESS_EPOCH
            .get_or_init(Instant::now)
            .elapsed()
            .as_millis(),
    )
    .unwrap_or(u64::MAX)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewSlotUpdateResult {
    Applied,
    StaleAttempt,
    StaleRevision,
    NativeUpdateFailed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginChildWebviewPresentationResult {
    Applied,
    StaleAttempt,
    NativeUnavailable,
    NotReady,
    NotVisible,
    NativeFailed,
}

pub(crate) type PluginChildWebviewService<R> =
    PluginChildWebviewRegistry<PluginChildWebviewHandle<R>>;

pub(crate) fn setup_plugin_child_webview_service<R: Runtime>(
    app: &AppHandle<R>,
) -> Arc<PluginChildWebviewService<R>> {
    let service = Arc::new(PluginChildWebviewService::default());
    let managed = app.manage(Arc::clone(&service));
    debug_assert!(
        managed,
        "Child WebView service state should only be managed once"
    );
    service
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    #[derive(Clone, Default)]
    struct FakeHandle {
        destroys: Arc<AtomicUsize>,
        bounds_updates: Arc<AtomicUsize>,
        shows: Arc<AtomicUsize>,
        hides: Arc<AtomicUsize>,
        focuses: Arc<AtomicUsize>,
        fail_destroy: Arc<AtomicBool>,
        fail_delivery: Arc<AtomicBool>,
        fail_presentation: Arc<AtomicBool>,
        events: Option<Arc<Mutex<Vec<&'static str>>>>,
        deliveries: Option<Arc<Mutex<Vec<Value>>>>,
        source_label: Option<&'static str>,
    }

    impl PluginChildWebviewNativeHandle for FakeHandle {
        fn source_label(&self) -> String {
            self.source_label.unwrap_or("fake-child").to_owned()
        }

        fn update_bounds(&self, _x: i32, _y: i32, _width: u32, _height: u32) -> Result<(), ()> {
            self.bounds_updates.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        fn show(&self) -> Result<(), ()> {
            self.shows.fetch_add(1, Ordering::SeqCst);
            if self.fail_presentation.load(Ordering::SeqCst) {
                Err(())
            } else {
                Ok(())
            }
        }

        fn hide(&self) -> Result<(), ()> {
            self.hides.fetch_add(1, Ordering::SeqCst);
            if self.fail_presentation.load(Ordering::SeqCst) {
                Err(())
            } else {
                Ok(())
            }
        }

        fn focus(&self) -> Result<(), ()> {
            self.focuses.fetch_add(1, Ordering::SeqCst);
            if self.fail_presentation.load(Ordering::SeqCst) {
                Err(())
            } else {
                Ok(())
            }
        }

        fn deliver_bridge_frame(&self, frame: &Value) -> Result<(), ()> {
            if self.fail_delivery.load(Ordering::SeqCst) {
                return Err(());
            }
            if let Some(deliveries) = &self.deliveries {
                deliveries
                    .lock()
                    .expect("delivery frames should lock")
                    .push(frame.clone());
            }
            Ok(())
        }

        fn destroy(&self) -> Result<(), ()> {
            if let Some(events) = &self.events {
                events
                    .lock()
                    .expect("event log should lock")
                    .push("destroy");
            }
            self.destroys.fetch_add(1, Ordering::SeqCst);
            if self.fail_destroy.load(Ordering::SeqCst) {
                Err(())
            } else {
                Ok(())
            }
        }
    }

    struct FakeResourceAuthority {
        events: Arc<Mutex<Vec<&'static str>>>,
    }

    impl PluginChildWebviewResourceAuthority for FakeResourceAuthority {
        fn activate(
            &self,
            _attempt_id: &str,
            _webview_label: &str,
            _entry_id: &str,
            _resource_generation: u64,
        ) -> bool {
            self.events
                .lock()
                .expect("event log should lock")
                .push("activate");
            true
        }

        fn revoke(&self, _attempt_id: &str) -> bool {
            self.events
                .lock()
                .expect("event log should lock")
                .push("revoke");
            true
        }
    }

    #[derive(Default)]
    struct FakeReadyDispatcher {
        calls: AtomicUsize,
        facts: Mutex<Vec<PluginChildWebviewReadyFacts>>,
    }

    impl PluginChildWebviewReadyDispatcher for FakeReadyDispatcher {
        fn accept_ready(&self, facts: &PluginChildWebviewReadyFacts) -> bool {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.facts
                .lock()
                .expect("ready facts should lock")
                .push(facts.clone());
            true
        }
    }

    #[derive(Default)]
    struct FakeRpcDispatcher {
        dispatches: Mutex<Vec<PluginChildWebviewRpcDispatchFacts>>,
        cancellations: Mutex<Vec<PluginChildWebviewRpcCancellationFacts>>,
        disconnects: AtomicUsize,
    }

    impl PluginChildWebviewRpcDispatcher for FakeRpcDispatcher {
        fn dispatch(&self, facts: &PluginChildWebviewRpcDispatchFacts) -> bool {
            self.dispatches
                .lock()
                .expect("dispatch facts should lock")
                .push(facts.clone());
            true
        }

        fn cancel(&self, facts: &PluginChildWebviewRpcCancellationFacts) {
            self.cancellations
                .lock()
                .expect("cancellation facts should lock")
                .push(facts.clone());
        }

        fn disconnect(&self, _attempt: PluginChildWebviewAttempt, _plugin_id: &str) {
            self.disconnects.fetch_add(1, Ordering::SeqCst);
        }
    }

    fn ready_body(freshness: &str) -> String {
        serde_json::json!({
            "contract_version": "0.2.0",
            "type": "lensx.plugin_bridge.ready",
            "freshness": freshness,
        })
        .to_string()
    }

    fn rpc_request(sequence: u64, method: &str, params: Value) -> String {
        serde_json::json!({
            "contract_version": "0.2.0",
            "type": "lensx.plugin_bridge.request",
            "request_id": format!("request_{sequence:016x}"),
            "request": {"method": method, "params": params},
        })
        .to_string()
    }

    fn identity(plugin_id: &str, generation: u64) -> PluginChildWebviewIdentity {
        PluginChildWebviewIdentity::new(
            plugin_id,
            format!("page_{plugin_id}"),
            format!("entry_{plugin_id}"),
            "1.0.0",
            generation,
            format!("lensx-plugin://{plugin_id}.runtime.localhost/index.html")
                .parse()
                .expect("fixture URL should parse"),
            "/",
        )
        .expect("fixture identity should be valid")
    }

    #[test]
    fn reserves_one_current_entry_and_tracks_attached_state_and_bounds() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("first reservation should succeed");
        assert!(service
            .reserve_current(identity("plugin-b", 2), "fake-child-b")
            .is_none());
        assert!(service.attach_current(attempt, FakeHandle::default()));
        assert_eq!(
            service.show_current(attempt),
            PluginChildWebviewPresentationResult::NotReady
        );
        let creation = service.creation_facts(attempt).expect("creation facts");
        assert!(service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));
        assert!(service.mark_native_loaded(attempt, "fake-child"));
        assert_eq!(
            service.accept_ready_ingress(attempt, "fake-child", &ready_body(&creation.freshness)),
            PluginChildWebviewReadyResult::Accepted
        );
        let bounds = PluginChildWebviewBounds {
            x: 20,
            y: 40,
            width: 600,
            height: 400,
        };
        assert_eq!(
            service.apply_slot_update(attempt, 1, bounds),
            PluginChildWebviewSlotUpdateResult::Applied
        );
        assert_eq!(
            service.show_current(attempt),
            PluginChildWebviewPresentationResult::Applied
        );
        let snapshot = service.snapshot().expect("current snapshot should exist");
        assert_eq!(snapshot.attempt.opaque_id(), "attempt_0000000000000001");
        assert_eq!(snapshot.state, PluginChildWebviewState::Visible);
        assert_eq!(snapshot.bounds, Some(bounds));
        assert!(snapshot.native_attached);
        assert_eq!(snapshot.presentation_revision, 1);
        assert_eq!(snapshot.data_store_identifier[6] >> 4, 4);
        assert_eq!(snapshot.data_store_identifier[8] >> 6, 2);
    }

    #[test]
    fn stale_attach_is_destroyed_without_replacing_current() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let current = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("reservation should succeed");
        let late = FakeHandle::default();
        let late_destroys = Arc::clone(&late.destroys);
        assert!(!service.attach_current(PluginChildWebviewAttempt(999), late));
        assert_eq!(late_destroys.load(Ordering::SeqCst), 1);
        assert_eq!(
            service.snapshot().expect("current remains").attempt,
            current
        );
    }

    #[test]
    fn reserved_source_binding_is_current_before_attach_and_wrong_label_is_destroyed() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("reservation should succeed");
        assert!(service.is_current_source(&attempt.opaque_id(), "fake-child"));
        assert!(!service.is_current_source(&attempt.opaque_id(), "other-child"));
        assert!(!service.is_current_source("attempt_0000000000000999", "fake-child"));

        let wrong = FakeHandle {
            source_label: Some("other-child"),
            ..FakeHandle::default()
        };
        let destroys = Arc::clone(&wrong.destroys);
        assert!(!service.attach_current(attempt, wrong));
        assert_eq!(destroys.load(Ordering::SeqCst), 1);
        assert!(service.is_current_source(&attempt.opaque_id(), "fake-child"));
        assert!(service
            .compare_current_teardown(attempt)
            .expect("teardown succeeds"));
        assert!(!service.is_current_source(&attempt.opaque_id(), "fake-child"));
    }

    #[test]
    fn product_creation_derives_opaque_label_and_accepts_load_ready_callbacks_before_attach() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let events = Arc::new(Mutex::new(Vec::new()));
        assert!(
            service.attach_resource_authority(Arc::new(FakeResourceAuthority {
                events: Arc::clone(&events),
            }))
        );
        assert!(service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));
        assert!(service.attach_rpc_dispatcher(Arc::new(FakeRpcDispatcher::default())));
        let attempt = service
            .reserve_current_with_derived_label(identity("plugin-secret", 1))
            .expect("product reservation succeeds");
        let creation = service.creation_facts(attempt).expect("creation facts");
        assert_eq!(creation.source_label, "plugin-child-0000000000000001");
        assert!(!creation.source_label.contains("plugin-secret"));
        assert!(service.prepare_current_creation(attempt));
        assert!(service.mark_native_loaded(attempt, &creation.source_label));
        assert_eq!(
            service.accept_ready_ingress(
                attempt,
                &creation.source_label,
                &ready_body(&creation.freshness),
            ),
            PluginChildWebviewReadyResult::Accepted
        );
        assert!(service.attach_current(
            attempt,
            FakeHandle {
                source_label: Some("plugin-child-0000000000000001"),
                ..FakeHandle::default()
            },
        ));
        let snapshot = service.snapshot().expect("product current exists");
        assert!(snapshot.native_attached);
        assert_eq!(
            snapshot.session_state,
            PluginChildWebviewSessionState::BridgeReady
        );
        assert_eq!(
            *events.lock().expect("events should lock"),
            vec!["activate"]
        );
    }

    #[test]
    fn show_hide_focus_and_native_failures_commit_state_only_after_success() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("reservation should succeed");
        let handle = FakeHandle::default();
        let shows = Arc::clone(&handle.shows);
        let hides = Arc::clone(&handle.hides);
        let focuses = Arc::clone(&handle.focuses);
        let fail_presentation = Arc::clone(&handle.fail_presentation);
        assert!(service.attach_current(attempt, handle));
        let creation = service.creation_facts(attempt).expect("creation facts");
        assert!(service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));

        assert_eq!(
            service.focus_current(attempt),
            PluginChildWebviewPresentationResult::NotVisible
        );
        assert_eq!(focuses.load(Ordering::SeqCst), 0);
        assert_eq!(
            service.show_current(attempt),
            PluginChildWebviewPresentationResult::NotReady
        );
        assert_eq!(shows.load(Ordering::SeqCst), 0);
        assert!(service.mark_native_loaded(attempt, "fake-child"));
        assert_eq!(
            service.accept_ready_ingress(attempt, "fake-child", &ready_body(&creation.freshness)),
            PluginChildWebviewReadyResult::Accepted
        );
        assert_eq!(
            service.show_current(attempt),
            PluginChildWebviewPresentationResult::Applied
        );
        assert_eq!(
            service.focus_current(attempt),
            PluginChildWebviewPresentationResult::Applied
        );
        assert_eq!(
            service.hide_current(attempt),
            PluginChildWebviewPresentationResult::Applied
        );
        assert_eq!(
            service.snapshot().expect("current").state,
            PluginChildWebviewState::Hidden
        );
        assert_eq!(shows.load(Ordering::SeqCst), 1);
        assert_eq!(hides.load(Ordering::SeqCst), 1);
        assert_eq!(focuses.load(Ordering::SeqCst), 1);

        fail_presentation.store(true, Ordering::SeqCst);
        assert_eq!(
            service.show_current(attempt),
            PluginChildWebviewPresentationResult::NativeFailed
        );
        assert_eq!(
            service.snapshot().expect("current").state,
            PluginChildWebviewState::Hidden
        );
    }

    #[test]
    fn stale_callbacks_cannot_operate_a_replacement_webview() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let old_attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("old reservation succeeds");
        assert!(service.attach_current(old_attempt, FakeHandle::default()));
        assert!(service
            .compare_current_teardown(old_attempt)
            .expect("old teardown succeeds"));

        let new_attempt = service
            .reserve_current(identity("plugin-b", 2), "replacement-child")
            .expect("replacement reservation succeeds");
        let replacement = FakeHandle {
            source_label: Some("replacement-child"),
            ..FakeHandle::default()
        };
        let bounds_updates = Arc::clone(&replacement.bounds_updates);
        let shows = Arc::clone(&replacement.shows);
        let hides = Arc::clone(&replacement.hides);
        let focuses = Arc::clone(&replacement.focuses);
        let destroys = Arc::clone(&replacement.destroys);
        assert!(service.attach_current(new_attempt, replacement));

        assert_eq!(
            service.apply_slot_update(
                old_attempt,
                99,
                PluginChildWebviewBounds {
                    x: 1,
                    y: 1,
                    width: 1,
                    height: 1,
                },
            ),
            PluginChildWebviewSlotUpdateResult::StaleAttempt
        );
        for result in [
            service.show_current(old_attempt),
            service.hide_current(old_attempt),
            service.focus_current(old_attempt),
        ] {
            assert_eq!(result, PluginChildWebviewPresentationResult::StaleAttempt);
        }
        assert!(!service
            .compare_current_teardown(old_attempt)
            .expect("stale teardown is bounded"));
        assert_eq!(bounds_updates.load(Ordering::SeqCst), 0);
        assert_eq!(shows.load(Ordering::SeqCst), 0);
        assert_eq!(hides.load(Ordering::SeqCst), 0);
        assert_eq!(focuses.load(Ordering::SeqCst), 0);
        assert_eq!(destroys.load(Ordering::SeqCst), 0);
        assert_eq!(
            service.snapshot().expect("replacement remains").attempt,
            new_attempt
        );
    }

    #[test]
    fn concurrent_reservations_publish_at_most_one_current_attempt() {
        use std::sync::Barrier;

        let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
        let barrier = Arc::new(Barrier::new(12));
        let workers = (0..12)
            .map(|index| {
                let service = Arc::clone(&service);
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    service.reserve_current(
                        identity(&format!("plugin-{index}"), index + 1),
                        format!("plugin-child-{index}"),
                    )
                })
            })
            .collect::<Vec<_>>();
        let attempts = workers
            .into_iter()
            .filter_map(|worker| worker.join().expect("reservation worker finishes"))
            .collect::<Vec<_>>();
        assert_eq!(attempts.len(), 1);
        assert_eq!(
            service.snapshot().expect("one current").attempt,
            attempts[0]
        );
    }

    #[test]
    fn teardown_is_compare_current_and_releases_the_native_handle() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("reservation should succeed");
        let handle = FakeHandle::default();
        let destroys = Arc::clone(&handle.destroys);
        assert!(service.attach_current(attempt, handle));
        assert!(!service
            .compare_current_teardown(PluginChildWebviewAttempt(999))
            .expect("stale teardown is bounded"));
        assert_eq!(destroys.load(Ordering::SeqCst), 0);
        assert!(service
            .compare_current_teardown(attempt)
            .expect("current teardown succeeds"));
        assert_eq!(destroys.load(Ordering::SeqCst), 1);
        assert!(service.snapshot().is_none());
    }

    #[test]
    fn teardown_terminates_both_rpc_endpoints_once_and_makes_late_callbacks_inert() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        assert!(service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));
        let dispatcher = Arc::new(FakeRpcDispatcher::default());
        assert!(service.attach_rpc_dispatcher(dispatcher.clone()));
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("reservation should succeed");
        let handle = FakeHandle {
            deliveries: Some(Arc::new(Mutex::new(Vec::new()))),
            ..FakeHandle::default()
        };
        let deliveries = handle
            .deliveries
            .as_ref()
            .expect("deliveries exist")
            .clone();
        let destroys = Arc::clone(&handle.destroys);
        assert!(service.attach_current_at(attempt, handle, 0));
        assert!(service.mark_native_loaded_at(attempt, "fake-child", 1));
        let creation = service.creation_facts(attempt).expect("creation facts");
        assert_eq!(
            service.accept_ready_ingress_at(
                attempt,
                "fake-child",
                &ready_body(&creation.freshness),
                2,
            ),
            PluginChildWebviewReadyResult::Accepted
        );
        assert_eq!(
            service.accept_rpc_ingress_at(
                attempt,
                "fake-child",
                &rpc_request(1, "storage.get", serde_json::json!({"key":"slow"})),
                3,
            ),
            PluginChildWebviewRpcIngressResult::Dispatched
        );

        assert!(service
            .compare_current_teardown(attempt)
            .expect("current teardown succeeds"));
        assert_eq!(destroys.load(Ordering::SeqCst), 1);
        assert_eq!(
            dispatcher
                .cancellations
                .lock()
                .expect("cancellations should lock")
                .len(),
            1
        );
        assert_eq!(dispatcher.disconnects.load(Ordering::SeqCst), 1);
        assert_eq!(
            deliveries
                .lock()
                .expect("deliveries should lock")
                .as_slice(),
            &[serde_json::json!({
                "contract_version":"0.2.0",
                "type":"lensx.plugin_bridge.disconnect"
            })]
        );
        assert_eq!(
            service.settle_rpc_dispatch(
                attempt,
                "fake-child",
                "request_0000000000000001",
                serde_json::json!({"method":"storage.get","result":{"found":false}}),
            ),
            PluginChildWebviewRpcIngressResult::SessionUnavailable
        );
        assert!(!service
            .compare_current_teardown(attempt)
            .expect("duplicate teardown is inert"));
        assert_eq!(destroys.load(Ordering::SeqCst), 1);
        assert_eq!(dispatcher.disconnects.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn failed_bridge_delivery_disconnects_handlers_and_revokes_resource_authority_once() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let events = Arc::new(Mutex::new(Vec::new()));
        assert!(
            service.attach_resource_authority(Arc::new(FakeResourceAuthority {
                events: Arc::clone(&events),
            }))
        );
        assert!(service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));
        let dispatcher = Arc::new(FakeRpcDispatcher::default());
        assert!(service.attach_rpc_dispatcher(dispatcher.clone()));
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("reservation should succeed");
        let handle = FakeHandle {
            fail_delivery: Arc::new(AtomicBool::new(true)),
            events: Some(Arc::clone(&events)),
            ..FakeHandle::default()
        };
        assert!(service.attach_current_at(attempt, handle, 0));
        assert!(service.mark_native_loaded_at(attempt, "fake-child", 1));
        let creation = service.creation_facts(attempt).expect("creation facts");
        assert_eq!(
            service.accept_ready_ingress_at(
                attempt,
                "fake-child",
                &ready_body(&creation.freshness),
                2,
            ),
            PluginChildWebviewReadyResult::Accepted
        );
        assert_eq!(
            service.accept_rpc_ingress_at(
                attempt,
                "fake-child",
                &rpc_request(1, "runtime.get_context", serde_json::json!({})),
                3,
            ),
            PluginChildWebviewRpcIngressResult::Dispatched
        );
        assert_eq!(
            service.settle_rpc_dispatch(
                attempt,
                "fake-child",
                "request_0000000000000001",
                serde_json::json!({
                    "method":"runtime.get_context",
                    "result":{
                        "hostApiVersion":"0.2.0",
                        "locale":"en-US",
                        "theme":"light",
                        "capabilities":[]
                    }
                }),
            ),
            PluginChildWebviewRpcIngressResult::Responded
        );
        assert_eq!(
            service
                .snapshot()
                .expect("current remains for teardown")
                .session_state,
            PluginChildWebviewSessionState::Disconnected
        );
        assert_eq!(dispatcher.disconnects.load(Ordering::SeqCst), 1);
        assert_eq!(
            *events.lock().expect("events should lock"),
            vec!["activate", "revoke"]
        );
        assert!(service
            .compare_current_teardown(attempt)
            .expect("native teardown succeeds"));
        assert_eq!(
            *events.lock().expect("events should lock"),
            vec!["activate", "revoke", "destroy"]
        );
        assert_eq!(dispatcher.disconnects.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn failed_native_destroy_keeps_current_for_retry() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let events = Arc::new(Mutex::new(Vec::new()));
        assert!(
            service.attach_resource_authority(Arc::new(FakeResourceAuthority {
                events: Arc::clone(&events),
            }))
        );
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("reservation should succeed");
        let handle = FakeHandle::default();
        let handle = FakeHandle {
            events: Some(Arc::clone(&events)),
            ..handle
        };
        handle.fail_destroy.store(true, Ordering::SeqCst);
        assert!(service.attach_current(attempt, handle.clone()));
        assert!(service.compare_current_teardown(attempt).is_err());
        assert!(service.snapshot().is_some());
        handle.fail_destroy.store(false, Ordering::SeqCst);
        assert!(service
            .compare_current_teardown(attempt)
            .expect("retry succeeds"));
        assert!(service.snapshot().is_none());
        assert_eq!(
            events
                .lock()
                .expect("events should lock")
                .iter()
                .filter(|event| **event == "revoke")
                .count(),
            1
        );
    }

    #[test]
    fn resource_authority_is_activated_for_source_and_revoked_before_destroy() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let events = Arc::new(Mutex::new(Vec::new()));
        assert!(
            service.attach_resource_authority(Arc::new(FakeResourceAuthority {
                events: Arc::clone(&events),
            }))
        );
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("reservation should succeed");
        assert!(service.attach_current(
            attempt,
            FakeHandle {
                events: Some(Arc::clone(&events)),
                ..FakeHandle::default()
            },
        ));
        assert!(service
            .compare_current_teardown(attempt)
            .expect("teardown succeeds"));
        assert_eq!(
            *events.lock().expect("event log should lock"),
            vec!["activate", "revoke", "destroy"]
        );
    }

    #[test]
    fn ready_ingress_is_current_identity_bound_single_use_and_rejection_has_zero_side_effects() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let dispatcher = Arc::new(FakeReadyDispatcher::default());
        assert!(service.attach_ready_dispatcher(dispatcher.clone()));
        let old_attempt = service
            .reserve_current(identity("plugin-a", 7), "fake-child")
            .expect("reservation succeeds");
        assert!(service.attach_current_at(old_attempt, FakeHandle::default(), 100));
        let old_creation = service
            .creation_facts(old_attempt)
            .expect("creation facts exist");
        let valid = ready_body(&old_creation.freshness);

        assert_eq!(
            service.accept_ready_ingress_at(old_attempt, "fake-child", &valid, 101),
            PluginChildWebviewReadyResult::SessionUnavailable
        );
        assert_eq!(dispatcher.calls.load(Ordering::SeqCst), 0);
        assert!(service.mark_native_loaded_at(old_attempt, "fake-child", 200));

        for malformed in [
            "not-json".to_owned(),
            "{}".to_owned(),
            serde_json::json!({
                "contract_version": "0.2.0",
                "type": "lensx.plugin_bridge.ready",
                "freshness": old_creation.freshness,
                "plugin_id": "forged",
            })
            .to_string(),
            serde_json::json!({
                "contract_version": "0.1.0",
                "type": "lensx.plugin_bridge.ready",
                "freshness": "0123456789abcdef0123456789abcdef",
            })
            .to_string(),
        ] {
            assert_eq!(
                service.accept_ready_ingress(old_attempt, "fake-child", &malformed),
                PluginChildWebviewReadyResult::Malformed
            );
        }
        assert_eq!(
            service.accept_ready_ingress(PluginChildWebviewAttempt(999), "fake-child", &valid),
            PluginChildWebviewReadyResult::StaleSource
        );
        assert_eq!(
            service.accept_ready_ingress(old_attempt, "wrong-child", &valid),
            PluginChildWebviewReadyResult::StaleSource
        );
        assert_eq!(
            service.accept_ready_ingress(
                old_attempt,
                "fake-child",
                &ready_body("ffffffffffffffffffffffffffffffff"),
            ),
            PluginChildWebviewReadyResult::FreshnessMismatch
        );
        assert_eq!(dispatcher.calls.load(Ordering::SeqCst), 0);

        assert_eq!(
            service.accept_ready_ingress_at(old_attempt, "fake-child", &valid, 201),
            PluginChildWebviewReadyResult::Accepted
        );
        assert_eq!(
            service.accept_ready_ingress_at(old_attempt, "fake-child", &valid, 202),
            PluginChildWebviewReadyResult::Duplicate
        );
        assert_eq!(dispatcher.calls.load(Ordering::SeqCst), 1);
        let accepted = dispatcher
            .facts
            .lock()
            .expect("ready facts should lock")
            .first()
            .cloned()
            .expect("one accepted ready");
        assert_eq!(accepted.attempt, old_attempt);
        assert_eq!(accepted.source_label, "fake-child");
        assert_eq!(accepted.plugin_id, "plugin-a");
        assert_eq!(accepted.page_id, "page_plugin-a");
        assert_eq!(accepted.registration_entry_id, "entry_plugin-a");
        assert_eq!(accepted.resource_generation, 7);

        assert!(service
            .compare_current_teardown(old_attempt)
            .expect("old teardown succeeds"));
        let replacement = service
            .reserve_current(identity("plugin-b", 8), "replacement-child")
            .expect("replacement reservation succeeds");
        assert!(service.attach_current_at(
            replacement,
            FakeHandle {
                source_label: Some("replacement-child"),
                ..FakeHandle::default()
            },
            300,
        ));
        assert!(service.mark_native_loaded_at(replacement, "replacement-child", 301));
        assert_eq!(
            service.accept_ready_ingress(old_attempt, "fake-child", &valid),
            PluginChildWebviewReadyResult::StaleSource
        );
        assert_eq!(dispatcher.calls.load(Ordering::SeqCst), 1);
        let replacement_facts = service
            .creation_facts(replacement)
            .expect("replacement facts");
        assert_eq!(
            service.accept_ready_ingress_at(
                replacement,
                "replacement-child",
                &ready_body(&replacement_facts.freshness),
                302,
            ),
            PluginChildWebviewReadyResult::Accepted
        );
        assert_eq!(dispatcher.calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn current_bridge_routes_rpc_with_trusted_facts_and_correlated_settlement() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let ready = Arc::new(FakeReadyDispatcher::default());
        let dispatcher = Arc::new(FakeRpcDispatcher::default());
        let delivery = Arc::new(Mutex::new(Vec::new()));
        assert!(service.attach_ready_dispatcher(ready));
        assert!(service.attach_rpc_dispatcher(dispatcher.clone()));

        let attempt = service
            .reserve_current(identity("plugin-a", 7), "fake-child")
            .expect("reservation succeeds");
        assert!(service.attach_current_at(
            attempt,
            FakeHandle {
                deliveries: Some(Arc::clone(&delivery)),
                ..FakeHandle::default()
            },
            100,
        ));
        assert!(service.mark_native_loaded_at(attempt, "fake-child", 101));
        let creation = service.creation_facts(attempt).expect("creation facts");
        assert_eq!(
            service.accept_ready_ingress_at(
                attempt,
                "fake-child",
                &ready_body(&creation.freshness),
                102,
            ),
            PluginChildWebviewReadyResult::Accepted
        );

        let context_request = rpc_request(1, "runtime.get_context", serde_json::json!({}));
        assert_eq!(
            service.accept_rpc_ingress_at(attempt, "wrong-child", &context_request, 103),
            PluginChildWebviewRpcIngressResult::SessionUnavailable
        );
        assert!(dispatcher
            .dispatches
            .lock()
            .expect("dispatch facts should lock")
            .is_empty());
        assert_eq!(
            service.accept_rpc_ingress_at(attempt, "fake-child", &context_request, 103),
            PluginChildWebviewRpcIngressResult::Dispatched
        );
        let facts = dispatcher
            .dispatches
            .lock()
            .expect("dispatch facts should lock")[0]
            .clone();
        assert_eq!(facts.attempt, attempt);
        assert_eq!(facts.source_label, "fake-child");
        assert_eq!(facts.plugin_id, "plugin-a");
        assert_eq!(facts.page_id, "page_plugin-a");
        assert_eq!(facts.registration_entry_id, "entry_plugin-a");
        assert_eq!(facts.resource_generation, 7);

        assert_eq!(
            service.settle_rpc_dispatch(
                attempt,
                "fake-child",
                "request_0000000000000001",
                serde_json::json!({
                    "method":"runtime.get_context",
                    "result":{
                        "hostApiVersion":"0.2.0",
                        "locale":"en-US",
                        "theme":"light",
                        "capabilities":[]
                    }
                }),
            ),
            PluginChildWebviewRpcIngressResult::Responded
        );
        assert_eq!(
            service.snapshot().expect("current").session_state,
            PluginChildWebviewSessionState::SdkReady
        );

        let close = rpc_request(2, "ui.close", serde_json::json!({}));
        let get = rpc_request(3, "storage.get", serde_json::json!({"key":"theme"}));
        assert_eq!(
            service.accept_rpc_ingress_at(attempt, "fake-child", &close, 200),
            PluginChildWebviewRpcIngressResult::Dispatched
        );
        assert_eq!(
            service.accept_rpc_ingress_at(attempt, "fake-child", &get, 200),
            PluginChildWebviewRpcIngressResult::Dispatched
        );
        assert_eq!(
            service.settle_rpc_dispatch(
                attempt,
                "fake-child",
                "request_0000000000000003",
                serde_json::json!({
                    "method":"storage.get",
                    "result":{"found":false}
                }),
            ),
            PluginChildWebviewRpcIngressResult::Responded
        );
        assert_eq!(
            service.settle_rpc_dispatch(
                attempt,
                "fake-child",
                "request_0000000000000002",
                serde_json::json!({"method":"ui.close","result":{"accepted":true}}),
            ),
            PluginChildWebviewRpcIngressResult::Responded
        );
        assert_eq!(service.snapshot().expect("current").rpc_pending_requests, 0);
        let frames = delivery.lock().expect("delivery frames should lock");
        let response_ids = frames
            .iter()
            .filter_map(|frame| frame.get("request_id").and_then(Value::as_str))
            .collect::<Vec<_>>();
        assert_eq!(
            response_ids,
            vec![
                "request_0000000000000001",
                "request_0000000000000003",
                "request_0000000000000002"
            ]
        );
    }

    #[test]
    fn late_old_response_and_event_never_cross_into_replacement_handle() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        assert!(service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));
        assert!(service.attach_rpc_dispatcher(Arc::new(FakeRpcDispatcher::default())));
        let old_deliveries = Arc::new(Mutex::new(Vec::new()));
        let old_attempt = service
            .reserve_current(identity("plugin-a", 1), "old-child")
            .expect("old reservation");
        assert!(service.attach_current_at(
            old_attempt,
            FakeHandle {
                source_label: Some("old-child"),
                deliveries: Some(Arc::clone(&old_deliveries)),
                ..FakeHandle::default()
            },
            0,
        ));
        assert!(service.mark_native_loaded_at(old_attempt, "old-child", 1));
        let old_creation = service.creation_facts(old_attempt).expect("old creation");
        assert_eq!(
            service.accept_ready_ingress_at(
                old_attempt,
                "old-child",
                &ready_body(&old_creation.freshness),
                2,
            ),
            PluginChildWebviewReadyResult::Accepted
        );
        assert_eq!(
            service.accept_rpc_ingress_at(
                old_attempt,
                "old-child",
                &rpc_request(1, "storage.get", serde_json::json!({"key":"payload"})),
                3,
            ),
            PluginChildWebviewRpcIngressResult::Dispatched
        );
        assert!(service
            .compare_current_teardown(old_attempt)
            .expect("old teardown"));

        let replacement_deliveries = Arc::new(Mutex::new(Vec::new()));
        let replacement = service
            .reserve_current(identity("plugin-b", 2), "replacement-child")
            .expect("replacement reservation");
        assert!(service.attach_current_at(
            replacement,
            FakeHandle {
                source_label: Some("replacement-child"),
                deliveries: Some(Arc::clone(&replacement_deliveries)),
                ..FakeHandle::default()
            },
            10,
        ));
        assert!(service.mark_native_loaded_at(replacement, "replacement-child", 11));
        let creation = service
            .creation_facts(replacement)
            .expect("replacement creation");
        assert_eq!(
            service.accept_ready_ingress_at(
                replacement,
                "replacement-child",
                &ready_body(&creation.freshness),
                12,
            ),
            PluginChildWebviewReadyResult::Accepted
        );

        assert_eq!(
            service.settle_rpc_dispatch(
                old_attempt,
                "old-child",
                "request_0000000000000001",
                serde_json::json!({
                    "method":"storage.get",
                    "result":{"found":true,"value":"</script>"}
                }),
            ),
            PluginChildWebviewRpcIngressResult::SessionUnavailable
        );
        assert_eq!(
            old_deliveries
                .lock()
                .expect("old deliveries should lock")
                .as_slice(),
            &[serde_json::json!({
                "contract_version":"0.2.0",
                "type":"lensx.plugin_bridge.disconnect"
            })]
        );
        assert!(replacement_deliveries
            .lock()
            .expect("replacement deliveries should lock")
            .is_empty());

        assert_eq!(
            service.emit_rpc_event(
                replacement,
                "replacement-child",
                serde_json::json!({
                    "event":"runtime.context_changed",
                    "payload":{
                        "hostApiVersion":"0.2.0",
                        "locale":"zh-CN",
                        "theme":"dark",
                        "capabilities":[]
                    }
                }),
            ),
            PluginChildWebviewRpcIngressResult::Responded
        );
        assert_eq!(
            replacement_deliveries
                .lock()
                .expect("replacement deliveries should lock")
                .len(),
            1
        );
    }

    #[test]
    fn native_loaded_bridge_ready_context_ready_disconnect_and_dispose_are_distinct() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let dispatcher = Arc::new(FakeReadyDispatcher::default());
        assert!(service.attach_ready_dispatcher(dispatcher));
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("reservation succeeds");
        assert_eq!(
            service.snapshot().expect("current").session_state,
            PluginChildWebviewSessionState::Creating
        );
        assert!(service.attach_current_at(attempt, FakeHandle::default(), 1_000));
        assert_eq!(
            service.snapshot().expect("current").session_state,
            PluginChildWebviewSessionState::Loading
        );
        assert!(!service.mark_native_loaded_at(attempt, "wrong-child", 1_100));
        assert!(service.mark_native_loaded_at(attempt, "fake-child", 1_100));
        assert_eq!(
            service.snapshot().expect("current").session_state,
            PluginChildWebviewSessionState::Loaded
        );
        let creation = service.creation_facts(attempt).expect("creation facts");
        assert_eq!(
            service.accept_ready_ingress_at(
                attempt,
                "fake-child",
                &ready_body(&creation.freshness),
                1_200,
            ),
            PluginChildWebviewReadyResult::Accepted
        );
        assert_eq!(
            service.snapshot().expect("current").session_state,
            PluginChildWebviewSessionState::BridgeReady
        );
        assert!(!service.mark_sdk_ready_after_context(attempt, "fake-child", "storage.get", true,));
        assert!(!service.mark_sdk_ready_after_context(
            attempt,
            "fake-child",
            "runtime.get_context",
            false,
        ));
        assert!(service.mark_sdk_ready_after_context(
            attempt,
            "fake-child",
            "runtime.get_context",
            true,
        ));
        assert_eq!(
            service.snapshot().expect("current").session_state,
            PluginChildWebviewSessionState::SdkReady
        );
        assert!(service.disconnect_current(
            attempt,
            PluginChildWebviewSessionErrorCode::RuntimeSessionDisconnected,
        ));
        let disconnected = service.snapshot().expect("current");
        assert_eq!(
            disconnected.session_state,
            PluginChildWebviewSessionState::Disconnected
        );
        assert_eq!(
            disconnected.session_error,
            Some(PluginChildWebviewSessionErrorCode::RuntimeSessionDisconnected)
        );
        assert!(service
            .compare_current_teardown(attempt)
            .expect("dispose succeeds"));
        assert!(service.snapshot().is_none());
    }

    #[test]
    fn ten_second_load_and_five_second_ready_deadlines_map_to_stable_errors() {
        let mut load = PluginChildWebviewSessionMachine::new();
        assert!(load.begin_loading(100));
        assert_eq!(
            load.expire(100 + PLUGIN_CHILD_WEBVIEW_LOAD_DEADLINE_MS - 1),
            None
        );
        assert_eq!(
            load.expire(100 + PLUGIN_CHILD_WEBVIEW_LOAD_DEADLINE_MS),
            Some(PluginChildWebviewSessionErrorCode::RuntimeLoadTimeout)
        );
        assert_eq!(load.state, PluginChildWebviewSessionState::Disconnected);
        assert_eq!(
            load.error.expect("load error").as_str(),
            "runtime_load_timeout"
        );

        let mut ready = PluginChildWebviewSessionMachine::new();
        assert!(ready.begin_loading(500));
        assert!(ready.native_loaded(600));
        assert_eq!(
            ready.expire(600 + PLUGIN_CHILD_WEBVIEW_READY_DEADLINE_MS - 1),
            None
        );
        assert_eq!(
            ready.expire(600 + PLUGIN_CHILD_WEBVIEW_READY_DEADLINE_MS),
            Some(PluginChildWebviewSessionErrorCode::RuntimeHandshakeTimeout)
        );
        assert_eq!(ready.state, PluginChildWebviewSessionState::Disconnected);
        assert_eq!(
            ready.error.expect("ready error").as_str(),
            "runtime_handshake_timeout"
        );
        assert_eq!(
            PluginChildWebviewSessionErrorCode::RuntimeUnavailable.as_str(),
            "runtime_unavailable"
        );
    }

    #[test]
    fn trusted_identity_rejects_wrong_scheme_and_zero_generation() {
        let wrong_scheme = PluginChildWebviewIdentity::new(
            "plugin-a",
            "page-a",
            "entry-a",
            "1.0.0",
            1,
            "https://example.com/plugin.html"
                .parse()
                .expect("fixture URL parses"),
            "/",
        );
        assert!(wrong_scheme.is_none());
        let zero_generation = PluginChildWebviewIdentity::new(
            "plugin-a",
            "page-a",
            "entry-a",
            "1.0.0",
            0,
            "lensx-plugin://plugin-a.runtime.localhost/plugin.html"
                .parse()
                .expect("fixture URL parses"),
            "/",
        );
        assert!(zero_generation.is_none());
    }

    #[test]
    fn each_attempt_and_resource_generation_gets_a_distinct_private_data_store() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let first = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("first reservation succeeds");
        let first_facts = service.creation_facts(first).expect("first facts exist");
        assert!(service
            .compare_current_teardown(first)
            .expect("first teardown succeeds"));
        let second = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("second reservation succeeds");
        let second_facts = service.creation_facts(second).expect("second facts exist");
        assert_ne!(
            first_facts.data_store_identifier,
            second_facts.data_store_identifier
        );
        assert!(service
            .compare_current_teardown(second)
            .expect("second teardown succeeds"));
        let third = service
            .reserve_current(identity("plugin-a", 2), "fake-child")
            .expect("third reservation succeeds");
        let third_facts = service.creation_facts(third).expect("third facts exist");
        assert_ne!(
            second_facts.data_store_identifier,
            third_facts.data_store_identifier
        );
    }

    #[test]
    fn presentation_readiness_wait_settles_once_for_ready_failure_and_stale_attempts() {
        let ready_service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let ready_attempt = ready_service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .expect("ready reservation succeeds");
        assert!(ready_service.attach_current(ready_attempt, FakeHandle::default()));
        assert!(ready_service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));
        let creation = ready_service
            .creation_facts(ready_attempt)
            .expect("ready creation facts exist");
        assert!(ready_service.mark_native_loaded(ready_attempt, "fake-child"));
        assert_eq!(
            ready_service.accept_ready_ingress(
                ready_attempt,
                "fake-child",
                &ready_body(&creation.freshness),
            ),
            PluginChildWebviewReadyResult::Accepted
        );
        assert_eq!(
            ready_service.wait_presentation_readiness(ready_attempt),
            PluginChildWebviewWaitReadiness::Ready
        );

        let failure_service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
        let failure_attempt = failure_service
            .reserve_current(identity("plugin-b", 2), "failed-child")
            .expect("failure reservation succeeds");
        assert!(failure_service.attach_current(
            failure_attempt,
            FakeHandle {
                source_label: Some("failed-child"),
                ..FakeHandle::default()
            },
        ));
        let (sender, receiver) = std::sync::mpsc::channel();
        let waiter = Arc::clone(&failure_service);
        std::thread::spawn(move || {
            sender
                .send(waiter.wait_presentation_readiness(failure_attempt))
                .expect("wait result should be received");
        });
        assert!(failure_service.disconnect_current(
            failure_attempt,
            PluginChildWebviewSessionErrorCode::RuntimeSessionDisconnected,
        ));
        assert_eq!(
            receiver
                .recv_timeout(Duration::from_secs(1))
                .expect("failure wait should settle"),
            PluginChildWebviewWaitReadiness::Failed(
                PluginChildWebviewSessionErrorCode::RuntimeSessionDisconnected,
            )
        );
        assert!(failure_service
            .compare_current_teardown(failure_attempt)
            .expect("failure teardown succeeds"));
        assert_eq!(
            failure_service.wait_presentation_readiness(failure_attempt),
            PluginChildWebviewWaitReadiness::StaleAttempt
        );
    }

    #[test]
    fn setup_manages_exactly_one_shared_service_instance() {
        let app = tauri::test::mock_app();
        let service = setup_plugin_child_webview_service(app.handle());
        let managed = app.state::<Arc<PluginChildWebviewService<tauri::test::MockRuntime>>>();
        assert!(Arc::ptr_eq(&service, &managed));
    }
}
