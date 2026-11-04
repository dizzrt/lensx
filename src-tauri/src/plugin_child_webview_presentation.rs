use crate::plugin_child_webview_execution::NativeExecutionGuard;
use crate::{
    plugin_child_webview_adapter::{
        create_plugin_child_webview, PluginChildWebviewBounds as PluginChildWebviewAdapterBounds,
        PluginChildWebviewBridgeIngress, PluginChildWebviewCurrentSource,
        PluginChildWebviewLifecycleIngress, PluginChildWebviewProductInput,
    },
    plugin_child_webview_owner::PluginChildWebviewOwner,
    plugin_child_webview_service::{
        PluginChildWebviewAttempt, PluginChildWebviewIdentity,
        PluginChildWebviewPresentationResult, PluginChildWebviewService,
        PluginChildWebviewSessionState, PluginChildWebviewWaitReadiness,
    },
    plugin_child_webview_slot::{
        apply_slot_update, parse_presentation_owner, PluginChildWebviewPhysicalBounds,
        PluginChildWebviewSurfaceMode, SlotWindowFacts, UpdatePluginChildWebviewSlotRequest,
    },
    plugin_manager::PluginManager,
    plugin_manifest::RuntimeKind,
    plugin_resource_contract::{
        ResolvePluginResourceEntryRequest, PLUGIN_RESOURCE_CONTRACT_VERSION,
    },
    plugin_resource_service::PluginResourceService,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, Webview, Wry};

pub(crate) const PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION: &str = "0.3.0";

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PluginChildWebviewPresentationIdentity {
    pub(crate) entry_id: String,
    pub(crate) plugin_id: String,
    pub(crate) version: String,
    pub(crate) page_id: String,
    pub(crate) expected_revision: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadPluginChildWebviewAdmissionRequest {
    contract_version: String,
    window_label: String,
    ownership_revision: String,
    identity: PluginChildWebviewPresentationIdentity,
}

#[derive(Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadPluginChildWebviewAdmissionResponse {
    contract_version: &'static str,
    entry_id: String,
    revision: String,
    resource_generation: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreatePluginChildWebviewPresentationRequest {
    contract_version: String,
    window_label: String,
    ownership_revision: String,
    surface_mode: PluginChildWebviewSurfaceMode,
    scale_factor: f64,
    physical_bounds: PluginChildWebviewPhysicalBounds,
    presentation_revision: String,
    identity: PluginChildWebviewPresentationIdentity,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct DestroyPluginChildWebviewPresentationRequest {
    contract_version: String,
    attempt_id: String,
    window_label: String,
    ownership_revision: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadPluginChildWebviewPresentationRequest {
    contract_version: String,
    attempt_id: String,
    window_label: String,
    ownership_revision: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WaitPluginChildWebviewPresentationRequest {
    contract_version: String,
    attempt_id: String,
    window_label: String,
    ownership_revision: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SetPluginChildWebviewPresentationVisibilityRequest {
    contract_version: String,
    attempt_id: String,
    window_label: String,
    ownership_revision: String,
    visible: bool,
}

#[derive(Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreatePluginChildWebviewPresentationResponse {
    contract_version: &'static str,
    attempt_id: String,
    window_label: String,
    ownership_revision: String,
    entry_url: String,
    resource_generation: String,
}

#[derive(Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct DestroyPluginChildWebviewPresentationResponse {
    contract_version: &'static str,
    destroyed: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PluginChildWebviewPresentationReadiness {
    Loading,
    Ready,
    Failed,
}

#[derive(Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadPluginChildWebviewPresentationResponse {
    contract_version: &'static str,
    attempt_id: String,
    readiness: PluginChildWebviewPresentationReadiness,
    failure_code: Option<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WaitPluginChildWebviewPresentationResponse {
    contract_version: &'static str,
    readiness: PluginChildWebviewPresentationReadiness,
    failure_code: Option<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SetPluginChildWebviewPresentationVisibilityResponse {
    contract_version: &'static str,
    attempt_id: String,
    visible: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PluginChildWebviewPresentationErrorCode {
    InvalidRequest,
    Unavailable,
    CurrentExists,
    NativeCreateFailed,
    NotReady,
    StaleAttempt,
    DestroyFailed,
}

#[derive(Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PluginChildWebviewPresentationError {
    contract_version: &'static str,
    code: PluginChildWebviewPresentationErrorCode,
    message: &'static str,
}

impl PluginChildWebviewPresentationError {
    fn new(code: PluginChildWebviewPresentationErrorCode) -> Self {
        let message = match code {
            PluginChildWebviewPresentationErrorCode::InvalidRequest => {
                "Plugin Child WebView presentation request is invalid."
            }
            PluginChildWebviewPresentationErrorCode::Unavailable => {
                "Plugin Child WebView presentation is unavailable."
            }
            PluginChildWebviewPresentationErrorCode::CurrentExists => {
                "A current Plugin Child WebView already exists."
            }
            PluginChildWebviewPresentationErrorCode::NativeCreateFailed => {
                "Plugin Child WebView creation failed."
            }
            PluginChildWebviewPresentationErrorCode::NotReady => {
                "Plugin Child WebView presentation is not ready."
            }
            PluginChildWebviewPresentationErrorCode::StaleAttempt => {
                "Plugin Child WebView attempt is not current."
            }
            PluginChildWebviewPresentationErrorCode::DestroyFailed => {
                "Plugin Child WebView destruction failed."
            }
        };
        Self {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            code,
            message,
        }
    }
}

fn parse_attempt(
    contract_version: &str,
    attempt_id: &str,
) -> Result<PluginChildWebviewAttempt, PluginChildWebviewPresentationError> {
    if contract_version != PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION {
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        ));
    }
    PluginChildWebviewAttempt::from_opaque_id(attempt_id).ok_or_else(|| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        )
    })
}

fn parse_owner(
    window_label: &str,
    ownership_revision: &str,
    actual_host_source: &str,
    actual_window_label: &str,
) -> Result<PluginChildWebviewOwner, PluginChildWebviewPresentationError> {
    parse_presentation_owner(
        window_label,
        ownership_revision,
        actual_host_source,
        actual_window_label,
    )
    .ok_or_else(|| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        )
    })
}

pub(crate) fn read_plugin_child_webview_admission_inner(
    manager: &PluginManager,
    actual_host_source: &str,
    actual_window_label: &str,
    request: ReadPluginChildWebviewAdmissionRequest,
) -> Result<ReadPluginChildWebviewAdmissionResponse, PluginChildWebviewPresentationError> {
    let owner = parse_owner(
        &request.window_label,
        &request.ownership_revision,
        actual_host_source,
        actual_window_label,
    )?;
    if request.contract_version != PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION
        || owner.revision != 1
        || [
            &request.identity.entry_id,
            &request.identity.plugin_id,
            &request.identity.version,
            &request.identity.page_id,
            &request.identity.expected_revision,
        ]
        .iter()
        .any(|value| value.is_empty() || value.len() > 512)
    {
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        ));
    }
    let projection = manager
        .read_resource_projection(
            &request.identity.entry_id,
            Some(&request.identity.expected_revision),
        )
        .map_err(|_| {
            PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::Unavailable,
            )
        })?;
    if projection.plugin_id != request.identity.plugin_id
        || projection.registration.manifest.version != request.identity.version
        || !projection.registration.facts.enabled
        || !projection.registration.compatibility.lensx
        || !projection.registration.compatibility.host_api
        || projection.registration.manifest.runtime.kind != RuntimeKind::Webview
        || !projection
            .registration
            .manifest
            .contributes
            .pages
            .iter()
            .any(|page| page.id == request.identity.page_id)
    {
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        ));
    }
    Ok(ReadPluginChildWebviewAdmissionResponse {
        contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
        entry_id: projection.entry_id,
        revision: projection.revision,
        resource_generation: projection.resource_generation.to_string(),
    })
}

#[tauri::command]
pub(crate) fn read_plugin_child_webview_admission(
    webview: Webview,
    manager: State<'_, Arc<PluginManager>>,
    request: ReadPluginChildWebviewAdmissionRequest,
) -> Result<ReadPluginChildWebviewAdmissionResponse, PluginChildWebviewPresentationError> {
    read_plugin_child_webview_admission_inner(
        manager.inner(),
        webview.label(),
        webview.window().label(),
        request,
    )
}

struct ScopedCreationSource {
    source: Arc<dyn PluginChildWebviewCurrentSource>,
    guard: NativeExecutionGuard,
}
impl PluginChildWebviewCurrentSource for ScopedCreationSource {
    fn is_current_source(&self, attempt: &str, label: &str) -> bool {
        self.guard.is_current() && self.source.is_current_source(attempt, label)
    }
}

fn teardown_failed_creation(
    service: &Arc<PluginChildWebviewService<Wry>>,
    attempt: PluginChildWebviewAttempt,
) {
    let _ = service.compare_current_teardown(attempt);
}

pub(crate) fn create_plugin_child_webview_presentation_inner(
    app: &AppHandle,
    actual_host_source: &str,
    actual_window_label: &str,
    manager: &PluginManager,
    resources: &PluginResourceService,
    service: &Arc<PluginChildWebviewService<Wry>>,
    request: CreatePluginChildWebviewPresentationRequest,
    scope_guard: Option<NativeExecutionGuard>,
) -> Result<CreatePluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    let owner = parse_owner(
        &request.window_label,
        &request.ownership_revision,
        actual_host_source,
        actual_window_label,
    )?;
    if request.contract_version != PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION
        || owner.revision != 1
        || request.surface_mode != PluginChildWebviewSurfaceMode::Page
    {
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        ));
    }
    if owner.window_label == "main"
        && (service.main_hide_blocked()
            || !crate::launcher_native_execution::fence(app)
                .normal_guard(false)
                .is_current())
    {
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        ));
    }
    if scope_guard
        .as_ref()
        .is_some_and(|guard| !guard.is_current())
    {
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::StaleAttempt,
        ));
    }
    let projection = manager
        .read_resource_projection(
            &request.identity.entry_id,
            Some(&request.identity.expected_revision),
        )
        .map_err(|_| {
            PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::Unavailable,
            )
        })?;
    let page = projection
        .registration
        .manifest
        .contributes
        .pages
        .iter()
        .find(|page| page.id == request.identity.page_id);
    if projection.entry_id != request.identity.entry_id
        || projection.plugin_id != request.identity.plugin_id
        || projection.registration.manifest.version != request.identity.version
        || !projection.registration.facts.enabled
        || !projection.registration.compatibility.lensx
        || !projection.registration.compatibility.host_api
        || projection.registration.manifest.runtime.kind != RuntimeKind::Webview
        || page.is_none()
    {
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        ));
    }
    let Some(page) = page else {
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        ));
    };
    let creation = service
        .reserve_creation_for_entry(
            owner.clone(),
            &projection.entry_id,
            projection.resource_generation,
        )
        .ok_or_else(|| {
            PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::CurrentExists,
            )
        })?;
    let reservation = resources
        .reserve_entry_for_attempt(
            &ResolvePluginResourceEntryRequest {
                contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
                entry_id: request.identity.entry_id.clone(),
                expected_revision: request.identity.expected_revision.clone(),
            },
            &creation.attempt.opaque_id(),
        )
        .map_err(|_| {
            PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::Unavailable,
            )
        })?;
    let resolved = &reservation.entry;
    if resolved.entry_id != projection.entry_id
        || resolved.plugin_id != projection.plugin_id
        || resolved.version != projection.registration.manifest.version
        || resolved.revision != projection.revision
    {
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        ));
    }
    let entry_url = resolved.entry_url.parse().map_err(|_| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        )
    })?;
    let identity = PluginChildWebviewIdentity::new(
        projection.plugin_id,
        page.id.clone(),
        projection.entry_id,
        projection.registration.manifest.version,
        projection.resource_generation,
        entry_url,
        page.route.clone(),
    )
    .ok_or_else(|| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        )
    })?;
    let service = Arc::clone(service);
    let attempt = service
        .bind_creation_reservation(&creation, identity)
        .ok_or_else(|| {
            PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::CurrentExists,
            )
        })?;
    let window = app.get_window(&owner.window_label).ok_or_else(|| {
        teardown_failed_creation(&service, attempt);
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        )
    })?;
    let size = window.inner_size().map_err(|_| {
        teardown_failed_creation(&service, attempt);
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        )
    })?;
    let scale_factor = window.scale_factor().map_err(|_| {
        teardown_failed_creation(&service, attempt);
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        )
    })?;
    let slot_request = UpdatePluginChildWebviewSlotRequest {
        contract_version:
            crate::plugin_child_webview_slot::PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION.to_owned(),
        attempt_id: attempt.opaque_id(),
        window_label: request.window_label,
        ownership_revision: request.ownership_revision,
        surface_mode: request.surface_mode,
        scale_factor: request.scale_factor,
        physical_bounds: request.physical_bounds,
        presentation_revision: request.presentation_revision,
    };
    if apply_slot_update(
        &service,
        slot_request,
        SlotWindowFacts {
            scale_factor,
            physical_width: size.width,
            physical_height: size.height,
        },
        actual_host_source,
        actual_window_label,
    )
    .is_err()
    {
        teardown_failed_creation(&service, attempt);
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        ));
    }
    if scope_guard
        .as_ref()
        .is_some_and(|guard| !guard.is_current())
        || !service.prepare_current_creation(attempt)
    {
        teardown_failed_creation(&service, attempt);
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        ));
    }
    let facts = service.creation_facts(attempt).ok_or_else(|| {
        teardown_failed_creation(&service, attempt);
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        )
    })?;
    let bounds = service
        .snapshot_owned(attempt, &owner)
        .and_then(|snapshot| {
            (snapshot.attempt == attempt)
                .then_some(snapshot.bounds)
                .flatten()
        })
        .ok_or_else(|| {
            teardown_failed_creation(&service, attempt);
            PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::InvalidRequest,
            )
        })?;
    let current_source: Arc<dyn PluginChildWebviewCurrentSource> = service.clone();
    let current_source: Arc<dyn PluginChildWebviewCurrentSource> =
        if let Some(guard) = scope_guard.as_ref() {
            Arc::new(ScopedCreationSource {
                source: current_source,
                guard: guard.clone(),
            })
        } else {
            current_source
        };
    let bridge_ingress: Arc<dyn PluginChildWebviewBridgeIngress> = service.clone();
    let lifecycle_ingress: Arc<dyn PluginChildWebviewLifecycleIngress> = service.clone();
    let product_input = PluginChildWebviewProductInput {
        attempt_id: attempt.opaque_id(),
        source_label: facts.source_label,
        exact_entry: facts.entry_url,
        host_route: facts.host_route,
        freshness: facts.freshness,
        data_store_identifier: facts.data_store_identifier,
        bounds: PluginChildWebviewAdapterBounds {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
        },
    };
    let handle = create_plugin_child_webview(
        app,
        &owner.window_label,
        product_input,
        current_source,
        bridge_ingress,
        lifecycle_ingress,
    )
    .map_err(|_| {
        teardown_failed_creation(&service, attempt);
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::NativeCreateFailed,
        )
    })?;
    if scope_guard
        .as_ref()
        .is_some_and(|guard| !guard.is_current())
    {
        teardown_failed_creation(&service, attempt);
        let _ =
            crate::plugin_child_webview_adapter::PluginChildWebviewNativeHandle::destroy(&handle);
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::StaleAttempt,
        ));
    }
    if !service.attach_current(attempt, handle) {
        teardown_failed_creation(&service, attempt);
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::NativeCreateFailed,
        ));
    }
    Ok(CreatePluginChildWebviewPresentationResponse {
        contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
        attempt_id: attempt.opaque_id(),
        window_label: owner.window_label,
        ownership_revision: owner.revision.to_string(),
        entry_url: resolved.entry_url.clone(),
        resource_generation: projection.resource_generation.to_string(),
    })
}

#[tauri::command]
pub(crate) fn create_plugin_child_webview_presentation(
    app: AppHandle,
    webview: Webview,
    manager: State<'_, Arc<PluginManager>>,
    resources: State<'_, Arc<PluginResourceService>>,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: CreatePluginChildWebviewPresentationRequest,
) -> Result<CreatePluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    create_plugin_child_webview_presentation_inner(
        &app,
        webview.label(),
        webview.window().label(),
        manager.inner(),
        resources.inner(),
        service.inner(),
        request,
        None,
    )
}

#[tauri::command]
pub(crate) fn destroy_plugin_child_webview_presentation(
    webview: Webview,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: DestroyPluginChildWebviewPresentationRequest,
) -> Result<DestroyPluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    let attempt = parse_attempt(&request.contract_version, &request.attempt_id)?;
    let owner = parse_owner(
        &request.window_label,
        &request.ownership_revision,
        webview.label(),
        webview.window().label(),
    )?;
    match service.compare_owned_teardown(attempt, &owner) {
        Ok(true) => Ok(DestroyPluginChildWebviewPresentationResponse {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            destroyed: true,
        }),
        Ok(false) => Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::StaleAttempt,
        )),
        Err(()) => Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::DestroyFailed,
        )),
    }
}

#[tauri::command]
pub(crate) fn read_plugin_child_webview_presentation(
    webview: Webview,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: ReadPluginChildWebviewPresentationRequest,
) -> Result<ReadPluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    let attempt = parse_attempt(&request.contract_version, &request.attempt_id)?;
    let owner = parse_owner(
        &request.window_label,
        &request.ownership_revision,
        webview.label(),
        webview.window().label(),
    )?;
    let _ = service.expire_owned_session_deadline(attempt, &owner);
    let snapshot = service.snapshot_owned(attempt, &owner).ok_or_else(|| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::StaleAttempt,
        )
    })?;
    let (readiness, failure_code) = match snapshot.session_state {
        PluginChildWebviewSessionState::BridgeReady | PluginChildWebviewSessionState::SdkReady => {
            (PluginChildWebviewPresentationReadiness::Ready, None)
        }
        PluginChildWebviewSessionState::Disconnected | PluginChildWebviewSessionState::Disposed => {
            (
                PluginChildWebviewPresentationReadiness::Failed,
                snapshot.session_error.map(|error| error.as_str()),
            )
        }
        PluginChildWebviewSessionState::Creating
        | PluginChildWebviewSessionState::Loading
        | PluginChildWebviewSessionState::Loaded => {
            (PluginChildWebviewPresentationReadiness::Loading, None)
        }
    };
    Ok(ReadPluginChildWebviewPresentationResponse {
        contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
        attempt_id: request.attempt_id,
        readiness,
        failure_code,
    })
}

#[tauri::command]
pub(crate) async fn wait_plugin_child_webview_presentation(
    webview: Webview,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: WaitPluginChildWebviewPresentationRequest,
) -> Result<WaitPluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    let attempt = parse_attempt(&request.contract_version, &request.attempt_id)?;
    let owner = parse_owner(
        &request.window_label,
        &request.ownership_revision,
        webview.label(),
        webview.window().label(),
    )?;
    let service = service.inner().clone();
    let readiness = tauri::async_runtime::spawn_blocking(move || {
        service.wait_owned_presentation_readiness(attempt, &owner)
    })
    .await
    .map_err(|_| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        )
    })?;
    match readiness {
        PluginChildWebviewWaitReadiness::Ready => Ok(WaitPluginChildWebviewPresentationResponse {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            readiness: PluginChildWebviewPresentationReadiness::Ready,
            failure_code: None,
        }),
        PluginChildWebviewWaitReadiness::Failed(error) => {
            Ok(WaitPluginChildWebviewPresentationResponse {
                contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
                readiness: PluginChildWebviewPresentationReadiness::Failed,
                failure_code: Some(error.as_str()),
            })
        }
        PluginChildWebviewWaitReadiness::StaleAttempt => {
            Err(PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::StaleAttempt,
            ))
        }
    }
}

#[tauri::command]
pub(crate) fn set_plugin_child_webview_presentation_visibility(
    webview: Webview,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: SetPluginChildWebviewPresentationVisibilityRequest,
) -> Result<SetPluginChildWebviewPresentationVisibilityResponse, PluginChildWebviewPresentationError>
{
    let attempt = parse_attempt(&request.contract_version, &request.attempt_id)?;
    let owner = parse_owner(
        &request.window_label,
        &request.ownership_revision,
        webview.label(),
        webview.window().label(),
    )?;
    let result = if request.visible {
        service.show_owned(attempt, &owner)
    } else {
        service.hide_owned(attempt, &owner)
    };
    match result {
        PluginChildWebviewPresentationResult::Applied => {
            if request.visible {
                match service.focus_owned(attempt, &owner) {
                    PluginChildWebviewPresentationResult::Applied
                    | PluginChildWebviewPresentationResult::FocusUnavailable => {}
                    PluginChildWebviewPresentationResult::StaleAttempt
                    | PluginChildWebviewPresentationResult::NotVisible => {
                        return Err(PluginChildWebviewPresentationError::new(
                            PluginChildWebviewPresentationErrorCode::StaleAttempt,
                        ));
                    }
                    _ => {
                        let _ = service.hide_owned(attempt, &owner);
                        return Err(PluginChildWebviewPresentationError::new(
                            PluginChildWebviewPresentationErrorCode::Unavailable,
                        ));
                    }
                }
            }
            Ok(SetPluginChildWebviewPresentationVisibilityResponse {
                contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
                attempt_id: request.attempt_id,
                visible: request.visible,
            })
        }
        PluginChildWebviewPresentationResult::NotReady => {
            Err(PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::NotReady,
            ))
        }
        PluginChildWebviewPresentationResult::StaleAttempt => {
            Err(PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::StaleAttempt,
            ))
        }
        PluginChildWebviewPresentationResult::NativeUnavailable
        | PluginChildWebviewPresentationResult::FocusUnavailable
        | PluginChildWebviewPresentationResult::NotVisible
        | PluginChildWebviewPresentationResult::NativeFailed => {
            Err(PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::Unavailable,
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn presentation_contract_rejects_private_creation_facts() {
        let request = json!({
            "contract_version": PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            "window_label": "main",
            "ownership_revision": "1",
            "surface_mode": "page",
            "scale_factor": 2.0,
            "physical_bounds": { "x": 20, "y": 40, "width": 600, "height": 400 },
            "presentation_revision": "1",
            "identity": {
                "entry_id": "entry_0123456789abcdef",
                "plugin_id": "com.acme.workspace",
                "version": "1.2.3",
                "page_id": "home",
                "expected_revision": "7",
                "entry_url": "lensx-plugin://forged.runtime.localhost/index.html"
            }
        });
        assert!(
            serde_json::from_value::<CreatePluginChildWebviewPresentationRequest>(request).is_err()
        );
    }

    #[test]
    fn presentation_commands_require_owner_fields_and_reject_unknown_authority() {
        let valid = json!({
            "contract_version": PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            "attempt_id": "attempt_0123456789abcdef",
            "window_label": "main",
            "ownership_revision": "1"
        });
        assert!(
            serde_json::from_value::<ReadPluginChildWebviewPresentationRequest>(valid.clone())
                .is_ok()
        );
        assert!(
            serde_json::from_value::<WaitPluginChildWebviewPresentationRequest>(valid.clone())
                .is_ok()
        );
        assert!(
            serde_json::from_value::<DestroyPluginChildWebviewPresentationRequest>(valid.clone())
                .is_ok()
        );
        for missing in ["window_label", "ownership_revision"] {
            let mut invalid = valid.clone();
            invalid.as_object_mut().unwrap().remove(missing);
            assert!(
                serde_json::from_value::<ReadPluginChildWebviewPresentationRequest>(
                    invalid.clone()
                )
                .is_err()
            );
            assert!(
                serde_json::from_value::<WaitPluginChildWebviewPresentationRequest>(
                    invalid.clone()
                )
                .is_err()
            );
            assert!(
                serde_json::from_value::<DestroyPluginChildWebviewPresentationRequest>(invalid)
                    .is_err()
            );
        }
        let mut forged = valid.clone();
        forged["source_label"] = json!("main");
        assert!(
            serde_json::from_value::<DestroyPluginChildWebviewPresentationRequest>(forged).is_err()
        );
        assert!(parse_owner("main", "1", "plugin-child-0123456789abcdef", "main").is_err());
        assert!(parse_owner("main", "1", "main", "plugin-window-0000000000000001").is_err());
        assert!(parse_attempt("0.2.0", "attempt_0123456789abcdef").is_err());
    }

    #[test]
    fn presentation_results_are_closed_and_non_oracular() {
        let entry_url = crate::plugin_resource_url::build_native_resource_url(
            "0123456789abcdef0123456789abcdef",
            &crate::plugin_identity::plugin_record_key("com.example.fixture"),
            "1.0.0",
            "dist/index.html",
        );
        let response = serde_json::to_value(CreatePluginChildWebviewPresentationResponse {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            attempt_id: "attempt_0123456789abcdef".to_owned(),
            window_label: "main".to_owned(),
            ownership_revision: "1".to_owned(),
            entry_url: entry_url.clone(),
            resource_generation: "1".into(),
        })
        .expect("response should serialize");
        assert_eq!(
            response,
            json!({
                "contract_version": PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
                "attempt_id": "attempt_0123456789abcdef",
                "window_label": "main",
                "ownership_revision": "1",
                "entry_url": entry_url,
                "resource_generation": "1"
            })
        );
        let error = serde_json::to_value(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::Unavailable,
        ))
        .expect("error should serialize");
        assert_eq!(
            error,
            json!({
                "contract_version": PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
                "code": "unavailable",
                "message": "Plugin Child WebView presentation is unavailable."
            })
        );
        let serialized = error.to_string();
        for private_fact in ["entry_url", "origin", "label", "handle", "data_store"] {
            assert!(!serialized.contains(private_fact));
        }
    }
    #[test]
    fn admission_reads_current_generation_without_allocating_resource_authority() {
        use crate::plugin_manager::{PackageDigest, PluginRegistrationFacts, PluginSource};
        use crate::plugin_manifest::{validate_plugin_manifest, PluginHostVersions};
        let path = std::env::temp_dir().join(format!(
            "lensx-child-admission-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let versions = PluginHostVersions {
            lensx: "0.1.0".into(),
            host_api: "0.2.0".into(),
        };
        let manager = PluginManager::recover(path.join("config"), versions.clone());
        let input: serde_json::Value = serde_json::from_str(include_str!(
            "../../packages/plugin-contract/tests/fixtures/base.json"
        ))
        .unwrap();
        let manifest = validate_plugin_manifest(&input, &versions)
            .manifest
            .unwrap();
        let plugin_id = manifest.plugin_id.clone();
        let version = manifest.version.clone();
        let page_id = manifest.contributes.pages[0].id.clone();
        manager
            .register(
                manifest,
                PluginRegistrationFacts::new(
                    path.join("payload").to_string_lossy(),
                    PackageDigest {
                        algorithm: "sha256".into(),
                        value: "a".repeat(64),
                    },
                    PluginSource::External,
                    true,
                )
                .unwrap(),
            )
            .unwrap();
        let entry_id = crate::plugin_registration::healthy_entry_id(
            &manager.registration(&plugin_id).unwrap(),
        );
        let request = || ReadPluginChildWebviewAdmissionRequest {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION.into(),
            window_label: "main".into(),
            ownership_revision: "1".into(),
            identity: PluginChildWebviewPresentationIdentity {
                entry_id: entry_id.clone(),
                plugin_id: plugin_id.clone(),
                version: version.clone(),
                page_id: page_id.clone(),
                expected_revision: manager.registration_revision(),
            },
        };
        let first =
            read_plugin_child_webview_admission_inner(&manager, "main", "main", request()).unwrap();
        assert_eq!(
            first.resource_generation,
            manager
                .read_resource_projection(&entry_id, None)
                .unwrap()
                .resource_generation
                .to_string()
        );
        assert_eq!(first.entry_id, entry_id);
        let serialized = serde_json::to_value(first).unwrap();
        assert_eq!(serialized.as_object().unwrap().len(), 4);
        for forbidden in ["entry_url", "attempt_id", "scope", "data_store"] {
            assert!(serialized.get(forbidden).is_none());
        }
        assert!(read_plugin_child_webview_admission_inner(
            &manager,
            "plugin-child-0000000000000001",
            "main",
            request()
        )
        .is_err());
        let mut invalid = request();
        invalid.identity.page_id = "unregistered".into();
        assert!(
            read_plugin_child_webview_admission_inner(&manager, "main", "main", invalid).is_err()
        );
        manager.set_enabled(&plugin_id, false).unwrap();
        assert!(
            read_plugin_child_webview_admission_inner(&manager, "main", "main", request()).is_err()
        );
        manager.set_enabled(&plugin_id, true).unwrap();
        let next =
            read_plugin_child_webview_admission_inner(&manager, "main", "main", request()).unwrap();
        assert_ne!(
            serialized["resource_generation"],
            serde_json::json!(next.resource_generation)
        );
        // There is no ResourceService/native adapter in this production policy's
        // dependency list; metadata admission needs no payload file or scope.
        assert!(!path.join("payload").exists());
        drop(manager);
        std::fs::remove_dir_all(path).unwrap();
    }
}
