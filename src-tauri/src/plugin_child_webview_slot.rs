use crate::{
    launcher_window::MAIN_WINDOW_LABEL,
    plugin_child_webview_service::{
        PluginChildWebviewAttempt, PluginChildWebviewBounds, PluginChildWebviewRegistry,
        PluginChildWebviewService, PluginChildWebviewSlotUpdateResult,
    },
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub(crate) const PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION: &str = "0.1.0";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PluginChildWebviewSurfaceMode {
    Home,
    Page,
    Search,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginChildWebviewPhysicalBounds {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdatePluginChildWebviewSlotRequest {
    pub(crate) contract_version: String,
    pub(crate) attempt_id: String,
    pub(crate) window_label: String,
    pub(crate) surface_mode: PluginChildWebviewSurfaceMode,
    pub(crate) scale_factor: f64,
    pub(crate) physical_bounds: PluginChildWebviewPhysicalBounds,
    pub(crate) presentation_revision: String,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct UpdatePluginChildWebviewSlotResponse {
    contract_version: &'static str,
    accepted_revision: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginChildWebviewSlotErrorCode {
    InvalidRequest,
    StaleAttempt,
    StaleRevision,
    NativeUpdateFailed,
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginChildWebviewSlotError {
    contract_version: &'static str,
    code: PluginChildWebviewSlotErrorCode,
    message: &'static str,
}

impl PluginChildWebviewSlotError {
    fn new(code: PluginChildWebviewSlotErrorCode) -> Self {
        let message = match code {
            PluginChildWebviewSlotErrorCode::InvalidRequest => {
                "Plugin Child WebView slot update is invalid."
            }
            PluginChildWebviewSlotErrorCode::StaleAttempt => {
                "Plugin Child WebView attempt is not current."
            }
            PluginChildWebviewSlotErrorCode::StaleRevision => {
                "Plugin Child WebView slot revision is stale."
            }
            PluginChildWebviewSlotErrorCode::NativeUpdateFailed => {
                "Plugin Child WebView bounds could not be updated."
            }
        };
        Self {
            contract_version: PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION,
            code,
            message,
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) struct SlotWindowFacts {
    pub(crate) scale_factor: f64,
    pub(crate) physical_width: u32,
    pub(crate) physical_height: u32,
}

fn exact_nonnegative_integer(value: f64) -> bool {
    value.is_finite() && value >= 0.0 && value.fract() == 0.0
}

fn parse_request(
    request: &UpdatePluginChildWebviewSlotRequest,
    window: SlotWindowFacts,
) -> Option<(PluginChildWebviewAttempt, u64, PluginChildWebviewBounds)> {
    if request.contract_version != PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION
        || request.window_label != MAIN_WINDOW_LABEL
        || request.surface_mode != PluginChildWebviewSurfaceMode::Page
        || !request.scale_factor.is_finite()
        || request.scale_factor <= 0.0
        || (request.scale_factor - window.scale_factor).abs() > f64::EPSILON
    {
        return None;
    }
    let bounds = request.physical_bounds;
    if !exact_nonnegative_integer(bounds.x)
        || !exact_nonnegative_integer(bounds.y)
        || !exact_nonnegative_integer(bounds.width)
        || !exact_nonnegative_integer(bounds.height)
        || bounds.width == 0.0
        || bounds.height == 0.0
        || bounds.x > i32::MAX as f64
        || bounds.y > i32::MAX as f64
        || bounds.width > u32::MAX as f64
        || bounds.height > u32::MAX as f64
        || bounds.x + bounds.width > f64::from(window.physical_width)
        || bounds.y + bounds.height > f64::from(window.physical_height)
    {
        return None;
    }
    if request.presentation_revision.is_empty()
        || request.presentation_revision.len() > 20
        || !request
            .presentation_revision
            .bytes()
            .all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    let revision = request.presentation_revision.parse::<u64>().ok()?;
    if revision == 0 {
        return None;
    }
    Some((
        PluginChildWebviewAttempt::from_opaque_id(&request.attempt_id)?,
        revision,
        PluginChildWebviewBounds {
            x: bounds.x as i32,
            y: bounds.y as i32,
            width: bounds.width as u32,
            height: bounds.height as u32,
        },
    ))
}

pub(crate) fn apply_slot_update<
    H: crate::plugin_child_webview_adapter::PluginChildWebviewNativeHandle,
>(
    service: &PluginChildWebviewRegistry<H>,
    request: UpdatePluginChildWebviewSlotRequest,
    window: SlotWindowFacts,
) -> Result<UpdatePluginChildWebviewSlotResponse, PluginChildWebviewSlotError> {
    let (attempt, revision, bounds) = parse_request(&request, window).ok_or_else(|| {
        PluginChildWebviewSlotError::new(PluginChildWebviewSlotErrorCode::InvalidRequest)
    })?;
    match service.apply_slot_update(attempt, revision, bounds) {
        PluginChildWebviewSlotUpdateResult::Applied => Ok(UpdatePluginChildWebviewSlotResponse {
            contract_version: PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION,
            accepted_revision: revision.to_string(),
        }),
        PluginChildWebviewSlotUpdateResult::StaleAttempt => Err(PluginChildWebviewSlotError::new(
            PluginChildWebviewSlotErrorCode::StaleAttempt,
        )),
        PluginChildWebviewSlotUpdateResult::StaleRevision => Err(PluginChildWebviewSlotError::new(
            PluginChildWebviewSlotErrorCode::StaleRevision,
        )),
        PluginChildWebviewSlotUpdateResult::NativeUpdateFailed => Err(
            PluginChildWebviewSlotError::new(PluginChildWebviewSlotErrorCode::NativeUpdateFailed),
        ),
    }
}

#[tauri::command]
pub(crate) fn update_plugin_child_webview_slot(
    app: AppHandle,
    service: State<'_, Arc<PluginChildWebviewService<tauri::Wry>>>,
    request: UpdatePluginChildWebviewSlotRequest,
) -> Result<UpdatePluginChildWebviewSlotResponse, PluginChildWebviewSlotError> {
    let window = app.get_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
        PluginChildWebviewSlotError::new(PluginChildWebviewSlotErrorCode::InvalidRequest)
    })?;
    let size = window.inner_size().map_err(|_| {
        PluginChildWebviewSlotError::new(PluginChildWebviewSlotErrorCode::InvalidRequest)
    })?;
    let scale_factor = window.scale_factor().map_err(|_| {
        PluginChildWebviewSlotError::new(PluginChildWebviewSlotErrorCode::InvalidRequest)
    })?;
    apply_slot_update(
        &service,
        request,
        SlotWindowFacts {
            scale_factor,
            physical_width: size.width,
            physical_height: size.height,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        plugin_child_webview_adapter::PluginChildWebviewNativeHandle,
        plugin_child_webview_service::PluginChildWebviewIdentity,
    };
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use url::Url;

    #[derive(Clone, Default)]
    struct FakeHandle {
        bounds_updates: Arc<AtomicUsize>,
        fail_bounds: Arc<AtomicBool>,
    }

    impl PluginChildWebviewNativeHandle for FakeHandle {
        fn source_label(&self) -> String {
            "fake-child".to_owned()
        }

        fn update_bounds(&self, _x: i32, _y: i32, _width: u32, _height: u32) -> Result<(), ()> {
            self.bounds_updates.fetch_add(1, Ordering::SeqCst);
            if self.fail_bounds.load(Ordering::SeqCst) {
                Err(())
            } else {
                Ok(())
            }
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

        fn deliver_bridge_frame(&self, _frame: &serde_json::Value) -> Result<(), ()> {
            Ok(())
        }

        fn destroy(&self) -> Result<(), ()> {
            Ok(())
        }
    }

    fn identity() -> PluginChildWebviewIdentity {
        PluginChildWebviewIdentity::new(
            "plugin-a",
            "page-a",
            "entry-a",
            "1.0.0",
            1,
            Url::parse("lensx-plugin://plugin-a.runtime.localhost/index.html")
                .expect("fixture URL parses"),
            "/",
        )
        .expect("fixture identity is valid")
    }

    fn request(attempt_id: String, revision: &str) -> UpdatePluginChildWebviewSlotRequest {
        UpdatePluginChildWebviewSlotRequest {
            contract_version: PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION.to_owned(),
            attempt_id,
            window_label: MAIN_WINDOW_LABEL.to_owned(),
            surface_mode: PluginChildWebviewSurfaceMode::Page,
            scale_factor: 2.0,
            physical_bounds: PluginChildWebviewPhysicalBounds {
                x: 40.0,
                y: 80.0,
                width: 600.0,
                height: 400.0,
            },
            presentation_revision: revision.to_owned(),
        }
    }

    fn window() -> SlotWindowFacts {
        SlotWindowFacts {
            scale_factor: 2.0,
            physical_width: 1300,
            physical_height: 1200,
        }
    }

    #[test]
    fn current_revision_updates_native_physical_bounds_once() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let attempt = service
            .reserve_current(identity(), "fake-child")
            .expect("reserve current");
        let handle = FakeHandle::default();
        let updates = Arc::clone(&handle.bounds_updates);
        assert!(service.attach_current(attempt, handle));
        let response = apply_slot_update(&service, request(attempt.opaque_id(), "1"), window())
            .expect("slot update should apply");
        assert_eq!(response.accepted_revision, "1");
        assert_eq!(updates.load(Ordering::SeqCst), 1);
        let snapshot = service.snapshot().expect("current remains");
        assert_eq!(snapshot.presentation_revision, 1);
        assert_eq!(
            snapshot.bounds,
            Some(PluginChildWebviewBounds {
                x: 40,
                y: 80,
                width: 600,
                height: 400,
            })
        );
    }

    #[test]
    fn stale_attempt_and_revision_never_touch_native_handle() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let attempt = service
            .reserve_current(identity(), "fake-child")
            .expect("reserve current");
        let handle = FakeHandle::default();
        let updates = Arc::clone(&handle.bounds_updates);
        assert!(service.attach_current(attempt, handle));
        let stale_attempt = apply_slot_update(
            &service,
            request("attempt_00000000000000ff".to_owned(), "1"),
            window(),
        )
        .expect_err("stale attempt must fail");
        assert_eq!(
            stale_attempt.code,
            PluginChildWebviewSlotErrorCode::StaleAttempt
        );
        apply_slot_update(&service, request(attempt.opaque_id(), "2"), window())
            .expect("new revision applies");
        let stale_revision =
            apply_slot_update(&service, request(attempt.opaque_id(), "2"), window())
                .expect_err("duplicate revision must fail");
        assert_eq!(
            stale_revision.code,
            PluginChildWebviewSlotErrorCode::StaleRevision
        );
        assert_eq!(updates.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn invalid_window_surface_scale_and_bounds_fail_before_registry() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let attempt = service
            .reserve_current(identity(), "fake-child")
            .expect("reserve current");
        let cases = [
            {
                let mut value = request(attempt.opaque_id(), "1");
                value.window_label = "forged".to_owned();
                value
            },
            {
                let mut value = request(attempt.opaque_id(), "1");
                value.surface_mode = PluginChildWebviewSurfaceMode::Home;
                value
            },
            {
                let mut value = request(attempt.opaque_id(), "1");
                value.scale_factor = 1.0;
                value
            },
            {
                let mut value = request(attempt.opaque_id(), "1");
                value.physical_bounds.x = f64::NAN;
                value
            },
            {
                let mut value = request(attempt.opaque_id(), "1");
                value.physical_bounds.width = -1.0;
                value
            },
            {
                let mut value = request(attempt.opaque_id(), "1");
                value.physical_bounds.width = 2000.0;
                value
            },
        ];
        for invalid in cases {
            let error = apply_slot_update(&service, invalid, window())
                .expect_err("invalid slot input must fail");
            assert_eq!(error.code, PluginChildWebviewSlotErrorCode::InvalidRequest);
        }
        assert_eq!(
            service
                .snapshot()
                .expect("current remains")
                .presentation_revision,
            0
        );
    }

    #[test]
    fn native_failure_does_not_commit_revision_or_bounds() {
        let service = PluginChildWebviewRegistry::<FakeHandle>::default();
        let attempt = service
            .reserve_current(identity(), "fake-child")
            .expect("reserve current");
        let handle = FakeHandle::default();
        handle.fail_bounds.store(true, Ordering::SeqCst);
        assert!(service.attach_current(attempt, handle));
        let error = apply_slot_update(&service, request(attempt.opaque_id(), "1"), window())
            .expect_err("native update should fail");
        assert_eq!(
            error.code,
            PluginChildWebviewSlotErrorCode::NativeUpdateFailed
        );
        let snapshot = service.snapshot().expect("current remains");
        assert_eq!(snapshot.presentation_revision, 0);
        assert!(snapshot.bounds.is_none());
    }

    #[test]
    fn serialized_error_is_bounded_and_non_oracular() {
        let wire = serde_json::to_string(&PluginChildWebviewSlotError::new(
            PluginChildWebviewSlotErrorCode::InvalidRequest,
        ))
        .expect("error serializes");
        for forbidden in ["window_label", "attempt_id", "physical_bounds", "plugin-a"] {
            assert!(!wire.contains(forbidden));
        }
    }
}
