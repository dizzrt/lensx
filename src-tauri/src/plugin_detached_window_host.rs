//! Trusted Host-window broker. Native source identity and registered shell epochs
//! grant access; URL/query fields and label patterns never grant authority alone.
use crate::frame_aware_navigation_policy::{
    FrameAwareNavigationPolicy, NavigationAllow, NavigationDecision, NavigationFrame,
};
use crate::plugin_child_webview_execution::NativeExecutionGuard;
use crate::plugin_child_webview_owner::{
    PluginChildWebviewOwner, PluginChildWebviewOwnershipTransfer,
};
use crate::plugin_child_webview_service::{
    PluginChildWebviewAttempt, PluginChildWebviewService, PluginChildWebviewSessionState,
};
use crate::trusted_app_target::TrustedAppTarget;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{
    ipc::{Channel, JavaScriptChannelId},
    AppHandle, Manager, State, Webview, Wry,
};

pub(crate) const HOST_WINDOW_VERSION: &str = "0.1.0";
pub(crate) const HOST_WINDOW_SNAPSHOT_EVENT: &str = "plugin-host-window://snapshot";
pub(crate) const HOST_WINDOW_OPERATION_EVENT: &str = "plugin-host-window://operation";
const MAX_PENDING_OPERATIONS: usize = 32;
const MAX_ACKNOWLEDGED_OPERATIONS: usize = 128;
const OPERATION_DEADLINE: Duration = Duration::from_secs(10);

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HostWindowOwner {
    pub(crate) window_label: String,
    pub(crate) ownership_revision: String,
}
impl HostWindowOwner {
    pub(crate) fn native(&self) -> Option<PluginChildWebviewOwner> {
        PluginChildWebviewOwner::from_parts(
            &self.window_label,
            positive_revision(&self.ownership_revision)?,
        )
    }
}
impl From<&PluginChildWebviewOwner> for HostWindowOwner {
    fn from(owner: &PluginChildWebviewOwner) -> Self {
        Self {
            window_label: owner.window_label.clone(),
            ownership_revision: owner.revision.to_string(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HostWindowPage {
    pub(crate) owner_id: String,
    pub(crate) page_id: String,
    pub(crate) title: String,
    pub(crate) plugin_name: String,
    pub(crate) action_name: String,
}
impl HostWindowPage {
    fn valid(&self) -> bool {
        valid_plugin_id(&self.owner_id)
            && valid_local_id(&self.page_id)
            && [
                &self.owner_id,
                &self.page_id,
                &self.title,
                &self.plugin_name,
                &self.action_name,
            ]
            .iter()
            .all(|value| {
                !value.is_empty()
                    && value.len() <= 2048
                    && value.chars().count() <= 512
                    && !value.contains('\0')
            })
    }
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HostWindowBinding {
    pub(crate) attempt_id: String,
    pub(crate) entry_url: String,
    pub(crate) resource_generation: String,
}
impl HostWindowBinding {
    fn valid(&self) -> bool {
        PluginChildWebviewAttempt::from_opaque_id(&self.attempt_id).is_some()
            && self.entry_url.len() <= 8192
            && crate::plugin_resource_url::parse_plugin_resource_url(&self.entry_url, false)
                .is_some()
            && positive_revision(&self.resource_generation).is_some()
    }
}
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HostWindowPhase {
    Preparing,
    Active,
    RecoveryRequired,
    Closing,
}
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HostWindowFailure {
    RuntimeUnavailable,
    RecoveryRequired,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HostWindowPreferences {
    pub(crate) locale: String,
    pub(crate) theme: String,
}
impl Default for HostWindowPreferences {
    fn default() -> Self {
        Self {
            locale: "en-US".into(),
            theme: "light".into(),
        }
    }
}
impl HostWindowPreferences {
    fn valid(&self) -> bool {
        matches!(self.locale.as_str(), "en-US" | "zh-CN")
            && matches!(self.theme.as_str(), "light" | "dark")
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HostWindowSnapshot {
    pub(crate) contract_version: &'static str,
    pub(crate) shell_epoch: String,
    pub(crate) revision: String,
    pub(crate) owner: HostWindowOwner,
    pub(crate) phase: HostWindowPhase,
    pub(crate) page: HostWindowPage,
    pub(crate) locale: String,
    pub(crate) theme: String,
    pub(crate) binding: Option<HostWindowBinding>,
    pub(crate) error_code: Option<HostWindowFailure>,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HostWindowBounds {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HostWindowGeometry {
    pub(crate) scale_factor: f64,
    pub(crate) physical_bounds: HostWindowBounds,
}
impl HostWindowGeometry {
    pub(crate) fn fills_detached_content(&self, scale: f64, width: u32, height: u32) -> bool {
        self.valid()
            && self.scale_factor == scale
            && self.physical_bounds.x == 0.0
            && self.physical_bounds.y == 0.0
            && self.physical_bounds.width == f64::from(width)
            && self.physical_bounds.height == f64::from(height)
    }
    fn valid(&self) -> bool {
        self.scale_factor.is_finite()
            && self.scale_factor > 0.0
            && self.scale_factor <= 16.0
            && [
                self.physical_bounds.x,
                self.physical_bounds.y,
                self.physical_bounds.width,
                self.physical_bounds.height,
            ]
            .iter()
            .all(|v| v.is_finite() && *v >= 0.0 && *v <= 65536.0)
            && self.physical_bounds.width > 0.0
            && self.physical_bounds.height > 0.0
    }
}
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HostWindowOperationKind {
    PrepareTransfer,
    CloseInstance,
    TransferNavigation,
    RestoreNavigation,
    SetMainHome,
    SettleTransfer,
}
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HostWindowOutcome {
    Committed,
    Restored,
    RecoveryRequired,
    Terminated,
}
#[derive(Clone, Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HostWindowOperation {
    pub(crate) contract_version: &'static str,
    pub(crate) operation_id: String,
    pub(crate) transfer_token: String,
    pub(crate) attempt_id: String,
    pub(crate) kind: HostWindowOperationKind,
    pub(crate) from_owner: HostWindowOwner,
    pub(crate) to_owner: HostWindowOwner,
    pub(crate) shell_epoch: String,
    pub(crate) outcome: Option<HostWindowOutcome>,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HostWindowErrorCode {
    InvalidRequest,
    Unavailable,
    Stale,
    Busy,
    Timeout,
    Rejected,
}
#[derive(Clone, Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HostWindowError {
    pub(crate) contract_version: &'static str,
    pub(crate) code: HostWindowErrorCode,
    pub(crate) message: &'static str,
}
impl HostWindowError {
    fn new(code: HostWindowErrorCode) -> Self {
        Self {
            contract_version: HOST_WINDOW_VERSION,
            code,
            message: "Host window operation is unavailable.",
        }
    }
}
type HostResult<T> = Result<T, HostWindowError>;

pub(crate) struct ActualHostSource {
    pub(crate) webview_label: String,
    pub(crate) window_label: String,
    pub(crate) document_url: String,
}
#[cfg(test)]
pub(crate) trait HostWindowEmitter: Send + Sync {
    fn emit(&self, host_label: &str, event: &str, payload: Value) -> Result<(), ()>;
}
pub(crate) trait HostWindowControl: Send + Sync {
    fn close_attempt(&self, attempt: PluginChildWebviewAttempt) -> Result<(), ()>;
    fn replace_attempt(
        &self,
        attempt: PluginChildWebviewAttempt,
        owner: PluginChildWebviewOwner,
    ) -> Result<(), ()>;
    fn prepare_page(
        &self,
        shell_epoch: &str,
        identity: &crate::plugin_child_webview_presentation::PluginChildWebviewPresentationIdentity,
    ) -> Result<(), ()>;
    fn shell_lost(&self, shell_epoch: &str, attempt: PluginChildWebviewAttempt);
    fn main_lost(&self, shell_epochs: Vec<String>);
}
struct HostSubscription {
    id: String,
    channel_key: String,
    channel: Channel<Value>,
}
struct ShellRecord {
    snapshot: HostWindowSnapshot,
    original_binding: HostWindowBinding,
    geometry: Option<HostWindowGeometry>,
    slot_revision: u64,
    loaded: bool,
    subscribed: bool,
    accepting: bool,
    subscription: Option<HostSubscription>,
    publication_attempt: Option<String>,
    transfer: PluginChildWebviewOwnershipTransfer,
}
struct OperationRecord {
    operation: HostWindowOperation,
    deadline: Instant,
    guard: Option<NativeExecutionGuard>,
    acknowledged: Option<bool>,
    geometry: Option<HostWindowGeometry>,
}
#[derive(Default)]
struct BrokerState {
    next_shell: u64,
    next_operation: u64,
    next_subscription: u64,
    main_subscription: Option<HostSubscription>,
    issued_shells: BTreeMap<String, String>,
    retired_snapshots: BTreeMap<String, HostWindowSnapshot>,
    cancelled_channels: BTreeMap<String, BTreeSet<String>>,
    shells: BTreeMap<String, ShellRecord>,
    used_labels: BTreeSet<String>,
    operations: BTreeMap<u64, OperationRecord>,
    main_page: Option<(PluginChildWebviewOwner, HostWindowPage, HostWindowBinding)>,
    preferences: HostWindowPreferences,
    main_loaded: bool,
    main_interaction_blocked: Option<bool>,
}
pub(crate) struct PluginDetachedWindowHost {
    state: Mutex<BrokerState>,
    changed: Condvar,
    policy: FrameAwareNavigationPolicy,
    #[cfg(test)]
    emitter: Mutex<Option<Arc<dyn HostWindowEmitter>>>,
    control: Mutex<Option<Arc<dyn HostWindowControl>>>,
}
impl PluginDetachedWindowHost {
    pub(crate) fn new(target: &TrustedAppTarget) -> Self {
        Self {
            state: Mutex::new(BrokerState::default()),
            changed: Condvar::new(),
            policy: FrameAwareNavigationPolicy::new(target.document_url())
                .expect("trusted target was validated"),
            #[cfg(test)]
            emitter: Mutex::new(None),
            control: Mutex::new(None),
        }
    }
    pub(crate) fn attach_control(&self, control: Arc<dyn HostWindowControl>) -> bool {
        let mut slot = self.control.lock().unwrap_or_else(|e| e.into_inner());
        if slot.is_some() {
            false
        } else {
            *slot = Some(control);
            true
        }
    }
    #[cfg(test)]
    pub(crate) fn attach_emitter(&self, emitter: Arc<dyn HostWindowEmitter>) -> bool {
        let mut slot = self.emitter.lock().unwrap_or_else(|e| e.into_inner());
        if slot.is_some() {
            false
        } else {
            *slot = Some(emitter);
            true
        }
    }
    fn trusted_document(&self, source: &ActualHostSource) -> bool {
        self.policy
            .decide(NavigationFrame::Main, &source.document_url)
            == NavigationDecision::Allow(NavigationAllow::MainApp)
    }
    pub(crate) fn authorize_main_webview(&self, webview: &Webview) -> bool {
        actual_source(webview).is_ok_and(|source| self.main_source(&source).is_ok())
    }
    fn main_source(&self, source: &ActualHostSource) -> HostResult<()> {
        if source.webview_label == "main"
            && source.window_label == "main"
            && self.trusted_document(source)
        {
            Ok(())
        } else {
            Err(HostWindowError::new(HostWindowErrorCode::Unavailable))
        }
    }
    fn shell<'a>(
        &self,
        state: &'a BrokerState,
        source: &ActualHostSource,
        epoch: &str,
        revision: Option<&str>,
    ) -> HostResult<&'a ShellRecord> {
        let record = state
            .shells
            .get(epoch)
            .filter(|record| {
                record.accepting
                    && record.snapshot.owner.window_label == source.webview_label
                    && source.window_label == source.webview_label
                    && revision.is_none_or(|revision| record.snapshot.revision == revision)
                    && self.trusted_document(source)
            })
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
        Ok(record)
    }
    fn shell_read<'a>(
        &self,
        state: &'a BrokerState,
        source: &ActualHostSource,
        epoch: &str,
        revision: Option<&str>,
    ) -> HostResult<&'a ShellRecord> {
        state
            .shells
            .get(epoch)
            .filter(|record| {
                (record.accepting || record.snapshot.phase == HostWindowPhase::Closing)
                    && record.snapshot.owner.window_label == source.webview_label
                    && source.window_label == source.webview_label
                    && revision.is_none_or(|revision| record.snapshot.revision == revision)
                    && self.trusted_document(source)
            })
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))
    }
    pub(crate) fn claim_shell_close(&self, epoch: &str, expected_revision: &str) -> bool {
        let snapshot = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let Some(record) = state
                .shells
                .get_mut(epoch)
                .filter(|record| record.snapshot.revision == expected_revision)
            else {
                return false;
            };
            if record.snapshot.phase == HostWindowPhase::Closing {
                return true;
            }
            let mut snapshot = record.snapshot.clone();
            snapshot.phase = HostWindowPhase::Closing;
            if bump_snapshot(&mut snapshot).is_err() {
                return false;
            }
            record.accepting = false;
            record.geometry = None;
            record.publication_attempt = None;
            record.snapshot = snapshot.clone();
            snapshot
        };
        self.changed.notify_all();
        self.emit_snapshot(&snapshot);
        true
    }
    pub(crate) fn reserve_shell(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        page: HostWindowPage,
        preferences: HostWindowPreferences,
        binding: HostWindowBinding,
    ) -> HostResult<HostWindowSnapshot> {
        if !page.valid()
            || !preferences.valid()
            || !binding.valid()
            || binding.attempt_id != transfer.attempt.opaque_id()
            || transfer.target.window_label == "main"
        {
            return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
        }
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.used_labels.contains(&transfer.target.window_label) {
            return Err(HostWindowError::new(HostWindowErrorCode::Stale));
        }
        state.next_shell = state
            .next_shell
            .checked_add(1)
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
        let epoch = format!("shell_{:016x}", state.next_shell);
        let snapshot = HostWindowSnapshot {
            contract_version: HOST_WINDOW_VERSION,
            shell_epoch: epoch.clone(),
            revision: "1".into(),
            owner: (&transfer.target).into(),
            phase: HostWindowPhase::Preparing,
            page,
            locale: preferences.locale,
            theme: preferences.theme,
            binding: None,
            error_code: None,
        };
        state
            .used_labels
            .insert(transfer.target.window_label.clone());
        state
            .issued_shells
            .insert(epoch.clone(), transfer.target.window_label.clone());
        state.shells.insert(
            epoch,
            ShellRecord {
                snapshot: snapshot.clone(),
                original_binding: binding,
                geometry: None,
                slot_revision: 0,
                loaded: false,
                subscribed: false,
                accepting: true,
                subscription: None,
                publication_attempt: Some(transfer.attempt.opaque_id()),
                transfer: transfer.clone(),
            },
        );
        Ok(snapshot)
    }
    pub(crate) fn main_page_for_attempt(
        &self,
        attempt: PluginChildWebviewAttempt,
    ) -> HostResult<(HostWindowPage, HostWindowPreferences, HostWindowBinding)> {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let (_, page, binding) = state
            .main_page
            .as_ref()
            .filter(|(_, _, binding)| binding.attempt_id == attempt.opaque_id())
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
        Ok((page.clone(), state.preferences.clone(), binding.clone()))
    }
    pub(crate) fn snapshot(&self, epoch: &str) -> HostResult<HostWindowSnapshot> {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .shells
            .get(epoch)
            .map(|r| r.snapshot.clone())
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))
    }
    pub(crate) fn snapshot_for_window(&self, label: &str) -> HostResult<HostWindowSnapshot> {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .shells
            .values()
            .find(|r| r.snapshot.owner.window_label == label)
            .map(|r| r.snapshot.clone())
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))
    }
    pub(crate) fn shell_source_current(&self, epoch: &str) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .shells
            .get(epoch)
            .is_some_and(|record| record.accepting)
    }
    pub(crate) fn current_shell_title(&self, epoch: &str, window_label: &str) -> Option<String> {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .shells
            .get(epoch)
            .filter(|record| record.accepting && record.snapshot.owner.window_label == window_label)
            .map(|record| record.snapshot.page.title.clone())
    }
    pub(crate) fn registered_owner(&self, epoch: &str) -> HostResult<PluginChildWebviewOwner> {
        self.snapshot(epoch)?
            .owner
            .native()
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))
    }
    pub(crate) fn wait_shell_ready(
        &self,
        epoch: &str,
        guard: &NativeExecutionGuard,
        timeout: Duration,
    ) -> HostResult<HostWindowGeometry> {
        let deadline = Instant::now() + timeout.min(OPERATION_DEADLINE);
        loop {
            if !guard.is_current() {
                return Err(HostWindowError::new(HostWindowErrorCode::Stale));
            }
            let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let record = state
                .shells
                .get(epoch)
                .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
            if !record.accepting {
                return Err(HostWindowError::new(HostWindowErrorCode::Stale));
            }
            if let Some(geometry) = record.geometry {
                return Ok(geometry);
            }
            let remaining = deadline
                .checked_duration_since(Instant::now())
                .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Timeout))?;
            let (state, _) = self
                .changed
                .wait_timeout(state, remaining.min(Duration::from_millis(25)))
                .unwrap_or_else(|e| e.into_inner());
            drop(state);
        }
    }
    pub(crate) fn publish_shell(
        &self,
        epoch: &str,
        expected_revision: &str,
        owner: &PluginChildWebviewOwner,
        phase: HostWindowPhase,
        page: HostWindowPage,
        binding: Option<HostWindowBinding>,
        error: Option<HostWindowFailure>,
    ) -> HostResult<HostWindowSnapshot> {
        if !page.valid()
            || !owner.is_valid()
            || binding.as_ref().is_some_and(|binding| !binding.valid())
        {
            return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
        }
        let snapshot = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let record = state
                .shells
                .get_mut(epoch)
                .filter(|r| {
                    r.accepting
                        && r.snapshot.owner.window_label == owner.window_label
                        && r.snapshot.revision == expected_revision
                })
                .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
            if binding.as_ref().is_none_or(|binding| {
                record.publication_attempt.as_deref() != Some(binding.attempt_id.as_str())
            }) {
                record.publication_attempt = None;
            }
            record.snapshot.owner = owner.into();
            record.snapshot.phase = phase;
            record.snapshot.page = page;
            record.snapshot.binding = binding.clone();
            if let Some(binding) = binding {
                record.original_binding = binding;
            }
            record.snapshot.error_code = error;
            bump_snapshot(&mut record.snapshot)?;
            record.snapshot.clone()
        };
        self.emit_snapshot(&snapshot);
        Ok(snapshot)
    }
    pub(crate) fn unregister_shell(&self, epoch: &str) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let record = state.shells.remove(epoch);
        if let Some(record) = &record {
            if record.transfer.publication_receipt.read().is_none() {
                let mut snapshot = record.snapshot.clone();
                snapshot.phase = HostWindowPhase::Closing;
                snapshot.binding = None;
                state.retired_snapshots.insert(epoch.into(), snapshot);
            }
        }
        state.operations.retain(|_, op| {
            op.operation.shell_epoch != epoch
                || matches!(
                    op.operation.kind,
                    HostWindowOperationKind::SettleTransfer
                        | HostWindowOperationKind::CloseInstance
                )
        });
        drop(state);
        let removed = record.is_some();
        drop(record);
        self.changed.notify_all();
        removed
    }
    fn snapshot_for_epoch_read(&self, epoch: &str) -> HostResult<HostWindowSnapshot> {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state
            .shells
            .get(epoch)
            .map(|record| record.snapshot.clone())
            .or_else(|| state.retired_snapshots.get(epoch).cloned())
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))
    }
    fn emit_snapshot(&self, snapshot: &HostWindowSnapshot) {
        // A delayed preference/metadata batch cannot target a newer Page intent
        // or a shell whose source was invalidated after the batch was captured.
        let current = self
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .shells
            .get(&snapshot.shell_epoch)
            .is_some_and(|record| {
                record.snapshot.revision == snapshot.revision
                    && record.snapshot.owner == snapshot.owner
                    && (record.accepting || snapshot.phase == HostWindowPhase::Closing)
            });
        if !current {
            return;
        }
        self.emit(
            &snapshot.owner.window_label,
            HOST_WINDOW_SNAPSHOT_EVENT,
            serde_json::to_value(snapshot).expect("typed snapshot serializes"),
        );
    }
    fn emit(&self, label: &str, event: &str, payload: Value) {
        let channel = {
            let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if label == "main" && event == HOST_WINDOW_OPERATION_EVENT {
                state
                    .main_subscription
                    .as_ref()
                    .map(|subscription| subscription.channel.clone())
            } else if event == HOST_WINDOW_SNAPSHOT_EVENT {
                state
                    .shells
                    .values()
                    .find(|record| record.snapshot.owner.window_label == label)
                    .and_then(|record| record.subscription.as_ref())
                    .map(|subscription| subscription.channel.clone())
            } else {
                None
            }
        };
        if let Some(channel) = channel {
            let _ = channel.send(payload.clone());
        }
        #[cfg(test)]
        if let Some(observer) = self
            .emitter
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            let _ = observer.emit(label, event, payload);
        }
    }
    fn new_operation(
        &self,
        kind: HostWindowOperationKind,
        transfer: &PluginChildWebviewOwnershipTransfer,
        epoch: &str,
        to_owner: &PluginChildWebviewOwner,
        outcome: Option<HostWindowOutcome>,
        guard: Option<NativeExecutionGuard>,
        timeout: Duration,
    ) -> HostResult<(u64, HostWindowOperation)> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        prune_operations(&mut state);
        if !matches!(
            kind,
            HostWindowOperationKind::SettleTransfer | HostWindowOperationKind::CloseInstance
        ) && state
            .operations
            .values()
            .filter(|op| op.acknowledged.is_none())
            .count()
            >= MAX_PENDING_OPERATIONS
        {
            return Err(HostWindowError::new(HostWindowErrorCode::Busy));
        }
        if !matches!(
            kind,
            HostWindowOperationKind::SettleTransfer | HostWindowOperationKind::CloseInstance
        ) && !state.shells.contains_key(epoch)
        {
            return Err(HostWindowError::new(HostWindowErrorCode::Stale));
        }
        state.next_operation = state
            .next_operation
            .checked_add(1)
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
        let id = state.next_operation;
        let operation = HostWindowOperation {
            contract_version: HOST_WINDOW_VERSION,
            operation_id: format!("window_op_{id:016x}"),
            transfer_token: transfer.token.opaque_id(),
            attempt_id: transfer.attempt.opaque_id(),
            kind,
            from_owner: if kind == HostWindowOperationKind::RestoreNavigation {
                (&transfer.target).into()
            } else {
                (&transfer.source).into()
            },
            to_owner: to_owner.into(),
            shell_epoch: epoch.into(),
            outcome,
        };
        state.operations.insert(
            id,
            OperationRecord {
                operation: operation.clone(),
                deadline: Instant::now() + timeout.min(OPERATION_DEADLINE),
                guard,
                acknowledged: None,
                geometry: None,
            },
        );
        Ok((id, operation))
    }
    pub(crate) fn dispatch_main_operation(
        &self,
        kind: HostWindowOperationKind,
        transfer: &PluginChildWebviewOwnershipTransfer,
        epoch: &str,
        to_owner: &PluginChildWebviewOwner,
        guard: &NativeExecutionGuard,
        timeout: Duration,
    ) -> HostResult<Option<HostWindowGeometry>> {
        if !guard.is_current() {
            return Err(HostWindowError::new(HostWindowErrorCode::Stale));
        }
        let (id, operation) = self.new_operation(
            kind,
            transfer,
            epoch,
            to_owner,
            None,
            Some(guard.clone()),
            timeout,
        )?;
        self.emit(
            "main",
            HOST_WINDOW_OPERATION_EVENT,
            serde_json::to_value(operation).expect("typed operation serializes"),
        );
        loop {
            if !guard.is_current() {
                return Err(HostWindowError::new(HostWindowErrorCode::Stale));
            }
            let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let op = state
                .operations
                .get(&id)
                .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
            if let Some(accepted) = op.acknowledged {
                return if accepted {
                    Ok(op.geometry)
                } else {
                    Err(HostWindowError::new(HostWindowErrorCode::Rejected))
                };
            }
            let remaining = op
                .deadline
                .checked_duration_since(Instant::now())
                .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Timeout))?;
            let (state, _) = self
                .changed
                .wait_timeout(state, remaining.min(Duration::from_millis(25)))
                .unwrap_or_else(|e| e.into_inner());
            drop(state);
        }
    }
    /// Store final state before best-effort notification. Replaying operations or
    /// subscribing the shell recovers a lost event without republishing ownership.
    pub(crate) fn publish_settled(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        epoch: &str,
        owner: &PluginChildWebviewOwner,
        outcome: HostWindowOutcome,
    ) {
        let snapshot = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if state
                .main_page
                .as_ref()
                .is_some_and(|(_, _, binding)| binding.attempt_id == transfer.attempt.opaque_id())
            {
                if outcome == HostWindowOutcome::Committed {
                    state.main_page = None;
                } else if outcome == HostWindowOutcome::Restored {
                    if let Some((main_owner, _, _)) = state.main_page.as_mut() {
                        *main_owner = owner.clone();
                    }
                }
            }
            if let Some(record) = state.shells.get_mut(epoch).filter(|record| {
                record.publication_attempt.as_deref() == Some(transfer.attempt.opaque_id().as_str())
                    && record.transfer.token == transfer.token
            }) {
                record.snapshot.phase = match outcome {
                    HostWindowOutcome::Committed => HostWindowPhase::Active,
                    HostWindowOutcome::RecoveryRequired => HostWindowPhase::RecoveryRequired,
                    _ => HostWindowPhase::Closing,
                };
                if outcome == HostWindowOutcome::Committed {
                    record.snapshot.owner = owner.into();
                    record.snapshot.binding = Some(record.original_binding.clone());
                }
                record.snapshot.error_code = (outcome == HostWindowOutcome::RecoveryRequired)
                    .then_some(HostWindowFailure::RecoveryRequired);
                let _ = bump_snapshot(&mut record.snapshot);
                Some(record.snapshot.clone())
            } else {
                if outcome == HostWindowOutcome::RecoveryRequired {
                    if let Some(snapshot) = state.retired_snapshots.get_mut(epoch) {
                        snapshot.phase = HostWindowPhase::RecoveryRequired;
                        snapshot.error_code = Some(HostWindowFailure::RecoveryRequired);
                    }
                } else {
                    state.retired_snapshots.remove(epoch);
                }
                None
            }
        };
        if let Some(snapshot) = snapshot {
            self.emit_snapshot(&snapshot);
        }
        if let Ok((_, operation)) = self.new_operation(
            HostWindowOperationKind::SettleTransfer,
            transfer,
            epoch,
            owner,
            Some(outcome),
            None,
            OPERATION_DEADLINE,
        ) {
            self.emit(
                "main",
                HOST_WINDOW_OPERATION_EVENT,
                serde_json::to_value(operation).expect("typed operation serializes"),
            );
        }
    }
    pub(crate) fn main_interaction_blocked(&self) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .main_interaction_blocked
            .unwrap_or(true)
    }
    pub(crate) fn close_subscriptions(&self) {
        let (main, shells) = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let main = state.main_subscription.take();
            let shells = state
                .shells
                .values_mut()
                .filter_map(|record| {
                    record.subscribed = false;
                    record.accepting = false;
                    record.subscription.take()
                })
                .collect::<Vec<_>>();
            (main, shells)
        };
        drop(main);
        drop(shells);
        self.changed.notify_all();
    }
    pub(crate) fn note_host_load(&self, label: &str) {
        let (action, subscriptions) = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let mut subscriptions = Vec::new();
            let action = if label == "main" {
                state.main_loaded = true;
                state.main_page = None;
                subscriptions.extend(state.main_subscription.take());
                state.cancelled_channels.remove("main");
                for record in state.shells.values_mut() {
                    record.accepting = false;
                    record.geometry = None;
                    record.subscribed = false;
                    subscriptions.extend(record.subscription.take());
                }
                state.main_interaction_blocked = Some(true);
                state.operations.clear();
                Some((None, None, state.shells.keys().cloned().collect::<Vec<_>>()))
            } else {
                state
                    .shells
                    .iter_mut()
                    .find(|(_, r)| r.snapshot.owner.window_label == label)
                    .and_then(|(epoch, record)| {
                        if !record.loaded {
                            record.loaded = true;
                            None
                        } else {
                            record.accepting = false;
                            record.geometry = None;
                            record.subscribed = false;
                            subscriptions.extend(record.subscription.take());
                            Some((
                                Some(epoch.clone()),
                                PluginChildWebviewAttempt::from_opaque_id(
                                    &record.original_binding.attempt_id,
                                ),
                                Vec::new(),
                            ))
                        }
                    })
            };
            (action, subscriptions)
        };
        drop(subscriptions);
        self.changed.notify_all();
        if let Some((epoch, attempt, old_epochs)) = action {
            if let Some(control) = self
                .control
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
            {
                std::thread::spawn(move || {
                    if let (Some(epoch), Some(attempt)) = (epoch, attempt) {
                        control.shell_lost(&epoch, attempt)
                    } else {
                        control.main_lost(old_epochs)
                    }
                });
            }
        }
    }
    pub(crate) fn publish_instance_closed(
        &self,
        epoch: &str,
        attempt: PluginChildWebviewAttempt,
        owner: &PluginChildWebviewOwner,
    ) {
        let transfer = self
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .shells
            .get(epoch)
            .map(|record| record.transfer.clone());
        if let Some(transfer) = transfer {
            if let Ok((id, mut operation)) = self.new_operation(
                HostWindowOperationKind::CloseInstance,
                &transfer,
                epoch,
                owner,
                Some(HostWindowOutcome::Terminated),
                None,
                OPERATION_DEADLINE,
            ) {
                operation.attempt_id = attempt.opaque_id();
                operation.from_owner = owner.into();
                if let Some(record) = self
                    .state
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .operations
                    .get_mut(&id)
                {
                    record.operation = operation.clone();
                }
                self.emit(
                    "main",
                    HOST_WINDOW_OPERATION_EVENT,
                    serde_json::to_value(operation).expect("typed close serializes"),
                );
            }
        }
    }
}

fn valid_local_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'_' | b'-'))
}
fn valid_plugin_id(value: &str) -> bool {
    value.len() <= 255 && value.split('.').count() >= 2 && value.split('.').all(valid_local_id)
}

fn positive_revision(value: &str) -> Option<u64> {
    if value.is_empty()
        || value.len() > 20
        || value.starts_with('0')
        || !value.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    value.parse().ok().filter(|v| *v > 0)
}
fn bump_snapshot(snapshot: &mut HostWindowSnapshot) -> HostResult<()> {
    snapshot.revision = positive_revision(&snapshot.revision)
        .and_then(|v| v.checked_add(1))
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?
        .to_string();
    Ok(())
}
fn prune_operations(state: &mut BrokerState) {
    let now = Instant::now();
    state.operations.retain(|_, op| {
        op.acknowledged.is_some()
            || matches!(
                op.operation.kind,
                HostWindowOperationKind::SettleTransfer | HostWindowOperationKind::CloseInstance
            )
            || now < op.deadline
    });
    while state.operations.len() > MAX_PENDING_OPERATIONS + MAX_ACKNOWLEDGED_OPERATIONS {
        let Some(id) = state
            .operations
            .iter()
            .find(|(_, op)| op.acknowledged.is_some())
            .map(|(id, _)| *id)
        else {
            break;
        };
        state.operations.remove(&id);
    }
}
fn version(value: &str) -> HostResult<()> {
    if value == HOST_WINDOW_VERSION {
        Ok(())
    } else {
        Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest))
    }
}
fn actual_source(webview: &Webview) -> HostResult<ActualHostSource> {
    Ok(ActualHostSource {
        webview_label: webview.label().into(),
        window_label: webview.window().label().into(),
        document_url: webview
            .url()
            .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?
            .to_string(),
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyRequest {}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct VersionRequest {
    contract_version: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EpochRequest {
    contract_version: String,
    shell_epoch: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SnapshotRequest {
    contract_version: String,
    window_label: Option<String>,
    shell_epoch: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SubscriptionRequest {
    contract_version: String,
    shell_epoch: String,
    channel_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OperationSubscriptionRequest {
    contract_version: String,
    channel_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReleaseSubscriptionRequest {
    contract_version: String,
    #[serde(deserialize_with = "required_nullable")]
    shell_epoch: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    subscription_id: Option<String>,
    channel_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GeometryRequest {
    contract_version: String,
    shell_epoch: String,
    snapshot_revision: String,
    scale_factor: f64,
    physical_bounds: HostWindowBounds,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SlotRequest {
    contract_version: String,
    shell_epoch: String,
    snapshot_revision: String,
    presentation_revision: String,
    scale_factor: f64,
    physical_bounds: HostWindowBounds,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AttemptRequest {
    contract_version: String,
    attempt_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReplaceAttemptRequest {
    contract_version: String,
    attempt_id: String,
    owner: HostWindowOwner,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AckRequest {
    contract_version: String,
    operation_id: String,
    transfer_token: String,
    accepted: bool,
    #[serde(deserialize_with = "required_nullable")]
    geometry: Option<HostWindowGeometry>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PreferencesRequest {
    contract_version: String,
    locale: String,
    theme: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct InteractionRequest {
    contract_version: String,
    overlay_open: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MainPageRequest {
    contract_version: String,
    attempt_id: String,
    owner: HostWindowOwner,
    page: HostWindowPage,
    binding: HostWindowBinding,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ShellPageRequest {
    contract_version: String,
    shell_epoch: String,
    owner: HostWindowOwner,
    page: HostWindowPage,
    #[serde(deserialize_with = "required_nullable")]
    binding: Option<HostWindowBinding>,
    phase: HostWindowPhase,
    #[serde(deserialize_with = "required_nullable")]
    error_code: Option<HostWindowFailure>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CoordinateRequest {
    contract_version: String,
    shell_epoch: String,
    operation: String,
    request: Value,
}
fn required_nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}
fn parse_request<T: serde::de::DeserializeOwned>(value: Value) -> HostResult<T> {
    if value.to_string().len() > 32 * 1024 {
        return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
    }
    serde_json::from_value(value)
        .map_err(|_| HostWindowError::new(HostWindowErrorCode::InvalidRequest))
}
fn accepted() -> Value {
    json!({"contract_version":HOST_WINDOW_VERSION,"accepted":true})
}
fn wrapped(snapshot: HostWindowSnapshot) -> Value {
    json!({"contract_version":HOST_WINDOW_VERSION,"snapshot":snapshot})
}
fn parse_attempt(value: &str) -> HostResult<PluginChildWebviewAttempt> {
    PluginChildWebviewAttempt::from_opaque_id(value)
        .filter(|attempt| attempt.opaque_id() != "attempt_0000000000000000")
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::InvalidRequest))
}

impl PluginDetachedWindowHost {
    fn subscribe_channel(
        &self,
        source: &ActualHostSource,
        epoch: &str,
        channel_key: String,
        create: impl FnOnce() -> Channel<Value>,
    ) -> HostResult<(String, HostWindowSnapshot)> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        self.shell_read(&state, source, epoch, None)?;
        if let Some(subscription) = state
            .shells
            .get(epoch)
            .and_then(|record| record.subscription.as_ref())
            .filter(|subscription| subscription.channel_key == channel_key)
        {
            return Ok((
                subscription.id.clone(),
                state.shells[epoch].snapshot.clone(),
            ));
        }
        reject_cancelled_channel(&state, epoch, &channel_key)?;
        let id = next_subscription(&mut state)?;
        let record = state.shells.get_mut(epoch).expect("validated shell");
        record.subscribed = true;
        let old = record.subscription.replace(HostSubscription {
            id: id.clone(),
            channel_key,
            channel: create(),
        });
        let snapshot = record.snapshot.clone();
        if let Some(old) = &old {
            remember_channel_cancellation(&mut state, epoch, &old.channel_key);
        }
        drop(state);
        drop(old);
        Ok((id, snapshot))
    }
    fn release_registered_subscription(
        &self,
        source: &ActualHostSource,
        epoch: Option<&str>,
        id: Option<&str>,
        channel_key: &str,
    ) -> HostResult<bool> {
        let removed = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let scope = epoch.unwrap_or("main");
            if let Some(epoch) = epoch {
                if !self.trusted_document(source)
                    || source.webview_label != source.window_label
                    || state.issued_shells.get(epoch) != Some(&source.webview_label)
                {
                    return Err(HostWindowError::new(HostWindowErrorCode::Stale));
                }
            } else {
                self.main_source(source)?;
            }
            let subscription = match epoch {
                None => state.main_subscription.as_ref(),
                Some(epoch) => state
                    .shells
                    .get(epoch)
                    .and_then(|record| record.subscription.as_ref()),
            };
            let matches = subscription.is_some_and(|subscription| {
                subscription.channel_key == channel_key && id.is_none_or(|id| id == subscription.id)
            });
            let protected_successor = subscription
                .is_some_and(|subscription| subscription.channel_key == channel_key && !matches);
            if matches || id.is_none() && !protected_successor {
                remember_channel_cancellation(&mut state, scope, channel_key);
            }
            if !matches {
                None
            } else {
                match epoch {
                    None => state.main_subscription.take(),
                    Some(epoch) => state.shells.get_mut(epoch).and_then(|record| {
                        record.subscribed = false;
                        record.subscription.take()
                    }),
                }
            }
        };
        let found = removed.is_some();
        drop(removed);
        Ok(found)
    }
    pub(crate) fn refresh_shell_geometry(&self, epoch: &str) -> HostResult<HostWindowSnapshot> {
        let snapshot = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let record = state
                .shells
                .get_mut(epoch)
                .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
            record.geometry = None;
            bump_snapshot(&mut record.snapshot)?;
            record.snapshot.clone()
        };
        self.emit_snapshot(&snapshot);
        Ok(snapshot)
    }
    fn bootstrap(&self, source: &ActualHostSource) -> HostResult<Value> {
        if self.main_source(source).is_ok() {
            return Ok(json!({"contract_version":HOST_WINDOW_VERSION,"mode":"main"}));
        }
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let (epoch, _) = state
            .shells
            .iter()
            .find(|(_, record)| record.snapshot.owner.window_label == source.webview_label)
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
        let record = self.shell_read(&state, source, epoch, None)?;
        Ok(
            json!({"contract_version":HOST_WINDOW_VERSION,"mode":"detached","snapshot":record.snapshot}),
        )
    }
    #[cfg(test)]
    fn subscribe(&self, source: &ActualHostSource, epoch: &str) -> HostResult<HostWindowSnapshot> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        self.shell_read(&state, source, epoch, None)?;
        let record = state.shells.get_mut(epoch).expect("validated record");
        record.subscribed = true;
        Ok(record.snapshot.clone())
    }
    fn accept_geometry(
        &self,
        source: &ActualHostSource,
        epoch: &str,
        revision: &str,
        geometry: HostWindowGeometry,
        presentation_revision: Option<u64>,
    ) -> HostResult<HostWindowSnapshot> {
        if !geometry.valid()
            || geometry.physical_bounds.x != 0.0
            || geometry.physical_bounds.y != 0.0
        {
            return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
        }
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let record = self.shell(&state, source, epoch, Some(revision))?;
        if !record.subscribed || presentation_revision.is_some_and(|r| r <= record.slot_revision) {
            return Err(HostWindowError::new(HostWindowErrorCode::Stale));
        }
        if presentation_revision.is_none()
            && record.geometry.is_some_and(|current| current != geometry)
        {
            return Err(HostWindowError::new(HostWindowErrorCode::Stale));
        }
        let record = state.shells.get_mut(epoch).expect("validated record");
        record.geometry = Some(geometry);
        if let Some(revision) = presentation_revision {
            record.slot_revision = revision;
        }
        let snapshot = record.snapshot.clone();
        drop(state);
        self.changed.notify_all();
        Ok(snapshot)
    }
    fn read_operations(&self, source: &ActualHostSource) -> HostResult<Vec<HostWindowOperation>> {
        self.main_source(source)?;
        let pending = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            prune_operations(&mut state);
            state
                .operations
                .values()
                .filter(|record| record.acknowledged.is_none())
                .map(|record| (record.operation.clone(), record.guard.clone()))
                .collect::<Vec<_>>()
        };
        Ok(pending
            .into_iter()
            .filter(|(_, guard)| guard.as_ref().is_none_or(NativeExecutionGuard::is_current))
            .take(128)
            .map(|(operation, _)| operation)
            .collect())
    }
    fn acknowledge(&self, source: &ActualHostSource, request: AckRequest) -> HostResult<Value> {
        self.main_source(source)?;
        version(&request.contract_version)?;
        let id = request
            .operation_id
            .strip_prefix("window_op_")
            .filter(|hex| {
                hex.len() == 16
                    && hex
                        .bytes()
                        .all(|b| b.is_ascii_digit() || matches!(b, b'a'..=b'f'))
            })
            .and_then(|hex| u64::from_str_radix(hex, 16).ok())
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::InvalidRequest))?;
        let guard = {
            let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            let record = state
                .operations
                .get(&id)
                .filter(|record| record.operation.transfer_token == request.transfer_token)
                .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
            if request.geometry.is_some_and(|geometry| !geometry.valid())
                || request.accepted
                    && record.operation.kind == HostWindowOperationKind::RestoreNavigation
                    && request.geometry.is_none()
            {
                return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
            }
            if let Some(accepted) = record.acknowledged {
                return if accepted == request.accepted && record.geometry == request.geometry {
                    Ok(accepted_response(true))
                } else {
                    Err(HostWindowError::new(HostWindowErrorCode::Stale))
                };
            }
            if !matches!(
                record.operation.kind,
                HostWindowOperationKind::SettleTransfer | HostWindowOperationKind::CloseInstance
            ) && Instant::now() >= record.deadline
            {
                return Err(HostWindowError::new(HostWindowErrorCode::Timeout));
            }
            record.guard.clone()
        };
        if guard.as_ref().is_some_and(|guard| !guard.is_current()) {
            return Err(HostWindowError::new(HostWindowErrorCode::Stale));
        }
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let record = state
            .operations
            .get_mut(&id)
            .filter(|record| record.operation.transfer_token == request.transfer_token)
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
        if record.acknowledged.is_none()
            && !matches!(
                record.operation.kind,
                HostWindowOperationKind::SettleTransfer | HostWindowOperationKind::CloseInstance
            )
            && Instant::now() >= record.deadline
        {
            return Err(HostWindowError::new(HostWindowErrorCode::Timeout));
        }
        if record
            .acknowledged
            .is_some_and(|value| value != request.accepted)
        {
            return Err(HostWindowError::new(HostWindowErrorCode::Stale));
        }
        record.acknowledged = Some(request.accepted);
        record.geometry = request.geometry;
        drop(state);
        self.changed.notify_all();
        Ok(accepted_response(true))
    }
    fn publish_preferences(
        &self,
        source: &ActualHostSource,
        preferences: HostWindowPreferences,
    ) -> HostResult<()> {
        self.main_source(source)?;
        if !preferences.valid() {
            return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
        }
        let snapshots = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if state.preferences == preferences {
                return Ok(());
            }
            state.preferences = preferences.clone();
            let mut snapshots = Vec::new();
            for record in state.shells.values_mut() {
                if !record.accepting {
                    continue;
                }
                record.snapshot.locale = preferences.locale.clone();
                record.snapshot.theme = preferences.theme.clone();
                bump_snapshot(&mut record.snapshot)?;
                snapshots.push(record.snapshot.clone());
            }
            snapshots
        };
        for snapshot in snapshots {
            self.emit_snapshot(&snapshot);
        }
        Ok(())
    }
    pub(crate) fn bind_shell_attempt(
        &self,
        epoch: &str,
        binding: HostWindowBinding,
    ) -> HostResult<()> {
        if !binding.valid() {
            return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
        }
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let record = state
            .shells
            .get_mut(epoch)
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
        record.original_binding = binding;
        Ok(())
    }
}
fn accepted_response(value: bool) -> Value {
    json!({"contract_version":HOST_WINDOW_VERSION,"accepted":value})
}
fn validate_geometry_window(webview: &Webview, geometry: HostWindowGeometry) -> HostResult<()> {
    let window = webview.window();
    let scale = window
        .scale_factor()
        .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    let size = window
        .inner_size()
        .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    if !geometry.fills_detached_content(scale, size.width, size.height) {
        return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn read_host_window_bootstrap(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let _: EmptyRequest = parse_request(request)?;
    host.bootstrap(&actual_source(&webview)?)
}
#[tauri::command]
pub(crate) fn subscribe_host_window(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: SubscriptionRequest = parse_request(request)?;
    version(&request.contract_version)?;
    let source = actual_source(&webview)?;
    let channel_id = parse_channel_id(&request.channel_id)?;
    let (id, snapshot) =
        host.subscribe_channel(&source, &request.shell_epoch, request.channel_id, || {
            channel_id.channel_on(webview)
        })?;
    Ok(json!({"contract_version":HOST_WINDOW_VERSION,"subscription_id":id,"snapshot":snapshot}))
}
#[tauri::command]
pub(crate) fn subscribe_host_window_operations(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: OperationSubscriptionRequest = parse_request(request)?;
    version(&request.contract_version)?;
    let source = actual_source(&webview)?;
    host.main_source(&source)?;
    let channel_id = parse_channel_id(&request.channel_id)?;
    let (id, old) = {
        let mut state = host.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(subscription) = state
            .main_subscription
            .as_ref()
            .filter(|subscription| subscription.channel_key == request.channel_id)
        {
            (subscription.id.clone(), None)
        } else {
            reject_cancelled_channel(&state, "main", &request.channel_id)?;
            let id = next_subscription(&mut state)?;
            let old = state.main_subscription.replace(HostSubscription {
                id: id.clone(),
                channel_key: request.channel_id,
                channel: channel_id.channel_on(webview),
            });
            if let Some(old) = &old {
                remember_channel_cancellation(&mut state, "main", &old.channel_key);
            }
            (id, old)
        }
    };
    drop(old);
    Ok(
        json!({"contract_version":HOST_WINDOW_VERSION,"subscription_id":id,"operations":host.read_operations(&source)?}),
    )
}
#[tauri::command]
pub(crate) fn release_host_window_subscription(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: ReleaseSubscriptionRequest = parse_request(request)?;
    version(&request.contract_version)?;
    let source = actual_source(&webview)?;
    let channel_id = parse_channel_id(&request.channel_id)?;
    let found = host.release_registered_subscription(
        &source,
        request.shell_epoch.as_deref(),
        request.subscription_id.as_deref(),
        &request.channel_id,
    )?;
    // A rejected/lost registration may never construct a Rust Channel. Closing
    // that caller-owned unused callback is safe and never selects another view.
    if !found && request.subscription_id.is_none() {
        let active = {
            let state = host.state.lock().unwrap_or_else(|e| e.into_inner());
            state
                .main_subscription
                .as_ref()
                .is_some_and(|s| s.channel_key == request.channel_id)
                && source.webview_label == "main"
                || state
                    .shells
                    .values()
                    .filter(|r| r.snapshot.owner.window_label == source.webview_label)
                    .any(|r| {
                        r.subscription
                            .as_ref()
                            .is_some_and(|s| s.channel_key == request.channel_id)
                    })
        };
        if !active {
            let unused: Channel<Value> = channel_id.channel_on(webview);
            drop(unused);
        }
    }
    Ok(accepted_response(found))
}
#[tauri::command]
pub(crate) fn read_host_window_snapshot(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: SnapshotRequest = parse_request(request)?;
    version(&request.contract_version)?;
    let source = actual_source(&webview)?;
    let snapshot = match (
        request.window_label.as_deref(),
        request.shell_epoch.as_deref(),
    ) {
        (Some(label), None) => {
            host.main_source(&source)?;
            host.snapshot_for_window(label)?
        }
        (None, Some(epoch)) => {
            if host.main_source(&source).is_ok() {
                host.snapshot_for_epoch_read(epoch)?
            } else {
                let state = host.state.lock().unwrap_or_else(|e| e.into_inner());
                host.shell_read(&state, &source, epoch, None)?
                    .snapshot
                    .clone()
            }
        }
        _ => return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest)),
    };
    Ok(wrapped(snapshot))
}
#[tauri::command]
pub(crate) fn read_host_window_geometry(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: EpochRequest = parse_request(request)?;
    version(&request.contract_version)?;
    host.main_source(&actual_source(&webview)?)?;
    let state = host.state.lock().unwrap_or_else(|e| e.into_inner());
    let record = state
        .shells
        .get(&request.shell_epoch)
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
    let geometry = record
        .geometry
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    Ok(
        json!({"contract_version":HOST_WINDOW_VERSION,"snapshot_revision":record.snapshot.revision,"scale_factor":geometry.scale_factor,"physical_bounds":geometry.physical_bounds}),
    )
}
#[tauri::command]
pub(crate) fn ready_host_window(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: GeometryRequest = parse_request(request)?;
    version(&request.contract_version)?;
    let geometry = HostWindowGeometry {
        scale_factor: request.scale_factor,
        physical_bounds: request.physical_bounds,
    };
    let source = actual_source(&webview)?;
    {
        let state = host.state.lock().unwrap_or_else(|e| e.into_inner());
        host.shell(
            &state,
            &source,
            &request.shell_epoch,
            Some(&request.snapshot_revision),
        )?;
    }
    validate_geometry_window(&webview, geometry)?;
    host.accept_geometry(
        &source,
        &request.shell_epoch,
        &request.snapshot_revision,
        geometry,
        None,
    )?;
    Ok(accepted())
}
#[tauri::command]
pub(crate) fn update_host_window_slot(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: Value,
) -> HostResult<Value> {
    let request: SlotRequest = parse_request(request)?;
    version(&request.contract_version)?;
    let revision = positive_revision(&request.presentation_revision)
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::InvalidRequest))?;
    let geometry = HostWindowGeometry {
        scale_factor: request.scale_factor,
        physical_bounds: request.physical_bounds,
    };
    let source = actual_source(&webview)?;
    let snapshot = {
        let state = host.state.lock().unwrap_or_else(|e| e.into_inner());
        host.shell(
            &state,
            &source,
            &request.shell_epoch,
            Some(&request.snapshot_revision),
        )?
        .snapshot
        .clone()
    };
    validate_geometry_window(&webview, geometry)?;
    if snapshot.phase == HostWindowPhase::Active {
        let binding = snapshot
            .binding
            .as_ref()
            .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Stale))?;
        let result = crate::plugin_child_webview_slot::apply_slot_update(
            service.inner(),
            crate::plugin_child_webview_slot::UpdatePluginChildWebviewSlotRequest {
                contract_version:
                    crate::plugin_child_webview_slot::PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION
                        .into(),
                attempt_id: binding.attempt_id.clone(),
                window_label: snapshot.owner.window_label.clone(),
                ownership_revision: snapshot.owner.ownership_revision.clone(),
                surface_mode: crate::plugin_child_webview_slot::PluginChildWebviewSurfaceMode::Page,
                scale_factor: geometry.scale_factor,
                physical_bounds:
                    crate::plugin_child_webview_slot::PluginChildWebviewPhysicalBounds {
                        x: geometry.physical_bounds.x,
                        y: geometry.physical_bounds.y,
                        width: geometry.physical_bounds.width,
                        height: geometry.physical_bounds.height,
                    },
                presentation_revision: request.presentation_revision.clone(),
            },
            crate::plugin_child_webview_slot::SlotWindowFacts {
                scale_factor: webview
                    .window()
                    .scale_factor()
                    .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?,
                physical_width: webview
                    .window()
                    .inner_size()
                    .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?
                    .width,
                physical_height: webview
                    .window()
                    .inner_size()
                    .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?
                    .height,
            },
            &source.webview_label,
            &source.window_label,
        );
        result.map_err(|_| HostWindowError::new(HostWindowErrorCode::Stale))?;
    } else if snapshot.phase != HostWindowPhase::Preparing {
        return Err(HostWindowError::new(HostWindowErrorCode::Unavailable));
    }
    host.accept_geometry(
        &source,
        &request.shell_epoch,
        &request.snapshot_revision,
        geometry,
        Some(revision),
    )?;
    Ok(accepted())
}
#[tauri::command]
pub(crate) fn read_host_window_operations(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: VersionRequest = parse_request(request)?;
    version(&request.contract_version)?;
    Ok(
        json!({"contract_version":HOST_WINDOW_VERSION,"operations":host.read_operations(&actual_source(&webview)?)?}),
    )
}
#[tauri::command]
pub(crate) fn ack_host_window_operation(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    host.acknowledge(&actual_source(&webview)?, parse_request(request)?)
}
#[tauri::command]
pub(crate) fn publish_host_window_preferences(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: PreferencesRequest = parse_request(request)?;
    version(&request.contract_version)?;
    host.publish_preferences(
        &actual_source(&webview)?,
        HostWindowPreferences {
            locale: request.locale,
            theme: request.theme,
        },
    )?;
    Ok(accepted())
}
#[tauri::command]
pub(crate) fn publish_main_host_interaction(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: InteractionRequest = parse_request(request)?;
    version(&request.contract_version)?;
    host.main_source(&actual_source(&webview)?)?;
    host.state
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .main_interaction_blocked = Some(request.overlay_open);
    Ok(accepted())
}
#[tauri::command]
pub(crate) fn publish_main_host_page(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: Value,
) -> HostResult<Value> {
    let request: MainPageRequest = parse_request(request)?;
    version(&request.contract_version)?;
    host.main_source(&actual_source(&webview)?)?;
    let owner = request
        .owner
        .native()
        .filter(|owner| owner.window_label == "main")
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::InvalidRequest))?;
    if request.attempt_id != request.binding.attempt_id
        || !valid_binding(&service, &owner, &request.page, &request.binding)
    {
        return Err(HostWindowError::new(HostWindowErrorCode::Stale));
    }
    host.state
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .main_page = Some((owner, request.page, request.binding));
    Ok(accepted())
}
#[tauri::command]
pub(crate) fn publish_host_window_page(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: Value,
) -> HostResult<Value> {
    let request: ShellPageRequest = parse_request(request)?;
    version(&request.contract_version)?;
    host.main_source(&actual_source(&webview)?)?;
    let expected = host.snapshot(&request.shell_epoch)?;
    let owner = request
        .owner
        .native()
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::InvalidRequest))?;
    if owner.window_label != expected.owner.window_label
        || request
            .binding
            .as_ref()
            .is_some_and(|binding| !valid_binding(&service, &owner, &request.page, binding))
        || request.binding.is_none()
            && (request.phase != HostWindowPhase::Preparing
                || !service.surface_available_for_creation(&owner.window_label))
    {
        return Err(HostWindowError::new(HostWindowErrorCode::Stale));
    }
    let snapshot = host.publish_shell(
        &request.shell_epoch,
        &expected.revision,
        &owner,
        request.phase,
        request.page,
        request.binding,
        request.error_code,
    )?;
    #[cfg(target_os = "macos")]
    if snapshot.page.title != expected.page.title {
        crate::plugin_detached_window_native::refresh_detached_window_title(
            webview.app_handle(),
            host.inner(),
            &snapshot,
        );
    }
    Ok(wrapped(snapshot))
}
#[tauri::command]
pub(crate) async fn wait_host_instance_owner(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: Value,
) -> HostResult<Value> {
    let request: AttemptRequest = parse_request(request)?;
    version(&request.contract_version)?;
    host.main_source(&actual_source(&webview)?)?;
    let attempt = parse_attempt(&request.attempt_id)?;
    let service = service.inner().clone();
    let owner = tauri::async_runtime::spawn_blocking(move || {
        service.wait_for_stable_owner(attempt, OPERATION_DEADLINE)
    })
    .await
    .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?
    .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    Ok(
        json!({"contract_version":HOST_WINDOW_VERSION,"status":"stable","owner":HostWindowOwner::from(&owner)}),
    )
}
#[tauri::command]
pub(crate) async fn close_host_instance(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: AttemptRequest = parse_request(request)?;
    version(&request.contract_version)?;
    host.main_source(&actual_source(&webview)?)?;
    let attempt = parse_attempt(&request.attempt_id)?;
    let control = host
        .control
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    tauri::async_runtime::spawn_blocking(move || control.close_attempt(attempt))
        .await
        .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?
        .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    Ok(accepted())
}
#[tauri::command]
pub(crate) async fn replace_host_instance(
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    request: Value,
) -> HostResult<Value> {
    let request: ReplaceAttemptRequest = parse_request(request)?;
    version(&request.contract_version)?;
    host.main_source(&actual_source(&webview)?)?;
    let attempt = parse_attempt(&request.attempt_id)?;
    let owner = request
        .owner
        .native()
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::InvalidRequest))?;
    let control = host
        .control
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    tauri::async_runtime::spawn_blocking(move || control.replace_attempt(attempt, owner))
        .await
        .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?
        .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    Ok(accepted())
}

fn valid_binding(
    service: &PluginChildWebviewService<Wry>,
    owner: &PluginChildWebviewOwner,
    page: &HostWindowPage,
    binding: &HostWindowBinding,
) -> bool {
    page.valid()
        && binding.valid()
        && parse_attempt(&binding.attempt_id)
            .ok()
            .is_some_and(|attempt| {
                service.matches_presentation_identity(
                    attempt,
                    owner,
                    &page.owner_id,
                    &page.page_id,
                    &binding.entry_url,
                    &binding.resource_generation,
                )
            })
}

pub(crate) fn setup_plugin_detached_window_host(
    app: &AppHandle,
    target: &TrustedAppTarget,
) -> Arc<PluginDetachedWindowHost> {
    let host = Arc::new(PluginDetachedWindowHost::new(target));
    assert!(
        app.manage(host.clone()),
        "Host window broker must be installed once"
    );
    host
}
fn parse_channel_id(value: &str) -> HostResult<JavaScriptChannelId> {
    let number = value
        .strip_prefix("__CHANNEL__:")
        .and_then(|value| value.parse::<u32>().ok())
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::InvalidRequest))?;
    if value != format!("__CHANNEL__:{number}") {
        return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
    }
    value
        .parse()
        .map_err(|_| HostWindowError::new(HostWindowErrorCode::InvalidRequest))
}
fn reject_cancelled_channel(state: &BrokerState, scope: &str, key: &str) -> HostResult<()> {
    if state
        .cancelled_channels
        .get(scope)
        .is_some_and(|keys| keys.contains(key) || keys.len() >= 256)
    {
        Err(HostWindowError::new(HostWindowErrorCode::Stale))
    } else {
        Ok(())
    }
}
fn remember_channel_cancellation(state: &mut BrokerState, scope: &str, key: &str) {
    let keys = state.cancelled_channels.entry(scope.into()).or_default();
    // At the bound the scope refuses new subscriptions rather than evicting a
    // tombstone and permitting a delayed cancelled registration to resurrect.
    if keys.len() < 256 {
        keys.insert(key.into());
    }
}
fn next_subscription(state: &mut BrokerState) -> HostResult<String> {
    state.next_subscription = state
        .next_subscription
        .checked_add(1)
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    Ok(format!("subscription_{:016x}", state.next_subscription))
}

#[tauri::command]
pub(crate) async fn coordinate_plugin_child_webview(
    app: AppHandle,
    webview: Webview,
    host: State<'_, Arc<PluginDetachedWindowHost>>,
    manager: State<'_, Arc<crate::plugin_manager::PluginManager>>,
    resources: State<'_, Arc<crate::plugin_resource_service::PluginResourceService>>,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: Value,
) -> HostResult<Value> {
    let request: CoordinateRequest = parse_request(request)?;
    version(&request.contract_version)?;
    host.main_source(&actual_source(&webview)?)?;
    let host = host.inner().clone();
    let manager = manager.inner().clone();
    let resources = resources.inner().clone();
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        coordinate_inner(&app, &host, &manager, &resources, &service, request)
    })
    .await
    .map_err(|_| HostWindowError::new(HostWindowErrorCode::Unavailable))?
}
fn coordinate_inner(
    app: &AppHandle,
    host: &Arc<PluginDetachedWindowHost>,
    manager: &Arc<crate::plugin_manager::PluginManager>,
    resources: &Arc<crate::plugin_resource_service::PluginResourceService>,
    service: &Arc<PluginChildWebviewService<Wry>>,
    mut envelope: CoordinateRequest,
) -> HostResult<Value> {
    let snapshot = host.snapshot(&envelope.shell_epoch)?;
    let window_label = snapshot.owner.window_label.clone();
    let target = app
        .get_webview(&window_label)
        .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::Unavailable))?;
    let source = actual_source(&target)?;
    {
        let state = host.state.lock().unwrap_or_else(|e| e.into_inner());
        host.shell(&state, &source, &envelope.shell_epoch, None)?;
    }
    let owner = HostWindowOwner {
        window_label: envelope
            .request
            .get("window_label")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        ownership_revision: envelope
            .request
            .get("ownership_revision")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
    }
    .native()
    .filter(|owner| owner.window_label == window_label)
    .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::InvalidRequest))?;
    let terminal_cleanup = service
        .snapshot_for_surface(&window_label)
        .filter(|current| {
            matches!(
                current.session_state,
                PluginChildWebviewSessionState::Disposed
                    | PluginChildWebviewSessionState::Disconnected
            ) && host
                .state
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .shells
                .get(&envelope.shell_epoch)
                .is_some_and(|record| {
                    record.original_binding.attempt_id == current.attempt.opaque_id()
                })
        });
    if owner != snapshot.owner.native().expect("stored owner")
        && !(envelope.operation == "create"
            && owner.revision == 1
            && (service.surface_available_for_creation(&window_label)
                || terminal_cleanup.is_some()))
    {
        return Err(HostWindowError::new(HostWindowErrorCode::Stale));
    }
    let unavailable = || HostWindowError::new(HostWindowErrorCode::Unavailable);
    match envelope.operation.as_str() {
        "admission" => {
            let request = parse_request(envelope.request)?;
            serde_json::to_value(crate::plugin_child_webview_presentation::read_plugin_child_webview_admission_inner(manager,&source.webview_label,&source.window_label,request).map_err(|_|unavailable())?).map_err(|_|unavailable())
        }
        "create" => {
            if let Some(old) = terminal_cleanup {
                service
                    .compare_current_teardown(old.attempt)
                    .map_err(|_| unavailable())?;
            }
            if owner.revision != 1 || !service.surface_available_for_creation(&window_label) {
                return Err(HostWindowError::new(HostWindowErrorCode::Busy));
            }
            let identity:crate::plugin_child_webview_presentation::PluginChildWebviewPresentationIdentity=parse_request(envelope.request.get("identity").cloned().ok_or_else(unavailable)?)?;
            {
                let mut state = host.state.lock().unwrap_or_else(|e| e.into_inner());
                let record = state
                    .shells
                    .get_mut(&envelope.shell_epoch)
                    .ok_or_else(unavailable)?;
                record.publication_attempt = None;
                record.snapshot.owner = (&owner).into();
                record.snapshot.binding = None;
                record.snapshot.phase = HostWindowPhase::Preparing;
                record.geometry = None;
                record.slot_revision = 0;
                bump_snapshot(&mut record.snapshot)?;
                let snapshot = record.snapshot.clone();
                drop(state);
                host.emit_snapshot(&snapshot);
            }
            let control = host
                .control
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
                .ok_or_else(unavailable)?;
            control
                .prepare_page(&envelope.shell_epoch, &identity)
                .map_err(|_| unavailable())?;
            // The preparation callback applies native size first; publish a fresh
            // revision only afterwards so the trusted DOM can measure that size.
            host.refresh_shell_geometry(&envelope.shell_epoch)?;
            let weak = Arc::downgrade(host);
            let epoch = envelope.shell_epoch.clone();
            let expected_owner = owner.clone();
            let guard = NativeExecutionGuard::new(move || {
                weak.upgrade().is_some_and(|host| {
                    host.shell_source_current(&epoch)
                        && host
                            .registered_owner(&epoch)
                            .is_ok_and(|owner| owner == expected_owner)
                })
            });
            let geometry =
                host.wait_shell_ready(&envelope.shell_epoch, &guard, OPERATION_DEADLINE)?;
            let object = envelope
                .request
                .as_object_mut()
                .ok_or_else(|| HostWindowError::new(HostWindowErrorCode::InvalidRequest))?;
            object.insert("scale_factor".into(), json!(geometry.scale_factor));
            object.insert(
                "physical_bounds".into(),
                serde_json::to_value(geometry.physical_bounds).expect("geometry serializes"),
            );
            object.insert("presentation_revision".into(), json!("1"));
            let request = parse_request(envelope.request)?;
            let result=crate::plugin_child_webview_presentation::create_plugin_child_webview_presentation_inner(app,&source.webview_label,&source.window_label,manager,resources,service,request,Some(guard.clone())).map_err(|_|unavailable())?;
            let value = serde_json::to_value(result).map_err(|_| unavailable())?;
            let binding = HostWindowBinding {
                attempt_id: value["attempt_id"].as_str().ok_or_else(unavailable)?.into(),
                entry_url: value["entry_url"].as_str().ok_or_else(unavailable)?.into(),
                resource_generation: value["resource_generation"]
                    .as_str()
                    .ok_or_else(unavailable)?
                    .into(),
            };
            if !guard.is_current()
                || host
                    .bind_shell_attempt(&envelope.shell_epoch, binding.clone())
                    .is_err()
            {
                if let Ok(attempt) = parse_attempt(&binding.attempt_id) {
                    let _ = service.compare_current_teardown(attempt);
                }
                return Err(HostWindowError::new(HostWindowErrorCode::Stale));
            }
            Ok(value)
        }
        "read" | "wait" | "visibility" | "destroy" => {
            let version = envelope
                .request
                .get("contract_version")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if version!=crate::plugin_child_webview_presentation::PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION{return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));}
            let attempt_id = envelope
                .request
                .get("attempt_id")
                .and_then(Value::as_str)
                .ok_or_else(unavailable)?
                .to_owned();
            let attempt = parse_attempt(&attempt_id)?;
            let expected = if envelope.operation == "visibility" {
                5
            } else {
                4
            };
            if envelope
                .request
                .as_object()
                .is_none_or(|request| request.len() != expected)
            {
                return Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest));
            }
            let version=crate::plugin_child_webview_presentation::PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION;
            match envelope.operation.as_str(){
                "destroy"=>Ok(json!({"contract_version":version,"destroyed":service.compare_owned_teardown(attempt,&owner).map_err(|_|unavailable())?})),
                "visibility"=>{let visible=envelope.request.get("visible").and_then(Value::as_bool).ok_or_else(unavailable)?;let result=if visible{service.show_owned(attempt,&owner)}else{service.hide_owned(attempt,&owner)};if result!=crate::plugin_child_webview_service::PluginChildWebviewPresentationResult::Applied{return Err(unavailable());}if visible&&service.focus_owned(attempt,&owner)!=crate::plugin_child_webview_service::PluginChildWebviewPresentationResult::Applied{return Err(unavailable());}Ok(json!({"contract_version":version,"attempt_id":attempt_id,"visible":visible}))},
                "wait"=>match service.wait_owned_presentation_readiness(attempt,&owner){crate::plugin_child_webview_service::PluginChildWebviewWaitReadiness::Ready=>Ok(json!({"contract_version":version,"readiness":"ready","failure_code":null})),crate::plugin_child_webview_service::PluginChildWebviewWaitReadiness::Failed(error)=>Ok(json!({"contract_version":version,"readiness":"failed","failure_code":error.as_str()})),_=>Err(HostWindowError::new(HostWindowErrorCode::Stale))},
                _=>{let _=service.expire_owned_session_deadline(attempt,&owner);let snapshot=service.snapshot_owned(attempt,&owner).ok_or_else(unavailable)?;let readiness=match snapshot.session_state{PluginChildWebviewSessionState::BridgeReady|PluginChildWebviewSessionState::SdkReady=>"ready",PluginChildWebviewSessionState::Disconnected|PluginChildWebviewSessionState::Disposed=>"failed",_=>"loading"};Ok(json!({"contract_version":version,"attempt_id":attempt_id,"readiness":readiness,"failure_code":snapshot.session_error.map(|e|e.as_str())}))}
            }
        }
        "slot" => {
            let request = parse_request(envelope.request)?;
            let window = target.window();
            let size = window.inner_size().map_err(|_| unavailable())?;
            let result = crate::plugin_child_webview_slot::apply_slot_update(
                service,
                request,
                crate::plugin_child_webview_slot::SlotWindowFacts {
                    scale_factor: window.scale_factor().map_err(|_| unavailable())?,
                    physical_width: size.width,
                    physical_height: size.height,
                },
                &source.webview_label,
                &source.window_label,
            )
            .map_err(|_| unavailable())?;
            serde_json::to_value(result).map_err(|_| unavailable())
        }
        _ => Err(HostWindowError::new(HostWindowErrorCode::InvalidRequest)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_child_webview_owner::{
        PluginChildWebviewMigrationToken, TransferPublicationReceipt,
    };
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::mpsc;
    #[derive(Default)]
    struct FakeEmitter {
        events: Mutex<Vec<(String, String, Value)>>,
        delivered: Mutex<Option<mpsc::Sender<Value>>>,
    }
    impl HostWindowEmitter for FakeEmitter {
        fn emit(&self, label: &str, event: &str, payload: Value) -> Result<(), ()> {
            self.events
                .lock()
                .unwrap()
                .push((label.into(), event.into(), payload.clone()));
            if event == HOST_WINDOW_OPERATION_EVENT {
                if let Some(sender) = self.delivered.lock().unwrap().as_ref() {
                    let _ = sender.send(payload);
                }
            }
            Ok(())
        }
    }
    #[derive(Default)]
    struct FakeControl {
        closes: AtomicUsize,
        losses: AtomicUsize,
    }
    impl HostWindowControl for FakeControl {
        fn close_attempt(&self, _: PluginChildWebviewAttempt) -> Result<(), ()> {
            self.closes.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
        fn replace_attempt(
            &self,
            _: PluginChildWebviewAttempt,
            _: PluginChildWebviewOwner,
        ) -> Result<(), ()> {
            Ok(())
        }
        fn prepare_page(
            &self,
            _: &str,
            _: &crate::plugin_child_webview_presentation::PluginChildWebviewPresentationIdentity,
        ) -> Result<(), ()> {
            Ok(())
        }
        fn shell_lost(&self, _: &str, _: PluginChildWebviewAttempt) {
            self.losses.fetch_add(1, Ordering::SeqCst);
        }
        fn main_lost(&self, _: Vec<String>) {
            self.losses.fetch_add(1, Ordering::SeqCst);
        }
    }
    fn transfer(sequence: u64) -> PluginChildWebviewOwnershipTransfer {
        PluginChildWebviewOwnershipTransfer {
            attempt: PluginChildWebviewAttempt::from_opaque_id(&format!("attempt_{sequence:016x}"))
                .unwrap(),
            source_label: format!("plugin-child-{sequence:016x}"),
            token: PluginChildWebviewMigrationToken::new(sequence).unwrap(),
            source: PluginChildWebviewOwner::main(),
            target: PluginChildWebviewOwner::from_parts(
                &format!("plugin-window-{sequence:016x}"),
                2,
            )
            .unwrap(),
            publication_receipt: TransferPublicationReceipt::default(),
        }
    }
    fn page() -> HostWindowPage {
        HostWindowPage {
            owner_id: "com.acme.fixture".into(),
            page_id: "home".into(),
            title: "Fixture".into(),
            plugin_name: "Fixture plugin".into(),
            action_name: "Open Fixture".into(),
        }
    }
    fn binding(transfer: &PluginChildWebviewOwnershipTransfer) -> HostWindowBinding {
        HostWindowBinding {
            attempt_id: transfer.attempt.opaque_id(),
            entry_url: crate::plugin_resource_url::build_native_resource_url(
                "0123456789abcdef0123456789abcdef",
                &crate::plugin_identity::plugin_record_key("com.acme.fixture"),
                "1.0.0",
                "dist/index.html",
            ),
            resource_generation: "1".into(),
        }
    }
    fn source(label: &str) -> ActualHostSource {
        ActualHostSource {
            webview_label: label.into(),
            window_label: label.into(),
            document_url: "tauri://localhost/".into(),
        }
    }
    fn fixture() -> (
        Arc<PluginDetachedWindowHost>,
        Arc<FakeEmitter>,
        Arc<FakeControl>,
        PluginChildWebviewOwnershipTransfer,
        HostWindowSnapshot,
    ) {
        let host = Arc::new(PluginDetachedWindowHost::new(
            &TrustedAppTarget::production(),
        ));
        let emitter = Arc::new(FakeEmitter::default());
        let control = Arc::new(FakeControl::default());
        assert!(host.attach_emitter(emitter.clone()));
        assert!(host.attach_control(control.clone()));
        let transfer = transfer(1);
        let snapshot = host
            .reserve_shell(
                &transfer,
                page(),
                HostWindowPreferences::default(),
                binding(&transfer),
            )
            .unwrap();
        (host, emitter, control, transfer, snapshot)
    }
    fn geometry() -> HostWindowGeometry {
        HostWindowGeometry {
            scale_factor: 2.0,
            physical_bounds: HostWindowBounds {
                x: 0.0,
                y: 0.0,
                width: 1300.0,
                height: 800.0,
            },
        }
    }

    #[test]
    fn preferences_and_localized_metadata_reach_only_current_shell_channels_without_identity_changes(
    ) {
        let (host, _, _, first, initial) = fixture();
        let second = transfer(2);
        let third = transfer(3);
        let mut other_page = page();
        other_page.owner_id = "com.acme.other".into();
        let mut other_binding = binding(&third);
        other_binding.entry_url = crate::plugin_resource_url::build_native_resource_url(
            "1123456789abcdef0123456789abcdef",
            &crate::plugin_identity::plugin_record_key("com.acme.other"),
            "1.0.0",
            "dist/index.html",
        );
        let mut snapshots = vec![
            initial,
            host.reserve_shell(
                &second,
                page(),
                HostWindowPreferences::default(),
                binding(&second),
            )
            .unwrap(),
            host.reserve_shell(
                &third,
                other_page.clone(),
                HostWindowPreferences::default(),
                other_binding.clone(),
            )
            .unwrap(),
        ];
        let transfers = [first, second, third];
        let bindings = [
            binding(&transfers[0]),
            binding(&transfers[1]),
            other_binding,
        ];
        let deliveries = Arc::new(Mutex::new(Vec::<(usize, Value)>::new()));
        let mut leases = Vec::new();
        for index in 0..3 {
            snapshots[index] = host
                .publish_shell(
                    &snapshots[index].shell_epoch,
                    &snapshots[index].revision,
                    &transfers[index].target,
                    HostWindowPhase::Active,
                    if index == 2 {
                        other_page.clone()
                    } else {
                        page()
                    },
                    Some(bindings[index].clone()),
                    None,
                )
                .unwrap();
            let sentinel = Arc::new(());
            leases.push(Arc::downgrade(&sentinel));
            let output = deliveries.clone();
            host.subscribe_channel(
                &source(&snapshots[index].owner.window_label),
                &snapshots[index].shell_epoch,
                format!("__CHANNEL__:{}", index + 1),
                move || {
                    Channel::new(move |payload| {
                        let _keep_subscription = &sentinel;
                        let tauri::ipc::InvokeResponseBody::Json(json) = payload else {
                            panic!("snapshot must be JSON");
                        };
                        output
                            .lock()
                            .unwrap()
                            .push((index, serde_json::from_str(&json).unwrap()));
                        Ok(())
                    })
                },
            )
            .unwrap();
        }
        let preferences = HostWindowPreferences {
            locale: "zh-CN".into(),
            theme: "dark".into(),
        };
        host.publish_preferences(&source("main"), preferences.clone())
            .unwrap();
        assert_eq!(deliveries.lock().unwrap().len(), 3);
        for index in 0..3 {
            let current = host.snapshot(&snapshots[index].shell_epoch).unwrap();
            let mut localized = current.page.clone();
            localized.title = "插件页面".into();
            localized.plugin_name = if index == 2 {
                "其他插件"
            } else {
                "同一插件"
            }
            .into();
            localized.action_name = "打开页面".into();
            snapshots[index] = host
                .publish_shell(
                    &current.shell_epoch,
                    &current.revision,
                    &transfers[index].target,
                    HostWindowPhase::Active,
                    localized,
                    Some(bindings[index].clone()),
                    None,
                )
                .unwrap();
        }
        let delivered = deliveries.lock().unwrap();
        assert_eq!(delivered.len(), 6);
        for index in 0..3 {
            let payload = &delivered
                .iter()
                .rev()
                .find(|(recipient, _)| *recipient == index)
                .unwrap()
                .1;
            assert_eq!(payload["locale"], "zh-CN");
            assert_eq!(payload["theme"], "dark");
            assert_eq!(payload["page"]["title"], "插件页面");
            assert_eq!(
                payload["owner"],
                serde_json::to_value(&snapshots[index].owner).unwrap()
            );
            assert_eq!(
                payload["binding"],
                serde_json::to_value(&bindings[index]).unwrap()
            );
            assert_eq!(
                payload["page"]["owner_id"],
                if index == 2 {
                    "com.acme.other"
                } else {
                    "com.acme.fixture"
                }
            );
        }
        drop(delivered);
        host.publish_preferences(&source("main"), preferences)
            .unwrap();
        assert_eq!(deliveries.lock().unwrap().len(), 6);
        assert!(host.claim_shell_close(&snapshots[0].shell_epoch, &snapshots[0].revision));
        let closed_count = deliveries
            .lock()
            .unwrap()
            .iter()
            .filter(|(index, _)| *index == 0)
            .count();
        host.publish_preferences(&source("main"), HostWindowPreferences::default())
            .unwrap();
        assert_eq!(
            deliveries
                .lock()
                .unwrap()
                .iter()
                .filter(|(index, _)| *index == 0)
                .count(),
            closed_count
        );
        assert!(host.unregister_shell(&snapshots[0].shell_epoch));
        assert!(leases[0].upgrade().is_none());
        host.note_host_load(&snapshots[1].owner.window_label);
        host.note_host_load(&snapshots[1].owner.window_label);
        assert!(leases[1].upgrade().is_none());
        let invalidated_count = deliveries
            .lock()
            .unwrap()
            .iter()
            .filter(|(index, _)| *index == 1)
            .count();
        host.publish_preferences(
            &source("main"),
            HostWindowPreferences {
                locale: "zh-CN".into(),
                theme: "light".into(),
            },
        )
        .unwrap();
        assert_eq!(
            deliveries
                .lock()
                .unwrap()
                .iter()
                .filter(|(index, _)| *index == 1)
                .count(),
            invalidated_count
        );
        host.close_subscriptions();
        assert!(leases.iter().all(|lease| lease.upgrade().is_none()));
        let count = deliveries.lock().unwrap().len();
        host.publish_preferences(&source("main"), HostWindowPreferences::default())
            .unwrap();
        assert_eq!(deliveries.lock().unwrap().len(), count);
        assert!(host.state.lock().unwrap().operations.is_empty());
    }

    #[test]
    fn delayed_locale_publication_cannot_overwrite_a_replacement_generation_or_emit_to_it() {
        let (host, emitter, _, transfer, initial) = fixture();
        let old = host
            .publish_shell(
                &initial.shell_epoch,
                &initial.revision,
                &transfer.target,
                HostWindowPhase::Active,
                page(),
                Some(binding(&transfer)),
                None,
            )
            .unwrap();
        let replacement_owner =
            PluginChildWebviewOwner::from_parts(&transfer.target.window_label, 1).unwrap();
        let mut replacement_page = page();
        replacement_page.page_id = "replacement".into();
        let preparing = host
            .publish_shell(
                &old.shell_epoch,
                &old.revision,
                &replacement_owner,
                HostWindowPhase::Preparing,
                replacement_page.clone(),
                None,
                None,
            )
            .unwrap();
        let mut replacement_binding = binding(&transfer);
        replacement_binding.attempt_id = "attempt_0000000000000004".into();
        replacement_binding.resource_generation = "2".into();
        let current = host
            .publish_shell(
                &preparing.shell_epoch,
                &preparing.revision,
                &replacement_owner,
                HostWindowPhase::Active,
                replacement_page,
                Some(replacement_binding),
                None,
            )
            .unwrap();
        let before = serde_json::to_value(&current).unwrap();
        let count = emitter.events.lock().unwrap().len();
        assert!(host
            .publish_shell(
                &old.shell_epoch,
                &old.revision,
                &transfer.target,
                HostWindowPhase::Active,
                page(),
                Some(binding(&transfer)),
                None
            )
            .is_err());
        host.emit_snapshot(&old);
        assert_eq!(emitter.events.lock().unwrap().len(), count);
        assert_eq!(
            serde_json::to_value(host.snapshot(&old.shell_epoch).unwrap()).unwrap(),
            before
        );
        host.unregister_shell(&old.shell_epoch);
        host.emit_snapshot(&current);
        assert_eq!(emitter.events.lock().unwrap().len(), count);
    }

    #[test]
    fn bootstrap_requires_actual_registered_host_not_url_or_label_pattern() {
        let (host, _, control, _, snapshot) = fixture();
        assert_eq!(
            host.bootstrap(&source("main")).unwrap(),
            json!({"contract_version":HOST_WINDOW_VERSION,"mode":"main"})
        );
        let shell = source(&snapshot.owner.window_label);
        let value = host.bootstrap(&shell).unwrap();
        assert_eq!(value["mode"], "detached");
        assert_eq!(value["snapshot"]["shell_epoch"], snapshot.shell_epoch);
        for untrusted in [
            source("plugin-child-0000000000000001"),
            source("plugin-window-000000000000ffff"),
            ActualHostSource {
                window_label: "main".into(),
                ..source(&snapshot.owner.window_label)
            },
            ActualHostSource {
                document_url: "tauri://localhost/?mode=detached".into(),
                ..source(&snapshot.owner.window_label)
            },
            ActualHostSource {
                document_url: "https://attacker.invalid/".into(),
                ..source("main")
            },
        ] {
            assert!(host.bootstrap(&untrusted).is_err());
            assert!(host.subscribe(&untrusted, &snapshot.shell_epoch).is_err());
            assert!(host
                .accept_geometry(
                    &untrusted,
                    &snapshot.shell_epoch,
                    &snapshot.revision,
                    geometry(),
                    None
                )
                .is_err());
        }
        assert_eq!(control.closes.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn ready_requires_subscription_epoch_revision_and_valid_geometry() {
        let (host, _, _, _, snapshot) = fixture();
        let source = source(&snapshot.owner.window_label);
        assert!(host
            .accept_geometry(
                &source,
                &snapshot.shell_epoch,
                &snapshot.revision,
                geometry(),
                None
            )
            .is_err());
        host.subscribe(&source, &snapshot.shell_epoch).unwrap();
        assert!(host
            .accept_geometry(&source, "shell_0000000000009999", "1", geometry(), None)
            .is_err());
        assert!(host
            .accept_geometry(&source, &snapshot.shell_epoch, "2", geometry(), None)
            .is_err());
        let invalid = HostWindowGeometry {
            scale_factor: f64::NAN,
            ..geometry()
        };
        assert!(host
            .accept_geometry(&source, &snapshot.shell_epoch, "1", invalid, None)
            .is_err());
        host.accept_geometry(&source, &snapshot.shell_epoch, "1", geometry(), None)
            .unwrap();
        assert_eq!(
            host.wait_shell_ready(
                &snapshot.shell_epoch,
                &NativeExecutionGuard::new(|| true),
                Duration::ZERO
            )
            .unwrap(),
            geometry()
        );
        let refreshed = host.refresh_shell_geometry(&snapshot.shell_epoch).unwrap();
        assert_eq!(refreshed.revision, "2");
        assert!(host
            .accept_geometry(&source, &snapshot.shell_epoch, "1", geometry(), Some(2))
            .is_err());
        host.accept_geometry(&source, &snapshot.shell_epoch, "2", geometry(), None)
            .unwrap();
    }
    #[test]
    fn two_shells_do_not_accept_each_others_geometry_or_epoch() {
        let (host, _, control, _, a) = fixture();
        let transfer = transfer(2);
        let b = host
            .reserve_shell(
                &transfer,
                page(),
                HostWindowPreferences::default(),
                binding(&transfer),
            )
            .unwrap();
        let sa = source(&a.owner.window_label);
        let sb = source(&b.owner.window_label);
        host.subscribe(&sa, &a.shell_epoch).unwrap();
        host.subscribe(&sb, &b.shell_epoch).unwrap();
        assert!(host
            .accept_geometry(&sa, &b.shell_epoch, &b.revision, geometry(), Some(1))
            .is_err());
        assert!(host
            .accept_geometry(&sb, &a.shell_epoch, &a.revision, geometry(), Some(1))
            .is_err());
        host.accept_geometry(&sa, &a.shell_epoch, &a.revision, geometry(), Some(1))
            .unwrap();
        assert_eq!(control.closes.load(Ordering::SeqCst), 0);
        assert!(host.unregister_shell(&a.shell_epoch));
        assert!(host.bootstrap(&sa).is_err());
        assert!(host.snapshot(&b.shell_epoch).is_ok());
    }
    #[test]
    fn operation_ack_is_main_only_exact_single_use_and_emitted_only_to_main_webview() {
        let (host, emitter, control, transfer, snapshot) = fixture();
        let (tx, rx) = mpsc::channel();
        *emitter.delivered.lock().unwrap() = Some(tx);
        let weak = Arc::downgrade(&host);
        let epoch = snapshot.shell_epoch.clone();
        let guard = NativeExecutionGuard::new(move || {
            weak.upgrade()
                .is_some_and(|host| host.snapshot(&epoch).is_ok())
        });
        let run = host.clone();
        let op_transfer = transfer.clone();
        let op_epoch = snapshot.shell_epoch.clone();
        let task = std::thread::spawn(move || {
            run.dispatch_main_operation(
                HostWindowOperationKind::PrepareTransfer,
                &op_transfer,
                &op_epoch,
                &op_transfer.target,
                &guard,
                Duration::from_secs(1),
            )
        });
        let event = rx.recv_timeout(Duration::from_secs(1)).unwrap();
        let make_ack = |token: String| AckRequest {
            contract_version: HOST_WINDOW_VERSION.into(),
            operation_id: event["operation_id"].as_str().unwrap().into(),
            transfer_token: token,
            accepted: true,
            geometry: None,
        };
        assert!(host
            .acknowledge(
                &source(&snapshot.owner.window_label),
                make_ack(transfer.token.opaque_id())
            )
            .is_err());
        assert!(host
            .acknowledge(
                &source("main"),
                make_ack("migration_0000000000009999".into())
            )
            .is_err());
        host.acknowledge(&source("main"), make_ack(transfer.token.opaque_id()))
            .unwrap();
        task.join().unwrap().unwrap();
        host.acknowledge(&source("main"), make_ack(transfer.token.opaque_id()))
            .unwrap();
        assert!(host.read_operations(&source("main")).unwrap().is_empty());
        assert_eq!(control.closes.load(Ordering::SeqCst), 0);
        for (label, event, _) in emitter.events.lock().unwrap().iter() {
            if event == HOST_WINDOW_OPERATION_EVENT {
                assert_eq!(label, "main");
            }
            assert!(!label.starts_with("plugin-child-"));
        }
    }
    #[test]
    fn expired_operation_cannot_ack_or_replay_and_wait_never_holds_broker_over_guard() {
        let (host, _, _, transfer, snapshot) = fixture();
        let active = Arc::new(AtomicBool::new(true));
        let weak = Arc::downgrade(&host);
        let check = active.clone();
        let guard = NativeExecutionGuard::new(move || {
            check.load(Ordering::SeqCst)
                && weak
                    .upgrade()
                    .is_some_and(|host| host.snapshot("shell_0000000000000001").is_ok())
        });
        let (_, op) = host
            .new_operation(
                HostWindowOperationKind::TransferNavigation,
                &transfer,
                &snapshot.shell_epoch,
                &transfer.target,
                None,
                Some(guard.clone()),
                Duration::from_secs(1),
            )
            .unwrap();
        active.store(false, Ordering::SeqCst);
        assert!(host
            .acknowledge(
                &source("main"),
                AckRequest {
                    contract_version: HOST_WINDOW_VERSION.into(),
                    operation_id: op.operation_id,
                    transfer_token: op.transfer_token,
                    accepted: true,
                    geometry: None,
                }
            )
            .is_err());
        assert!(host.read_operations(&source("main")).unwrap().is_empty());
        assert!(host
            .wait_shell_ready(&snapshot.shell_epoch, &guard, Duration::ZERO)
            .is_err());
    }
    #[test]
    fn final_restore_notification_survives_target_unregister_and_lost_event() {
        let (host, emitter, _, transfer, snapshot) = fixture();
        host.state.lock().unwrap().main_page =
            Some((transfer.source.clone(), page(), binding(&transfer)));
        assert!(host.unregister_shell(&snapshot.shell_epoch));
        let owner = PluginChildWebviewOwner::from_parts("main", 2).unwrap();
        host.publish_settled(
            &transfer,
            &snapshot.shell_epoch,
            &owner,
            HostWindowOutcome::Restored,
        );
        let operations = host.read_operations(&source("main")).unwrap();
        assert_eq!(operations.len(), 1);
        assert_eq!(operations[0].kind, HostWindowOperationKind::SettleTransfer);
        assert_eq!(operations[0].outcome, Some(HostWindowOutcome::Restored));
        assert_eq!(operations[0].to_owner.ownership_revision, "2");
        assert_eq!(
            host.state.lock().unwrap().main_page.as_ref().unwrap().0,
            owner
        );
        assert!(emitter
            .events
            .lock()
            .unwrap()
            .iter()
            .all(|(label, _, _)| label == "main"));
    }
    #[test]
    fn locale_theme_changes_target_each_current_shell_and_old_intents_become_stale() {
        let (host, emitter, _, _, a) = fixture();
        let transfer = transfer(2);
        let b = host
            .reserve_shell(
                &transfer,
                page(),
                HostWindowPreferences::default(),
                binding(&transfer),
            )
            .unwrap();
        host.publish_preferences(
            &source("main"),
            HostWindowPreferences {
                locale: "zh-CN".into(),
                theme: "dark".into(),
            },
        )
        .unwrap();
        assert_eq!(host.snapshot(&a.shell_epoch).unwrap().locale, "zh-CN");
        assert_eq!(host.snapshot(&b.shell_epoch).unwrap().theme, "dark");
        assert!(host
            .accept_geometry(
                &source(&a.owner.window_label),
                &a.shell_epoch,
                &a.revision,
                geometry(),
                Some(1)
            )
            .is_err());
        let events = emitter.events.lock().unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(
            events
                .iter()
                .map(|(label, _, _)| label.as_str())
                .collect::<BTreeSet<_>>(),
            BTreeSet::from([a.owner.window_label.as_str(), b.owner.window_label.as_str()])
        );
    }
    #[test]
    fn retired_shell_label_and_old_geometry_do_not_regain_authority() {
        let (host, _, _, transfer, snapshot) = fixture();
        host.unregister_shell(&snapshot.shell_epoch);
        assert!(host
            .reserve_shell(
                &transfer,
                page(),
                HostWindowPreferences::default(),
                binding(&transfer)
            )
            .is_err());
        assert!(host
            .subscribe(&source(&snapshot.owner.window_label), &snapshot.shell_epoch)
            .is_err());
    }
    #[test]
    fn closed_wire_rejects_extra_authority_and_errors_are_bounded() {
        let valid = json!({"contract_version":HOST_WINDOW_VERSION,"shell_epoch":"shell_1","snapshot_revision":"1","scale_factor":2.0,"physical_bounds":geometry().physical_bounds});
        assert!(parse_request::<GeometryRequest>(valid.clone()).is_ok());
        for field in ["window_label", "attempt_id"] {
            let mut forged = valid.clone();
            forged[field] = json!("other");
            assert!(parse_request::<GeometryRequest>(forged).is_err());
        }
        assert!(parse_request::<EmptyRequest>(json!({"mode":"main"})).is_err());
        assert!(parse_request::<MainPageRequest>(
            json!({"contract_version":HOST_WINDOW_VERSION,"unknown":true})
        )
        .is_err());
        let error =
            serde_json::to_string(&HostWindowError::new(HostWindowErrorCode::Stale)).unwrap();
        for field in [
            "shell_",
            "plugin-window-",
            "entry_url",
            "native",
            "path",
            "source_label",
        ] {
            assert!(!error.contains(field));
        }
    }
    #[test]
    fn app_bootstrap_and_generic_window_authority_are_not_available_to_detached_shell() {
        let (host, _, _, _, snapshot) = fixture();
        assert!(host
            .main_source(&source(&snapshot.owner.window_label))
            .is_err());
        assert!(host
            .read_operations(&source(&snapshot.owner.window_label))
            .is_err());
        assert!(host
            .publish_preferences(
                &source(&snapshot.owner.window_label),
                HostWindowPreferences::default()
            )
            .is_err());
        let capability: Value =
            serde_json::from_str(include_str!("../capabilities/detached-shell.json")).unwrap();
        assert!(capability.get("windows").is_none());
        for permission in capability["permissions"].as_array().unwrap() {
            assert!(!permission.as_str().unwrap().starts_with("core:window:"));
        }
        let main: Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        assert!(main.get("windows").is_none());
        assert_eq!(main["webviews"], json!(["main"]));
    }
    static MAIN_HANDLER_HITS: AtomicUsize = AtomicUsize::new(0);
    #[tauri::command]
    fn read_app_preferences() -> bool {
        MAIN_HANDLER_HITS.fetch_add(1, Ordering::SeqCst);
        true
    }
    static QUIT_HANDLER_HITS: AtomicUsize = AtomicUsize::new(0);
    #[tauri::command]
    fn quit_plugin_windows() -> bool {
        QUIT_HANDLER_HITS.fetch_add(1, Ordering::SeqCst);
        true
    }
    static DEVELOPMENT_HANDLER_HITS: AtomicUsize = AtomicUsize::new(0);
    #[tauri::command]
    fn read_plugin_development_capability() -> bool {
        DEVELOPMENT_HANDLER_HITS.fetch_add(1, Ordering::SeqCst);
        true
    }

    #[test]
    fn actual_app_acl_denies_main_commands_to_child_siblings_and_detached_webviews() {
        use tauri::{
            ipc::{CallbackFn, InvokeBody},
            test::{get_ipc_response, mock_builder, INVOKE_KEY},
            webview::InvokeRequest,
            WebviewBuilder, WebviewWindowBuilder,
        };
        MAIN_HANDLER_HITS.store(0, Ordering::SeqCst);
        QUIT_HANDLER_HITS.store(0, Ordering::SeqCst);
        DEVELOPMENT_HANDLER_HITS.store(0, Ordering::SeqCst);
        let app = mock_builder()
            .invoke_handler(tauri::generate_handler![
                read_app_preferences,
                quit_plugin_windows,
                read_plugin_development_capability
            ])
            .build(tauri::generate_context!(test = true))
            .unwrap();
        let main = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let child = app
            .get_window("main")
            .unwrap()
            .add_child(
                WebviewBuilder::new("plugin-child-0000000000000001", Default::default()),
                tauri::LogicalPosition::new(0.0, 0.0),
                tauri::LogicalSize::new(100.0, 100.0),
            )
            .unwrap();
        let detached =
            WebviewWindowBuilder::new(&app, "plugin-window-0000000000000001", Default::default())
                .build()
                .unwrap();
        let invoke = |cmd: &str, body: Value| InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "tauri://localhost/".parse().unwrap(),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.into(),
        };
        assert!(get_ipc_response(&main, invoke("read_app_preferences", json!({}))).is_ok());
        struct ChildView(tauri::Webview<tauri::test::MockRuntime>);
        impl AsRef<tauri::Webview<tauri::test::MockRuntime>> for ChildView {
            fn as_ref(&self) -> &tauri::Webview<tauri::test::MockRuntime> {
                &self.0
            }
        }
        let child = ChildView(child);
        assert!(get_ipc_response(&child, invoke("read_app_preferences", json!({}))).is_err());
        assert!(get_ipc_response(&detached, invoke("read_app_preferences", json!({}))).is_err());
        assert!(get_ipc_response(&main, invoke("quit_plugin_windows", json!({}))).is_ok());
        assert!(get_ipc_response(&child, invoke("quit_plugin_windows", json!({}))).is_err());
        assert!(get_ipc_response(&detached, invoke("quit_plugin_windows", json!({}))).is_err());
        assert_eq!(QUIT_HANDLER_HITS.load(Ordering::SeqCst), 1);
        assert_eq!(
            get_ipc_response(
                &main,
                invoke("read_plugin_development_capability", json!({}))
            )
            .is_ok(),
            cfg!(feature = "plugin-development-mode")
        );
        assert!(get_ipc_response(
            &child,
            invoke("read_plugin_development_capability", json!({}))
        )
        .is_err());
        assert!(get_ipc_response(
            &detached,
            invoke("read_plugin_development_capability", json!({}))
        )
        .is_err());
        assert_eq!(
            DEVELOPMENT_HANDLER_HITS.load(Ordering::SeqCst),
            usize::from(cfg!(feature = "plugin-development-mode"))
        );
        assert!(get_ipc_response(
            &detached,
            invoke("plugin:window|start_dragging", json!({"label":"main"}))
        )
        .is_err());
        for target in [
            json!({"kind":"Any"}),
            json!({"kind":"Webview","label":"main"}),
            json!({"kind":"Webview","label":"plugin-window-0000000000000002"}),
        ] {
            assert!(get_ipc_response(
                &detached,
                invoke(
                    "plugin:event|listen",
                    json!({"event":HOST_WINDOW_OPERATION_EVENT,"target":target,"handler":77})
                )
            )
            .is_err());
        }
        assert_eq!(MAIN_HANDLER_HITS.load(Ordering::SeqCst), 1);
    }
    #[test]
    fn shell_reload_invalidates_its_source_synchronously_and_main_reload_invalidates_all() {
        let (host, _, control, _, a) = fixture();
        let transfer = transfer(2);
        let b = host
            .reserve_shell(
                &transfer,
                page(),
                HostWindowPreferences::default(),
                binding(&transfer),
            )
            .unwrap();
        host.note_host_load(&a.owner.window_label);
        assert!(host.bootstrap(&source(&a.owner.window_label)).is_ok());
        host.note_host_load(&a.owner.window_label);
        assert!(host.bootstrap(&source(&a.owner.window_label)).is_err());
        assert!(host
            .accept_geometry(
                &source(&a.owner.window_label),
                &a.shell_epoch,
                &a.revision,
                geometry(),
                Some(1)
            )
            .is_err());
        assert!(host.bootstrap(&source(&b.owner.window_label)).is_ok());
        assert_eq!(control.closes.load(Ordering::SeqCst), 0);
        host.note_host_load("main");
        assert!(host.bootstrap(&source(&b.owner.window_label)).is_err());
        assert!(host.main_interaction_blocked());
    }
    #[test]
    fn restore_navigation_ack_requires_fresh_geometry_and_returns_it_to_native_policy() {
        let (host, emitter, _, transfer, snapshot) = fixture();
        let (tx, rx) = mpsc::channel();
        *emitter.delivered.lock().unwrap() = Some(tx);
        let run = host.clone();
        let transfer_for_task = transfer.clone();
        let epoch = snapshot.shell_epoch.clone();
        let owner = PluginChildWebviewOwner::from_parts("main", 2).unwrap();
        let task = std::thread::spawn(move || {
            run.dispatch_main_operation(
                HostWindowOperationKind::RestoreNavigation,
                &transfer_for_task,
                &epoch,
                &owner,
                &NativeExecutionGuard::new(|| true),
                Duration::from_secs(1),
            )
        });
        let event = rx.recv_timeout(Duration::from_secs(1)).unwrap();
        let mut ack = AckRequest {
            contract_version: HOST_WINDOW_VERSION.into(),
            operation_id: event["operation_id"].as_str().unwrap().into(),
            transfer_token: transfer.token.opaque_id(),
            accepted: true,
            geometry: None,
        };
        assert!(host
            .acknowledge(
                &source("main"),
                AckRequest {
                    contract_version: ack.contract_version.clone(),
                    operation_id: ack.operation_id.clone(),
                    transfer_token: ack.transfer_token.clone(),
                    accepted: true,
                    geometry: None
                }
            )
            .is_err());
        ack.geometry = Some(geometry());
        host.acknowledge(&source("main"), ack).unwrap();
        assert_eq!(task.join().unwrap().unwrap(), Some(geometry()));
        assert!(parse_request::<AckRequest>(json!({"contract_version":HOST_WINDOW_VERSION,"operation_id":"window_op_0000000000000001","transfer_token":"migration_0000000000000001","accepted":true})).is_err());
    }
    #[test]
    fn late_settlement_cannot_reactivate_old_attempt_over_preparing_or_ready_replacement() {
        let (host, _, _, transfer, snapshot) = fixture();
        let owner = PluginChildWebviewOwner::from_parts(&transfer.target.window_label, 1).unwrap();
        let mut new_page = page();
        new_page.page_id = "replacement".into();
        new_page.title = "Replacement".into();
        host.publish_shell(
            &snapshot.shell_epoch,
            &host.snapshot(&snapshot.shell_epoch).unwrap().revision,
            &owner,
            HostWindowPhase::Preparing,
            new_page.clone(),
            None,
            None,
        )
        .unwrap();
        let before = serde_json::to_value(host.snapshot(&snapshot.shell_epoch).unwrap()).unwrap();
        host.publish_settled(
            &transfer,
            &snapshot.shell_epoch,
            &transfer.target,
            HostWindowOutcome::Committed,
        );
        assert_eq!(
            serde_json::to_value(host.snapshot(&snapshot.shell_epoch).unwrap()).unwrap(),
            before
        );
        let mut replacement = binding(&transfer);
        replacement.attempt_id = "attempt_0000000000000002".into();
        host.publish_shell(
            &snapshot.shell_epoch,
            &host.snapshot(&snapshot.shell_epoch).unwrap().revision,
            &owner,
            HostWindowPhase::Active,
            new_page,
            Some(replacement),
            None,
        )
        .unwrap();
        let before = serde_json::to_value(host.snapshot(&snapshot.shell_epoch).unwrap()).unwrap();
        host.publish_settled(
            &transfer,
            &snapshot.shell_epoch,
            &transfer.target,
            HostWindowOutcome::Committed,
        );
        assert_eq!(
            serde_json::to_value(host.snapshot(&snapshot.shell_epoch).unwrap()).unwrap(),
            before
        );
    }

    #[test]
    fn queued_native_title_update_uses_the_current_page_of_its_own_live_shell() {
        let (host, _, _, transfer, initial) = fixture();
        let epoch = &initial.shell_epoch;
        let window = &initial.owner.window_label;
        let mut replacement = page();
        replacement.page_id = "replacement".into();
        replacement.title = "替代页面".into();
        let current = host
            .publish_shell(
                epoch,
                &initial.revision,
                &transfer.target,
                HostWindowPhase::Preparing,
                replacement,
                None,
                None,
            )
            .unwrap();
        assert_eq!(
            host.current_shell_title(epoch, window).as_deref(),
            Some("替代页面")
        );
        assert_eq!(host.current_shell_title(epoch, "main"), None);
        assert_eq!(host.current_shell_title("different-shell", window), None);
        assert!(host.claim_shell_close(epoch, &current.revision));
        assert_eq!(host.current_shell_title(epoch, window), None);
    }
    #[test]
    fn close_claim_is_atomic_and_retryable_but_rejects_prior_page_revision() {
        let (host, _, control, _, snapshot) = fixture();
        let fresh = host.refresh_shell_geometry(&snapshot.shell_epoch).unwrap();
        assert!(!host.claim_shell_close(&snapshot.shell_epoch, &snapshot.revision));
        assert!(host.claim_shell_close(&snapshot.shell_epoch, &fresh.revision));
        assert!(!host.shell_source_current(&snapshot.shell_epoch));
        let closing = host.snapshot(&snapshot.shell_epoch).unwrap();
        assert_eq!(closing.phase, HostWindowPhase::Closing);
        assert!(host.claim_shell_close(&snapshot.shell_epoch, &closing.revision));
        assert!(host
            .accept_geometry(
                &source(&closing.owner.window_label),
                &closing.shell_epoch,
                &closing.revision,
                geometry(),
                Some(1)
            )
            .is_err());
        assert_eq!(control.closes.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn recovery_replay_can_resolve_virtual_target_after_uncommitted_window_cleanup() {
        let (host, _, _, transfer, snapshot) = fixture();
        host.unregister_shell(&snapshot.shell_epoch);
        host.publish_settled(
            &transfer,
            &snapshot.shell_epoch,
            &transfer.source,
            HostWindowOutcome::RecoveryRequired,
        );
        let target = host.snapshot_for_epoch_read(&snapshot.shell_epoch).unwrap();
        assert_eq!(target.owner.window_label, transfer.target.window_label);
        assert_eq!(target.phase, HostWindowPhase::RecoveryRequired);
        assert!(host
            .bootstrap(&source(&transfer.target.window_label))
            .is_err());
        host.publish_settled(
            &transfer,
            &snapshot.shell_epoch,
            &PluginChildWebviewOwner::from_parts("main", 2).unwrap(),
            HostWindowOutcome::Restored,
        );
        assert!(host.snapshot_for_epoch_read(&snapshot.shell_epoch).is_err());
    }
    #[test]
    fn subscription_query_reuses_channel_and_late_release_cannot_drop_successor() {
        let (host, _, _, _, snapshot) = fixture();
        let caller = source(&snapshot.owner.window_label);
        let creates = Arc::new(AtomicUsize::new(0));
        let make = || {
            creates.fetch_add(1, Ordering::SeqCst);
            Channel::<Value>::new(|_| Ok(()))
        };
        let (first, _) = host
            .subscribe_channel(&caller, &snapshot.shell_epoch, "__CHANNEL__:7".into(), make)
            .unwrap();
        let (same, _) = host
            .subscribe_channel(
                &caller,
                &snapshot.shell_epoch,
                "__CHANNEL__:7".into(),
                || panic!("query must not construct/drop another Channel"),
            )
            .unwrap();
        assert_eq!(same, first);
        let (next, _) = host
            .subscribe_channel(&caller, &snapshot.shell_epoch, "__CHANNEL__:8".into(), make)
            .unwrap();
        assert_ne!(next, first);
        assert_eq!(creates.load(Ordering::SeqCst), 2);
        assert!(!host
            .release_registered_subscription(
                &caller,
                Some(&snapshot.shell_epoch),
                Some(&first),
                "__CHANNEL__:7"
            )
            .unwrap());
        assert_eq!(
            host.state.lock().unwrap().shells[&snapshot.shell_epoch]
                .subscription
                .as_ref()
                .unwrap()
                .id,
            next
        );
        assert!(host
            .release_registered_subscription(
                &caller,
                Some(&snapshot.shell_epoch),
                Some(&next),
                "__CHANNEL__:8"
            )
            .unwrap());
        assert!(host.state.lock().unwrap().shells[&snapshot.shell_epoch]
            .subscription
            .is_none());
    }
    #[test]
    fn real_channel_callback_id_cannot_select_another_recipient_webview() {
        use tauri::{
            test::{mock_builder, mock_context, noop_assets},
            WebviewWindowBuilder,
        };
        let recipients = Arc::new(Mutex::new(Vec::<String>::new()));
        let observed = recipients.clone();
        let app = mock_builder()
            .channel_interceptor(move |view, _, _, _| {
                observed.lock().unwrap().push(view.label().into());
                true
            })
            .build(mock_context(noop_assets()))
            .unwrap();
        WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        WebviewWindowBuilder::new(&app, "plugin-window-0000000000000001", Default::default())
            .build()
            .unwrap();
        let main: Channel<Value> = "__CHANNEL__:7"
            .parse::<JavaScriptChannelId>()
            .unwrap()
            .channel_on(app.get_webview("main").unwrap());
        let guessed: Channel<Value> = "__CHANNEL__:7"
            .parse::<JavaScriptChannelId>()
            .unwrap()
            .channel_on(app.get_webview("plugin-window-0000000000000001").unwrap());
        main.send(json!({"private":"main only"})).unwrap();
        guessed.send(json!({"own":"shell"})).unwrap();
        assert_eq!(
            *recipients.lock().unwrap(),
            vec!["main", "plugin-window-0000000000000001"]
        );
    }
    #[test]
    fn cancelled_queued_subscription_cannot_later_retain_an_unreachable_channel() {
        let (host, _, _, _, snapshot) = fixture();
        let caller = source(&snapshot.owner.window_label);
        assert!(!host
            .release_registered_subscription(
                &caller,
                Some(&snapshot.shell_epoch),
                None,
                "__CHANNEL__:7"
            )
            .unwrap());
        assert!(host
            .subscribe_channel(
                &caller,
                &snapshot.shell_epoch,
                "__CHANNEL__:7".into(),
                || panic!("cancelled queued channel must not be allocated")
            )
            .is_err());
        let (next, _) = host
            .subscribe_channel(
                &caller,
                &snapshot.shell_epoch,
                "__CHANNEL__:8".into(),
                || Channel::<Value>::new(|_| Ok(())),
            )
            .unwrap();
        assert!(!host
            .release_registered_subscription(
                &caller,
                Some(&snapshot.shell_epoch),
                None,
                "__CHANNEL__:7"
            )
            .unwrap());
        assert_eq!(
            host.state.lock().unwrap().shells[&snapshot.shell_epoch]
                .subscription
                .as_ref()
                .unwrap()
                .id,
            next
        );
        assert!(host
            .subscribe_channel(
                &caller,
                &snapshot.shell_epoch,
                "__CHANNEL__:7".into(),
                || panic!("old registration cannot replace successor")
            )
            .is_err());
    }
}
