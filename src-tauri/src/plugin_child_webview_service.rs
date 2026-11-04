#![allow(dead_code)] // Tasks 2.2-4.5 connect this task's Host-private registry to presentation and lifecycle.

use crate::plugin_child_webview_adapter::{
    valid_host_route, valid_source_label, PluginChildWebviewBridgeIngress,
    PluginChildWebviewCurrentSource, PluginChildWebviewHandle, PluginChildWebviewLifecycleIngress,
    PluginChildWebviewNativeHandle,
};
use crate::plugin_child_webview_execution::{
    NativeExecutionGuard, NativePresentationOperation, NativePresentationOutcome, PresentationEpoch,
};
use crate::plugin_child_webview_owner::{
    PluginChildWebviewMigrationToken, PluginChildWebviewOwner, PluginChildWebviewOwnershipTransfer,
    TransferPublication, TransferPublicationReceipt,
};
use crate::plugin_child_webview_rpc::{
    PluginChildWebviewRpcCancellation, PluginChildWebviewRpcDispatch, PluginChildWebviewRpcEffect,
    PluginChildWebviewRpcIngressResult, PluginChildWebviewRpcSession,
};
use crate::plugin_host_api_validation::validate_host_api_result;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
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

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
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
    pub(crate) fn plugin_id(&self) -> &str {
        &self.plugin_id
    }
    pub(crate) fn page_id(&self) -> &str {
        &self.page_id
    }
    pub(crate) fn entry_id(&self) -> &str {
        &self.registration_entry_id
    }
    pub(crate) fn version(&self) -> &str {
        &self.plugin_version
    }
    pub(crate) fn resource_generation(&self) -> u64 {
        self.resource_generation
    }

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
    pub(crate) owner: PluginChildWebviewOwner,
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
    pub(crate) owner: PluginChildWebviewOwner,
    pub(crate) entry_url: Url,
    pub(crate) host_route: String,
    pub(crate) source_label: String,
    pub(crate) freshness: String,
    pub(crate) data_store_identifier: [u8; 16],
}

struct CurrentEntry<H> {
    owner: PluginChildWebviewOwner,
    transfer: Option<PluginChildWebviewOwnershipTransfer>,
    teardown_running: bool,
    attempt: PluginChildWebviewAttempt,
    identity: PluginChildWebviewIdentity,
    source_label: String,
    state: PluginChildWebviewState,
    bounds: Option<PluginChildWebviewBounds>,
    handle: Option<Arc<H>>,
    presentation_revision: u64,
    visibility_intent_revision: u64,
    presentation_epoch: Arc<PresentationEpoch>,
    freshness: String,
    bridge_ready: bool,
    session: PluginChildWebviewSessionMachine,
    rpc: PluginChildWebviewRpcSession,
    data_store_identifier: [u8; 16],
    resource_authority_active: bool,
    load_started_at_ms: Option<u64>,
}

impl<H> CurrentEntry<H> {
    fn matches_owner(&self, owner: &PluginChildWebviewOwner) -> bool {
        self.owner == *owner && self.transfer.is_none()
    }

    fn snapshot(&self) -> PluginChildWebviewSnapshot {
        PluginChildWebviewSnapshot {
            attempt: self.attempt,
            identity: self.identity.clone(),
            owner: self.owner.clone(),
            source_label: self.source_label.clone(),
            state: self.state,
            bounds: self.bounds,
            native_attached: self.handle.is_some(),
            presentation_revision: self.presentation_revision,
            bridge_ready: self.bridge_ready,
            session_state: self.session.state,
            session_error: self.session.error,
            rpc_pending_requests: self.rpc.pending_count(),
            data_store_identifier: self.data_store_identifier,
        }
    }
}

struct PendingCreation {
    owner: PluginChildWebviewOwner,
    deadline: u64,
    entry: Option<(String, u64)>,
}

struct RegistryState<H> {
    next_attempt: u64,
    instances: BTreeMap<PluginChildWebviewAttempt, CurrentEntry<H>>,
    surfaces: BTreeMap<String, PluginChildWebviewAttempt>,
    reserved_surfaces: BTreeMap<String, PluginChildWebviewAttempt>,
    used_sources: BTreeSet<String>,
    next_transfer: u64,
    recovery_transfers: BTreeMap<PluginChildWebviewAttempt, PluginChildWebviewOwnershipTransfer>,
    pending_creations: BTreeMap<PluginChildWebviewAttempt, PendingCreation>,
    pending_main_focus: Option<(
        PluginChildWebviewAttempt,
        PluginChildWebviewOwner,
        NativeExecutionGuard,
    )>,
    shutting_down: bool,
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
            instances: BTreeMap::new(),
            surfaces: BTreeMap::new(),
            reserved_surfaces: BTreeMap::new(),
            used_sources: BTreeSet::new(),
            next_transfer: 0,
            recovery_transfers: BTreeMap::new(),
            pending_creations: BTreeMap::new(),
            pending_main_focus: None,
            shutting_down: false,
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

/// A native-issued, bounded attempt reservation. It grants no resource access.
pub(crate) struct PluginChildWebviewCreationReservation<'a, H: PluginChildWebviewNativeHandle> {
    registry: &'a PluginChildWebviewRegistry<H>,
    pub(crate) attempt: PluginChildWebviewAttempt,
    owner: PluginChildWebviewOwner,
}

impl<H: PluginChildWebviewNativeHandle> Drop for PluginChildWebviewCreationReservation<'_, H> {
    fn drop(&mut self) {
        self.registry.release_creation_reservation(self.attempt);
    }
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
        self.reserve_owned(
            identity,
            PluginChildWebviewOwner::main(),
            Some(source_label.into()),
        )
    }

    pub(crate) fn reserve_current_with_derived_label(
        &self,
        identity: PluginChildWebviewIdentity,
    ) -> Option<PluginChildWebviewAttempt> {
        self.reserve_owned_with_derived_label(identity, PluginChildWebviewOwner::main())
    }

    pub(crate) fn reserve_owned_with_derived_label(
        &self,
        identity: PluginChildWebviewIdentity,
        owner: PluginChildWebviewOwner,
    ) -> Option<PluginChildWebviewAttempt> {
        self.reserve_owned(identity, owner, None)
    }

    fn reserve_owned(
        &self,
        identity: PluginChildWebviewIdentity,
        owner: PluginChildWebviewOwner,
        source_label: Option<String>,
    ) -> Option<PluginChildWebviewAttempt> {
        if !owner.is_valid() || owner.revision != 1 {
            return None;
        }
        let mut state = self.lock_state();
        if state.shutting_down
            || state.surfaces.contains_key(&owner.window_label)
            || state.reserved_surfaces.contains_key(&owner.window_label)
        {
            return None;
        }
        let sequence = state.next_attempt.checked_add(1)?;
        let source_label = source_label.unwrap_or_else(|| format!("plugin-child-{sequence:016x}"));
        if !valid_source_label(&source_label) || state.used_sources.contains(&source_label) {
            return None;
        }
        state.next_attempt = sequence;
        let attempt = PluginChildWebviewAttempt(sequence);
        let data_store_identifier = derive_data_store_identifier(attempt, &identity);
        let freshness = derive_bridge_freshness(attempt, &identity, &source_label);
        state.used_sources.insert(source_label.clone());
        state.surfaces.insert(owner.window_label.clone(), attempt);
        state.instances.insert(
            attempt,
            CurrentEntry {
                owner,
                transfer: None,
                teardown_running: false,
                attempt,
                identity,
                source_label,
                state: PluginChildWebviewState::Creating,
                bounds: None,
                handle: None,
                presentation_revision: 0,
                visibility_intent_revision: 0,
                presentation_epoch: Arc::new(PresentationEpoch::default()),
                freshness,
                bridge_ready: false,
                session: PluginChildWebviewSessionMachine::new(),
                rpc: PluginChildWebviewRpcSession::default(),
                data_store_identifier,
                resource_authority_active: false,
                load_started_at_ms: None,
            },
        );
        Some(attempt)
    }

    pub(crate) fn surface_has_pending(&self, window_label: &str) -> bool {
        let state = self.lock_state();
        state.reserved_surfaces.contains_key(window_label)
            || state
                .pending_creations
                .values()
                .any(|pending| pending.owner.window_label == window_label)
    }

    pub(crate) fn surface_available_for_creation(&self, window_label: &str) -> bool {
        let state = self.lock_state();
        !state.shutting_down
            && !state.surfaces.contains_key(window_label)
            && !state.reserved_surfaces.contains_key(window_label)
            && !state.recovery_transfers.values().any(|transfer| {
                transfer.source.window_label == window_label
                    || transfer.target.window_label == window_label
            })
    }

    pub(crate) fn reserve_creation(
        &self,
        owner: PluginChildWebviewOwner,
    ) -> Option<PluginChildWebviewCreationReservation<'_, H>> {
        self.reserve_creation_at(owner, monotonic_now_ms())
    }

    pub(crate) fn reserve_creation_for_entry(
        &self,
        owner: PluginChildWebviewOwner,
        entry_id: &str,
        generation: u64,
    ) -> Option<PluginChildWebviewCreationReservation<'_, H>> {
        if entry_id.is_empty() || entry_id.len() > MAX_IDENTITY_TEXT || generation == 0 {
            return None;
        }
        self.reserve_creation_for_entry_at(
            owner,
            monotonic_now_ms(),
            Some((entry_id.into(), generation)),
        )
    }

    fn reserve_creation_at(
        &self,
        owner: PluginChildWebviewOwner,
        now_ms: u64,
    ) -> Option<PluginChildWebviewCreationReservation<'_, H>> {
        self.reserve_creation_for_entry_at(owner, now_ms, None)
    }

    fn reserve_creation_for_entry_at(
        &self,
        owner: PluginChildWebviewOwner,
        now_ms: u64,
        entry: Option<(String, u64)>,
    ) -> Option<PluginChildWebviewCreationReservation<'_, H>> {
        if !owner.is_valid() || owner.revision != 1 {
            return None;
        }
        let mut state = self.lock_state();
        let expired = state
            .pending_creations
            .iter()
            .filter(|(_, pending)| now_ms >= pending.deadline)
            .map(|(attempt, _)| *attempt)
            .collect::<Vec<_>>();
        for attempt in expired {
            state.pending_creations.remove(&attempt);
            state
                .reserved_surfaces
                .retain(|_, current| *current != attempt);
        }
        if state.shutting_down
            || state.pending_creations.len() >= 32
            || state.surfaces.contains_key(&owner.window_label)
            || state.reserved_surfaces.contains_key(&owner.window_label)
        {
            return None;
        }
        state.next_attempt = state.next_attempt.checked_add(1)?;
        let attempt = PluginChildWebviewAttempt(state.next_attempt);
        state
            .reserved_surfaces
            .insert(owner.window_label.clone(), attempt);
        state.pending_creations.insert(
            attempt,
            PendingCreation {
                owner: owner.clone(),
                deadline: now_ms.saturating_add(PLUGIN_CHILD_WEBVIEW_LOAD_DEADLINE_MS),
                entry,
            },
        );
        Some(PluginChildWebviewCreationReservation {
            registry: self,
            attempt,
            owner,
        })
    }

    fn release_creation_reservation(&self, attempt: PluginChildWebviewAttempt) {
        let mut state = self.lock_state();
        if state.pending_creations.remove(&attempt).is_some() {
            state
                .reserved_surfaces
                .retain(|_, current| *current != attempt);
        }
    }

    pub(crate) fn bind_creation_reservation(
        &self,
        reservation: &PluginChildWebviewCreationReservation<'_, H>,
        identity: PluginChildWebviewIdentity,
    ) -> Option<PluginChildWebviewAttempt> {
        if !std::ptr::eq(self, reservation.registry) {
            return None;
        }
        let mut state = self.lock_state();
        let attempt = reservation.attempt;
        let owner = reservation.owner.clone();
        if state.shutting_down
            || !state
                .pending_creations
                .get(&attempt)
                .is_some_and(|pending| {
                    pending.owner == owner && monotonic_now_ms() < pending.deadline
                })
            || state.reserved_surfaces.get(&owner.window_label) != Some(&attempt)
            || state.surfaces.contains_key(&owner.window_label)
        {
            return None;
        }
        let source_label = format!("plugin-child-{:016x}", attempt.0);
        if state.used_sources.contains(&source_label) {
            return None;
        }
        let data_store_identifier = derive_data_store_identifier(attempt, &identity);
        let freshness = derive_bridge_freshness(attempt, &identity, &source_label);
        state.pending_creations.remove(&attempt);
        state.reserved_surfaces.remove(&owner.window_label);
        state.used_sources.insert(source_label.clone());
        state.surfaces.insert(owner.window_label.clone(), attempt);
        state.instances.insert(
            attempt,
            CurrentEntry {
                owner,
                transfer: None,
                teardown_running: false,
                attempt,
                identity,
                source_label,
                state: PluginChildWebviewState::Creating,
                bounds: None,
                handle: None,
                presentation_revision: 0,
                visibility_intent_revision: 0,
                presentation_epoch: Arc::new(PresentationEpoch::default()),
                freshness,
                bridge_ready: false,
                session: PluginChildWebviewSessionMachine::new(),
                rpc: PluginChildWebviewRpcSession::default(),
                data_store_identifier,
                resource_authority_active: false,
                load_started_at_ms: None,
            },
        );
        Some(attempt)
    }

    fn main_owner(&self, attempt: PluginChildWebviewAttempt) -> Option<PluginChildWebviewOwner> {
        self.snapshot_for_surface("main")
            .filter(|snapshot| snapshot.attempt == attempt)
            .map(|snapshot| snapshot.owner)
    }

    pub(crate) fn owner_for_attempt(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> Option<PluginChildWebviewOwner> {
        self.snapshot_attempt(attempt)
            .map(|snapshot| snapshot.owner)
    }

    pub(crate) fn matches_owner(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_host_source: &str,
        owner: &PluginChildWebviewOwner,
    ) -> bool {
        owner.matches_host_source(actual_host_source)
            && self.snapshot_owned(attempt, owner).is_some()
    }

    pub(crate) fn begin_ownership_transfer(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_host_source: &str,
        expected_owner: &PluginChildWebviewOwner,
        target_window_label: &str,
    ) -> Option<PluginChildWebviewOwnershipTransfer> {
        if expected_owner.window_label != "main"
            || !expected_owner.matches_host_source(actual_host_source)
        {
            return None;
        }
        let target = PluginChildWebviewOwner::from_parts(
            target_window_label,
            expected_owner.revision.checked_add(1)?,
        )?;
        if target.window_label == "main" {
            return None;
        }
        let mut state = self.lock_state();
        if state.shutting_down
            || state
                .recovery_transfers
                .values()
                .any(|recovery| recovery.source.window_label == expected_owner.window_label)
            || state.surfaces.contains_key(target_window_label)
            || state.reserved_surfaces.contains_key(target_window_label)
        {
            return None;
        }
        let current = state.instances.get(&attempt)?;
        if !current.matches_owner(expected_owner)
            || current.teardown_running
            || current.session.state != PluginChildWebviewSessionState::SdkReady
        {
            return None;
        }
        let next = state.next_transfer.checked_add(1)?;
        let transfer = PluginChildWebviewOwnershipTransfer {
            attempt,
            source_label: current.source_label.clone(),
            token: PluginChildWebviewMigrationToken::new(next)?,
            source: expected_owner.clone(),
            target,
            publication_receipt: TransferPublicationReceipt::default(),
        };
        state.next_transfer = next;
        state
            .reserved_surfaces
            .insert(target_window_label.into(), attempt);
        let current = state.instances.get_mut(&attempt)?;
        current.presentation_epoch.revoke();
        current.transfer = Some(transfer.clone());
        drop(state);
        self.readiness_changed.notify_all();
        Some(transfer)
    }

    pub(crate) fn retain_recovery_required(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
    ) -> bool {
        let mut state = self.lock_state();
        if state
            .recovery_transfers
            .get(&transfer.attempt)
            .is_some_and(|existing| existing != transfer)
        {
            return false;
        }
        state
            .recovery_transfers
            .insert(transfer.attempt, transfer.clone());
        true
    }

    pub(crate) fn release_recovery_required(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
    ) -> bool {
        let mut state = self.lock_state();
        if state.recovery_transfers.get(&transfer.attempt) != Some(transfer) {
            return false;
        }
        state.recovery_transfers.remove(&transfer.attempt);
        drop(state);
        self.readiness_changed.notify_all();
        true
    }

    pub(crate) fn is_shutting_down(&self) -> bool {
        self.lock_state().shutting_down
    }

    pub(crate) fn main_hide_blocked(&self) -> bool {
        let state = self.lock_state();
        !state.recovery_transfers.is_empty()
            || state.instances.values().any(|instance| {
                instance
                    .transfer
                    .as_ref()
                    .is_some_and(|transfer| transfer.source.window_label == "main")
            })
    }

    pub(crate) fn ownership_transfer_is_current(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
    ) -> bool {
        let state = self.lock_state();
        !state.shutting_down
            && state.reserved_surfaces.get(&transfer.target.window_label) == Some(&transfer.attempt)
            && state
                .instances
                .get(&transfer.attempt)
                .is_some_and(|current| {
                    current.transfer.as_ref() == Some(transfer)
                        && current.owner == transfer.source
                        && current.source_label == transfer.source_label
                        && !current.teardown_running
                        && current.session.state == PluginChildWebviewSessionState::SdkReady
                })
    }

    pub(crate) fn ownership_transfer_guard(
        self: &Arc<Self>,
        transfer: &PluginChildWebviewOwnershipTransfer,
    ) -> NativeExecutionGuard {
        let registry = Arc::downgrade(self);
        let transfer = transfer.clone();
        NativeExecutionGuard::new(move || {
            registry
                .upgrade()
                .is_some_and(|registry| registry.ownership_transfer_is_current(&transfer))
        })
    }

    pub(crate) fn retained_native_handle(
        &self,
        attempt: PluginChildWebviewAttempt,
        source_label: &str,
    ) -> Option<Arc<H>> {
        self.lock_state()
            .instances
            .get(&attempt)
            .filter(|entry| entry.source_label == source_label)
            .and_then(|entry| entry.handle.clone())
    }

    pub(crate) fn handle_for_transfer(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
    ) -> Option<Arc<H>> {
        let state = self.lock_state();
        state
            .instances
            .get(&transfer.attempt)
            .filter(|current| {
                current.transfer.as_ref() == Some(transfer)
                    && current.owner == transfer.source
                    && current.source_label == transfer.source_label
                    && !current.teardown_running
                    && current.session.state == PluginChildWebviewSessionState::SdkReady
            })
            .and_then(|current| current.handle.clone())
    }

    pub(crate) fn wait_for_stable_owner(
        &self,
        attempt: PluginChildWebviewAttempt,
        timeout: Duration,
    ) -> Option<PluginChildWebviewOwner> {
        let deadline = Instant::now() + timeout.min(Duration::from_millis(10_000));
        let mut state = self.lock_state();
        loop {
            let current = state.instances.get(&attempt)?;
            if state.shutting_down
                || current.teardown_running
                || matches!(
                    current.session.state,
                    PluginChildWebviewSessionState::Disconnected
                        | PluginChildWebviewSessionState::Disposed
                )
            {
                return None;
            }
            if current.transfer.is_none() && !state.recovery_transfers.contains_key(&attempt) {
                return Some(current.owner.clone());
            }
            let remaining = deadline.checked_duration_since(Instant::now())?;
            let (next, result) = self
                .readiness_changed
                .wait_timeout(state, remaining)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state = next;
            if result.timed_out() {
                return None;
            }
        }
    }

    pub(crate) fn commit_ownership_transfer_presentation(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        bounds: PluginChildWebviewBounds,
    ) -> bool {
        if bounds.x < 0 || bounds.y < 0 || bounds.width == 0 || bounds.height == 0 {
            return false;
        }
        self.finish_ownership_transfer(transfer, Some(bounds), None)
    }

    pub(crate) fn commit_ownership_transfer(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
    ) -> bool {
        self.finish_ownership_transfer(transfer, None, None)
    }

    pub(crate) fn commit_ownership_transfer_presentation_if(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        bounds: PluginChildWebviewBounds,
        guard: &NativeExecutionGuard,
    ) -> bool {
        if bounds.x < 0 || bounds.y < 0 || bounds.width == 0 || bounds.height == 0 {
            return false;
        }
        self.finish_ownership_transfer(transfer, Some(bounds), Some(guard))
    }

    fn finish_ownership_transfer(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        bounds: Option<PluginChildWebviewBounds>,
        execution: Option<&NativeExecutionGuard>,
    ) -> bool {
        let mut state = self.lock_state();
        if state.shutting_down
            || state.reserved_surfaces.get(&transfer.target.window_label) != Some(&transfer.attempt)
        {
            return false;
        }
        let Some(current) = state
            .instances
            .get_mut(&transfer.attempt)
            .filter(|current| {
                current.transfer.as_ref() == Some(transfer)
                    && current.owner == transfer.source
                    && current.source_label == transfer.source_label
                    && !current.teardown_running
                    && current.session.state == PluginChildWebviewSessionState::SdkReady
            })
        else {
            return false;
        };
        if execution.is_some_and(|guard| !guard.is_unexpired()) {
            return false;
        }
        current.owner = transfer.target.clone();
        if let Some(bounds) = bounds {
            current.bounds = Some(bounds);
            current.state = PluginChildWebviewState::Visible;
        }
        current.transfer = None;
        current.presentation_epoch = Arc::new(PresentationEpoch::default());
        current.presentation_revision = 0;
        current.visibility_intent_revision = current.visibility_intent_revision.saturating_add(1);
        let _ = current
            .presentation_epoch
            .visibility_guard(current.visibility_intent_revision);
        state.surfaces.remove(&transfer.source.window_label);
        state
            .reserved_surfaces
            .remove(&transfer.target.window_label);
        state
            .surfaces
            .insert(transfer.target.window_label.clone(), transfer.attempt);
        transfer
            .publication_receipt
            .publish(TransferPublication::Committed);
        drop(state);
        self.readiness_changed.notify_all();
        true
    }

    pub(crate) fn cancel_ownership_transfer(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
    ) -> bool {
        self.finish_ownership_cancellation(transfer, None)
    }

    pub(crate) fn cancel_ownership_transfer_if(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        guard: &NativeExecutionGuard,
    ) -> bool {
        self.finish_ownership_cancellation(transfer, Some(guard))
    }

    fn finish_ownership_cancellation(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        execution: Option<&NativeExecutionGuard>,
    ) -> bool {
        let mut state = self.lock_state();
        let Some(current) = state
            .instances
            .get_mut(&transfer.attempt)
            .filter(|current| {
                current.transfer.as_ref() == Some(transfer)
                    && current.owner == transfer.source
                    && !current.teardown_running
                    && current.session.state == PluginChildWebviewSessionState::SdkReady
            })
        else {
            return false;
        };
        if execution.is_some_and(|guard| !guard.is_unexpired()) {
            return false;
        }
        // Even a rollback retires every captured source-owner completion.
        current.owner.revision = transfer.target.revision;
        current.transfer = None;
        current.presentation_epoch = Arc::new(PresentationEpoch::default());
        current.presentation_revision = 0;
        current.visibility_intent_revision = current.visibility_intent_revision.saturating_add(1);
        let _ = current
            .presentation_epoch
            .visibility_guard(current.visibility_intent_revision);
        state
            .reserved_surfaces
            .remove(&transfer.target.window_label);
        transfer
            .publication_receipt
            .publish(TransferPublication::Cancelled);
        drop(state);
        self.readiness_changed.notify_all();
        true
    }

    pub(crate) fn prepare_current_creation(&self, attempt: PluginChildWebviewAttempt) -> bool {
        let mut state = self.lock_state();
        let Some(current) = state.instances.get_mut(&attempt).filter(|current| {
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
            .instances
            .get_mut(&attempt)
            .filter(|current| current.attempt == attempt && current.handle.is_none());
        if let Some(current) = attach {
            let source_label = handle.source_label();
            if source_label != current.source_label {
                drop(state);
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
                        drop(state);
                        let _ = handle.destroy();
                        return false;
                    }
                }
                if !current.session.begin_loading(now_ms) {
                    if let Some(resource_authority) = resource_authority {
                        resource_authority.revoke(&current.attempt.opaque_id());
                    }
                    drop(state);
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
                drop(state);
                let _ = handle.destroy();
                return false;
            }
            current.handle = Some(Arc::new(handle));
            true
        } else {
            drop(state);
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
            .instances
            .get_mut(&attempt)
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
        let Some(owner) = self.main_owner(attempt) else {
            return PluginChildWebviewSlotUpdateResult::StaleAttempt;
        };
        self.apply_owned_slot_update(attempt, &owner, presentation_revision, bounds)
    }

    pub(crate) fn apply_owned_slot_update(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
        presentation_revision: u64,
        bounds: PluginChildWebviewBounds,
    ) -> PluginChildWebviewSlotUpdateResult {
        let (handle, guard) = {
            let mut state = self.lock_state();
            let Some(current) = state
                .instances
                .get_mut(&attempt)
                .filter(|current| current.matches_owner(owner))
            else {
                return PluginChildWebviewSlotUpdateResult::StaleAttempt;
            };
            if presentation_revision
                <= current
                    .presentation_revision
                    .max(current.presentation_epoch.slot_revision())
            {
                return PluginChildWebviewSlotUpdateResult::StaleRevision;
            }
            let guard = current.presentation_epoch.slot_guard(presentation_revision);
            if current.handle.is_none() {
                current.presentation_revision = presentation_revision;
                current.bounds = Some(bounds);
                return PluginChildWebviewSlotUpdateResult::Applied;
            }
            (Arc::clone(current.handle.as_ref().unwrap()), guard)
        };
        let outcome = handle.present_owned(
            &owner.window_label,
            &guard,
            NativePresentationOperation::Bounds {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
            },
        );
        let mut state = self.lock_state();
        let Some(current) = state
            .instances
            .get_mut(&attempt)
            .filter(|current| current.matches_owner(owner))
        else {
            return PluginChildWebviewSlotUpdateResult::StaleAttempt;
        };
        if !guard.is_current() || outcome == NativePresentationOutcome::Stale {
            return PluginChildWebviewSlotUpdateResult::StaleAttempt;
        }
        if outcome != NativePresentationOutcome::Applied {
            return PluginChildWebviewSlotUpdateResult::NativeUpdateFailed;
        }
        current.presentation_revision = presentation_revision;
        current.bounds = Some(bounds);
        PluginChildWebviewSlotUpdateResult::Applied
    }

    pub(crate) fn show_current(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> PluginChildWebviewPresentationResult {
        let Some(owner) = self.main_owner(attempt) else {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        };
        self.show_owned(attempt, &owner)
    }

    pub(crate) fn show_owned(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
    ) -> PluginChildWebviewPresentationResult {
        let (handle, guard) = {
            let mut state = self.lock_state();
            let Some(current) = state
                .instances
                .get_mut(&attempt)
                .filter(|current| current.matches_owner(owner))
            else {
                return PluginChildWebviewPresentationResult::StaleAttempt;
            };
            if !matches!(
                current.session.state,
                PluginChildWebviewSessionState::BridgeReady
                    | PluginChildWebviewSessionState::SdkReady
            ) {
                return PluginChildWebviewPresentationResult::NotReady;
            }
            let Some(handle) = &current.handle else {
                return PluginChildWebviewPresentationResult::NativeUnavailable;
            };
            let Some(revision) = current.visibility_intent_revision.checked_add(1) else {
                return PluginChildWebviewPresentationResult::NativeFailed;
            };
            current.visibility_intent_revision = revision;
            (
                Arc::clone(handle),
                current.presentation_epoch.visibility_guard(revision),
            )
        };
        // The adapter confirms clipping and reveal inside one guarded native
        // callback. No registry mutex survives native dispatch, wait or callback.
        let outcome = handle.present_owned(
            &owner.window_label,
            &guard,
            NativePresentationOperation::Show,
        );
        let mut state = self.lock_state();
        let Some(current) = state
            .instances
            .get_mut(&attempt)
            .filter(|current| current.matches_owner(owner))
        else {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        };
        if !matches!(
            current.session.state,
            PluginChildWebviewSessionState::BridgeReady | PluginChildWebviewSessionState::SdkReady
        ) {
            return PluginChildWebviewPresentationResult::NotReady;
        }
        if !guard.is_current() || outcome == NativePresentationOutcome::Stale {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        }
        match outcome {
            NativePresentationOutcome::Applied => {
                current.state = PluginChildWebviewState::Visible;
                PluginChildWebviewPresentationResult::Applied
            }
            NativePresentationOutcome::FailedHidden => {
                current.state = PluginChildWebviewState::Hidden;
                PluginChildWebviewPresentationResult::NativeFailed
            }
            _ => PluginChildWebviewPresentationResult::NativeFailed,
        }
    }

    pub(crate) fn hide_current(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> PluginChildWebviewPresentationResult {
        let Some(owner) = self.main_owner(attempt) else {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        };
        self.hide_owned(attempt, &owner)
    }

    pub(crate) fn hide_owned(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
    ) -> PluginChildWebviewPresentationResult {
        let (handle, guard) = {
            let mut state = self.lock_state();
            let Some(current) = state
                .instances
                .get_mut(&attempt)
                .filter(|current| current.matches_owner(owner))
            else {
                return PluginChildWebviewPresentationResult::StaleAttempt;
            };
            let Some(handle) = &current.handle else {
                return PluginChildWebviewPresentationResult::NativeUnavailable;
            };
            let Some(revision) = current.visibility_intent_revision.checked_add(1) else {
                return PluginChildWebviewPresentationResult::NativeFailed;
            };
            current.visibility_intent_revision = revision;
            (
                Arc::clone(handle),
                current.presentation_epoch.visibility_guard(revision),
            )
        };
        let outcome = handle.present_owned(
            &owner.window_label,
            &guard,
            NativePresentationOperation::Hide,
        );
        let mut state = self.lock_state();
        let Some(current) = state
            .instances
            .get_mut(&attempt)
            .filter(|current| current.matches_owner(owner))
        else {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        };
        if !guard.is_current() || outcome == NativePresentationOutcome::Stale {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        }
        if outcome != NativePresentationOutcome::Applied {
            return PluginChildWebviewPresentationResult::NativeFailed;
        }
        current.state = PluginChildWebviewState::Hidden;
        PluginChildWebviewPresentationResult::Applied
    }

    pub(crate) fn focus_current(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> PluginChildWebviewPresentationResult {
        let Some(owner) = self.main_owner(attempt) else {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        };
        self.focus_owned(attempt, &owner)
    }

    pub(crate) fn focus_owned(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
    ) -> PluginChildWebviewPresentationResult {
        self.focus_owned_with_permit(attempt, owner, None)
    }

    pub(crate) fn retry_pending_main_focus(&self) {
        let pending = self.lock_state().pending_main_focus.take();
        if let Some((attempt, owner, guard)) = pending {
            if guard.is_current() {
                self.focus_owned_with_permit(attempt, &owner, Some(guard));
            }
        }
    }

    fn focus_owned_with_permit(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
        previous: Option<NativeExecutionGuard>,
    ) -> PluginChildWebviewPresentationResult {
        let is_retry = previous.is_some();
        let (handle, guard) = {
            let state = self.lock_state();
            let Some(current) = state
                .instances
                .get(&attempt)
                .filter(|current| current.matches_owner(owner))
            else {
                return PluginChildWebviewPresentationResult::StaleAttempt;
            };
            if current.state != PluginChildWebviewState::Visible {
                return PluginChildWebviewPresentationResult::NotVisible;
            }
            let Some(handle) = &current.handle else {
                return PluginChildWebviewPresentationResult::NativeUnavailable;
            };
            (
                Arc::clone(handle),
                previous.unwrap_or_else(|| {
                    current
                        .presentation_epoch
                        .focus_guard(current.visibility_intent_revision)
                }),
            )
        };
        let outcome = handle.present_owned(
            &owner.window_label,
            &guard,
            NativePresentationOperation::Focus,
        );
        let mut state = self.lock_state();
        if !guard.is_current()
            || !state
                .instances
                .get(&attempt)
                .is_some_and(|entry| entry.matches_owner(owner))
            || outcome == NativePresentationOutcome::Stale
        {
            return PluginChildWebviewPresentationResult::StaleAttempt;
        }
        if owner.window_label == "main" {
            state.pending_main_focus = None;
        }
        match outcome {
            NativePresentationOutcome::Applied => PluginChildWebviewPresentationResult::Applied,
            NativePresentationOutcome::FocusUnavailable { awaiting_key }
                if owner.window_label == "main" =>
            {
                if awaiting_key && !is_retry {
                    // One notification may finish this exact visibility intent.
                    // Hide, replacement and transfer invalidate its old epoch.
                    state.pending_main_focus = Some((
                        attempt,
                        owner.clone(),
                        guard.with_deadline(std::time::Duration::from_secs(2)),
                    ));
                }
                PluginChildWebviewPresentationResult::FocusUnavailable
            }
            _ => PluginChildWebviewPresentationResult::NativeFailed,
        }
    }

    pub(crate) fn compare_current_teardown(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> Result<bool, ()> {
        self.teardown(attempt, None, false)
            .map(|owner| owner.is_some())
    }

    pub(crate) fn compare_owned_teardown(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
    ) -> Result<bool, ()> {
        self.teardown(attempt, Some(owner), false)
            .map(|owner| owner.is_some())
    }

    pub(crate) fn teardown_with_owner(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> Result<Option<PluginChildWebviewOwner>, ()> {
        self.teardown(attempt, None, false)
    }

    pub(crate) fn teardown_owned_instance(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
    ) -> Result<Option<PluginChildWebviewOwner>, ()> {
        self.teardown(attempt, Some(owner), true)
    }

    fn teardown(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: Option<&PluginChildWebviewOwner>,
        captured_terminal_owner: bool,
    ) -> Result<Option<PluginChildWebviewOwner>, ()> {
        let (effects, context, handle, claimed_owner) = {
            let mut state = self.lock_state();
            let Some(current) = state.instances.get_mut(&attempt) else {
                return Ok(None);
            };
            if current.teardown_running
                || owner.is_some_and(|owner| {
                    if captured_terminal_owner {
                        current.owner != *owner
                    } else {
                        !current.matches_owner(owner)
                    }
                })
            {
                return Ok(None);
            }
            current.teardown_running = true;
            current.presentation_epoch.revoke();
            current.session.dispose();
            (
                current.rpc.terminate(true),
                RpcEffectContext::from_current(current),
                current.handle.clone(),
                current.owner.clone(),
            )
        };
        self.apply_rpc_effects(context, effects);
        self.revoke_current_resource_authority(attempt);
        // Native completion must never wait while holding the registry mutex.
        let result = handle.as_ref().map_or(Ok(()), |handle| handle.destroy());
        let mut state = self.lock_state();
        if result.is_err() {
            if let Some(current) = state.instances.get_mut(&attempt) {
                current.teardown_running = false;
            }
            return Err(());
        }
        let removed = state.instances.remove(&attempt).is_some();
        state.surfaces.retain(|_, bound| *bound != attempt);
        state.reserved_surfaces.retain(|_, bound| *bound != attempt);
        drop(state);
        self.readiness_changed.notify_all();
        Ok(removed.then_some(claimed_owner))
    }

    pub(crate) fn teardown_surface(&self, window_label: &str) -> Result<(), ()> {
        let (attempts, pending) = {
            let mut state = self.lock_state();
            let attempts = state
                .instances
                .values()
                .filter(|entry| entry.owner.window_label == window_label)
                .map(|entry| entry.attempt)
                .collect::<Vec<_>>();
            let pending = state
                .pending_creations
                .iter()
                .filter(|(_, pending)| pending.owner.window_label == window_label)
                .map(|(attempt, _)| *attempt)
                .collect::<Vec<_>>();
            for attempt in &pending {
                state.pending_creations.remove(attempt);
                state.reserved_surfaces.retain(|_, bound| bound != attempt);
            }
            (attempts, pending)
        };
        if let Some(authority) = self.resource_authority() {
            for attempt in pending {
                authority.revoke(&attempt.opaque_id());
            }
        }
        // A transfer reservation is not ownership. Losing its hidden target must
        // leave the source instance available for ordinary same-instance rollback.
        self.teardown_attempts(attempts)
    }

    pub(crate) fn teardown_entry_instances(
        &self,
        entry_id: &str,
        retained_generation: Option<u64>,
    ) -> Result<(), ()> {
        let (attempts, pending) = {
            let mut state = self.lock_state();
            let affected = |entry: &str, generation: u64| {
                entry == entry_id
                    && retained_generation.is_none_or(|retained| generation < retained)
            };
            let attempts = state
                .instances
                .values()
                .filter(|current| {
                    affected(
                        &current.identity.registration_entry_id,
                        current.identity.resource_generation,
                    )
                })
                .map(|current| current.attempt)
                .collect::<Vec<_>>();
            let pending = state
                .pending_creations
                .iter()
                .filter(|(_, pending)| {
                    pending
                        .entry
                        .as_ref()
                        .is_some_and(|(entry, generation)| affected(entry, *generation))
                })
                .map(|(attempt, _)| *attempt)
                .collect::<Vec<_>>();
            for attempt in &pending {
                state.pending_creations.remove(attempt);
                state
                    .reserved_surfaces
                    .retain(|_, current| current != attempt);
            }
            (attempts, pending)
        };
        if let Some(authority) = self.resource_authority() {
            for attempt in pending {
                authority.revoke(&attempt.opaque_id());
            }
        }
        self.teardown_attempts(attempts)
    }

    pub(crate) fn prepare_host_reload(&self) -> Vec<PluginChildWebviewAttempt> {
        let (attempts, pending) = {
            let mut state = self.lock_state();
            let pending = state.pending_creations.keys().copied().collect::<Vec<_>>();
            state.pending_creations.clear();
            state.reserved_surfaces.clear();
            (state.instances.keys().copied().collect::<Vec<_>>(), pending)
        };
        if let Some(authority) = self.resource_authority() {
            for attempt in pending {
                authority.revoke(&attempt.opaque_id());
            }
        }
        for attempt in &attempts {
            self.disconnect_current(
                *attempt,
                PluginChildWebviewSessionErrorCode::RuntimeUnavailable,
            );
        }
        attempts
    }

    pub(crate) fn teardown_instances(&self) -> Result<(), ()> {
        self.teardown_attempts(self.prepare_host_reload())
    }

    fn teardown_attempts(&self, attempts: Vec<PluginChildWebviewAttempt>) -> Result<(), ()> {
        for attempt in &attempts {
            self.disconnect_current(
                *attempt,
                PluginChildWebviewSessionErrorCode::RuntimeUnavailable,
            );
        }
        let mut result = Ok(());
        for attempt in attempts {
            if self.compare_current_teardown(attempt).is_err() {
                result = Err(());
            }
        }
        result
    }

    pub(crate) fn teardown_all(&self) -> Result<(), ()> {
        self.teardown_attempts(self.prepare_shutdown())
    }

    pub(crate) fn prepare_shutdown(&self) -> Vec<PluginChildWebviewAttempt> {
        self.lock_state().shutting_down = true;
        self.prepare_host_reload()
    }

    // Legacy Launcher callers always mean the main surface, never the last instance.
    pub(crate) fn snapshot(&self) -> Option<PluginChildWebviewSnapshot> {
        self.snapshot_for_surface("main")
    }

    pub(crate) fn snapshot_for_surface(&self, label: &str) -> Option<PluginChildWebviewSnapshot> {
        let state = self.lock_state();
        state
            .surfaces
            .get(label)
            .and_then(|attempt| state.instances.get(attempt))
            .map(CurrentEntry::snapshot)
    }

    pub(crate) fn snapshot_attempt(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> Option<PluginChildWebviewSnapshot> {
        self.lock_state()
            .instances
            .get(&attempt)
            .map(CurrentEntry::snapshot)
    }

    pub(crate) fn snapshot_owned(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
    ) -> Option<PluginChildWebviewSnapshot> {
        self.lock_state()
            .instances
            .get(&attempt)
            .filter(|entry| entry.matches_owner(owner))
            .map(CurrentEntry::snapshot)
    }

    pub(crate) fn snapshots(&self) -> Vec<PluginChildWebviewSnapshot> {
        self.lock_state()
            .instances
            .values()
            .map(CurrentEntry::snapshot)
            .collect()
    }

    pub(crate) fn matches_presentation_identity(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
        plugin_id: &str,
        page_id: &str,
        entry_url: &str,
        generation: &str,
    ) -> bool {
        self.lock_state()
            .instances
            .get(&attempt)
            .is_some_and(|current| {
                current.matches_owner(owner)
                    && current.identity.plugin_id == plugin_id
                    && current.identity.page_id == page_id
                    && current.identity.entry_url.as_str() == entry_url
                    && current.identity.resource_generation.to_string() == generation
            })
    }

    pub(crate) fn creation_facts(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> Option<PluginChildWebviewCreationFacts> {
        self.lock_state()
            .instances
            .get(&attempt)
            .filter(|current| current.attempt == attempt)
            .map(|current| PluginChildWebviewCreationFacts {
                attempt,
                owner: current.owner.clone(),
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
        let Some(current) = state.instances.get_mut(&attempt).filter(|current| {
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
            .instances
            .get_mut(&attempt)
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
            let Some(current) = state.instances.get_mut(&attempt).filter(|current| {
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

    pub(crate) fn is_rpc_dispatch_pending(
        &self,
        attempt: PluginChildWebviewAttempt,
        source_label: &str,
        request_id: &str,
        method: &str,
    ) -> bool {
        self.lock_state()
            .instances
            .get(&attempt)
            .is_some_and(|current| {
                current.attempt == attempt
                    && current.source_label == source_label
                    && current.bridge_ready
                    && current.rpc.has_pending_request(request_id, method)
            })
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
            let Some(current) = state.instances.get_mut(&attempt).filter(|current| {
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

    pub(crate) fn settle_close_confirmed(
        &self,
        attempt: PluginChildWebviewAttempt,
        source: &str,
        request_id: &str,
        output: Value,
    ) -> PluginChildWebviewRpcIngressResult {
        if !self.is_current_source(&attempt.opaque_id(), source) {
            return PluginChildWebviewRpcIngressResult::SessionUnavailable;
        }
        self.expire_rpc_deadlines(attempt, monotonic_now_ms());
        let (handle, delivery) = {
            let mut state = self.lock_state();
            let Some(current) = state
                .instances
                .get_mut(&attempt)
                .filter(|entry| entry.source_label == source && !entry.teardown_running)
            else {
                return PluginChildWebviewRpcIngressResult::SessionUnavailable;
            };
            let Some(handle) = current.handle.as_ref().cloned() else {
                return PluginChildWebviewRpcIngressResult::SessionUnavailable;
            };
            let Some(delivery) =
                current
                    .rpc
                    .begin_confirmed_close(request_id, output, monotonic_now_ms())
            else {
                return PluginChildWebviewRpcIngressResult::Ignored;
            };
            (handle, delivery)
        };
        let guard = delivery.guard.with_deadline(Duration::from_millis(
            delivery.deadline_at_ms.saturating_sub(monotonic_now_ms()),
        ));
        // A receiver can immediately send another RPC while acknowledging the
        // response. Never hold the registry lock or block the native main thread.
        let delivered = handle
            .deliver_bridge_frame_confirmed(&delivery.frame, guard.clone())
            .is_ok();
        let accepted = {
            let mut state = self.lock_state();
            state
                .instances
                .get_mut(&attempt)
                .filter(|entry| entry.source_label == source && !entry.teardown_running)
                .is_some_and(|entry| {
                    entry.rpc.finish_confirmed_close(
                        request_id,
                        &delivery.active,
                        delivered,
                        monotonic_now_ms(),
                    )
                })
        };
        // A receiver may reject a locally cancelled close before its cancellation
        // frame reaches native ingress. Do not turn that race into Session loss.
        if accepted {
            PluginChildWebviewRpcIngressResult::Responded
        } else {
            PluginChildWebviewRpcIngressResult::Ignored
        }
    }

    pub(crate) fn fail_rpc_dispatch(
        &self,
        attempt: PluginChildWebviewAttempt,
        actual_source_label: &str,
        request_id: &str,
    ) -> PluginChildWebviewRpcIngressResult {
        let (outcome, context) = {
            let mut state = self.lock_state();
            let Some(current) = state.instances.get_mut(&attempt).filter(|current| {
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
            let Some(current) = state.instances.get_mut(&attempt).filter(|current| {
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
                .instances
                .get_mut(&attempt)
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
            .instances
            .get_mut(&attempt)
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
                .instances
                .get_mut(&attempt)
                .filter(|current| current.attempt == attempt)
            else {
                return false;
            };
            let changed = current.session.disconnect(error);
            current.presentation_epoch.revoke();
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
        self.expire_deadline(attempt, now_ms, None)
    }

    pub(crate) fn expire_owned_session_deadline(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
    ) -> Option<PluginChildWebviewSessionErrorCode> {
        self.expire_deadline(attempt, monotonic_now_ms(), Some(owner))
    }

    fn expire_deadline(
        &self,
        attempt: PluginChildWebviewAttempt,
        now_ms: u64,
        owner: Option<&PluginChildWebviewOwner>,
    ) -> Option<PluginChildWebviewSessionErrorCode> {
        let (error, effects, context) = {
            let mut state = self.lock_state();
            let current = state
                .instances
                .get_mut(&attempt)
                .filter(|current| owner.is_none_or(|owner| current.matches_owner(owner)))?;
            let error = current.session.expire(now_ms)?;
            current.presentation_epoch.revoke();
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
        self.wait_readiness(attempt, None)
    }

    pub(crate) fn wait_owned_presentation_readiness(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
    ) -> PluginChildWebviewWaitReadiness {
        self.wait_readiness(attempt, Some(owner))
    }

    fn wait_readiness(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: Option<&PluginChildWebviewOwner>,
    ) -> PluginChildWebviewWaitReadiness {
        loop {
            let state = self.lock_state();
            let Some(current) = state
                .instances
                .get(&attempt)
                .filter(|current| owner.is_none_or(|owner| current.matches_owner(owner)))
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
                        .expire_deadline(attempt, now, owner)
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
                .instances
                .get_mut(&attempt)
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
                        .instances
                        .get(&context.attempt)
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
                    let mut state = self.lock_state();
                    if let Some(current) =
                        state.instances.get_mut(&context.attempt).filter(|current| {
                            current.attempt == context.attempt
                                && current.source_label == context.source_label
                        })
                    {
                        current.presentation_epoch.revoke();
                        current.session.disconnect(
                            PluginChildWebviewSessionErrorCode::RuntimeSessionDisconnected,
                        );
                    }
                    drop(state);
                    if let Some(dispatcher) = &dispatcher {
                        dispatcher.disconnect(context.attempt, &context.plugin_id);
                    }
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
        let Some(attempt) = PluginChildWebviewAttempt::from_opaque_id(attempt_id) else {
            return false;
        };
        let state = self.lock_state();
        let current = state.instances.get(&attempt).filter(|current| {
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
    FocusUnavailable,
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
    use std::sync::mpsc;

    struct PendingConfirmation {
        started: mpsc::Sender<()>,
        release: Mutex<mpsc::Receiver<()>>,
    }

    struct PendingNativeExecution {
        operation: NativePresentationOperation,
        started: mpsc::Sender<()>,
        release: Mutex<mpsc::Receiver<()>>,
    }

    #[derive(Clone, Default)]
    struct FakeHandle {
        clip_checks: Arc<AtomicUsize>,
        fail_clip: Arc<AtomicBool>,
        pending_confirmation: Option<Arc<PendingConfirmation>>,
        pending_destroy: Option<Arc<PendingConfirmation>>,
        pending_confirmed_delivery: Option<Arc<PendingConfirmation>>,
        pending_native_execution: Option<Arc<PendingNativeExecution>>,
        awaiting_key: Arc<AtomicBool>,
        unconfirmed_hides: Arc<AtomicUsize>,
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
        fn present_owned(
            &self,
            _expected_window: &str,
            guard: &crate::plugin_child_webview_execution::NativeExecutionGuard,
            operation: NativePresentationOperation,
        ) -> NativePresentationOutcome {
            if operation == NativePresentationOperation::Focus
                && self.awaiting_key.load(Ordering::Acquire)
                && guard.is_current()
            {
                self.focuses.fetch_add(1, Ordering::SeqCst);
                return NativePresentationOutcome::FocusUnavailable { awaiting_key: true };
            }
            if let Some(pending) = self
                .pending_native_execution
                .as_ref()
                .filter(|pending| pending.operation == operation)
            {
                pending.started.send(()).unwrap();
                pending.release.lock().unwrap().recv().unwrap();
            }
            crate::plugin_child_webview_execution::perform_owned_presentation(
                guard,
                operation,
                |step| {
                    match step {
                crate::plugin_child_webview_execution::NativePresentationStep::ConfirmClip => self.ensure_rounded_corners(),
                crate::plugin_child_webview_execution::NativePresentationStep::HideUnconfirmed => self.hide_unconfirmed_content(),
                crate::plugin_child_webview_execution::NativePresentationStep::Apply(NativePresentationOperation::Bounds { x, y, width, height }) => self.update_bounds(x, y, width, height),
                crate::plugin_child_webview_execution::NativePresentationStep::Apply(NativePresentationOperation::Show) => self.show(),
                crate::plugin_child_webview_execution::NativePresentationStep::Apply(NativePresentationOperation::Hide) => self.hide(),
                crate::plugin_child_webview_execution::NativePresentationStep::Apply(NativePresentationOperation::Focus) => self.focus(),
            }
                },
            )
        }

        fn ensure_rounded_corners(&self) -> Result<(), ()> {
            self.clip_checks.fetch_add(1, Ordering::SeqCst);
            if let Some(pending) = &self.pending_confirmation {
                pending
                    .started
                    .send(())
                    .expect("confirmation started receiver");
                pending
                    .release
                    .lock()
                    .expect("confirmation release lock")
                    .recv()
                    .expect("confirmation release sender");
            }
            if self.fail_clip.load(Ordering::SeqCst) {
                Err(())
            } else {
                Ok(())
            }
        }

        fn hide_unconfirmed_content(&self) -> Result<(), ()> {
            self.unconfirmed_hides.fetch_add(1, Ordering::SeqCst);
            self.hide()
        }

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

        fn deliver_bridge_frame_confirmed(
            &self,
            frame: &Value,
            guard: NativeExecutionGuard,
        ) -> Result<(), ()> {
            if let Some(pending) = &self.pending_confirmed_delivery {
                pending.started.send(()).unwrap();
                pending.release.lock().unwrap().recv().unwrap();
            }
            if !guard.is_current() {
                return Err(());
            }
            self.deliver_bridge_frame(frame)?;
            guard.is_current().then_some(()).ok_or(())
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
            if let Some(pending) = &self.pending_destroy {
                pending.started.send(()).unwrap();
                pending.release.lock().unwrap().recv().unwrap();
            }
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
        let fail_clip = Arc::clone(&handle.fail_clip);
        let clip_checks = Arc::clone(&handle.clip_checks);
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
        assert_eq!(clip_checks.load(Ordering::SeqCst), 0);
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

        fail_clip.store(true, Ordering::SeqCst);
        assert_eq!(
            service.show_current(attempt),
            PluginChildWebviewPresentationResult::NativeFailed
        );
        assert_eq!(
            shows.load(Ordering::SeqCst),
            1,
            "unconfirmed clipping cannot reveal"
        );
        assert_eq!(
            service.snapshot().unwrap().state,
            PluginChildWebviewState::Hidden
        );
        fail_clip.store(false, Ordering::SeqCst);
        assert_eq!(
            service.show_current(attempt),
            PluginChildWebviewPresentationResult::Applied
        );
        assert_eq!(service.snapshot().unwrap().attempt, attempt);
        assert_eq!(
            service.creation_facts(attempt).unwrap().freshness,
            creation.freshness
        );
        assert_eq!(clip_checks.load(Ordering::SeqCst), 3);
        assert_eq!(
            focuses.load(Ordering::SeqCst),
            1,
            "clipping does not transfer focus"
        );
        assert_eq!(
            service.hide_current(attempt),
            PluginChildWebviewPresentationResult::Applied
        );

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
        let clip_checks = Arc::clone(&replacement.clip_checks);
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
        assert_eq!(clip_checks.load(Ordering::SeqCst), 0);
        assert_eq!(
            service.snapshot().expect("replacement remains").attempt,
            new_attempt
        );
    }

    #[test]
    fn pending_outline_confirmation_releases_registry_and_cannot_present_or_hide_a_replacement() {
        for fail_confirmation in [false, true] {
            let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
            assert!(service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));
            let old_attempt = service
                .reserve_current(identity("plugin-a", 1), "fake-child")
                .unwrap();
            let (started, started_rx) = mpsc::channel();
            let (release, release_rx) = mpsc::channel();
            let old = FakeHandle {
                pending_confirmation: Some(Arc::new(PendingConfirmation {
                    started,
                    release: Mutex::new(release_rx),
                })),
                ..FakeHandle::default()
            };
            old.fail_clip.store(fail_confirmation, Ordering::SeqCst);
            assert!(service.attach_current(old_attempt, old.clone()));
            let creation = service.creation_facts(old_attempt).unwrap();
            assert!(service.mark_native_loaded(old_attempt, "fake-child"));
            assert_eq!(
                service.accept_ready_ingress(
                    old_attempt,
                    "fake-child",
                    &ready_body(&creation.freshness)
                ),
                PluginChildWebviewReadyResult::Accepted
            );
            let showing = {
                let service = Arc::clone(&service);
                std::thread::spawn(move || service.show_current(old_attempt))
            };
            started_rx
                .recv_timeout(Duration::from_secs(2))
                .expect("confirmation is pending");
            let replacement = FakeHandle {
                source_label: Some("replacement-child"),
                ..FakeHandle::default()
            };
            let (replaced, replaced_rx) = mpsc::channel();
            let replacing = {
                let service = Arc::clone(&service);
                let replacement = replacement.clone();
                std::thread::spawn(move || {
                    assert_eq!(service.snapshot().unwrap().attempt, old_attempt);
                    assert!(service.compare_current_teardown(old_attempt).unwrap());
                    let current = service
                        .reserve_current(identity("plugin-b", 2), "replacement-child")
                        .unwrap();
                    assert!(service.attach_current(current, replacement));
                    let creation = service.creation_facts(current).unwrap();
                    assert!(service.mark_native_loaded(current, "replacement-child"));
                    assert_eq!(
                        service.accept_ready_ingress(
                            current,
                            "replacement-child",
                            &ready_body(&creation.freshness)
                        ),
                        PluginChildWebviewReadyResult::Accepted
                    );
                    assert_eq!(
                        service.show_current(current),
                        PluginChildWebviewPresentationResult::Applied
                    );
                    replaced.send(current).unwrap();
                })
            };
            let replacement_before_confirmation = replaced_rx.recv_timeout(Duration::from_secs(2));
            // Always release the held confirmation before asserting, including a
            // lock-regression failure, so the test cannot strand either worker.
            release.send(()).unwrap();
            let old_result = showing.join().unwrap();
            replacing.join().unwrap();
            let current = replacement_before_confirmation
                .expect("registry remains usable while AppKit confirmation waits");
            assert_eq!(
                old_result,
                PluginChildWebviewPresentationResult::StaleAttempt
            );
            assert_eq!(service.snapshot().unwrap().attempt, current);
            assert_eq!(
                service.snapshot().unwrap().state,
                PluginChildWebviewState::Visible
            );
            assert_eq!(old.clip_checks.load(Ordering::SeqCst), 1);
            assert_eq!(old.shows.load(Ordering::SeqCst), 0);
            assert_eq!(old.hides.load(Ordering::SeqCst), 0);
            assert_eq!(old.unconfirmed_hides.load(Ordering::SeqCst), 0);
            assert_eq!(old.destroys.load(Ordering::SeqCst), 1);
            assert_eq!(replacement.clip_checks.load(Ordering::SeqCst), 1);
            assert_eq!(replacement.shows.load(Ordering::SeqCst), 1);
            assert_eq!(replacement.hides.load(Ordering::SeqCst), 0);
            assert_eq!(replacement.unconfirmed_hides.load(Ordering::SeqCst), 0);
        }
    }

    #[test]
    fn pending_outline_confirmation_cannot_override_a_newer_same_attempt_visibility_intent() {
        for (newer_show, fail_confirmation) in [(false, false), (false, true), (true, false)] {
            let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
            assert!(service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));
            let attempt = service
                .reserve_current(identity("plugin-a", 1), "fake-child")
                .unwrap();
            let (started, started_rx) = mpsc::channel();
            let (release, release_rx) = mpsc::channel();
            let handle = FakeHandle {
                pending_confirmation: Some(Arc::new(PendingConfirmation {
                    started,
                    release: Mutex::new(release_rx),
                })),
                ..FakeHandle::default()
            };
            handle.fail_clip.store(fail_confirmation, Ordering::SeqCst);
            assert!(service.attach_current(attempt, handle.clone()));
            let creation = service.creation_facts(attempt).unwrap();
            assert!(service.mark_native_loaded(attempt, "fake-child"));
            assert_eq!(
                service.accept_ready_ingress(
                    attempt,
                    "fake-child",
                    &ready_body(&creation.freshness)
                ),
                PluginChildWebviewReadyResult::Accepted
            );
            let first = {
                let service = Arc::clone(&service);
                std::thread::spawn(move || service.show_current(attempt))
            };
            started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
            let (hidden, hidden_rx) = mpsc::channel();
            let newer = {
                let service = Arc::clone(&service);
                std::thread::spawn(move || {
                    if newer_show {
                        service.show_current(attempt)
                    } else {
                        let result = service.hide_current(attempt);
                        hidden.send(()).unwrap();
                        result
                    }
                })
            };
            let newer_admitted = if newer_show {
                started_rx.recv_timeout(Duration::from_secs(2))
            } else {
                hidden_rx.recv_timeout(Duration::from_secs(2))
            };
            release.send(()).unwrap();
            if newer_show {
                release.send(()).unwrap();
            }
            let first_result = first.join().unwrap();
            let newer_result = newer.join().unwrap();
            newer_admitted.expect("newer intent is admitted without waiting for old confirmation");
            assert_eq!(
                first_result,
                PluginChildWebviewPresentationResult::StaleAttempt
            );
            assert_eq!(newer_result, PluginChildWebviewPresentationResult::Applied);
            assert_eq!(handle.shows.load(Ordering::SeqCst), usize::from(newer_show));
            assert_eq!(
                handle.hides.load(Ordering::SeqCst),
                usize::from(!newer_show)
            );
            assert_eq!(handle.unconfirmed_hides.load(Ordering::SeqCst), 0);
            assert_eq!(handle.focuses.load(Ordering::SeqCst), 0);
            assert_eq!(
                service.snapshot().unwrap().state,
                if newer_show {
                    PluginChildWebviewState::Visible
                } else {
                    PluginChildWebviewState::Hidden
                }
            );
            assert_eq!(
                service.snapshot().unwrap().presentation_revision,
                0,
                "visibility intent does not change the slot wire revision"
            );
            assert_eq!(
                service.creation_facts(attempt).unwrap().freshness,
                creation.freshness
            );
        }
    }

    #[test]
    fn pending_outline_confirmation_rechecks_session_readiness_after_completion() {
        let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
        assert!(service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default())));
        let attempt = service
            .reserve_current(identity("plugin-a", 1), "fake-child")
            .unwrap();
        let (started, started_rx) = mpsc::channel();
        let (release, release_rx) = mpsc::channel();
        let handle = FakeHandle {
            pending_confirmation: Some(Arc::new(PendingConfirmation {
                started,
                release: Mutex::new(release_rx),
            })),
            ..FakeHandle::default()
        };
        assert!(service.attach_current(attempt, handle.clone()));
        let creation = service.creation_facts(attempt).unwrap();
        assert!(service.mark_native_loaded(attempt, "fake-child"));
        assert_eq!(
            service.accept_ready_ingress(attempt, "fake-child", &ready_body(&creation.freshness)),
            PluginChildWebviewReadyResult::Accepted
        );
        let showing = {
            let service = Arc::clone(&service);
            std::thread::spawn(move || service.show_current(attempt))
        };
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let (disconnected, disconnected_rx) = mpsc::channel();
        let disconnecting = {
            let service = Arc::clone(&service);
            std::thread::spawn(move || {
                let result = service.disconnect_current(
                    attempt,
                    PluginChildWebviewSessionErrorCode::RuntimeSessionDisconnected,
                );
                disconnected.send(result).unwrap();
            })
        };
        let disconnected_before_confirmation = disconnected_rx.recv_timeout(Duration::from_secs(2));
        release.send(()).unwrap();
        let result = showing.join().unwrap();
        disconnecting.join().unwrap();
        assert!(
            disconnected_before_confirmation.expect("disconnect is not blocked by confirmation")
        );
        assert_eq!(result, PluginChildWebviewPresentationResult::NotReady);
        assert_eq!(handle.shows.load(Ordering::SeqCst), 0);
        assert_eq!(handle.unconfirmed_hides.load(Ordering::SeqCst), 0);
        assert_eq!(
            service.snapshot().unwrap().session_state,
            PluginChildWebviewSessionState::Disconnected
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
            .reserve_current_with_derived_label(identity("plugin-a", 1))
            .expect("first reservation succeeds");
        let first_facts = service.creation_facts(first).expect("first facts exist");
        assert!(service
            .compare_current_teardown(first)
            .expect("first teardown succeeds"));
        let second = service
            .reserve_current_with_derived_label(identity("plugin-a", 1))
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
            .reserve_current_with_derived_label(identity("plugin-a", 2))
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
    fn ready_owned_instance(
        service: &PluginChildWebviewRegistry<FakeHandle>,
        owner: PluginChildWebviewOwner,
        source: &'static str,
        handle: FakeHandle,
    ) -> PluginChildWebviewAttempt {
        let _ = service.attach_ready_dispatcher(Arc::new(FakeReadyDispatcher::default()));
        let attempt = service
            .reserve_owned(identity("plugin-a", 1), owner, Some(source.into()))
            .unwrap();
        assert!(service.attach_current(
            attempt,
            FakeHandle {
                source_label: Some(source),
                ..handle
            }
        ));
        let facts = service.creation_facts(attempt).unwrap();
        assert!(service.mark_native_loaded(attempt, source));
        assert_eq!(
            service.accept_ready_ingress(attempt, source, &ready_body(&facts.freshness)),
            PluginChildWebviewReadyResult::Accepted
        );
        assert!(service.mark_sdk_ready_after_context(attempt, source, "runtime.get_context", true));
        attempt
    }

    #[test]
    fn delayed_main_key_focus_preserves_the_instance_and_only_retries_the_original_visibility_intent(
    ) {
        for race in ["key", "hide", "renew", "replace"] {
            let service = PluginChildWebviewRegistry::<FakeHandle>::default();
            let owner = PluginChildWebviewOwner::main();
            let handle = FakeHandle::default();
            let attempt =
                ready_owned_instance(&service, owner.clone(), "restoring-main", handle.clone());
            assert_eq!(
                service.show_owned(attempt, &owner),
                PluginChildWebviewPresentationResult::Applied
            );
            assert_eq!(
                service.hide_owned(attempt, &owner),
                PluginChildWebviewPresentationResult::Applied
            );
            assert_eq!(
                service.show_owned(attempt, &owner),
                PluginChildWebviewPresentationResult::Applied
            );
            handle.awaiting_key.store(true, Ordering::Release);
            assert_eq!(
                service.focus_owned(attempt, &owner),
                PluginChildWebviewPresentationResult::FocusUnavailable
            );
            let snapshot = service.snapshot_attempt(attempt).unwrap();
            assert_eq!(snapshot.state, PluginChildWebviewState::Visible);
            assert_eq!(
                snapshot.session_state,
                PluginChildWebviewSessionState::SdkReady
            );
            assert_eq!(handle.destroys.load(Ordering::Acquire), 0);
            handle.awaiting_key.store(false, Ordering::Release);
            let replacement = FakeHandle::default();
            match race {
                "hide" => {
                    assert_eq!(
                        service.hide_owned(attempt, &owner),
                        PluginChildWebviewPresentationResult::Applied
                    );
                    assert_eq!(
                        service.show_owned(attempt, &owner),
                        PluginChildWebviewPresentationResult::Applied
                    );
                }
                "renew" => {
                    let transfer = service
                        .begin_ownership_transfer(
                            attempt,
                            "main",
                            &owner,
                            "plugin-window-0000000000000011",
                        )
                        .unwrap();
                    assert!(service.cancel_ownership_transfer(&transfer));
                }
                "replace" => {
                    service.compare_owned_teardown(attempt, &owner).unwrap();
                    let new = ready_owned_instance(
                        &service,
                        owner.clone(),
                        "replacement-main",
                        replacement.clone(),
                    );
                    assert_eq!(
                        service.show_owned(new, &owner),
                        PluginChildWebviewPresentationResult::Applied
                    );
                }
                _ => {}
            }
            service.retry_pending_main_focus();
            service.retry_pending_main_focus();
            assert_eq!(
                handle.focuses.load(Ordering::Acquire),
                if race == "key" { 2 } else { 1 }
            );
            assert_eq!(replacement.focuses.load(Ordering::Acquire), 0);
            assert_eq!(
                handle.destroys.load(Ordering::Acquire),
                usize::from(race == "replace")
            );
        }
    }

    #[test]
    fn quit_preparation_revokes_all_instances_before_native_destruction_and_blocks_new_admission() {
        let registry = PluginChildWebviewRegistry::<FakeHandle>::default();
        let main = FakeHandle::default();
        let sibling = FakeHandle::default();
        let a = ready_owned_instance(
            &registry,
            PluginChildWebviewOwner::main(),
            "quit-main",
            main.clone(),
        );
        let b = ready_owned_instance(
            &registry,
            PluginChildWebviewOwner::detached(1).unwrap(),
            "quit-sibling",
            sibling.clone(),
        );
        let captured = registry.prepare_shutdown();
        assert_eq!(captured, [a, b]);
        assert!(registry.is_shutting_down());
        assert_eq!(main.destroys.load(Ordering::SeqCst), 0);
        assert_eq!(sibling.destroys.load(Ordering::SeqCst), 0);
        for attempt in &captured {
            assert_eq!(
                registry.snapshot_attempt(*attempt).unwrap().session_state,
                PluginChildWebviewSessionState::Disconnected
            );
        }
        assert!(registry
            .reserve_owned(
                identity("plugin-a", 1),
                PluginChildWebviewOwner::detached(2).unwrap(),
                Some("quit-new".into())
            )
            .is_none());
        for attempt in captured {
            assert!(registry.compare_current_teardown(attempt).unwrap());
        }
        assert!(registry.snapshots().is_empty());
        assert_eq!(main.destroys.load(Ordering::SeqCst), 1);
        assert_eq!(sibling.destroys.load(Ordering::SeqCst), 1);
        registry.teardown_all().unwrap();
        assert_eq!(main.destroys.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn close_response_confirmation_releases_registry_and_survives_only_valid_instance_work() {
        for race in ["cancel", "terminate", "transfer", "delivery_failure"] {
            let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
            let dispatcher = Arc::new(FakeRpcDispatcher::default());
            assert!(service.attach_rpc_dispatcher(dispatcher));
            let (started, waiting) = mpsc::channel();
            let (release, resumed) = mpsc::channel();
            let handle = FakeHandle {
                pending_confirmed_delivery: Some(Arc::new(PendingConfirmation {
                    started,
                    release: Mutex::new(resumed),
                })),
                deliveries: Some(Arc::new(Mutex::new(Vec::new()))),
                ..FakeHandle::default()
            };
            let owner = PluginChildWebviewOwner::main();
            let attempt =
                ready_owned_instance(&service, owner.clone(), "child-close", handle.clone());
            let sibling = ready_owned_instance(
                &service,
                PluginChildWebviewOwner::detached(2).unwrap(),
                "child-sibling",
                FakeHandle::default(),
            );
            assert_eq!(
                service.accept_rpc_ingress(
                    attempt,
                    "child-close",
                    &rpc_request(1, "ui.close", serde_json::json!({}))
                ),
                PluginChildWebviewRpcIngressResult::Dispatched
            );
            let pending = Arc::clone(&service);
            let worker = std::thread::spawn(move || {
                pending.settle_close_confirmed(
                    attempt,
                    "child-close",
                    "request_0000000000000001",
                    serde_json::json!({"method":"ui.close","result":{"accepted":true}}),
                )
            });
            waiting.recv_timeout(Duration::from_secs(2)).unwrap();
            // These registry operations must remain available while native delivery waits.
            assert!(service.snapshot_attempt(sibling).is_some());
            match race {
                "cancel" => {
                    let cancel = serde_json::json!({"contract_version":"0.2.0","type":"lensx.plugin_bridge.cancel","request_id":"request_0000000000000001"}).to_string();
                    assert_eq!(
                        service.accept_rpc_ingress(attempt, "child-close", &cancel),
                        PluginChildWebviewRpcIngressResult::Cancelled
                    );
                }
                "terminate" => {
                    assert!(service.compare_current_teardown(attempt).unwrap());
                }
                "transfer" => {
                    let transfer = service
                        .begin_ownership_transfer(
                            attempt,
                            "main",
                            &owner,
                            "plugin-window-0000000000000001",
                        )
                        .unwrap();
                    assert!(service.commit_ownership_transfer(&transfer));
                }
                _ => handle.fail_delivery.store(true, Ordering::SeqCst),
            }
            release.send(()).unwrap();
            let accepted = worker.join().unwrap();
            assert_eq!(
                accepted == PluginChildWebviewRpcIngressResult::Responded,
                race == "transfer",
                "{race}"
            );
            let responses = handle
                .deliveries
                .as_ref()
                .unwrap()
                .lock()
                .unwrap()
                .iter()
                .filter(|frame| frame["type"] == "lensx.plugin_bridge.response")
                .count();
            assert_eq!(responses, usize::from(race == "transfer"), "{race}");
            assert_eq!(
                service.snapshot_attempt(sibling).unwrap().session_state,
                PluginChildWebviewSessionState::SdkReady
            );
            if race == "cancel" {
                assert_eq!(
                    service.snapshot_attempt(attempt).unwrap().session_state,
                    PluginChildWebviewSessionState::SdkReady
                );
            }
        }
    }

    #[test]
    fn three_same_plugin_instances_own_distinct_surfaces_sessions_and_cleanup() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let dispatcher = Arc::new(FakeRpcDispatcher::default());
        assert!(service.attach_rpc_dispatcher(dispatcher.clone()));
        let owners = [
            PluginChildWebviewOwner::main(),
            PluginChildWebviewOwner::detached(1).unwrap(),
            PluginChildWebviewOwner::detached(2).unwrap(),
        ];
        let sources = ["child-main", "child-one", "child-two"];
        let handles: Vec<_> = (0..3)
            .map(|_| FakeHandle {
                deliveries: Some(Arc::new(Mutex::new(Vec::new()))),
                ..FakeHandle::default()
            })
            .collect();
        let attempts: Vec<_> = (0..3)
            .map(|i| {
                ready_owned_instance(&service, owners[i].clone(), sources[i], handles[i].clone())
            })
            .collect();
        assert_eq!(service.snapshots().len(), 3);
        assert_eq!(service.snapshot().unwrap().attempt, attempts[0]);
        for i in 0..3 {
            let snapshot = service
                .snapshot_for_surface(&owners[i].window_label)
                .unwrap();
            assert_eq!(snapshot.attempt, attempts[i]);
            assert_eq!(snapshot.owner, owners[i]);
            assert!(service
                .reserve_owned_with_derived_label(identity("plugin-a", 1), owners[i].clone())
                .is_none());
            assert!(service.is_current_source(&attempts[i].opaque_id(), sources[i]));
            assert_eq!(
                service.accept_rpc_ingress(
                    attempts[i],
                    sources[i],
                    &rpc_request(1, "storage.get", serde_json::json!({"key":"shared"}))
                ),
                PluginChildWebviewRpcIngressResult::Dispatched
            );
            for j in 0..3 {
                if i != j {
                    assert_ne!(
                        snapshot.data_store_identifier,
                        service
                            .snapshot_attempt(attempts[j])
                            .unwrap()
                            .data_store_identifier
                    );
                    assert!(!service.is_current_source(&attempts[i].opaque_id(), sources[j]));
                }
            }
        }
        assert!(service.compare_current_teardown(attempts[1]).unwrap());
        assert!(!service.compare_current_teardown(attempts[1]).unwrap());
        assert_eq!(handles[1].destroys.load(Ordering::SeqCst), 1);
        assert!(!service.is_current_source(&attempts[1].opaque_id(), sources[1]));
        assert_eq!(service.snapshots().len(), 2);
        assert_eq!(
            service
                .snapshot_attempt(attempts[0])
                .unwrap()
                .rpc_pending_requests,
            1
        );
        assert_eq!(
            service
                .snapshot_attempt(attempts[2])
                .unwrap()
                .rpc_pending_requests,
            1
        );
        for i in [0, 2] {
            let result = serde_json::json!({"method":"storage.get","result":{"found":true,"value":format!("result-{i}")}});
            service.settle_rpc_dispatch(
                attempts[i],
                sources[i],
                "request_0000000000000001",
                result.clone(),
            );
            let deliveries = handles[i].deliveries.as_ref().unwrap().lock().unwrap();
            assert_eq!(deliveries[0].get("result"), Some(&result));
            assert_eq!(
                deliveries
                    .iter()
                    .filter(|frame| frame.get("request_id").and_then(Value::as_str)
                        == Some("request_0000000000000001"))
                    .count(),
                1
            );
        }
        assert!(service.teardown_all().is_ok());
        assert!(service.snapshots().is_empty());
        assert!(service.teardown_all().is_ok());
        for handle in handles {
            assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
        }
        assert!(service
            .reserve_current_with_derived_label(identity("plugin-a", 1))
            .is_none());
    }

    #[test]
    fn migration_is_source_bound_single_use_and_retires_the_old_owner() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let handle = FakeHandle::default();
        let attempt = ready_owned_instance(
            &service,
            PluginChildWebviewOwner::main(),
            "child-migrate",
            handle.clone(),
        );
        let source = PluginChildWebviewOwner::main();
        let target = PluginChildWebviewOwner::detached(1).unwrap();
        let before = service.creation_facts(attempt).unwrap();
        assert!(service
            .begin_ownership_transfer(attempt, "child-migrate", &source, &target.window_label)
            .is_none());
        assert!(service
            .begin_ownership_transfer(
                attempt,
                "main",
                &PluginChildWebviewOwner::from_parts("main", 2).unwrap(),
                &target.window_label
            )
            .is_none());
        assert!(service
            .begin_ownership_transfer(attempt, "main", &source, "fake-window")
            .is_none());
        let transfer = service
            .begin_ownership_transfer(attempt, "main", &source, &target.window_label)
            .unwrap();
        assert!(service
            .begin_ownership_transfer(
                attempt,
                "main",
                &source,
                &PluginChildWebviewOwner::detached(2).unwrap().window_label
            )
            .is_none());
        assert_eq!(
            service.show_owned(attempt, &source),
            PluginChildWebviewPresentationResult::StaleAttempt
        );
        assert_eq!(
            service.hide_owned(attempt, &source),
            PluginChildWebviewPresentationResult::StaleAttempt
        );
        let mut forged = transfer.clone();
        forged.token = PluginChildWebviewMigrationToken::new(999).unwrap();
        assert!(!service.commit_ownership_transfer(&forged));
        assert!(!service.cancel_ownership_transfer(&forged));
        assert!(service.commit_ownership_transfer(&transfer));
        assert!(!service.commit_ownership_transfer(&transfer));
        assert!(!service.cancel_ownership_transfer(&transfer));
        assert!(service.snapshot().is_none());
        let after = service.creation_facts(attempt).unwrap();
        assert_eq!(before.attempt, after.attempt);
        assert_eq!(before.source_label, after.source_label);
        assert_eq!(before.freshness, after.freshness);
        assert_eq!(before.data_store_identifier, after.data_store_identifier);
        assert_eq!(after.owner, transfer.target);
        assert_eq!(
            service.show_owned(attempt, &source),
            PluginChildWebviewPresentationResult::StaleAttempt
        );
        assert_eq!(
            service.hide_owned(attempt, &source),
            PluginChildWebviewPresentationResult::StaleAttempt
        );
        assert_eq!(
            service.focus_owned(attempt, &source),
            PluginChildWebviewPresentationResult::StaleAttempt
        );
        assert!(!service.compare_owned_teardown(attempt, &source).unwrap());
        assert_eq!(
            service.show_current(attempt),
            PluginChildWebviewPresentationResult::StaleAttempt
        );
        assert_eq!(
            service.show_owned(attempt, &transfer.target),
            PluginChildWebviewPresentationResult::Applied
        );
        assert_eq!(
            service.focus_owned(attempt, &transfer.target),
            PluginChildWebviewPresentationResult::Applied
        );
        assert_eq!(handle.shows.load(Ordering::SeqCst), 1);
        assert_eq!(handle.focuses.load(Ordering::SeqCst), 1);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        let next = service
            .reserve_current_with_derived_label(identity("plugin-a", 1))
            .unwrap();
        assert_ne!(next, attempt);
        assert_eq!(service.snapshot().unwrap().attempt, next);
        assert_eq!(
            service
                .snapshot_for_surface(&transfer.target.window_label)
                .unwrap()
                .attempt,
            attempt
        );
    }

    #[test]
    fn cancelled_or_terminal_migrations_never_reuse_a_token_owner_or_source() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let attempt = ready_owned_instance(
            &service,
            PluginChildWebviewOwner::main(),
            "child-cancel",
            FakeHandle::default(),
        );
        let target = PluginChildWebviewOwner::detached(1).unwrap();
        let first = service
            .begin_ownership_transfer(
                attempt,
                "main",
                &PluginChildWebviewOwner::main(),
                &target.window_label,
            )
            .unwrap();
        assert!(service.cancel_ownership_transfer(&first));
        let owner = service.owner_for_attempt(attempt).unwrap();
        assert_eq!(owner.window_label, "main");
        assert!(owner.revision > first.source.revision);
        assert!(!service.commit_ownership_transfer(&first));
        assert!(!service.cancel_ownership_transfer(&first));
        let second = service
            .begin_ownership_transfer(attempt, "main", &owner, &target.window_label)
            .unwrap();
        assert_ne!(first.token, second.token);
        assert!(service.compare_current_teardown(attempt).unwrap());
        assert!(!service.commit_ownership_transfer(&second));
        assert!(!service.cancel_ownership_transfer(&second));
        assert!(service
            .reserve_current(identity("plugin-a", 1), "child-cancel")
            .is_none());
        let next = service
            .reserve_current_with_derived_label(identity("plugin-a", 1))
            .unwrap();
        assert_ne!(attempt, next);
        assert!(service
            .reserve_owned_with_derived_label(identity("plugin-a", 1), target)
            .is_some());
        assert_eq!(service.snapshots().len(), 2);
    }

    #[test]
    fn queued_native_owner_operations_cannot_run_after_same_window_rollback() {
        let bounds = PluginChildWebviewBounds {
            x: 10,
            y: 20,
            width: 601,
            height: 401,
        };
        for operation in [
            NativePresentationOperation::Bounds {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
            },
            NativePresentationOperation::Hide,
            NativePresentationOperation::Focus,
        ] {
            let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
            let (started, wait_started) = mpsc::channel();
            let (release, wait_release) = mpsc::channel();
            let handle = FakeHandle {
                pending_native_execution: Some(Arc::new(PendingNativeExecution {
                    operation,
                    started,
                    release: Mutex::new(wait_release),
                })),
                ..FakeHandle::default()
            };
            let attempt = ready_owned_instance(
                &service,
                PluginChildWebviewOwner::main(),
                "queued-old-owner",
                handle.clone(),
            );
            assert_eq!(
                service.show_current(attempt),
                PluginChildWebviewPresentationResult::Applied
            );
            let pending = Arc::clone(&service);
            let task = std::thread::spawn(move || {
                let owner = PluginChildWebviewOwner::main();
                match operation {
                    NativePresentationOperation::Bounds { .. } => assert_eq!(
                        pending.apply_owned_slot_update(attempt, &owner, 1, bounds),
                        PluginChildWebviewSlotUpdateResult::StaleAttempt
                    ),
                    NativePresentationOperation::Hide => assert_eq!(
                        pending.hide_owned(attempt, &owner),
                        PluginChildWebviewPresentationResult::StaleAttempt
                    ),
                    NativePresentationOperation::Focus => assert_eq!(
                        pending.focus_owned(attempt, &owner),
                        PluginChildWebviewPresentationResult::StaleAttempt
                    ),
                    _ => unreachable!(),
                }
            });
            wait_started.recv_timeout(Duration::from_secs(1)).unwrap();
            // Native execution is waiting while both registry transitions complete;
            // holding the registry mutex across native wait would deadlock here.
            let transition_service = Arc::clone(&service);
            let (completed, transition_complete) = mpsc::channel();
            let transition = std::thread::spawn(move || {
                let transfer = transition_service
                    .begin_ownership_transfer(
                        attempt,
                        "main",
                        &PluginChildWebviewOwner::main(),
                        "plugin-window-0000000000000001",
                    )
                    .unwrap();
                assert!(transition_service.cancel_ownership_transfer(&transfer));
                completed.send(()).unwrap();
            });
            let transitioned = transition_complete.recv_timeout(Duration::from_secs(1));
            release.send(()).unwrap();
            transitioned.expect("registry must remain available during native wait");
            transition.join().unwrap();
            task.join().unwrap();
            let snapshot = service.snapshot().unwrap();
            assert_eq!(snapshot.owner.window_label, "main");
            assert_eq!(snapshot.owner.revision, 2);
            assert_eq!(snapshot.state, PluginChildWebviewState::Visible);
            assert_eq!(snapshot.presentation_revision, 0);
            assert!(snapshot.bounds.is_none());
            assert_eq!(handle.bounds_updates.load(Ordering::SeqCst), 0);
            assert_eq!(handle.hides.load(Ordering::SeqCst), 0);
            assert_eq!(handle.focuses.load(Ordering::SeqCst), 0);
            assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        }
    }

    #[test]
    fn pending_source_outline_confirmation_cannot_present_a_migrated_instance() {
        let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
        let (started_sender, started_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let handle = FakeHandle {
            pending_confirmation: Some(Arc::new(PendingConfirmation {
                started: started_sender,
                release: Mutex::new(release_receiver),
            })),
            ..FakeHandle::default()
        };
        let attempt = ready_owned_instance(
            &service,
            PluginChildWebviewOwner::main(),
            "child-pending",
            handle.clone(),
        );
        let source_owner = PluginChildWebviewOwner::main();
        let pending = service.clone();
        let task = std::thread::spawn(move || pending.show_owned(attempt, &source_owner));
        started_receiver
            .recv_timeout(Duration::from_secs(1))
            .unwrap();
        let transfer = service
            .begin_ownership_transfer(
                attempt,
                "main",
                &PluginChildWebviewOwner::main(),
                &PluginChildWebviewOwner::detached(1).unwrap().window_label,
            )
            .unwrap();
        assert!(service.commit_ownership_transfer(&transfer));
        release_sender.send(()).unwrap();
        assert_eq!(
            task.join().unwrap(),
            PluginChildWebviewPresentationResult::StaleAttempt
        );
        assert_eq!(handle.shows.load(Ordering::SeqCst), 0);
        assert_eq!(handle.hides.load(Ordering::SeqCst), 0);
        assert_eq!(handle.focuses.load(Ordering::SeqCst), 0);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        assert_eq!(service.owner_for_attempt(attempt), Some(transfer.target));
    }
    #[test]
    fn native_attempt_reservations_are_unique_bounded_and_released_without_reuse() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let first = service
            .reserve_creation_at(PluginChildWebviewOwner::main(), 0)
            .unwrap();
        assert!(service.snapshots().is_empty());
        assert!(service
            .reserve_creation_at(PluginChildWebviewOwner::main(), 9_999)
            .is_none());
        let second = service
            .reserve_creation_at(PluginChildWebviewOwner::main(), 10_000)
            .unwrap();
        assert_ne!(first.attempt, second.attempt);
        assert!(service
            .bind_creation_reservation(&first, identity("plugin-a", 1))
            .is_none());
        drop(first);
        assert!(service
            .reserve_creation(PluginChildWebviewOwner::main())
            .is_none());
        let second_attempt = second.attempt;
        drop(second);
        let third = service
            .reserve_creation(PluginChildWebviewOwner::main())
            .unwrap();
        assert_ne!(third.attempt, second_attempt);
        let other_registry = PluginChildWebviewRegistry::<FakeHandle>::default();
        assert!(other_registry
            .bind_creation_reservation(&third, identity("plugin-a", 1))
            .is_none());
        let attempt = service
            .bind_creation_reservation(&third, identity("plugin-a", 1))
            .unwrap();
        assert_eq!(attempt, third.attempt);
        drop(third);
        assert_eq!(service.snapshot().unwrap().attempt, attempt);
        assert!(service
            .reserve_creation(PluginChildWebviewOwner::main())
            .is_none());
    }

    #[test]
    fn host_reload_captures_old_instances_and_pending_creation_without_stopping_new_admission() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let events = Arc::new(Mutex::new(Vec::new()));
        assert!(
            service.attach_resource_authority(Arc::new(FakeResourceAuthority {
                events: events.clone()
            }))
        );
        let main_handle = FakeHandle::default();
        let detached_handle = FakeHandle::default();
        let main = ready_owned_instance(
            &service,
            PluginChildWebviewOwner::main(),
            "reload-main",
            main_handle.clone(),
        );
        let detached = ready_owned_instance(
            &service,
            PluginChildWebviewOwner::detached(1).unwrap(),
            "reload-detached",
            detached_handle.clone(),
        );
        let pending = service
            .reserve_creation(PluginChildWebviewOwner::detached(2).unwrap())
            .unwrap();
        let captured = service.prepare_host_reload();
        assert_eq!(captured, vec![main, detached]);
        assert!(service
            .bind_creation_reservation(&pending, identity("plugin-a", 1))
            .is_none());
        assert_eq!(
            events
                .lock()
                .unwrap()
                .iter()
                .filter(|&&event| event == "revoke")
                .count(),
            3
        );
        assert!(service.compare_current_teardown(main).unwrap());
        let fresh = service
            .reserve_current_with_derived_label(identity("plugin-a", 1))
            .unwrap();
        for attempt in captured {
            let _ = service.compare_current_teardown(attempt);
        }
        assert_eq!(service.snapshot().unwrap().attempt, fresh);
        assert_eq!(service.snapshots().len(), 1);
        assert_eq!(main_handle.destroys.load(Ordering::SeqCst), 1);
        assert_eq!(detached_handle.destroys.load(Ordering::SeqCst), 1);
        drop(pending);
    }
    #[test]
    fn final_transfer_publication_rechecks_expiry_after_waiting_for_registry_lock() {
        for cancel in [false, true] {
            let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
            let attempt = ready_owned_instance(
                &service,
                PluginChildWebviewOwner::main(),
                "final-publication",
                FakeHandle::default(),
            );
            let transfer = service
                .begin_ownership_transfer(
                    attempt,
                    "main",
                    &PluginChildWebviewOwner::main(),
                    "plugin-window-0000000000000001",
                )
                .unwrap();
            let guard = NativeExecutionGuard::new(|| {
                panic!("publication must not recurse into currentness callback under registry lock")
            })
            .with_deadline(Duration::from_secs(1));
            let state = service.lock_state();
            let worker = service.clone();
            let worker_guard = guard.clone();
            let worker_transfer = transfer.clone();
            let (started, observed) = mpsc::channel();
            let thread = std::thread::spawn(move || {
                started.send(()).unwrap();
                if cancel {
                    worker.cancel_ownership_transfer_if(&worker_transfer, &worker_guard)
                } else {
                    worker.commit_ownership_transfer_presentation_if(
                        &worker_transfer,
                        PluginChildWebviewBounds {
                            x: 0,
                            y: 0,
                            width: 100,
                            height: 100,
                        },
                        &worker_guard,
                    )
                }
            });
            observed.recv_timeout(Duration::from_secs(1)).unwrap();
            guard.expire();
            drop(state);
            assert!(!thread.join().unwrap());
            assert!(service.ownership_transfer_is_current(&transfer));
            assert_eq!(transfer.publication_receipt.read(), None);
        }
    }
    #[test]
    fn terminal_claim_captures_current_owner_and_fences_commit_before_native_close_wait() {
        let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
        let (started, observed) = mpsc::channel();
        let (release, blocked) = mpsc::channel();
        let handle = FakeHandle {
            pending_destroy: Some(Arc::new(PendingConfirmation {
                started,
                release: Mutex::new(blocked),
            })),
            ..FakeHandle::default()
        };
        let attempt = ready_owned_instance(
            &service,
            PluginChildWebviewOwner::main(),
            "terminal-race",
            handle.clone(),
        );
        let transfer = service
            .begin_ownership_transfer(
                attempt,
                "main",
                &PluginChildWebviewOwner::main(),
                "plugin-window-0000000000000001",
            )
            .unwrap();
        let worker = service.clone();
        let closing = std::thread::spawn(move || worker.teardown_with_owner(attempt));
        observed.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(
            service.snapshot_attempt(attempt).unwrap().session_state,
            PluginChildWebviewSessionState::Disposed
        );
        assert!(!service.commit_ownership_transfer(&transfer));
        release.send(()).unwrap();
        assert_eq!(
            closing.join().unwrap().unwrap(),
            Some(PluginChildWebviewOwner::main())
        );
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);

        let service = Arc::new(PluginChildWebviewRegistry::<FakeHandle>::default());
        let attempt = ready_owned_instance(
            &service,
            PluginChildWebviewOwner::main(),
            "commit-wins",
            FakeHandle::default(),
        );
        let stale_owner = service.owner_for_attempt(attempt).unwrap();
        let transfer = service
            .begin_ownership_transfer(
                attempt,
                "main",
                &stale_owner,
                "plugin-window-0000000000000001",
            )
            .unwrap();
        assert!(service.commit_ownership_transfer(&transfer));
        assert_eq!(
            service
                .teardown_owned_instance(attempt, &stale_owner)
                .unwrap(),
            None
        );
        assert_eq!(
            service.teardown_with_owner(attempt).unwrap(),
            Some(transfer.target)
        );
    }
}
