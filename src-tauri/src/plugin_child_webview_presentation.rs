use crate::{
    launcher_surface::LauncherSurfaceMode,
    launcher_window::MAIN_WINDOW_LABEL,
    plugin_child_webview_adapter::{
        create_plugin_child_webview, create_plugin_child_webview_with_evidence,
        PluginChildWebviewBounds as PluginChildWebviewAdapterBounds,
        PluginChildWebviewBridgeIngress, PluginChildWebviewCurrentSource,
        PluginChildWebviewEvidenceIngress, PluginChildWebviewLifecycleIngress,
        PluginChildWebviewProductInput,
    },
    plugin_child_webview_service::{
        PluginChildWebviewAttempt, PluginChildWebviewIdentity,
        PluginChildWebviewPresentationResult, PluginChildWebviewService,
        PluginChildWebviewSessionState, PluginChildWebviewWaitReadiness,
    },
    plugin_child_webview_slot::{
        apply_slot_update, PluginChildWebviewPhysicalBounds, SlotWindowFacts,
        UpdatePluginChildWebviewSlotRequest,
    },
    plugin_manager::PluginManager,
    plugin_manifest::RuntimeKind,
    plugin_resource_contract::{
        ResolvePluginResourceEntryRequest, PLUGIN_RESOURCE_CONTRACT_VERSION,
    },
    plugin_resource_service::PluginResourceService,
    plugin_runtime_stage::{record_plugin_runtime_stage, PluginRuntimeStage},
};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Instant};
use tauri::{AppHandle, Manager, State, Wry};

pub(crate) const PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION: &str = "0.2.0";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PluginChildWebviewPresentationIdentity {
    entry_id: String,
    plugin_id: String,
    version: String,
    page_id: String,
    expected_revision: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreatePluginChildWebviewPresentationRequest {
    contract_version: String,
    window_label: String,
    surface_mode: LauncherSurfaceMode,
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
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadPluginChildWebviewPresentationRequest {
    contract_version: String,
    attempt_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct WaitPluginChildWebviewPresentationRequest {
    contract_version: String,
    attempt_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SetPluginChildWebviewPresentationVisibilityRequest {
    contract_version: String,
    attempt_id: String,
    visible: bool,
}

#[derive(Debug, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CreatePluginChildWebviewPresentationResponse {
    contract_version: &'static str,
    attempt_id: String,
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

fn teardown_failed_creation(
    service: &Arc<PluginChildWebviewService<Wry>>,
    attempt: PluginChildWebviewAttempt,
) {
    let _ = service.compare_current_teardown(attempt);
}

fn create_plugin_child_webview_presentation_inner(
    app: &AppHandle,
    manager: &PluginManager,
    resources: &PluginResourceService,
    service: &Arc<PluginChildWebviewService<Wry>>,
    request: CreatePluginChildWebviewPresentationRequest,
    evidence: Option<Arc<dyn PluginChildWebviewEvidenceIngress>>,
) -> Result<CreatePluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    let create_started = Instant::now();
    if request.contract_version != PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION
        || request.window_label != MAIN_WINDOW_LABEL
        || request.surface_mode != LauncherSurfaceMode::Page
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
    let resolved = resources
        .resolve_entry(&ResolvePluginResourceEntryRequest {
            contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION.to_owned(),
            entry_id: request.identity.entry_id.clone(),
            expected_revision: request.identity.expected_revision.clone(),
        })
        .map_err(|_| {
            PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::Unavailable,
            )
        })?;
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
        .reserve_current_with_derived_label(identity)
        .ok_or_else(|| {
            PluginChildWebviewPresentationError::new(
                PluginChildWebviewPresentationErrorCode::CurrentExists,
            )
        })?;
    let window = app.get_webview_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
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
    )
    .is_err()
    {
        teardown_failed_creation(&service, attempt);
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        ));
    }
    if !service.prepare_current_creation(attempt) {
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
        .snapshot()
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
    let handle = if let Some(evidence) = evidence {
        create_plugin_child_webview_with_evidence(
            app,
            MAIN_WINDOW_LABEL,
            product_input,
            current_source,
            bridge_ingress,
            lifecycle_ingress,
            Some(evidence),
        )
    } else {
        create_plugin_child_webview(
            app,
            MAIN_WINDOW_LABEL,
            product_input,
            current_source,
            bridge_ingress,
            lifecycle_ingress,
        )
    }
    .map_err(|_| {
        teardown_failed_creation(&service, attempt);
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::NativeCreateFailed,
        )
    })?;
    if !service.attach_current(attempt, handle) {
        teardown_failed_creation(&service, attempt);
        return Err(PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::NativeCreateFailed,
        ));
    }
    record_plugin_runtime_stage(PluginRuntimeStage::Create, create_started.elapsed());
    Ok(CreatePluginChildWebviewPresentationResponse {
        contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
        attempt_id: attempt.opaque_id(),
    })
}

#[tauri::command]
pub(crate) fn create_plugin_child_webview_presentation(
    app: AppHandle,
    manager: State<'_, Arc<PluginManager>>,
    resources: State<'_, Arc<PluginResourceService>>,
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: CreatePluginChildWebviewPresentationRequest,
) -> Result<CreatePluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    create_plugin_child_webview_presentation_inner(
        &app,
        manager.inner(),
        resources.inner(),
        service.inner(),
        request,
        None,
    )
}

#[cfg(feature = "config-lens-cold-open-harness")]
pub(crate) fn create_config_lens_evidence_presentation(
    app: &AppHandle,
    manager: &Arc<PluginManager>,
    resources: &Arc<PluginResourceService>,
    service: &Arc<PluginChildWebviewService<Wry>>,
    entry_id: String,
    plugin_id: String,
    version: String,
    page_id: String,
    expected_revision: String,
    evidence: Arc<dyn PluginChildWebviewEvidenceIngress>,
) -> Result<PluginChildWebviewAttempt, PluginChildWebviewPresentationError> {
    let window = app.get_webview_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        )
    })?;
    let scale_factor = window.scale_factor().map_err(|_| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        )
    })?;
    let size = window.inner_size().map_err(|_| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::InvalidRequest,
        )
    })?;
    let response = create_plugin_child_webview_presentation_inner(
        app,
        manager,
        resources,
        service,
        CreatePluginChildWebviewPresentationRequest {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION.to_owned(),
            window_label: MAIN_WINDOW_LABEL.to_owned(),
            surface_mode: LauncherSurfaceMode::Page,
            scale_factor,
            physical_bounds: PluginChildWebviewPhysicalBounds {
                x: 0.0,
                y: 0.0,
                width: f64::from(size.width),
                height: f64::from(size.height),
            },
            presentation_revision: "1".to_owned(),
            identity: PluginChildWebviewPresentationIdentity {
                entry_id,
                plugin_id,
                version,
                page_id,
                expected_revision,
            },
        },
        Some(evidence),
    )?;
    PluginChildWebviewAttempt::from_opaque_id(&response.attempt_id).ok_or_else(|| {
        PluginChildWebviewPresentationError::new(
            PluginChildWebviewPresentationErrorCode::NativeCreateFailed,
        )
    })
}

#[tauri::command]
pub(crate) fn destroy_plugin_child_webview_presentation(
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: DestroyPluginChildWebviewPresentationRequest,
) -> Result<DestroyPluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    let attempt = parse_attempt(&request.contract_version, &request.attempt_id)?;
    match service.compare_current_teardown(attempt) {
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
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: ReadPluginChildWebviewPresentationRequest,
) -> Result<ReadPluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    let attempt = parse_attempt(&request.contract_version, &request.attempt_id)?;
    let _ = service.expire_current_session_deadline(attempt);
    let snapshot = service
        .snapshot()
        .filter(|snapshot| snapshot.attempt == attempt)
        .ok_or_else(|| {
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
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: WaitPluginChildWebviewPresentationRequest,
) -> Result<WaitPluginChildWebviewPresentationResponse, PluginChildWebviewPresentationError> {
    let attempt = parse_attempt(&request.contract_version, &request.attempt_id)?;
    let service = service.inner().clone();
    let readiness =
        tauri::async_runtime::spawn_blocking(move || service.wait_presentation_readiness(attempt))
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
    service: State<'_, Arc<PluginChildWebviewService<Wry>>>,
    request: SetPluginChildWebviewPresentationVisibilityRequest,
) -> Result<SetPluginChildWebviewPresentationVisibilityResponse, PluginChildWebviewPresentationError>
{
    let attempt = parse_attempt(&request.contract_version, &request.attempt_id)?;
    let result = if request.visible {
        service.show_current(attempt)
    } else {
        service.hide_current(attempt)
    };
    match result {
        PluginChildWebviewPresentationResult::Applied => {
            if request.visible
                && service.focus_current(attempt) != PluginChildWebviewPresentationResult::Applied
            {
                let _ = service.hide_current(attempt);
                return Err(PluginChildWebviewPresentationError::new(
                    PluginChildWebviewPresentationErrorCode::Unavailable,
                ));
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
    fn presentation_results_are_closed_and_non_oracular() {
        let response = serde_json::to_value(CreatePluginChildWebviewPresentationResponse {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            attempt_id: "attempt_0123456789abcdef".to_owned(),
        })
        .expect("response should serialize");
        assert_eq!(
            response,
            json!({
                "contract_version": PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
                "attempt_id": "attempt_0123456789abcdef"
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
}
