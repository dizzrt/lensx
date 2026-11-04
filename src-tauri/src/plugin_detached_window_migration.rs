//! Host-private migration policy. The shell/native composition supplies the
//! adapter; this module owns ordering, deadlines, rollback and terminal races.
#![allow(dead_code)] // The concrete shell adapter is connected in the next integration task.

use crate::plugin_child_webview_adapter::PluginChildWebviewNativeHandle;
use crate::plugin_child_webview_execution::NativeExecutionGuard;
use crate::plugin_child_webview_owner::{
    PluginChildWebviewOwner, PluginChildWebviewOwnershipTransfer, TransferPublication,
};
use crate::plugin_child_webview_service::{
    PluginChildWebviewAttempt, PluginChildWebviewBounds, PluginChildWebviewRegistry,
};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub(crate) const MIGRATION_DEADLINE_MS: u64 = 10_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum MigrationStep {
    CaptureSource,
    PrepareHiddenTarget,
    AwaitTargetReady,
    MoveWebview,
    ApplyTargetBounds,
    ConfirmTargetClip,
    RevealTarget,
    FocusTarget,
    TransferNavigation,
    PrepareMainHome,
    SetMainHome,
    HideMain,
    HideTarget,
    RestoreWebview,
    RestoreSourceBoundsAndClip,
    RestoreNavigation,
    RestoreSourceVisibilityAndFocus,
    DestroyTarget,
    PublishOwnership,
}

const FORWARD: [MigrationStep; 8] = [
    MigrationStep::CaptureSource,
    MigrationStep::PrepareHiddenTarget,
    MigrationStep::AwaitTargetReady,
    MigrationStep::MoveWebview,
    MigrationStep::ApplyTargetBounds,
    MigrationStep::ConfirmTargetClip,
    MigrationStep::TransferNavigation,
    MigrationStep::PrepareMainHome,
];
const ROLLBACK: [MigrationStep; 5] = [
    MigrationStep::HideTarget,
    MigrationStep::RestoreWebview,
    MigrationStep::RestoreSourceBoundsAndClip,
    MigrationStep::RestoreNavigation,
    MigrationStep::DestroyTarget,
];
const TARGET_INTERACTIVE_BATCH: [MigrationStep; 4] = [
    MigrationStep::SetMainHome,
    MigrationStep::RevealTarget,
    MigrationStep::FocusTarget,
    MigrationStep::HideMain,
];
const SOURCE_INTERACTIVE_BATCH: [MigrationStep; 1] =
    [MigrationStep::RestoreSourceVisibilityAndFocus];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum MigrationFailure {
    Unavailable,
    Deadline,
    RecoveryUnavailable,
    CreateHiddenWindow,
    AttachShellWebview,
    ConfigureHiddenWindow,
    ConfirmHiddenWindow,
    AdoptSourceCheckpoint,
    ShellReadinessUnavailable,
    ShellReadinessTimeout,
    ShellGeometryUnavailable,
    NativeExecutionUnavailable,
    SourceWindowUnavailable,
    SourceApplicationInactive,
    SourceWindowNotKey,
    SourceCompositionActive,
    HostInteractionBlocked,
    SourceGenerationInvalid,
    SourceGeometryChanged,
    RetainedMoveAtSource,
    RetainedMoveRefusedAtTarget,
    RetainedMoveOwnerUnknown,
    RetainedMoveOriginalDestroyed,
    SourceResizeGuardUnavailable,
}

/// Closed Host diagnostic codes. No identity, payload or native error text is retained.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct MigrationDiagnostic {
    pub(crate) step: MigrationStep,
    pub(crate) failure: MigrationFailure,
    pub(crate) compensation_step: Option<MigrationStep>,
}

impl std::fmt::Display for MigrationDiagnostic {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "plugin window detachment failed: stage={:?} reason={:?}",
            self.step, self.failure
        )?;
        match self.compensation_step {
            Some(step) => write!(
                formatter,
                " outcome=recovery_required compensation_stage={step:?}"
            ),
            None => write!(formatter, " outcome=restored"),
        }
    }
}

pub(crate) struct DetachRequest {
    pub(crate) attempt: PluginChildWebviewAttempt,
    pub(crate) actual_host_source: String,
    pub(crate) owner: PluginChildWebviewOwner,
    /// Rust allocates this label; no plugin or untrusted wire caller selects it.
    pub(crate) target_window_label: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum NativeOriginalOwnership {
    Window(String),
    Destroyed,
    Unknown,
}

/// Target publication carries the exact frame confirmed by the final native
/// batch. Source cancellation preserves the original presentation instead.
pub(crate) enum FinalPresentation {
    Detached(PluginChildWebviewBounds),
    Restored,
}
pub(crate) type PublishOwnership = Box<dyn FnOnce(FinalPresentation) -> bool + Send + 'static>;

/// Implementations keep strong native references and the original navigation
/// lease in Context. `CaptureSource` is read-only; every later operation is
/// compensatable even if it returns an error after a partial side effect.
///
/// Every native mutation must check `guard` inside its execution callback and
/// confirm its actual result. An expired callback cannot mutate during rollback.
/// RestoreNavigation prepares `rollback_owner(transfer)` before final cancellation.
/// DestroyTarget and terminal cleanup use the context's exact target object,
/// never a fresh lookup that could select another window by a reused label.
pub(crate) trait DetachedWindowMigrationAdapter {
    type Context;
    fn report_failure(&self, _diagnostic: MigrationDiagnostic) {}
    fn now_ms(&self) -> u64;
    fn eligible(&self, request: &DetachRequest) -> bool;
    fn recovery_available(&self) -> bool;
    fn new_context(&self, transfer: &PluginChildWebviewOwnershipTransfer) -> Self::Context;
    fn execute(
        &self,
        step: MigrationStep,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
        guard: &NativeExecutionGuard,
        remaining: Duration,
    ) -> Result<(), MigrationFailure>;
    /// Inspect the retained actual native object, never infer destruction from
    /// registry removal or successful submission of a close message.
    fn original_native_owner(&self, context: &Self::Context) -> NativeOriginalOwnership;
    /// Explicit Close may retry the retained exact original after Host registry
    /// removal. Use the same confirmed native destruction primitive; never a
    /// window-label lookup, inverse reparent or new instance.
    fn destroy_retained_original(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
        guard: &NativeExecutionGuard,
    ) -> Result<(), MigrationFailure>;

    /// Hide the exact retained original child through its recovery permit,
    /// then show clipped, trusted main repair chrome. Unknown parent does not
    /// invalidate that view identity, but forbids window cleanup. Never reload,
    /// destroy or reparent the child here; rollback restores prior visibility.
    fn show_main_repair(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
        guard: &NativeExecutionGuard,
    ) -> Result<(), MigrationFailure>;
    /// This is the single confirmed main-thread interactive batch. Target
    /// publication applies native main Home, target reveal/focus and main Hide;
    /// source cancellation reveals/restores the source and conditionally focuses.
    /// Every preceding execute step stays noninteractive (PrepareMainHome is a
    /// JavaScript acknowledgement only). No JS/ready wait occurs in this batch.
    /// Before yielding after a failed batch, quiesce the exact original/target.
    /// Keep the original native snapshot through this final publication.
    /// The adapter validates expected native ownership inside its execution
    /// callback, then invokes publish without a native/registry borrow. Only a
    /// true publication releases the native token; no fallible mutation follows.
    fn publish_ownership(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
        expected_owner: &PluginChildWebviewOwner,
        guard: &NativeExecutionGuard,
        remaining: Duration,
        publish: PublishOwnership,
    ) -> Result<bool, MigrationFailure>;
    /// A terminal winner owns instance destruction. This cleans only the
    /// transaction's uncommitted target and cannot revive or reparent any view.
    fn cleanup_terminated_target(
        &self,
        transfer: &PluginChildWebviewOwnershipTransfer,
        context: &mut Self::Context,
    ) -> Result<(), MigrationFailure>;
}

pub(crate) enum DetachOutcome<C> {
    Rejected,
    Committed {
        attempt: PluginChildWebviewAttempt,
        owner: PluginChildWebviewOwner,
    },
    RolledBack {
        failed_step: MigrationStep,
        failure: MigrationFailure,
        owner: PluginChildWebviewOwner,
    },
    Terminated,
    Superseded,
    /// This is explicitly not a successful rollback. Retain Context for repair;
    /// do not destroy/recreate the original instance or publish success.
    RecoveryRequired {
        failed_step: MigrationStep,
        failure: MigrationFailure,
        recovery_step: MigrationStep,
        transfer: PluginChildWebviewOwnershipTransfer,
        context: C,
    },
}

pub(crate) fn rollback_owner(
    transfer: &PluginChildWebviewOwnershipTransfer,
) -> PluginChildWebviewOwner {
    PluginChildWebviewOwner {
        window_label: transfer.source.window_label.clone(),
        revision: transfer.target.revision,
    }
}

fn remaining(adapter: &impl DetachedWindowMigrationAdapter, deadline: u64) -> Option<Duration> {
    deadline
        .checked_sub(adapter.now_ms())
        .filter(|ms| *ms != 0)
        .map(Duration::from_millis)
}

pub(crate) fn run_detachment<
    H: PluginChildWebviewNativeHandle,
    A: DetachedWindowMigrationAdapter,
>(
    registry: &Arc<PluginChildWebviewRegistry<H>>,
    adapter: &A,
    request: DetachRequest,
) -> DetachOutcome<A::Context> {
    if !adapter.eligible(&request) || !adapter.recovery_available() {
        return DetachOutcome::Rejected;
    }
    let Some(transfer) = registry.begin_ownership_transfer(
        request.attempt,
        &request.actual_host_source,
        &request.owner,
        &request.target_window_label,
    ) else {
        return DetachOutcome::Rejected;
    };
    let mut context = adapter.new_context(&transfer);
    let guard = registry.ownership_transfer_guard(&transfer);
    let deadline = adapter.now_ms().saturating_add(MIGRATION_DEADLINE_MS);
    let mut failed = None;
    for step in FORWARD {
        if !guard.is_current() {
            return terminal(registry, adapter, &transfer, context, step);
        }
        // Admission already checked recovery. Once reserved, capture the source
        // fence and rollback route before acting on a subsequent recovery loss.
        // No native target is created or moved by CaptureSource.
        if step != MigrationStep::CaptureSource && !adapter.recovery_available() {
            failed = Some((step, MigrationFailure::RecoveryUnavailable));
            break;
        }
        let Some(budget) = remaining(adapter, deadline) else {
            failed = Some((step, MigrationFailure::Deadline));
            break;
        };
        let stage_guard = guard.with_deadline(budget);
        let result = adapter.execute(step, &transfer, &mut context, &stage_guard, budget);
        // Invalidate any queued callback before issuing a compensating operation.
        stage_guard.expire();
        if !guard.is_current() {
            return terminal(registry, adapter, &transfer, context, step);
        }
        if let Err(failure) = result {
            failed = Some((step, failure));
            break;
        }
        if remaining(adapter, deadline).is_none() {
            failed = Some((step, MigrationFailure::Deadline));
            break;
        }
    }
    if failed.is_none() && !adapter.recovery_available() {
        failed = Some((
            MigrationStep::HideMain,
            MigrationFailure::RecoveryUnavailable,
        ));
    }
    if failed.is_none() {
        if !guard.is_current() {
            return terminal(
                registry,
                adapter,
                &transfer,
                context,
                MigrationStep::HideMain,
            );
        }
        let mut publication_failure = MigrationFailure::Unavailable;
        if let Some(budget) = remaining(adapter, deadline) {
            let publish_registry = registry.clone();
            let publish_transfer = transfer.clone();
            let stage_guard = guard.with_deadline(budget);
            let publication_guard = stage_guard.clone();
            let publication = adapter.publish_ownership(
                &transfer,
                &mut context,
                &transfer.target,
                &stage_guard,
                budget,
                Box::new(move |presentation| {
                    let FinalPresentation::Detached(bounds) = presentation else {
                        return false;
                    };
                    publish_registry.commit_ownership_transfer_presentation_if(
                        &publish_transfer,
                        bounds,
                        &publication_guard,
                    )
                }),
            );
            publication_failure = publication.err().unwrap_or(MigrationFailure::Unavailable);
            stage_guard.expire();
            // A callback can publish successfully even if its reply is lost.
            // Exact registry ownership is the decision, not transport success.
            if transfer.publication_receipt.read() == Some(TransferPublication::Committed) {
                return DetachOutcome::Committed {
                    attempt: transfer.attempt,
                    owner: transfer.target,
                };
            }
        }
        if !guard.is_current() {
            return terminal(
                registry,
                adapter,
                &transfer,
                context,
                MigrationStep::HideMain,
            );
        }
        failed = Some((MigrationStep::PublishOwnership, publication_failure));
    }
    let (failed_step, failure) = failed.expect("forward phase has a failure");
    rollback_detachment(registry, adapter, transfer, context, failed_step, failure)
}

fn rollback_detachment<H: PluginChildWebviewNativeHandle, A: DetachedWindowMigrationAdapter>(
    registry: &Arc<PluginChildWebviewRegistry<H>>,
    adapter: &A,
    transfer: PluginChildWebviewOwnershipTransfer,
    mut context: A::Context,
    failed_step: MigrationStep,
    failure: MigrationFailure,
) -> DetachOutcome<A::Context> {
    let guard = registry.ownership_transfer_guard(&transfer);
    let rollback_deadline = adapter.now_ms().saturating_add(MIGRATION_DEADLINE_MS);
    for step in ROLLBACK {
        if !guard.is_current() {
            return terminal(registry, adapter, &transfer, context, step);
        }
        let Some(budget) = remaining(adapter, rollback_deadline) else {
            return DetachOutcome::RecoveryRequired {
                failed_step,
                failure,
                recovery_step: step,
                transfer,
                context,
            };
        };
        if step == MigrationStep::DestroyTarget && !target_is_empty(adapter, &transfer, &context) {
            return DetachOutcome::RecoveryRequired {
                failed_step,
                failure,
                recovery_step: step,
                transfer,
                context,
            };
        }
        let stage_guard = guard.with_deadline(budget);
        let result = adapter.execute(step, &transfer, &mut context, &stage_guard, budget);
        stage_guard.expire();
        if !guard.is_current() {
            return terminal(registry, adapter, &transfer, context, step);
        }
        if result.is_err() || remaining(adapter, rollback_deadline).is_none() {
            return DetachOutcome::RecoveryRequired {
                failed_step,
                failure,
                recovery_step: step,
                transfer,
                context,
            };
        }
    }
    // Restore operations have already acknowledged the renewed source owner and
    // cleaned the exact uncommitted target. Cancellation is the last publication.
    let owner = rollback_owner(&transfer);
    if let Some(budget) = remaining(adapter, rollback_deadline) {
        let publish_registry = registry.clone();
        let publish_transfer = transfer.clone();
        let stage_guard = guard.with_deadline(budget);
        let publication_guard = stage_guard.clone();
        let _ = adapter.publish_ownership(
            &transfer,
            &mut context,
            &owner,
            &stage_guard,
            budget,
            Box::new(move |presentation| {
                matches!(presentation, FinalPresentation::Restored)
                    && publish_registry
                        .cancel_ownership_transfer_if(&publish_transfer, &publication_guard)
            }),
        );
        stage_guard.expire();
        if transfer.publication_receipt.read() == Some(TransferPublication::Cancelled) {
            return DetachOutcome::RolledBack {
                failed_step,
                failure,
                owner,
            };
        }
    }
    if !guard.is_current() {
        terminal(
            registry,
            adapter,
            &transfer,
            context,
            MigrationStep::PublishOwnership,
        )
    } else {
        DetachOutcome::RecoveryRequired {
            failed_step,
            failure,
            recovery_step: MigrationStep::PublishOwnership,
            transfer,
            context,
        }
    }
}

fn target_is_empty<A: DetachedWindowMigrationAdapter>(
    adapter: &A,
    transfer: &PluginChildWebviewOwnershipTransfer,
    context: &A::Context,
) -> bool {
    match adapter.original_native_owner(context) {
        NativeOriginalOwnership::Destroyed => true,
        NativeOriginalOwnership::Window(label) => {
            label == transfer.source.window_label && label != transfer.target.window_label
        }
        NativeOriginalOwnership::Unknown => false,
    }
}

fn terminal<H: PluginChildWebviewNativeHandle, A: DetachedWindowMigrationAdapter>(
    _registry: &Arc<PluginChildWebviewRegistry<H>>,
    adapter: &A,
    transfer: &PluginChildWebviewOwnershipTransfer,
    mut context: A::Context,
    step: MigrationStep,
) -> DetachOutcome<A::Context> {
    if transfer.publication_receipt.read().is_some() {
        // A committed window can now host a replacement instance. Its old
        // transaction receipt outlives the old attempt and forbids cleanup.
        return DetachOutcome::Superseded;
    }
    if adapter.original_native_owner(&context) == NativeOriginalOwnership::Destroyed
        && adapter
            .cleanup_terminated_target(transfer, &mut context)
            .is_ok()
    {
        DetachOutcome::Terminated
    } else {
        DetachOutcome::RecoveryRequired {
            failed_step: step,
            failure: MigrationFailure::Unavailable,
            recovery_step: MigrationStep::DestroyTarget,
            transfer: transfer.clone(),
            context,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RecoveryTicket {
    pub(crate) attempt: PluginChildWebviewAttempt,
    pub(crate) token: crate::plugin_child_webview_owner::PluginChildWebviewMigrationToken,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RecoveryStatus {
    RecoveryRequired,
    Recovering,
    Closing,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RecoverySnapshot {
    pub(crate) ticket: RecoveryTicket,
    pub(crate) status: RecoveryStatus,
    pub(crate) failed_step: MigrationStep,
    pub(crate) recovery_step: MigrationStep,
    pub(crate) repair_visible: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum RecoveryActionResult {
    Rejected,
    Busy,
    Committed(PluginChildWebviewOwner),
    RolledBack(RestoredMigration),
    RecoveryRequired(RecoveryTicket),
    Closing(RecoveryTicket),
    Terminated,
    Superseded,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RestoredMigration {
    pub(crate) owner: PluginChildWebviewOwner,
    pub(crate) diagnostic: MigrationDiagnostic,
}

struct RecoveryRecord<C> {
    transfer: PluginChildWebviewOwnershipTransfer,
    context: Option<C>,
    failed_step: MigrationStep,
    failure: MigrationFailure,
    recovery_step: MigrationStep,
    status: RecoveryStatus,
    busy: bool,
    repair_visible: bool,
    active: Arc<AtomicBool>,
    repair_epoch: Arc<AtomicBool>,
}

/// App-owned in-memory retention. Context includes the original native rollback
/// token, never serialized plugin state. No mutex is held across native work.
pub(crate) struct DetachedWindowRecoveryCoordinator<
    H: PluginChildWebviewNativeHandle,
    A: DetachedWindowMigrationAdapter,
> {
    registry: Arc<PluginChildWebviewRegistry<H>>,
    adapter: Arc<A>,
    records: Mutex<BTreeMap<PluginChildWebviewAttempt, RecoveryRecord<A::Context>>>,
}

impl<H: PluginChildWebviewNativeHandle, A: DetachedWindowMigrationAdapter>
    DetachedWindowRecoveryCoordinator<H, A>
{
    pub(crate) fn new(registry: Arc<PluginChildWebviewRegistry<H>>, adapter: Arc<A>) -> Self {
        Self {
            registry,
            adapter,
            records: Mutex::new(BTreeMap::new()),
        }
    }

    pub(crate) fn detach(&self, request: DetachRequest) -> RecoveryActionResult {
        self.finish(
            run_detachment(&self.registry, self.adapter.as_ref(), request),
            None,
        )
    }

    pub(crate) fn recovery_snapshots(&self) -> Vec<RecoverySnapshot> {
        self.records
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .values()
            .map(|record| RecoverySnapshot {
                ticket: ticket(&record.transfer),
                status: record.status,
                failed_step: record.failed_step,
                recovery_step: record.recovery_step,
                repair_visible: record.repair_visible,
            })
            .collect()
    }

    pub(crate) fn retry_recovery(
        &self,
        ticket: &RecoveryTicket,
        actual_host_source: &str,
    ) -> RecoveryActionResult {
        let (transfer, context, failed_step, failure) = {
            let mut records = self
                .records
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let Some(record) = records
                .get_mut(&ticket.attempt)
                .filter(|record| authorized_recovery(record, ticket, actual_host_source))
            else {
                return RecoveryActionResult::Rejected;
            };
            if record.busy {
                return RecoveryActionResult::Busy;
            }
            let Some(context) = record.context.take() else {
                return RecoveryActionResult::Busy;
            };
            record.busy = true;
            record.status = if record.status == RecoveryStatus::Closing {
                RecoveryStatus::Closing
            } else {
                RecoveryStatus::Recovering
            };
            (
                record.transfer.clone(),
                context,
                record.failed_step,
                record.failure,
            )
        };
        let outcome = if self.registry.ownership_transfer_is_current(&transfer) {
            // Explicit retry starts only compensation, preserving the original
            // snapshot/token and never replaying a forward or bootstrap step.
            rollback_detachment(
                &self.registry,
                self.adapter.as_ref(),
                transfer,
                context,
                failed_step,
                failure,
            )
        } else {
            terminal(
                &self.registry,
                self.adapter.as_ref(),
                &transfer,
                context,
                MigrationStep::DestroyTarget,
            )
        };
        self.finish(outcome, Some(ticket))
    }

    pub(crate) fn close_recovery(
        &self,
        ticket: &RecoveryTicket,
        actual_host_source: &str,
    ) -> RecoveryActionResult {
        {
            let mut records = self
                .records
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let Some(record) = records
                .get_mut(&ticket.attempt)
                .filter(|record| authorized_recovery(record, ticket, actual_host_source))
            else {
                return RecoveryActionResult::Rejected;
            };
            record.status = RecoveryStatus::Closing;
            record.repair_epoch.store(false, Ordering::Release);
        }
        // Terminal service revokes ingress, Session and source authority BEFORE
        // destroying the exact original handle, regardless of its actual parent.
        let _ = self.registry.compare_current_teardown(ticket.attempt);
        self.cleanup_ticket(ticket, true)
    }

    /// Called after native lifecycle invalidation. It never attempts rollback;
    /// an old callback can select only its exact retained ticket/target object.
    pub(crate) fn reconcile_terminated(&self) -> Vec<RecoveryActionResult> {
        let tickets = {
            let records = self
                .records
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            records
                .values()
                .filter(|record| {
                    !self
                        .registry
                        .ownership_transfer_is_current(&record.transfer)
                })
                .map(|record| ticket(&record.transfer))
                .collect::<Vec<_>>()
        };
        tickets
            .iter()
            .map(|ticket| self.cleanup_ticket(ticket, false))
            .collect()
    }

    fn cleanup_ticket(
        &self,
        ticket: &RecoveryTicket,
        explicit_close: bool,
    ) -> RecoveryActionResult {
        let (transfer, mut context, active) = {
            let mut records = self
                .records
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let Some(record) = records
                .get_mut(&ticket.attempt)
                .filter(|record| record.transfer.token == ticket.token)
            else {
                return RecoveryActionResult::Rejected;
            };
            record.status = RecoveryStatus::Closing;
            record.repair_epoch.store(false, Ordering::Release);
            if record.busy {
                return RecoveryActionResult::Closing(ticket.clone());
            }
            let Some(context) = record.context.take() else {
                return RecoveryActionResult::Closing(ticket.clone());
            };
            record.busy = true;
            record.status = RecoveryStatus::Closing;
            (record.transfer.clone(), context, record.active.clone())
        };
        if explicit_close
            && self.registry.snapshot_attempt(ticket.attempt).is_none()
            && self.adapter.original_native_owner(&context) != NativeOriginalOwnership::Destroyed
        {
            let guard = NativeExecutionGuard::new(move || active.load(Ordering::Acquire))
                .with_deadline(Duration::from_millis(MIGRATION_DEADLINE_MS));
            let _ = self
                .adapter
                .destroy_retained_original(&transfer, &mut context, &guard);
            guard.expire();
        }
        self.finish(
            terminal(
                &self.registry,
                self.adapter.as_ref(),
                &transfer,
                context,
                MigrationStep::DestroyTarget,
            ),
            Some(ticket),
        )
    }

    fn finish(
        &self,
        outcome: DetachOutcome<A::Context>,
        existing: Option<&RecoveryTicket>,
    ) -> RecoveryActionResult {
        let result = match outcome {
            DetachOutcome::Rejected => RecoveryActionResult::Rejected,
            DetachOutcome::Committed { owner, .. } => RecoveryActionResult::Committed(owner),
            DetachOutcome::RolledBack {
                owner,
                failed_step,
                failure,
            } => {
                let diagnostic = MigrationDiagnostic {
                    step: failed_step,
                    failure,
                    compensation_step: None,
                };
                self.adapter.report_failure(diagnostic);
                RecoveryActionResult::RolledBack(RestoredMigration { owner, diagnostic })
            }
            DetachOutcome::Terminated => RecoveryActionResult::Terminated,
            DetachOutcome::Superseded => RecoveryActionResult::Superseded,
            DetachOutcome::RecoveryRequired {
                failed_step,
                failure,
                recovery_step,
                transfer,
                context,
            } => {
                let current_ticket = ticket(&transfer);
                self.registry.retain_recovery_required(&transfer);
                let diagnostic = {
                    let mut records = self
                        .records
                        .lock()
                        .unwrap_or_else(|error| error.into_inner());
                    let record =
                        records
                            .entry(transfer.attempt)
                            .or_insert_with(|| RecoveryRecord {
                                transfer: transfer.clone(),
                                context: None,
                                failed_step,
                                failure,
                                recovery_step,
                                status: RecoveryStatus::RecoveryRequired,
                                busy: false,
                                repair_visible: false,
                                active: Arc::new(AtomicBool::new(true)),
                                repair_epoch: Arc::new(AtomicBool::new(true)),
                            });
                    // Attempts and tokens never reuse; the only update is the
                    // outstanding operation returning its own retained Context.
                    assert_eq!(record.transfer.token, transfer.token);
                    record.context = Some(context);
                    record.repair_epoch.store(false, Ordering::Release);
                    record.repair_epoch = Arc::new(AtomicBool::new(true));
                    record.recovery_step = recovery_step;
                    record.busy = false;
                    if record.status != RecoveryStatus::Closing {
                        record.status = RecoveryStatus::RecoveryRequired;
                    }
                    MigrationDiagnostic {
                        step: record.failed_step,
                        failure: record.failure,
                        compensation_step: Some(recovery_step),
                    }
                };
                self.adapter.report_failure(diagnostic);
                if let Some(result) = self.show_repair(&current_ticket) {
                    return result;
                }
                return RecoveryActionResult::RecoveryRequired(current_ticket);
            }
        };
        if let Some(ticket) = existing {
            self.remove_record(ticket);
        }
        result
    }

    fn show_repair(&self, ticket: &RecoveryTicket) -> Option<RecoveryActionResult> {
        let (transfer, mut context, active, repair_epoch, was_closing) = {
            let mut records = self
                .records
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let Some(record) = records
                .get_mut(&ticket.attempt)
                .filter(|record| record.transfer.token == ticket.token && !record.busy)
            else {
                return None;
            };
            let Some(context) = record.context.take() else {
                return None;
            };
            record.busy = true;
            (
                record.transfer.clone(),
                context,
                record.active.clone(),
                record.repair_epoch.clone(),
                record.status == RecoveryStatus::Closing,
            )
        };
        let registry = self.registry.clone();
        let repair_transfer = transfer.clone();
        let initially_current = registry.ownership_transfer_is_current(&transfer);
        let guard = NativeExecutionGuard::new(move || {
            active.load(Ordering::Acquire)
                && repair_epoch.load(Ordering::Acquire)
                && !registry.is_shutting_down()
                && if initially_current {
                    registry.ownership_transfer_is_current(&repair_transfer)
                } else {
                    registry
                        .snapshot_for_surface("main")
                        .is_none_or(|snapshot| snapshot.attempt == repair_transfer.attempt)
                }
        })
        .with_deadline(Duration::from_millis(MIGRATION_DEADLINE_MS));
        let visible = self
            .adapter
            .show_main_repair(&transfer, &mut context, &guard)
            .is_ok();
        guard.expire();
        let mut records = self
            .records
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let mut close_arrived = false;
        if let Some(record) = records
            .get_mut(&ticket.attempt)
            .filter(|record| record.transfer.token == ticket.token)
        {
            record.context = Some(context);
            record.busy = false;
            record.repair_visible = visible;
            close_arrived = !was_closing && record.status == RecoveryStatus::Closing;
        }
        drop(records);
        close_arrived.then(|| self.cleanup_ticket(ticket, false))
    }

    fn remove_record(&self, ticket: &RecoveryTicket) {
        let removed = {
            let mut records = self
                .records
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if records
                .get(&ticket.attempt)
                .is_some_and(|record| record.transfer.token == ticket.token)
            {
                records.remove(&ticket.attempt)
            } else {
                None
            }
        };
        if let Some(record) = removed {
            record.active.store(false, Ordering::Release);
            record.repair_epoch.store(false, Ordering::Release);
            self.registry.release_recovery_required(&record.transfer);
        }
    }
}

fn ticket(transfer: &PluginChildWebviewOwnershipTransfer) -> RecoveryTicket {
    RecoveryTicket {
        attempt: transfer.attempt,
        token: transfer.token,
    }
}

fn authorized_recovery<C>(
    record: &RecoveryRecord<C>,
    ticket: &RecoveryTicket,
    actual_host_source: &str,
) -> bool {
    record.transfer.attempt == ticket.attempt
        && record.transfer.token == ticket.token
        && record.transfer.source.window_label == "main"
        && actual_host_source == "main"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_child_webview_service::{
        PluginChildWebviewIdentity, PluginChildWebviewReadyDispatcher,
        PluginChildWebviewReadyFacts, PluginChildWebviewReadyResult,
    };
    use serde_json::Value;
    use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
    use std::sync::{mpsc, Mutex};

    #[derive(Default)]
    struct WorkModel {
        input: String,
        undo: Vec<String>,
        selection: (usize, usize),
        result: Option<String>,
        worker: usize,
        pending: bool,
        alive: bool,
    }
    impl WorkModel {
        fn edit(&mut self, value: &str) {
            self.undo
                .push(std::mem::replace(&mut self.input, value.into()));
        }
        fn complete(&mut self, value: &str) {
            assert!(self.pending && self.alive);
            self.pending = false;
            self.result = Some(value.into());
        }
        fn undo(&mut self) {
            self.input = self.undo.pop().unwrap();
        }
    }
    #[derive(Clone)]
    struct FakeHandle {
        label: String,
        destroys: Arc<AtomicUsize>,
        fail_destroy: Arc<AtomicBool>,
        model: Arc<Mutex<WorkModel>>,
    }
    impl PluginChildWebviewNativeHandle for FakeHandle {
        fn source_label(&self) -> String {
            self.label.clone()
        }
        fn ensure_rounded_corners(&self) -> Result<(), ()> {
            Ok(())
        }
        fn hide_unconfirmed_content(&self) -> Result<(), ()> {
            Ok(())
        }
        fn update_bounds(&self, _: i32, _: i32, _: u32, _: u32) -> Result<(), ()> {
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
        fn deliver_bridge_frame(&self, _: &Value) -> Result<(), ()> {
            Ok(())
        }
        fn destroy(&self) -> Result<(), ()> {
            self.destroys.fetch_add(1, Ordering::SeqCst);
            if self.fail_destroy.load(Ordering::SeqCst) {
                return Err(());
            }
            self.model.lock().unwrap().alive = false;
            Ok(())
        }
    }
    struct Ready;
    impl PluginChildWebviewReadyDispatcher for Ready {
        fn accept_ready(&self, _: &PluginChildWebviewReadyFacts) -> bool {
            true
        }
    }
    fn instance(
        registry: &Arc<PluginChildWebviewRegistry<FakeHandle>>,
        owner: PluginChildWebviewOwner,
    ) -> (PluginChildWebviewAttempt, FakeHandle) {
        let identity = PluginChildWebviewIdentity::new(
            "plugin-a",
            "page-a",
            "entry-a",
            "1.0.0",
            1,
            "lensx-plugin://test.runtime.localhost/index.html"
                .parse()
                .unwrap(),
            "/",
        )
        .unwrap();
        let attempt = registry
            .reserve_owned_with_derived_label(identity, owner)
            .unwrap();
        let facts = registry.creation_facts(attempt).unwrap();
        let handle = FakeHandle {
            label: facts.source_label.clone(),
            destroys: Arc::new(AtomicUsize::new(0)),
            fail_destroy: Arc::new(AtomicBool::new(false)),
            model: Arc::new(Mutex::new(WorkModel {
                input: "original".into(),
                selection: (1, 3),
                worker: 7,
                pending: true,
                alive: true,
                ..WorkModel::default()
            })),
        };
        assert!(registry.attach_current(attempt, handle.clone()));
        assert!(registry.mark_native_loaded(attempt, &facts.source_label));
        let _ = registry.attach_ready_dispatcher(Arc::new(Ready));
        let frame = serde_json::json!({"contract_version":"0.2.0","type":"lensx.plugin_bridge.ready","freshness":facts.freshness}).to_string();
        assert_eq!(
            registry.accept_ready_ingress(attempt, &facts.source_label, &frame),
            PluginChildWebviewReadyResult::Accepted
        );
        assert!(registry.mark_sdk_ready_after_context(
            attempt,
            &facts.source_label,
            "runtime.get_context",
            true
        ));
        (attempt, handle)
    }
    #[derive(Clone, Debug, PartialEq)]
    struct Presentation {
        native_window: String,
        navigation: PluginChildWebviewOwner,
        main_visible: bool,
        main_size: (u32, u32),
        target: bool,
        target_visible: bool,
        child_visible: bool,
        bounds: PluginChildWebviewBounds,
        focused: String,
    }
    impl Default for Presentation {
        fn default() -> Self {
            Self {
                native_window: "main".into(),
                navigation: PluginChildWebviewOwner::main(),
                main_visible: true,
                main_size: (900, 700),
                target: false,
                target_visible: false,
                child_visible: true,
                bounds: PluginChildWebviewBounds {
                    x: 0,
                    y: 40,
                    width: 900,
                    height: 660,
                },
                focused: "original-responder".into(),
            }
        }
    }
    struct Context {
        original: Option<Presentation>,
        handle: Option<Arc<FakeHandle>>,
    }
    #[derive(Clone, Copy, Debug)]
    enum Terminal {
        Close,
        Replace,
        Disable,
        Upgrade,
        Reload,
        Quit,
    }
    struct Pause {
        step: MigrationStep,
        started: mpsc::Sender<()>,
        release: Mutex<mpsc::Receiver<()>>,
    }
    struct FakeAdapter {
        registry: Arc<PluginChildWebviewRegistry<FakeHandle>>,
        presentation: Mutex<Presentation>,
        log: Mutex<Vec<MigrationStep>>,
        saved_guards: Mutex<Vec<NativeExecutionGuard>>,
        now: AtomicU64,
        recovery: AtomicBool,
        lose_recovery_at_reservation: bool,
        fail: Option<(MigrationStep, bool)>,
        fail_kind: MigrationFailure,
        diagnostics: Mutex<Vec<MigrationDiagnostic>>,
        fail_rollback: Option<MigrationStep>,
        terminal: Option<(MigrationStep, Terminal)>,
        timeout: Option<MigrationStep>,
        lose_recovery: Option<MigrationStep>,
        pause: Option<Pause>,
        duplicate: Option<MigrationStep>,
        targets: AtomicUsize,
        owner_unknown: AtomicBool,
        fail_repair: AtomicBool,
        native_restores: AtomicUsize,
        rollback_failure_active: AtomicBool,
        pause_enabled: AtomicBool,
        publication_failure: AtomicUsize,
        fail_source_publication: AtomicBool,
        queued_publications: Mutex<Vec<(NativeExecutionGuard, Box<dyn FnOnce() -> bool + Send>)>>,
        timeout_active: AtomicBool,
        repair_pause: Option<Pause>,
        repair_mutations: AtomicUsize,
        publication_pause: Option<Pause>,
        publication_pause_enabled: AtomicBool,
    }
    impl FakeAdapter {
        fn new(registry: Arc<PluginChildWebviewRegistry<FakeHandle>>) -> Self {
            Self {
                registry,
                presentation: Mutex::new(Presentation::default()),
                log: Mutex::new(Vec::new()),
                saved_guards: Mutex::new(Vec::new()),
                now: AtomicU64::new(0),
                recovery: AtomicBool::new(true),
                lose_recovery_at_reservation: false,
                fail: None,
                fail_kind: MigrationFailure::Unavailable,
                diagnostics: Mutex::new(Vec::new()),
                fail_rollback: None,
                terminal: None,
                timeout: None,
                lose_recovery: None,
                pause: None,
                duplicate: None,
                targets: AtomicUsize::new(0),
                owner_unknown: AtomicBool::new(false),
                fail_repair: AtomicBool::new(false),
                native_restores: AtomicUsize::new(0),
                rollback_failure_active: AtomicBool::new(true),
                pause_enabled: AtomicBool::new(true),
                publication_failure: AtomicUsize::new(0),
                fail_source_publication: AtomicBool::new(false),
                queued_publications: Mutex::new(Vec::new()),
                timeout_active: AtomicBool::new(true),
                repair_pause: None,
                repair_mutations: AtomicUsize::new(0),
                publication_pause: None,
                publication_pause_enabled: AtomicBool::new(true),
            }
        }
        fn terminate(&self, transfer: &PluginChildWebviewOwnershipTransfer, terminal: Terminal) {
            match terminal {
                Terminal::Close | Terminal::Replace => {
                    self.registry
                        .compare_current_teardown(transfer.attempt)
                        .unwrap();
                }
                Terminal::Disable => {
                    self.registry
                        .teardown_entry_instances("entry-a", None)
                        .unwrap();
                }
                Terminal::Upgrade => {
                    self.registry
                        .teardown_entry_instances("entry-a", Some(2))
                        .unwrap();
                }
                Terminal::Reload => {
                    self.registry.teardown_instances().unwrap();
                }
                Terminal::Quit => {
                    self.registry.teardown_all().unwrap();
                }
            }
            if matches!(terminal, Terminal::Replace) {
                let _ = instance(&self.registry, PluginChildWebviewOwner::main());
            }
        }
    }
    impl DetachedWindowMigrationAdapter for FakeAdapter {
        type Context = Context;
        fn report_failure(&self, diagnostic: MigrationDiagnostic) {
            self.diagnostics.lock().unwrap().push(diagnostic);
        }
        fn now_ms(&self) -> u64 {
            self.now.load(Ordering::SeqCst)
        }
        fn eligible(&self, _: &DetachRequest) -> bool {
            true
        }
        fn recovery_available(&self) -> bool {
            self.recovery.load(Ordering::SeqCst)
        }
        fn new_context(&self, transfer: &PluginChildWebviewOwnershipTransfer) -> Context {
            if self.lose_recovery_at_reservation {
                self.recovery.store(false, Ordering::SeqCst);
            }
            Context {
                original: None,
                handle: self.registry.handle_for_transfer(transfer),
            }
        }
        fn execute(
            &self,
            step: MigrationStep,
            transfer: &PluginChildWebviewOwnershipTransfer,
            context: &mut Context,
            guard: &NativeExecutionGuard,
            remaining: Duration,
        ) -> Result<(), MigrationFailure> {
            assert!(remaining <= Duration::from_millis(MIGRATION_DEADLINE_MS));
            self.log.lock().unwrap().push(step);
            self.saved_guards.lock().unwrap().push(guard.clone());
            // Reenter the production registry from inside the adapter: retaining
            // its mutex across native execution would deadlock this test.
            assert!(self.registry.snapshot_attempt(transfer.attempt).is_some());
            if let Some(pause) = &self.pause {
                if pause.step == step && self.pause_enabled.load(Ordering::SeqCst) {
                    pause.started.send(()).unwrap();
                    pause.release.lock().unwrap().recv().unwrap();
                }
            }
            if !guard.is_current() {
                return Err(MigrationFailure::Unavailable);
            }
            if self.fail == Some((step, false)) {
                return Err(self.fail_kind);
            }
            if self.fail_rollback == Some(step)
                && self.rollback_failure_active.load(Ordering::SeqCst)
            {
                return Err(MigrationFailure::Unavailable);
            }
            {
                let mut state = self.presentation.lock().unwrap();
                match step {
                    MigrationStep::CaptureSource => context.original = Some(state.clone()),
                    MigrationStep::PrepareHiddenTarget => {
                        state.target = true;
                        self.targets.fetch_add(1, Ordering::SeqCst);
                    }
                    MigrationStep::AwaitTargetReady => {}
                    MigrationStep::MoveWebview => {
                        state.child_visible = false;
                        state.native_window = transfer.target.window_label.clone()
                    }
                    MigrationStep::ApplyTargetBounds => {
                        state.bounds = PluginChildWebviewBounds {
                            x: 0,
                            y: 44,
                            width: 880,
                            height: 636,
                        }
                    }
                    MigrationStep::ConfirmTargetClip => {}
                    MigrationStep::RevealTarget => state.target_visible = true,
                    MigrationStep::FocusTarget => state.focused = "original-responder".into(),
                    MigrationStep::TransferNavigation => state.navigation = transfer.target.clone(),
                    MigrationStep::PrepareMainHome => {}
                    MigrationStep::SetMainHome => state.main_size = (650, 320),
                    MigrationStep::HideMain => state.main_visible = false,
                    MigrationStep::HideTarget => state.target_visible = false,
                    MigrationStep::RestoreWebview => {
                        self.native_restores.fetch_add(1, Ordering::SeqCst);
                        state.native_window = transfer.source.window_label.clone()
                    }
                    MigrationStep::RestoreSourceBoundsAndClip => {
                        if let Some(original) = &context.original {
                            state.bounds = original.bounds;
                            state.main_size = original.main_size;
                        }
                    }
                    MigrationStep::RestoreNavigation => state.navigation = rollback_owner(transfer),
                    MigrationStep::RestoreSourceVisibilityAndFocus => {
                        state.main_visible = true;
                        if let Some(original) = &context.original {
                            state.focused = original.focused.clone();
                            state.child_visible = original.child_visible;
                        }
                    }
                    MigrationStep::DestroyTarget => {
                        state.target = false;
                        state.target_visible = false;
                    }
                    MigrationStep::PublishOwnership => {
                        unreachable!("publication has its own retained-token hook")
                    }
                }
            }
            if self.duplicate == Some(step) {
                let attempt = transfer.attempt;
                let second = run_detachment(
                    &self.registry,
                    self,
                    DetachRequest {
                        attempt,
                        actual_host_source: "main".into(),
                        owner: transfer.source.clone(),
                        target_window_label: PluginChildWebviewOwner::detached(99)
                            .unwrap()
                            .window_label,
                    },
                );
                assert!(matches!(second, DetachOutcome::Rejected));
            }
            if let Some((at, terminal)) = self.terminal {
                if at == step {
                    self.terminate(transfer, terminal);
                }
            }
            if self.timeout == Some(step) && self.timeout_active.load(Ordering::SeqCst) {
                self.now
                    .fetch_add(remaining.as_millis() as u64, Ordering::SeqCst);
            }
            if self.lose_recovery == Some(step) {
                self.recovery.store(false, Ordering::SeqCst);
            }
            if self.fail == Some((step, true)) {
                return Err(self.fail_kind);
            }
            Ok(())
        }
        fn original_native_owner(&self, context: &Context) -> NativeOriginalOwnership {
            if self.owner_unknown.load(Ordering::SeqCst) {
                return NativeOriginalOwnership::Unknown;
            }
            if context
                .handle
                .as_ref()
                .is_some_and(|handle| !handle.model.lock().unwrap().alive)
            {
                NativeOriginalOwnership::Destroyed
            } else {
                NativeOriginalOwnership::Window(
                    self.presentation.lock().unwrap().native_window.clone(),
                )
            }
        }
        fn destroy_retained_original(
            &self,
            _: &PluginChildWebviewOwnershipTransfer,
            context: &mut Context,
            guard: &NativeExecutionGuard,
        ) -> Result<(), MigrationFailure> {
            if !guard.is_current() {
                return Err(MigrationFailure::Unavailable);
            }
            if let Some(handle) = &context.handle {
                if handle.model.lock().unwrap().alive {
                    handle
                        .destroy()
                        .map_err(|_| MigrationFailure::Unavailable)?;
                }
            }
            Ok(())
        }
        fn show_main_repair(
            &self,
            _: &PluginChildWebviewOwnershipTransfer,
            context: &mut Context,
            guard: &NativeExecutionGuard,
        ) -> Result<(), MigrationFailure> {
            if let Some(pause) = &self.repair_pause {
                pause.started.send(()).unwrap();
                pause.release.lock().unwrap().recv().unwrap();
            }
            if !guard.is_current() || self.fail_repair.load(Ordering::SeqCst) {
                return Err(MigrationFailure::Unavailable);
            }
            self.repair_mutations.fetch_add(1, Ordering::SeqCst);
            let mut state = self.presentation.lock().unwrap();
            if context.original.is_none() {
                context.original = Some(state.clone());
            }
            state.child_visible = false;
            state.main_visible = true;
            Ok(())
        }
        fn publish_ownership(
            &self,
            transfer: &PluginChildWebviewOwnershipTransfer,
            context: &mut Context,
            expected_owner: &PluginChildWebviewOwner,
            guard: &NativeExecutionGuard,
            remaining: Duration,
            publish: PublishOwnership,
        ) -> Result<bool, MigrationFailure> {
            assert!(remaining <= Duration::from_millis(MIGRATION_DEADLINE_MS));
            if !guard.is_current()
                || self.original_native_owner(context)
                    != NativeOriginalOwnership::Window(expected_owner.window_label.clone())
            {
                return Err(MigrationFailure::Unavailable);
            }
            let mode = self.publication_failure.load(Ordering::SeqCst);
            // Failure mode applies only to target publication unless explicitly
            // selected for source cancellation as well.
            let applies = expected_owner.window_label == transfer.target.window_label
                || self.fail_source_publication.load(Ordering::SeqCst);
            if applies && mode == 1 {
                return Err(MigrationFailure::Unavailable);
            }
            if applies && mode == 3 {
                self.registry
                    .compare_current_teardown(transfer.attempt)
                    .unwrap();
                return Err(MigrationFailure::Unavailable);
            }
            if applies && mode == 4 {
                guard.expire();
                let geometry = if expected_owner == &transfer.target {
                    FinalPresentation::Detached(self.presentation.lock().unwrap().bounds)
                } else {
                    FinalPresentation::Restored
                };
                self.queued_publications
                    .lock()
                    .unwrap()
                    .push((guard.clone(), Box::new(move || publish(geometry))));
                return Err(MigrationFailure::Deadline);
            }
            let target_batch = expected_owner.window_label == transfer.target.window_label;
            let steps: &[MigrationStep] = if target_batch {
                &TARGET_INTERACTIVE_BATCH
            } else {
                &SOURCE_INTERACTIVE_BATCH
            };
            let deadline = self.now_ms().saturating_add(remaining.as_millis() as u64);
            for step in steps {
                let result = self.execute(*step, transfer, context, guard, remaining);
                if result.is_err()
                    || !guard.is_current()
                    || self.now_ms() >= deadline
                    || target_batch && !self.recovery_available()
                {
                    let mut state = self.presentation.lock().unwrap();
                    state.child_visible = false;
                    state.target_visible = false;
                    return Err(MigrationFailure::Unavailable);
                }
            }
            let published = publish(if target_batch {
                FinalPresentation::Detached(self.presentation.lock().unwrap().bounds)
            } else {
                FinalPresentation::Restored
            });
            if published && self.publication_pause_enabled.load(Ordering::SeqCst) {
                if let Some(pause) = &self.publication_pause {
                    pause.started.send(()).unwrap();
                    pause.release.lock().unwrap().recv().unwrap();
                }
            }
            if applies && mode == 2 {
                Err(MigrationFailure::Unavailable)
            } else {
                Ok(published)
            }
        }
        fn cleanup_terminated_target(
            &self,
            _: &PluginChildWebviewOwnershipTransfer,
            _: &mut Context,
        ) -> Result<(), MigrationFailure> {
            let mut state = self.presentation.lock().unwrap();
            state.target = false;
            state.target_visible = false;
            Ok(())
        }
    }
    fn request(attempt: PluginChildWebviewAttempt) -> DetachRequest {
        DetachRequest {
            attempt,
            actual_host_source: "main".into(),
            owner: PluginChildWebviewOwner::main(),
            target_window_label: PluginChildWebviewOwner::detached(1).unwrap().window_label,
        }
    }

    #[test]
    fn success_preserves_identity_history_worker_pending_work_and_commits_last() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
        let before = registry.creation_facts(attempt).unwrap();
        handle.model.lock().unwrap().edit("edited");
        let adapter = FakeAdapter::new(registry.clone());
        let outcome = run_detachment(&registry, &adapter, request(attempt));
        let DetachOutcome::Committed {
            attempt: committed,
            owner,
        } = outcome
        else {
            panic!("must commit")
        };
        assert_eq!(committed, attempt);
        assert_eq!(
            *adapter.log.lock().unwrap(),
            FORWARD
                .into_iter()
                .chain(TARGET_INTERACTIVE_BATCH)
                .collect::<Vec<_>>()
        );
        let after = registry.creation_facts(attempt).unwrap();
        assert_eq!(before.source_label, after.source_label);
        assert_eq!(before.data_store_identifier, after.data_store_identifier);
        assert_eq!(before.freshness, after.freshness);
        assert_eq!(after.owner, owner);
        assert!(registry.snapshot().is_none());
        assert_eq!(
            registry.snapshot_attempt(attempt).unwrap().bounds,
            Some(adapter.presentation.lock().unwrap().bounds)
        );
        let state = adapter.presentation.lock().unwrap();
        assert_eq!(state.native_window, owner.window_label);
        assert!(state.target && state.target_visible);
        assert!(!state.main_visible);
        assert_eq!(state.main_size, (650, 320));
        drop(state);
        let mut model = handle.model.lock().unwrap();
        assert_eq!(model.worker, 7);
        assert_eq!(model.selection, (1, 3));
        assert_eq!(model.input, "edited");
        model.complete("translated");
        model.undo();
        assert_eq!(model.input, "original");
        assert_eq!(model.result.as_deref(), Some("translated"));
        drop(model);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        assert!(adapter
            .saved_guards
            .lock()
            .unwrap()
            .iter()
            .all(|guard| !guard.is_current()));
        let (main, _) = instance(&registry, PluginChildWebviewOwner::main());
        assert_ne!(main, attempt);
        registry.compare_current_teardown(attempt).unwrap();
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
        assert_eq!(registry.snapshot().unwrap().attempt, main);
    }

    #[test]
    fn every_forward_failure_before_or_after_effect_restores_original_and_future_owner() {
        for step in FORWARD {
            for after in [false, true] {
                let registry = Arc::new(PluginChildWebviewRegistry::default());
                let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
                handle.model.lock().unwrap().edit("retained");
                let before = registry.creation_facts(attempt).unwrap();
                let mut adapter = FakeAdapter::new(registry.clone());
                adapter.fail = Some((step, after));
                let DetachOutcome::RolledBack {
                    failed_step, owner, ..
                } = run_detachment(&registry, &adapter, request(attempt))
                else {
                    panic!("must restore {step:?}/{after}")
                };
                assert_eq!(failed_step, step);
                assert_eq!(owner.window_label, "main");
                assert_eq!(owner.revision, 2);
                let state = adapter.presentation.lock().unwrap();
                assert_eq!(state.native_window, "main");
                assert!(state.main_visible);
                assert_eq!(state.main_size, (900, 700));
                assert!(!state.target && !state.target_visible);
                assert_eq!(state.navigation, owner);
                drop(state);
                assert_eq!(registry.owner_for_attempt(attempt), Some(owner));
                assert_eq!(
                    registry.creation_facts(attempt).unwrap().freshness,
                    before.freshness
                );
                assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
                let mut model = handle.model.lock().unwrap();
                model.complete("done");
                model.undo();
                assert_eq!(model.input, "original");
                assert!(adapter
                    .saved_guards
                    .lock()
                    .unwrap()
                    .iter()
                    .all(|guard| !guard.is_current()));
            }
        }
    }

    #[test]
    fn recovery_loss_after_reservation_captures_rollback_context_without_creating_a_target() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.lose_recovery_at_reservation = true;
        let outcome = run_detachment(&registry, &adapter, request(attempt));
        let DetachOutcome::RolledBack {
            failed_step: MigrationStep::PrepareHiddenTarget,
            failure: MigrationFailure::RecoveryUnavailable,
            owner,
        } = outcome
        else {
            panic!("recovery loss before target preparation must restore the original surface");
        };
        assert_eq!(
            owner,
            PluginChildWebviewOwner::from_parts("main", 2).unwrap()
        );
        let stages = adapter.log.lock().unwrap();
        assert_eq!(stages.first(), Some(&MigrationStep::CaptureSource));
        assert!(stages.contains(&MigrationStep::RestoreNavigation));
        assert_eq!(adapter.targets.load(Ordering::SeqCst), 0);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn deadline_recovery_loss_and_duplicate_admission_do_not_restart_the_instance() {
        for trigger in 0..4 {
            let registry = Arc::new(PluginChildWebviewRegistry::default());
            let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
            let mut adapter = FakeAdapter::new(registry.clone());
            match trigger {
                0 => adapter.timeout = Some(MigrationStep::AwaitTargetReady),
                1 => adapter.lose_recovery = Some(MigrationStep::FocusTarget),
                2 => adapter.lose_recovery = Some(MigrationStep::HideMain),
                _ => adapter.duplicate = Some(MigrationStep::PrepareHiddenTarget),
            }
            let outcome = run_detachment(&registry, &adapter, request(attempt));
            if trigger == 3 {
                assert!(matches!(outcome, DetachOutcome::Committed { .. }));
                assert_eq!(adapter.targets.load(Ordering::SeqCst), 1);
            } else {
                assert!(matches!(outcome, DetachOutcome::RolledBack { .. }));
                assert!(adapter.presentation.lock().unwrap().main_visible);
                assert!(!adapter.presentation.lock().unwrap().target);
            }
            assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
            assert_eq!(registry.snapshots().len(), 1);
        }
    }

    #[test]
    fn terminal_events_at_every_forward_stage_never_restore_or_retarget_old_work() {
        for step in FORWARD {
            for reason in [
                Terminal::Close,
                Terminal::Replace,
                Terminal::Disable,
                Terminal::Upgrade,
                Terminal::Reload,
                Terminal::Quit,
            ] {
                let registry = Arc::new(PluginChildWebviewRegistry::default());
                let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
                let mut adapter = FakeAdapter::new(registry.clone());
                adapter.terminal = Some((step, reason));
                assert!(matches!(
                    run_detachment(&registry, &adapter, request(attempt)),
                    DetachOutcome::Terminated
                ));
                assert!(registry.snapshot_attempt(attempt).is_none());
                assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
                assert!(!adapter.presentation.lock().unwrap().target);
                assert!(!adapter
                    .log
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|stage| ROLLBACK.contains(stage)));
                if matches!(reason, Terminal::Replace) {
                    assert_ne!(registry.snapshot().unwrap().attempt, attempt);
                } else {
                    assert!(registry.snapshots().is_empty());
                }
            }
        }
    }

    #[test]
    fn actual_barrier_wait_releases_registry_and_stale_native_callback_cannot_move_replacement() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.pause = Some(Pause {
            step: MigrationStep::MoveWebview,
            started: started_tx,
            release: Mutex::new(release_rx),
        });
        let adapter = Arc::new(adapter);
        let run_registry = registry.clone();
        let run_adapter = adapter.clone();
        let running = std::thread::spawn(move || {
            run_detachment(&run_registry, run_adapter.as_ref(), request(attempt))
        });
        started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(registry
            .wait_for_stable_owner(attempt, Duration::ZERO)
            .is_none());
        registry.compare_current_teardown(attempt).unwrap();
        let (replacement, _) = instance(&registry, PluginChildWebviewOwner::main());
        release_tx.send(()).unwrap();
        assert!(matches!(running.join().unwrap(), DetachOutcome::Terminated));
        assert_eq!(registry.snapshot().unwrap().attempt, replacement);
        assert_eq!(adapter.presentation.lock().unwrap().native_window, "main");
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn rollback_failure_retains_live_original_and_is_explicitly_not_success() {
        for failure in ROLLBACK {
            let registry = Arc::new(PluginChildWebviewRegistry::default());
            let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
            let mut adapter = FakeAdapter::new(registry.clone());
            adapter.fail = Some((MigrationStep::HideMain, true));
            adapter.fail_rollback = Some(failure);
            let outcome = run_detachment(&registry, &adapter, request(attempt));
            let DetachOutcome::RecoveryRequired {
                recovery_step,
                transfer,
                ..
            } = outcome
            else {
                panic!("must retain failed compensation")
            };
            assert_eq!(recovery_step, failure);
            assert!(registry.ownership_transfer_is_current(&transfer));
            assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
            assert!(handle.model.lock().unwrap().alive);
            assert!(registry
                .wait_for_stable_owner(attempt, Duration::ZERO)
                .is_none());
            registry.compare_current_teardown(attempt).unwrap();
            assert!(!registry.ownership_transfer_is_current(&transfer));
        }
    }
    #[test]
    fn terminal_barriers_cover_each_forward_and_rollback_stage_without_holding_registry() {
        for step in FORWARD.into_iter().chain(ROLLBACK) {
            let registry = Arc::new(PluginChildWebviewRegistry::default());
            let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
            let (started_tx, started_rx) = mpsc::channel();
            let (release_tx, release_rx) = mpsc::channel();
            let mut adapter = FakeAdapter::new(registry.clone());
            adapter.pause = Some(Pause {
                step,
                started: started_tx,
                release: Mutex::new(release_rx),
            });
            if ROLLBACK.contains(&step) {
                adapter.fail = Some((MigrationStep::HideMain, true));
            }
            let adapter = Arc::new(adapter);
            let run_registry = registry.clone();
            let run_adapter = adapter.clone();
            let running = std::thread::spawn(move || {
                run_detachment(&run_registry, run_adapter.as_ref(), request(attempt))
            });
            started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
            registry.compare_current_teardown(attempt).unwrap();
            let (replacement, replacement_handle) =
                instance(&registry, PluginChildWebviewOwner::main());
            release_tx.send(()).unwrap();
            assert!(matches!(running.join().unwrap(), DetachOutcome::Terminated));
            assert_eq!(registry.snapshot().unwrap().attempt, replacement);
            assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
            assert_eq!(replacement_handle.destroys.load(Ordering::SeqCst), 0);
            assert!(!adapter.presentation.lock().unwrap().target);
        }
    }

    #[test]
    fn ownership_waiters_observe_only_final_commit_or_renewed_rollback_owner() {
        for rollback in [false, true] {
            let registry = Arc::new(PluginChildWebviewRegistry::default());
            let (attempt, _) = instance(&registry, PluginChildWebviewOwner::main());
            let (started_tx, started_rx) = mpsc::channel();
            let (release_tx, release_rx) = mpsc::channel();
            let mut adapter = FakeAdapter::new(registry.clone());
            adapter.pause = Some(Pause {
                step: MigrationStep::AwaitTargetReady,
                started: started_tx,
                release: Mutex::new(release_rx),
            });
            if rollback {
                adapter.fail = Some((MigrationStep::MoveWebview, false));
            }
            let adapter = Arc::new(adapter);
            let run_registry = registry.clone();
            let run_adapter = adapter.clone();
            let running = std::thread::spawn(move || {
                run_detachment(&run_registry, run_adapter.as_ref(), request(attempt))
            });
            started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
            assert!(registry
                .wait_for_stable_owner(attempt, Duration::ZERO)
                .is_none());
            let waiting = registry.clone();
            let waiter = std::thread::spawn(move || {
                waiting.wait_for_stable_owner(attempt, Duration::from_secs(1))
            });
            release_tx.send(()).unwrap();
            let outcome = running.join().unwrap();
            let owner = match outcome {
                DetachOutcome::Committed { owner, .. }
                | DetachOutcome::RolledBack { owner, .. } => owner,
                _ => panic!("must settle"),
            };
            assert_eq!(waiter.join().unwrap(), Some(owner.clone()));
            assert_eq!(owner.revision, 2);
            assert_eq!(owner.window_label == "main", rollback);
        }
    }

    #[test]
    fn obsolete_transaction_cleanup_cannot_destroy_an_already_committed_target() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
        let adapter = FakeAdapter::new(registry.clone());
        let transfer = registry
            .begin_ownership_transfer(
                attempt,
                "main",
                &PluginChildWebviewOwner::main(),
                &PluginChildWebviewOwner::detached(1).unwrap().window_label,
            )
            .unwrap();
        adapter.presentation.lock().unwrap().target = true;
        assert!(registry.commit_ownership_transfer(&transfer));
        assert!(matches!(
            terminal(
                &registry,
                &adapter,
                &transfer,
                Context {
                    original: None,
                    handle: None
                },
                MigrationStep::HideMain
            ),
            DetachOutcome::Superseded
        ));
        assert!(adapter.presentation.lock().unwrap().target);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        assert_eq!(registry.owner_for_attempt(attempt), Some(transfer.target));
    }
    fn recovery_fixture() -> (
        Arc<PluginChildWebviewRegistry<FakeHandle>>,
        PluginChildWebviewAttempt,
        FakeHandle,
        Arc<FakeAdapter>,
        Arc<DetachedWindowRecoveryCoordinator<FakeHandle, FakeAdapter>>,
        RecoveryTicket,
    ) {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.fail = Some((MigrationStep::HideMain, true));
        adapter.fail_rollback = Some(MigrationStep::RestoreWebview);
        let adapter = Arc::new(adapter);
        let coordinator = Arc::new(DetachedWindowRecoveryCoordinator::new(
            registry.clone(),
            adapter.clone(),
        ));
        let RecoveryActionResult::RecoveryRequired(ticket) = coordinator.detach(request(attempt))
        else {
            panic!("compensation failure must be explicit")
        };
        (registry, attempt, handle, adapter, coordinator, ticket)
    }

    #[test]
    fn recovery_retains_original_context_freezes_ownership_and_retries_only_rollback() {
        let (registry, attempt, handle, adapter, coordinator, ticket) = recovery_fixture();
        let before = registry.creation_facts(attempt).unwrap();
        assert!(registry.main_hide_blocked());
        assert!(adapter.presentation.lock().unwrap().main_visible);
        assert!(!adapter.presentation.lock().unwrap().child_visible);
        assert!(adapter.presentation.lock().unwrap().target);
        assert_eq!(
            adapter.presentation.lock().unwrap().native_window,
            "plugin-window-0000000000000001"
        );
        assert_eq!(
            coordinator.recovery_snapshots()[0].status,
            RecoveryStatus::RecoveryRequired
        );
        assert!(coordinator.recovery_snapshots()[0].repair_visible);
        assert_eq!(
            coordinator.detach(request(attempt)),
            RecoveryActionResult::Rejected
        );
        assert!(registry
            .wait_for_stable_owner(attempt, Duration::ZERO)
            .is_none());
        assert_eq!(
            registry.show_owned(attempt, &PluginChildWebviewOwner::main()),
            crate::plugin_child_webview_service::PluginChildWebviewPresentationResult::StaleAttempt
        );
        let mut model = handle.model.lock().unwrap();
        model.edit("kept during repair");
        model.complete("pending response arrived once");
        assert_eq!(model.worker, 7);
        drop(model);
        let forward_count = adapter
            .log
            .lock()
            .unwrap()
            .iter()
            .filter(|step| FORWARD.contains(step))
            .count();
        adapter
            .rollback_failure_active
            .store(false, Ordering::SeqCst);
        let result = coordinator.retry_recovery(&ticket, "main");
        assert!(
            matches!(result, RecoveryActionResult::RolledBack(restored) if restored.owner == PluginChildWebviewOwner::from_parts("main", 2).unwrap())
        );
        assert!(coordinator.recovery_snapshots().is_empty());
        assert!(!registry.main_hide_blocked());
        assert!(!adapter.presentation.lock().unwrap().target);
        assert!(adapter.presentation.lock().unwrap().child_visible);
        assert_eq!(
            adapter
                .log
                .lock()
                .unwrap()
                .iter()
                .filter(|step| FORWARD.contains(step))
                .count(),
            forward_count
        );
        let after = registry.creation_facts(attempt).unwrap();
        assert_eq!(before.freshness, after.freshness);
        assert_eq!(before.data_store_identifier, after.data_store_identifier);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        let mut model = handle.model.lock().unwrap();
        model.undo();
        assert_eq!(model.input, "original");
        assert_eq!(
            model.result.as_deref(),
            Some("pending response arrived once")
        );
        assert_eq!(
            coordinator.retry_recovery(&ticket, "main"),
            RecoveryActionResult::Rejected
        );
    }

    #[test]
    fn wrong_host_or_ticket_cannot_retry_close_or_mutate_recovery() {
        let (registry, attempt, handle, adapter, coordinator, ticket) = recovery_fixture();
        let forged = RecoveryTicket {
            attempt,
            token: crate::plugin_child_webview_owner::PluginChildWebviewMigrationToken::new(999)
                .unwrap(),
        };
        let count = adapter.log.lock().unwrap().len();
        for host in [
            "plugin-child-0000000000000001",
            "plugin-window-0000000000000001",
            "main?trusted",
        ] {
            assert_eq!(
                coordinator.retry_recovery(&ticket, host),
                RecoveryActionResult::Rejected
            );
            assert_eq!(
                coordinator.close_recovery(&ticket, host),
                RecoveryActionResult::Rejected
            );
        }
        assert_eq!(
            coordinator.retry_recovery(&forged, "main"),
            RecoveryActionResult::Rejected
        );
        assert_eq!(
            coordinator.close_recovery(&forged, "main"),
            RecoveryActionResult::Rejected
        );
        assert_eq!(adapter.log.lock().unwrap().len(), count);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        assert!(registry.main_hide_blocked());
        assert_eq!(
            coordinator.close_recovery(&ticket, "main"),
            RecoveryActionResult::Terminated
        );
        assert_eq!(
            coordinator.close_recovery(&ticket, "main"),
            RecoveryActionResult::Rejected
        );
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
        assert!(coordinator.recovery_snapshots().is_empty());
        assert!(!registry.main_hide_blocked());
    }

    #[test]
    fn unknown_native_owner_preserves_target_even_after_registry_removal_until_confirmed() {
        let (registry, attempt, handle, adapter, coordinator, ticket) = recovery_fixture();
        adapter.owner_unknown.store(true, Ordering::SeqCst);
        assert_eq!(
            coordinator.close_recovery(&ticket, "main"),
            RecoveryActionResult::RecoveryRequired(ticket.clone())
        );
        assert!(registry.snapshot_attempt(attempt).is_none());
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
        assert!(adapter.presentation.lock().unwrap().target);
        assert!(registry.main_hide_blocked());
        assert_eq!(
            coordinator.recovery_snapshots()[0].status,
            RecoveryStatus::Closing
        );
        assert_eq!(
            coordinator.reconcile_terminated(),
            vec![RecoveryActionResult::RecoveryRequired(ticket.clone())]
        );
        assert!(adapter.presentation.lock().unwrap().target);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
        let (new_main, new_main_handle) = instance(&registry, PluginChildWebviewOwner::main());
        assert_eq!(
            coordinator.detach(request(new_main)),
            RecoveryActionResult::Rejected
        );
        adapter.owner_unknown.store(false, Ordering::SeqCst);
        assert_eq!(
            coordinator.reconcile_terminated(),
            vec![RecoveryActionResult::Terminated]
        );
        assert!(!adapter.presentation.lock().unwrap().target);
        assert!(coordinator.recovery_snapshots().is_empty());
        assert!(!registry.main_hide_blocked());
        assert_eq!(registry.snapshot().unwrap().attempt, new_main);
        assert_eq!(new_main_handle.destroys.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn unknown_parent_after_rollback_never_destroys_possibly_hosting_target() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.fail = Some((MigrationStep::HideMain, true));
        adapter.owner_unknown.store(true, Ordering::SeqCst);
        let adapter = Arc::new(adapter);
        let coordinator = DetachedWindowRecoveryCoordinator::new(registry.clone(), adapter.clone());
        let RecoveryActionResult::RecoveryRequired(ticket) = coordinator.detach(request(attempt))
        else {
            panic!("uncertain ownership must retain context")
        };
        assert_eq!(
            coordinator.recovery_snapshots()[0].recovery_step,
            MigrationStep::DestroyTarget
        );
        assert!(!adapter.presentation.lock().unwrap().child_visible);
        assert!(adapter.presentation.lock().unwrap().main_visible);
        assert!(adapter.presentation.lock().unwrap().target);
        assert!(!adapter
            .log
            .lock()
            .unwrap()
            .contains(&MigrationStep::DestroyTarget));
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        adapter.owner_unknown.store(false, Ordering::SeqCst);
        assert!(matches!(
            coordinator.retry_recovery(&ticket, "main"),
            RecoveryActionResult::RolledBack(_)
        ));
        assert!(!adapter.presentation.lock().unwrap().target);
    }

    #[test]
    fn close_during_busy_retry_terminates_once_and_late_restore_cannot_revive_original() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.fail = Some((MigrationStep::HideMain, true));
        adapter.fail_rollback = Some(MigrationStep::RestoreWebview);
        adapter.pause = Some(Pause {
            step: MigrationStep::RestoreWebview,
            started: started_tx,
            release: Mutex::new(release_rx),
        });
        adapter.pause_enabled.store(false, Ordering::SeqCst);
        let adapter = Arc::new(adapter);
        let coordinator = Arc::new(DetachedWindowRecoveryCoordinator::new(
            registry.clone(),
            adapter.clone(),
        ));
        let RecoveryActionResult::RecoveryRequired(ticket) = coordinator.detach(request(attempt))
        else {
            panic!("recovery")
        };
        adapter
            .rollback_failure_active
            .store(false, Ordering::SeqCst);
        adapter.pause_enabled.store(true, Ordering::SeqCst);
        let running = coordinator.clone();
        let retry_ticket = ticket.clone();
        let retry = std::thread::spawn(move || running.retry_recovery(&retry_ticket, "main"));
        started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(
            coordinator.recovery_snapshots()[0].status,
            RecoveryStatus::Recovering
        );
        assert!(coordinator.recovery_snapshots()[0].repair_visible);
        assert_eq!(
            coordinator.retry_recovery(&ticket, "main"),
            RecoveryActionResult::Busy
        );
        assert_eq!(
            coordinator.close_recovery(&ticket, "main"),
            RecoveryActionResult::Closing(ticket)
        );
        assert_eq!(
            coordinator.recovery_snapshots()[0].status,
            RecoveryStatus::Closing
        );
        release_tx.send(()).unwrap();
        assert_eq!(retry.join().unwrap(), RecoveryActionResult::Terminated);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
        assert_eq!(adapter.native_restores.load(Ordering::SeqCst), 0);
        assert!(registry.snapshot_attempt(attempt).is_none());
        assert!(!adapter.presentation.lock().unwrap().target);
        assert!(coordinator.recovery_snapshots().is_empty());
        assert!(!registry.main_hide_blocked());
    }

    #[test]
    fn lifecycle_invalidation_reconciles_retained_context_without_recovery_or_sibling_effects() {
        for quit in [false, true] {
            let (registry, attempt, handle, adapter, coordinator, ticket) = recovery_fixture();
            let count = adapter.log.lock().unwrap().len();
            if quit {
                registry.teardown_all().unwrap();
            } else {
                registry.teardown_entry_instances("entry-a", None).unwrap();
            }
            assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
            assert!(registry.snapshot_attempt(attempt).is_none());
            assert_eq!(
                coordinator.reconcile_terminated(),
                vec![RecoveryActionResult::Terminated]
            );
            assert!(coordinator.reconcile_terminated().is_empty());
            assert_eq!(
                coordinator.retry_recovery(&ticket, "main"),
                RecoveryActionResult::Rejected
            );
            assert_eq!(adapter.log.lock().unwrap().len(), count);
            assert!(!adapter.presentation.lock().unwrap().target);
            assert!(!registry.main_hide_blocked());
        }
    }
    #[test]
    fn final_publication_loss_staleness_and_terminal_races_do_not_clean_committed_windows() {
        for mode in 1..=4 {
            let registry = Arc::new(PluginChildWebviewRegistry::default());
            let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
            let adapter = FakeAdapter::new(registry.clone());
            adapter.publication_failure.store(mode, Ordering::SeqCst);
            let result = run_detachment(&registry, &adapter, request(attempt));
            match mode {
                1 | 4 => {
                    assert!(matches!(result, DetachOutcome::RolledBack { .. }));
                    assert!(!adapter.presentation.lock().unwrap().target);
                }
                2 => {
                    assert!(matches!(result, DetachOutcome::Committed { .. }));
                    assert!(adapter.presentation.lock().unwrap().target);
                    assert!(!adapter
                        .log
                        .lock()
                        .unwrap()
                        .contains(&MigrationStep::RestoreWebview));
                }
                3 => {
                    assert!(matches!(result, DetachOutcome::Terminated));
                    assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
                }
                _ => unreachable!(),
            }
            for (guard, publish) in adapter.queued_publications.lock().unwrap().drain(..) {
                assert!(!guard.is_current());
                assert!(!publish());
            }
        }
    }

    #[test]
    fn cancel_publication_loss_reconciles_receipt_and_rejection_retains_original_token() {
        for mode in [1, 2] {
            let registry = Arc::new(PluginChildWebviewRegistry::default());
            let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
            let mut adapter = FakeAdapter::new(registry.clone());
            adapter.fail = Some((MigrationStep::HideMain, true));
            adapter.publication_failure.store(mode, Ordering::SeqCst);
            adapter
                .fail_source_publication
                .store(true, Ordering::SeqCst);
            let adapter = Arc::new(adapter);
            let coordinator =
                DetachedWindowRecoveryCoordinator::new(registry.clone(), adapter.clone());
            let result = coordinator.detach(request(attempt));
            if mode == 2 {
                assert!(matches!(result, RecoveryActionResult::RolledBack(_)));
            } else {
                let RecoveryActionResult::RecoveryRequired(ticket) = result else {
                    panic!("retain refused cancellation")
                };
                assert_eq!(
                    coordinator.recovery_snapshots()[0].recovery_step,
                    MigrationStep::PublishOwnership
                );
                adapter.publication_failure.store(0, Ordering::SeqCst);
                assert!(matches!(
                    coordinator.retry_recovery(&ticket, "main"),
                    RecoveryActionResult::RolledBack(_)
                ));
            }
            assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
            assert!(!registry.main_hide_blocked());
        }
    }

    #[test]
    fn retry_deadline_and_repeated_compensation_failure_retain_the_same_context() {
        let (registry, attempt, handle, adapter, coordinator, ticket) = recovery_fixture();
        let facts = registry.creation_facts(attempt).unwrap();
        assert_eq!(
            coordinator.retry_recovery(&ticket, "main"),
            RecoveryActionResult::RecoveryRequired(ticket.clone())
        );
        assert_eq!(coordinator.recovery_snapshots().len(), 1);
        assert_eq!(
            registry.creation_facts(attempt).unwrap().freshness,
            facts.freshness
        );
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        assert_eq!(
            adapter
                .log
                .lock()
                .unwrap()
                .iter()
                .filter(|step| **step == MigrationStep::CaptureSource)
                .count(),
            1
        );
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.fail = Some((MigrationStep::HideMain, true));
        adapter.timeout = Some(MigrationStep::RestoreNavigation);
        let adapter = Arc::new(adapter);
        let coordinator = DetachedWindowRecoveryCoordinator::new(registry.clone(), adapter.clone());
        let RecoveryActionResult::RecoveryRequired(ticket) = coordinator.detach(request(attempt))
        else {
            panic!("rollback deadline")
        };
        let previous = adapter.now_ms();
        assert_eq!(
            coordinator.retry_recovery(&ticket, "main"),
            RecoveryActionResult::RecoveryRequired(ticket.clone())
        );
        assert_eq!(adapter.now_ms() - previous, MIGRATION_DEADLINE_MS);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        adapter.timeout_active.store(false, Ordering::SeqCst);
        assert!(matches!(
            coordinator.retry_recovery(&ticket, "main"),
            RecoveryActionResult::RolledBack(_)
        ));
    }

    #[test]
    fn queued_repair_reveal_is_revoked_by_close_invalidation_or_quit_before_execution() {
        for terminal_kind in 0..3 {
            let registry = Arc::new(PluginChildWebviewRegistry::default());
            let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
            let (started_tx, started_rx) = mpsc::channel();
            let (release_tx, release_rx) = mpsc::channel();
            let mut adapter = FakeAdapter::new(registry.clone());
            adapter.fail = Some((MigrationStep::HideMain, true));
            adapter.fail_rollback = Some(MigrationStep::RestoreWebview);
            adapter.repair_pause = Some(Pause {
                step: MigrationStep::CaptureSource,
                started: started_tx,
                release: Mutex::new(release_rx),
            });
            let adapter = Arc::new(adapter);
            let coordinator = Arc::new(DetachedWindowRecoveryCoordinator::new(
                registry.clone(),
                adapter.clone(),
            ));
            let running = coordinator.clone();
            let task = std::thread::spawn(move || running.detach(request(attempt)));
            started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
            let ticket = coordinator.recovery_snapshots()[0].ticket.clone();
            match terminal_kind {
                0 => {
                    assert_eq!(
                        coordinator.close_recovery(&ticket, "main"),
                        RecoveryActionResult::Closing(ticket)
                    );
                }
                1 => {
                    registry.teardown_entry_instances("entry-a", None).unwrap();
                    coordinator.reconcile_terminated();
                }
                _ => {
                    registry.teardown_all().unwrap();
                    coordinator.reconcile_terminated();
                }
            }
            release_tx.send(()).unwrap();
            assert_eq!(task.join().unwrap(), RecoveryActionResult::Terminated);
            assert_eq!(adapter.repair_mutations.load(Ordering::SeqCst), 0);
            assert_eq!(handle.destroys.load(Ordering::SeqCst), 1);
            assert!(coordinator.recovery_snapshots().is_empty());
            assert!(!registry.main_hide_blocked());
        }
    }

    #[test]
    fn durable_publication_receipt_protects_window_after_old_instance_was_replaced() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, _) = instance(&registry, PluginChildWebviewOwner::main());
        let adapter = FakeAdapter::new(registry.clone());
        let transfer = registry
            .begin_ownership_transfer(
                attempt,
                "main",
                &PluginChildWebviewOwner::main(),
                "plugin-window-0000000000000001",
            )
            .unwrap();
        let context = adapter.new_context(&transfer);
        adapter.presentation.lock().unwrap().target = true;
        assert!(registry.commit_ownership_transfer(&transfer));
        registry.compare_current_teardown(attempt).unwrap();
        let (replacement, handle) =
            instance(&registry, PluginChildWebviewOwner::detached(1).unwrap());
        assert!(matches!(
            terminal(
                &registry,
                &adapter,
                &transfer,
                context,
                MigrationStep::PublishOwnership
            ),
            DetachOutcome::Superseded
        ));
        assert!(adapter.presentation.lock().unwrap().target);
        assert_eq!(
            registry
                .snapshot_for_surface("plugin-window-0000000000000001")
                .unwrap()
                .attempt,
            replacement
        );
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn retained_recovery_marker_prevents_new_token_after_cancel_until_record_is_removed() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, _) = instance(&registry, PluginChildWebviewOwner::main());
        let transfer = registry
            .begin_ownership_transfer(
                attempt,
                "main",
                &PluginChildWebviewOwner::main(),
                "plugin-window-0000000000000001",
            )
            .unwrap();
        registry.retain_recovery_required(&transfer);
        assert!(registry.cancel_ownership_transfer(&transfer));
        let owner = registry.owner_for_attempt(attempt).unwrap();
        assert!(registry
            .wait_for_stable_owner(attempt, Duration::ZERO)
            .is_none());
        assert!(registry
            .begin_ownership_transfer(attempt, "main", &owner, "plugin-window-0000000000000002")
            .is_none());
        registry.release_recovery_required(&transfer);
        assert_eq!(
            registry.wait_for_stable_owner(attempt, Duration::ZERO),
            Some(owner.clone())
        );
        assert!(registry
            .begin_ownership_transfer(attempt, "main", &owner, "plugin-window-0000000000000002")
            .is_some());
    }

    #[test]
    fn explicit_close_can_reach_retained_original_after_host_record_was_removed() {
        let (registry, attempt, handle, adapter, coordinator, ticket) = recovery_fixture();
        registry.compare_current_teardown(attempt).unwrap();
        // Model an external/legacy close acknowledgment that removed the Host
        // record while its retained native object has not actually detached.
        handle.model.lock().unwrap().alive = true;
        assert_eq!(
            coordinator.reconcile_terminated(),
            vec![RecoveryActionResult::RecoveryRequired(ticket.clone())]
        );
        assert!(adapter.presentation.lock().unwrap().target);
        assert_eq!(
            coordinator.close_recovery(&ticket, "main"),
            RecoveryActionResult::Terminated
        );
        assert!(!handle.model.lock().unwrap().alive);
        assert!(!adapter.presentation.lock().unwrap().target);
        assert!(coordinator.recovery_snapshots().is_empty());
    }
    #[test]
    fn cancellation_publication_barrier_keeps_old_ticket_reserved_until_coordinator_retirement() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, _) = instance(&registry, PluginChildWebviewOwner::main());
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.fail = Some((MigrationStep::HideMain, true));
        adapter.fail_rollback = Some(MigrationStep::RestoreWebview);
        adapter.publication_pause = Some(Pause {
            step: MigrationStep::PublishOwnership,
            started: started_tx,
            release: Mutex::new(release_rx),
        });
        adapter
            .publication_pause_enabled
            .store(false, Ordering::SeqCst);
        let adapter = Arc::new(adapter);
        let coordinator = Arc::new(DetachedWindowRecoveryCoordinator::new(
            registry.clone(),
            adapter.clone(),
        ));
        let RecoveryActionResult::RecoveryRequired(ticket) = coordinator.detach(request(attempt))
        else {
            panic!("recovery")
        };
        adapter
            .rollback_failure_active
            .store(false, Ordering::SeqCst);
        adapter
            .publication_pause_enabled
            .store(true, Ordering::SeqCst);
        let running = coordinator.clone();
        let task = std::thread::spawn(move || running.retry_recovery(&ticket, "main"));
        started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        let owner = registry.owner_for_attempt(attempt).unwrap();
        assert_eq!(owner.revision, 2);
        assert!(registry
            .wait_for_stable_owner(attempt, Duration::ZERO)
            .is_none());
        assert_eq!(
            coordinator.detach(DetachRequest {
                attempt,
                actual_host_source: "main".into(),
                owner: owner.clone(),
                target_window_label: "plugin-window-0000000000000002".into()
            }),
            RecoveryActionResult::Rejected
        );
        release_tx.send(()).unwrap();
        assert!(
            matches!(task.join().unwrap(), RecoveryActionResult::RolledBack(restored) if restored.owner == owner)
        );
        assert!(coordinator.recovery_snapshots().is_empty());
        assert!(registry
            .begin_ownership_transfer(attempt, "main", &owner, "plugin-window-0000000000000002")
            .is_some());
    }

    #[test]
    fn commit_reply_barrier_keeps_replacement_in_same_target_window_after_original_close() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, original) = instance(&registry, PluginChildWebviewOwner::main());
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.publication_failure.store(2, Ordering::SeqCst);
        adapter.publication_pause = Some(Pause {
            step: MigrationStep::PublishOwnership,
            started: started_tx,
            release: Mutex::new(release_rx),
        });
        let adapter = Arc::new(adapter);
        let run_adapter = adapter.clone();
        let run_registry = registry.clone();
        let task = std::thread::spawn(move || {
            run_detachment(&run_registry, run_adapter.as_ref(), request(attempt))
        });
        started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        registry.compare_current_teardown(attempt).unwrap();
        let (replacement, handle) =
            instance(&registry, PluginChildWebviewOwner::detached(1).unwrap());
        release_tx.send(()).unwrap();
        assert!(matches!(
            task.join().unwrap(),
            DetachOutcome::Committed { .. }
        ));
        assert!(adapter.presentation.lock().unwrap().target);
        assert_eq!(
            registry
                .snapshot_for_surface("plugin-window-0000000000000001")
                .unwrap()
                .attempt,
            replacement
        );
        assert_eq!(original.destroys.load(Ordering::SeqCst), 1);
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn failed_confirmed_close_retains_handle_and_context_until_explicit_retry_succeeds() {
        let (registry, attempt, handle, adapter, coordinator, ticket) = recovery_fixture();
        handle.fail_destroy.store(true, Ordering::SeqCst);
        assert_eq!(
            coordinator.close_recovery(&ticket, "main"),
            RecoveryActionResult::RecoveryRequired(ticket.clone())
        );
        assert!(registry.snapshot_attempt(attempt).is_some());
        assert!(handle.model.lock().unwrap().alive);
        assert!(adapter.presentation.lock().unwrap().target);
        assert!(registry.main_hide_blocked());
        handle.fail_destroy.store(false, Ordering::SeqCst);
        assert_eq!(
            coordinator.close_recovery(&ticket, "main"),
            RecoveryActionResult::Terminated
        );
        assert!(registry.snapshot_attempt(attempt).is_none());
        assert!(!handle.model.lock().unwrap().alive);
        assert!(!adapter.presentation.lock().unwrap().target);
        assert!(coordinator.recovery_snapshots().is_empty());
    }
    #[test]
    fn publication_commits_the_final_applied_slot_after_geometry_changes() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, _) = instance(&registry, PluginChildWebviewOwner::main());
        let (started, arrived) = mpsc::channel();
        let (resume, released) = mpsc::channel();
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.pause = Some(Pause {
            step: MigrationStep::SetMainHome,
            started,
            release: Mutex::new(released),
        });
        let adapter = Arc::new(adapter);
        let coordinator = DetachedWindowRecoveryCoordinator::new(registry.clone(), adapter.clone());
        let running = std::thread::spawn(move || coordinator.detach(request(attempt)));
        arrived.recv_timeout(Duration::from_secs(1)).unwrap();

        // Forward preparation has finished. The target's confirmed frame now
        // changes before the final native batch publishes ownership.
        let final_frame = PluginChildWebviewBounds {
            x: 0,
            y: 60,
            width: 910,
            height: 680,
        };
        let mut native = adapter.presentation.lock().unwrap();
        assert_ne!(native.bounds, final_frame);
        native.bounds = final_frame;
        drop(native);
        resume.send(()).unwrap();
        let RecoveryActionResult::Committed(owner) = running.join().unwrap() else {
            panic!("target publication must succeed");
        };
        assert_eq!(
            registry.snapshot_owned(attempt, &owner).unwrap().bounds,
            Some(final_frame)
        );
        assert_eq!(adapter.presentation.lock().unwrap().bounds, final_frame);
    }

    #[test]
    fn successful_compensation_reports_the_original_native_failure_stage() {
        for (step, failure, reason) in [
            (
                MigrationStep::PrepareHiddenTarget,
                MigrationFailure::ConfigureHiddenWindow,
                "ConfigureHiddenWindow",
            ),
            (
                MigrationStep::PrepareHiddenTarget,
                MigrationFailure::AdoptSourceCheckpoint,
                "AdoptSourceCheckpoint",
            ),
            (
                MigrationStep::AwaitTargetReady,
                MigrationFailure::ShellReadinessTimeout,
                "ShellReadinessTimeout",
            ),
        ] {
            let registry = Arc::new(PluginChildWebviewRegistry::default());
            let (attempt, _) = instance(&registry, PluginChildWebviewOwner::main());
            let mut adapter = FakeAdapter::new(registry.clone());
            adapter.fail = Some((step, true));
            adapter.fail_kind = failure;
            let adapter = Arc::new(adapter);
            let coordinator =
                DetachedWindowRecoveryCoordinator::new(registry.clone(), adapter.clone());
            let RecoveryActionResult::RolledBack(restored) = coordinator.detach(request(attempt))
            else {
                panic!("original instance must be restored");
            };
            let diagnostic = MigrationDiagnostic {
                step,
                failure,
                compensation_step: None,
            };
            assert_eq!(restored.diagnostic, diagnostic);
            assert_eq!(
                adapter.diagnostics.lock().unwrap().as_slice(),
                &[diagnostic]
            );
            assert_eq!(diagnostic.to_string(), format!("plugin window detachment failed: stage={step:?} reason={reason} outcome=restored"));
            assert_eq!(registry.owner_for_attempt(attempt), Some(restored.owner));
        }
    }

    #[test]
    fn explicit_recovery_preserves_the_original_failure_across_retries() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, _) = instance(&registry, PluginChildWebviewOwner::main());
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.fail = Some((MigrationStep::PrepareHiddenTarget, true));
        adapter.fail_kind = MigrationFailure::AdoptSourceCheckpoint;
        adapter.fail_rollback = Some(MigrationStep::RestoreWebview);
        let adapter = Arc::new(adapter);
        let coordinator = DetachedWindowRecoveryCoordinator::new(registry, adapter.clone());
        let RecoveryActionResult::RecoveryRequired(ticket) = coordinator.detach(request(attempt))
        else {
            panic!("compensation must remain pending");
        };
        let failed = MigrationDiagnostic {
            step: MigrationStep::PrepareHiddenTarget,
            failure: MigrationFailure::AdoptSourceCheckpoint,
            compensation_step: Some(MigrationStep::RestoreWebview),
        };
        assert_eq!(adapter.diagnostics.lock().unwrap().as_slice(), &[failed]);
        adapter
            .rollback_failure_active
            .store(false, Ordering::SeqCst);
        let RecoveryActionResult::RolledBack(restored) =
            coordinator.retry_recovery(&ticket, "main")
        else {
            panic!("explicit retry must restore the same instance");
        };
        let success = MigrationDiagnostic {
            compensation_step: None,
            ..failed
        };
        assert_eq!(restored.diagnostic, success);
        assert_eq!(
            adapter.diagnostics.lock().unwrap().as_slice(),
            &[failed, success]
        );
    }

    #[test]
    fn final_native_batch_mutators_fail_without_publishing_and_restore_same_instance() {
        for step in TARGET_INTERACTIVE_BATCH {
            for after in [false, true] {
                let registry = Arc::new(PluginChildWebviewRegistry::default());
                let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
                let mut adapter = FakeAdapter::new(registry.clone());
                adapter.fail = Some((step, after));
                assert!(matches!(
                    run_detachment(&registry, &adapter, request(attempt)),
                    DetachOutcome::RolledBack { .. }
                ));
                assert_eq!(
                    registry.owner_for_attempt(attempt),
                    Some(PluginChildWebviewOwner::from_parts("main", 2).unwrap())
                );
                let state = adapter.presentation.lock().unwrap();
                assert!(state.main_visible && state.child_visible);
                assert!(!state.target && !state.target_visible);
                assert_eq!(state.main_size, (900, 700));
                assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
            }
        }
    }

    #[test]
    fn no_interactive_native_reveal_occurs_while_javascript_home_ack_is_pending() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, _) = instance(&registry, PluginChildWebviewOwner::main());
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.pause = Some(Pause {
            step: MigrationStep::PrepareMainHome,
            started: started_tx,
            release: Mutex::new(release_rx),
        });
        let adapter = Arc::new(adapter);
        let runner = adapter.clone();
        let runtime = registry.clone();
        let task =
            std::thread::spawn(move || run_detachment(&runtime, runner.as_ref(), request(attempt)));
        started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        let state = adapter.presentation.lock().unwrap();
        assert!(!state.target_visible && !state.child_visible);
        assert!(state.main_visible);
        assert_eq!(state.main_size, (900, 700));
        drop(state);
        assert!(!adapter
            .log
            .lock()
            .unwrap()
            .contains(&MigrationStep::FocusTarget));
        release_tx.send(()).unwrap();
        assert!(matches!(
            task.join().unwrap(),
            DetachOutcome::Committed { .. }
        ));
    }

    #[test]
    fn source_reveal_failure_remains_recovery_required_until_explicit_source_batch_retry() {
        let registry = Arc::new(PluginChildWebviewRegistry::default());
        let (attempt, handle) = instance(&registry, PluginChildWebviewOwner::main());
        let mut adapter = FakeAdapter::new(registry.clone());
        adapter.fail = Some((MigrationStep::HideMain, true));
        adapter.fail_rollback = Some(MigrationStep::RestoreSourceVisibilityAndFocus);
        let adapter = Arc::new(adapter);
        let coordinator = DetachedWindowRecoveryCoordinator::new(registry.clone(), adapter.clone());
        let RecoveryActionResult::RecoveryRequired(ticket) = coordinator.detach(request(attempt))
        else {
            panic!("source batch failure must retain original")
        };
        assert_eq!(
            coordinator.recovery_snapshots()[0].recovery_step,
            MigrationStep::PublishOwnership
        );
        assert_eq!(handle.destroys.load(Ordering::SeqCst), 0);
        assert!(!adapter.presentation.lock().unwrap().child_visible);
        adapter
            .rollback_failure_active
            .store(false, Ordering::SeqCst);
        assert!(matches!(
            coordinator.retry_recovery(&ticket, "main"),
            RecoveryActionResult::RolledBack(_)
        ));
        assert!(adapter.presentation.lock().unwrap().child_visible);
    }
}
