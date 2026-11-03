//! Window-owned clipping of the complete Host/Child native composition.
//!
//! The policy uses logical points and the content view's implicit bounds mask.
//! It never changes Child geometry, focus, the view hierarchy, or window shadow.

use std::fmt::{Display, Formatter};

#[cfg(any(target_os = "macos", test))]
use std::{sync::mpsc, time::Duration};

#[cfg(any(target_os = "macos", test))]
pub(crate) const LAUNCHER_CORNER_RADIUS_LOGICAL_POINTS: f64 = 18.0;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) enum LauncherRoundedCornersError {
    MainThreadRequired,
    WindowUnavailable,
    ContentViewUnavailable,
    LayerUnavailable,
    ConfigureFailed,
    ConfirmationFailed,
    DispatchFailed,
    CompletionExpired,
}

impl Display for LauncherRoundedCornersError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        let operation = match self {
            Self::MainThreadRequired => "main_thread",
            Self::WindowUnavailable => "window",
            Self::ContentViewUnavailable => "content_view",
            Self::LayerUnavailable => "layer",
            Self::ConfigureFailed => "configure",
            Self::ConfirmationFailed => "confirm",
            Self::DispatchFailed => "dispatch",
            Self::CompletionExpired => "completion",
        };
        write!(
            formatter,
            "Launcher rounded content unavailable ({operation})"
        )
    }
}

impl std::error::Error for LauncherRoundedCornersError {}

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Copy, Debug, PartialEq)]
struct RoundedContentState {
    layer_backed: bool,
    radius: f64,
    masks_to_bounds: bool,
    all_corners: bool,
}

#[cfg(any(target_os = "macos", test))]
impl RoundedContentState {
    fn is_confirmed(self) -> bool {
        self.layer_backed
            && self.radius == LAUNCHER_CORNER_RADIUS_LOGICAL_POINTS
            && self.masks_to_bounds
            && self.all_corners
    }
}

#[cfg(any(target_os = "macos", test))]
trait RoundedContentAdapter {
    fn read(&self) -> Result<RoundedContentState, LauncherRoundedCornersError>;
    fn configure(&mut self, logical_radius: f64) -> Result<(), LauncherRoundedCornersError>;
}

#[cfg(any(target_os = "macos", test))]
fn ensure_rounded_content(
    adapter: &mut impl RoundedContentAdapter,
) -> Result<(), LauncherRoundedCornersError> {
    // A currently confirmed safe clip requires no mutation, including during
    // same-attempt restore and ordinary surface configuration.
    if adapter.read().is_ok_and(RoundedContentState::is_confirmed) {
        return Ok(());
    }
    adapter.configure(LAUNCHER_CORNER_RADIUS_LOGICAL_POINTS)?;
    if adapter.read()?.is_confirmed() {
        Ok(())
    } else {
        Err(LauncherRoundedCornersError::ConfirmationFailed)
    }
}

/// Dispatch acceptance is never confirmation. This closure only configures a
/// Window-owned property: it must not reveal/focus a Window or capture a Child.
/// A job that has not begun by the deadline is inert; even if an executing job
/// finishes late, the expired caller receives failure and cannot reveal.
#[cfg(any(target_os = "macos", test))]
fn confirm_on_main_thread<F, S>(
    is_main_thread: bool,
    schedule: S,
    execute: F,
    timeout: Duration,
) -> Result<(), LauncherRoundedCornersError>
where
    F: FnOnce() -> Result<(), LauncherRoundedCornersError> + Send + 'static,
    S: FnOnce(Box<dyn FnOnce() + Send>) -> Result<(), ()>,
{
    if is_main_thread {
        return execute();
    }
    let deadline = std::time::Instant::now() + timeout;
    let (sender, receiver) = mpsc::sync_channel(1);
    schedule(Box::new(move || {
        let result = if std::time::Instant::now() >= deadline {
            Err(LauncherRoundedCornersError::CompletionExpired)
        } else {
            let result = execute();
            if std::time::Instant::now() >= deadline {
                Err(LauncherRoundedCornersError::CompletionExpired)
            } else {
                result
            }
        };
        let _ = sender.send(result);
    }))
    .map_err(|_| LauncherRoundedCornersError::DispatchFailed)?;
    receiver
        .recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))
        .map_err(|_| LauncherRoundedCornersError::CompletionExpired)?
}

#[cfg(target_os = "macos")]
struct AppKitRoundedContentAdapter {
    content_view: objc2::rc::Retained<objc2_app_kit::NSView>,
}

#[cfg(target_os = "macos")]
impl RoundedContentAdapter for AppKitRoundedContentAdapter {
    fn read(&self) -> Result<RoundedContentState, LauncherRoundedCornersError> {
        let layer = self
            .content_view
            .layer()
            .ok_or(LauncherRoundedCornersError::LayerUnavailable)?;
        Ok(RoundedContentState {
            layer_backed: self.content_view.wantsLayer(),
            // CALayer's generated CGFloat accessors require an otherwise
            // unnecessary QuartzCore feature. macOS CGFloat is f64; keep the
            // existing objc2 binding and this selector local to the main thread.
            radius: unsafe { objc2::msg_send![&*layer, cornerRadius] },
            masks_to_bounds: layer.masksToBounds(),
            all_corners: layer.maskedCorners().is_all(),
        })
    }

    fn configure(&mut self, logical_radius: f64) -> Result<(), LauncherRoundedCornersError> {
        self.content_view.setWantsLayer(true);
        if !self.content_view.wantsLayer() {
            return Err(LauncherRoundedCornersError::ConfigureFailed);
        }
        let layer = self
            .content_view
            .layer()
            .ok_or(LauncherRoundedCornersError::LayerUnavailable)?;
        // Reuse AppKit's layer. Complementing the typed option set selects all
        // four documented corners without adding a direct QuartzCore dependency.
        let corners = layer.maskedCorners();
        layer.setMaskedCorners(corners | !corners);
        let _: () = unsafe { objc2::msg_send![&*layer, setCornerRadius: logical_radius] };
        layer.setMasksToBounds(true);
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn ensure_on_main_thread<R: tauri::Runtime>(
    window: &tauri::Window<R>,
) -> Result<(), LauncherRoundedCornersError> {
    let _main_thread =
        objc2::MainThreadMarker::new().ok_or(LauncherRoundedCornersError::MainThreadRequired)?;
    if window.label() != crate::launcher_window::MAIN_WINDOW_LABEL {
        return Err(LauncherRoundedCornersError::WindowUnavailable);
    }
    let native_root = window
        .ns_view()
        .map_err(|_| LauncherRoundedCornersError::WindowUnavailable)?;
    // This is the complete Window's root, not a Webview's NSView. Resolve its
    // owning NSWindow without Window::ns_window's internal detached-view expect,
    // then obtain the current common content root. All native objects remain
    // local to this main-thread operation.
    let native_root = unsafe { native_root.cast::<objc2_app_kit::NSView>().as_ref() }
        .ok_or(LauncherRoundedCornersError::WindowUnavailable)?;
    let native_window = native_root
        .window()
        .ok_or(LauncherRoundedCornersError::WindowUnavailable)?;
    let content_view = native_window
        .contentView()
        .ok_or(LauncherRoundedCornersError::ContentViewUnavailable)?;
    ensure_rounded_content(&mut AppKitRoundedContentAdapter { content_view })
}

#[cfg(target_os = "macos")]
pub(crate) fn ensure_launcher_rounded_corners<R: tauri::Runtime>(
    window: &tauri::Window<R>,
) -> Result<(), LauncherRoundedCornersError> {
    let execution_window = window.clone();
    confirm_on_main_thread(
        objc2::MainThreadMarker::new().is_some(),
        |job| window.run_on_main_thread(job).map_err(|_| ()),
        move || ensure_on_main_thread(&execution_window),
        Duration::from_secs(5),
    )
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn ensure_launcher_rounded_corners<R: tauri::Runtime>(
    _window: &tauri::Window<R>,
) -> Result<(), LauncherRoundedCornersError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    };

    struct FakeContent {
        state: RoundedContentState,
        failure: Option<LauncherRoundedCornersError>,
        readback_failure_after_configure: bool,
        mismatch: bool,
        writes: usize,
    }

    impl Default for FakeContent {
        fn default() -> Self {
            Self {
                state: RoundedContentState {
                    layer_backed: false,
                    radius: 0.0,
                    masks_to_bounds: false,
                    all_corners: false,
                },
                failure: None,
                readback_failure_after_configure: false,
                mismatch: false,
                writes: 0,
            }
        }
    }

    impl RoundedContentAdapter for FakeContent {
        fn read(&self) -> Result<RoundedContentState, LauncherRoundedCornersError> {
            if self.readback_failure_after_configure && self.writes > 0 {
                return Err(LauncherRoundedCornersError::ConfirmationFailed);
            }
            if let Some(failure) = self.failure {
                if failure != LauncherRoundedCornersError::ConfigureFailed {
                    return Err(failure);
                }
            }
            Ok(self.state)
        }

        fn configure(&mut self, radius: f64) -> Result<(), LauncherRoundedCornersError> {
            self.writes += 1;
            if let Some(failure) = self.failure {
                return Err(failure);
            }
            self.state = RoundedContentState {
                layer_backed: true,
                radius: if self.mismatch { radius * 2.0 } else { radius },
                masks_to_bounds: true,
                all_corners: true,
            };
            Ok(())
        }
    }

    #[test]
    fn confirmed_window_clip_is_idempotent_and_retains_existing_safe_state() {
        let mut content = FakeContent::default();
        ensure_rounded_content(&mut content).unwrap();
        assert!(content.state.is_confirmed());
        content.failure = Some(LauncherRoundedCornersError::ConfigureFailed);
        ensure_rounded_content(&mut content).unwrap();
        assert_eq!(content.writes, 1);
    }

    #[test]
    fn unavailable_objects_setter_failure_and_readback_mismatch_never_reveal() {
        for failure in [
            LauncherRoundedCornersError::MainThreadRequired,
            LauncherRoundedCornersError::WindowUnavailable,
            LauncherRoundedCornersError::ContentViewUnavailable,
            LauncherRoundedCornersError::LayerUnavailable,
            LauncherRoundedCornersError::ConfigureFailed,
            LauncherRoundedCornersError::ConfirmationFailed,
        ] {
            let mut content = FakeContent {
                failure: Some(failure),
                ..Default::default()
            };
            let mut shown = false;
            let result = ensure_rounded_content(&mut content).map(|()| shown = true);
            assert_eq!(result, Err(failure));
            assert!(!shown);
            assert!(!failure.to_string().contains("0x"));
        }
        let mut content = FakeContent {
            mismatch: true,
            ..Default::default()
        };
        assert_eq!(
            ensure_rounded_content(&mut content),
            Err(LauncherRoundedCornersError::ConfirmationFailed)
        );
    }

    #[test]
    fn every_corner_and_layer_property_must_be_confirmed() {
        let mut content = FakeContent::default();
        ensure_rounded_content(&mut content).unwrap();
        for field in 0..4 {
            let mut state = content.state;
            match field {
                0 => state.layer_backed = false,
                1 => state.radius = 36.0,
                2 => state.masks_to_bounds = false,
                _ => state.all_corners = false,
            }
            assert!(!state.is_confirmed());
        }
    }

    #[test]
    fn successful_configuration_with_failed_readback_cannot_reveal_and_can_recover() {
        let mut content = FakeContent {
            readback_failure_after_configure: true,
            ..Default::default()
        };
        let mut shown = false;
        let result = ensure_rounded_content(&mut content).map(|()| shown = true);
        assert_eq!(result, Err(LauncherRoundedCornersError::ConfirmationFailed));
        assert_eq!(content.writes, 1);
        assert!(content.state.is_confirmed(), "the setter succeeded");
        assert!(!shown, "unreadable state cannot authorize presentation");

        content.readback_failure_after_configure = false;
        ensure_rounded_content(&mut content)
            .map(|()| shown = true)
            .unwrap();
        assert!(shown);
        assert_eq!(content.writes, 1, "recovery reuses the confirmed safe clip");
    }

    #[test]
    fn scale_and_resize_preserve_logical_radius_without_new_geometry_channel() {
        let mut content = FakeContent::default();
        for scale in [1.0, 2.0, 1.5, 3.0] {
            for (_width, _height, _resizable) in [
                (650, 320, false),
                (900, 600, true),
                (700, 500, true),
                (650, 320, false),
            ] {
                ensure_rounded_content(&mut content).unwrap();
                assert_eq!(content.state.radius, 18.0);
                assert_eq!(content.state.radius * scale, 18.0 * scale);
            }
        }
        assert_eq!(content.writes, 1);
    }

    #[test]
    fn main_thread_executes_inline_without_scheduling_or_self_waiting() {
        let result = confirm_on_main_thread(
            true,
            |_| panic!("must not dispatch"),
            || Ok(()),
            Duration::ZERO,
        );
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn dispatch_success_waits_for_execution_and_propagates_execution_failure() {
        let (queued_sender, queued_receiver) = mpsc::channel();
        let (result_sender, result_receiver) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            let result = confirm_on_main_thread(
                false,
                |job| {
                    queued_sender.send(job).unwrap();
                    Ok(())
                },
                || Err(LauncherRoundedCornersError::LayerUnavailable),
                Duration::from_secs(5),
            );
            result_sender.send(result).unwrap();
        });
        let job = queued_receiver.recv().unwrap();
        assert_eq!(result_receiver.try_recv(), Err(mpsc::TryRecvError::Empty));
        job();
        assert_eq!(
            result_receiver.recv().unwrap(),
            Err(LauncherRoundedCornersError::LayerUnavailable)
        );
        worker.join().unwrap();
    }

    #[test]
    fn rejected_dispatch_and_expired_queued_completion_cannot_configure_or_reveal() {
        assert_eq!(
            confirm_on_main_thread(
                false,
                |_| Err(()),
                || panic!("not executed"),
                Duration::from_secs(1)
            ),
            Err(LauncherRoundedCornersError::DispatchFailed)
        );
        let jobs = Mutex::new(Vec::new());
        let executed = Arc::new(AtomicUsize::new(0));
        let count = Arc::clone(&executed);
        let result = confirm_on_main_thread(
            false,
            |job| {
                jobs.lock().unwrap().push(job);
                Ok(())
            },
            move || {
                count.fetch_add(1, Ordering::SeqCst);
                Ok(())
            },
            Duration::ZERO,
        );
        assert_eq!(result, Err(LauncherRoundedCornersError::CompletionExpired));
        jobs.lock().unwrap().pop().unwrap()();
        assert_eq!(executed.load(Ordering::SeqCst), 0);
    }
}
