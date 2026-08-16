#![allow(dead_code)] // The target macOS evidence producer attaches the bounded observer.

use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

pub(crate) const PLUGIN_RUNTIME_STAGE_CATALOG: [&str; 12] = [
    "resolve",
    "create",
    "navigation",
    "load",
    "bridge",
    "sdk",
    "ui_bundle",
    "editor",
    "worker",
    "host_loading",
    "first_interactive",
    "restore",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginRuntimeStage {
    Resolve,
    Create,
    Navigation,
    Load,
    Bridge,
    Sdk,
    UiBundle,
    Editor,
    Worker,
    HostLoading,
    FirstInteractive,
    Restore,
}

impl PluginRuntimeStage {
    pub(crate) fn as_str(self) -> &'static str {
        PLUGIN_RUNTIME_STAGE_CATALOG[self as usize]
    }
}

pub(crate) trait PluginRuntimeStageObserver: Send + Sync + 'static {
    fn observe(&self, stage: PluginRuntimeStage, duration: Duration);
}

#[derive(Default)]
struct ObserverState {
    next_id: u64,
    current: Option<(u64, Arc<dyn PluginRuntimeStageObserver>)>,
}

fn observer_state() -> &'static Mutex<ObserverState> {
    static STATE: OnceLock<Mutex<ObserverState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(ObserverState::default()))
}

pub(crate) struct PluginRuntimeStageObserverGuard {
    id: u64,
}

impl Drop for PluginRuntimeStageObserverGuard {
    fn drop(&mut self) {
        let mut state = observer_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if state.current.as_ref().is_some_and(|(id, _)| *id == self.id) {
            state.current = None;
        }
    }
}

pub(crate) fn attach_plugin_runtime_stage_observer(
    observer: Arc<dyn PluginRuntimeStageObserver>,
) -> Option<PluginRuntimeStageObserverGuard> {
    let mut state = observer_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if state.current.is_some() {
        return None;
    }
    state.next_id = state.next_id.wrapping_add(1);
    let id = state.next_id;
    state.current = Some((id, observer));
    Some(PluginRuntimeStageObserverGuard { id })
}

pub(crate) fn record_plugin_runtime_stage(stage: PluginRuntimeStage, duration: Duration) {
    if duration > Duration::from_secs(60) {
        return;
    }
    let observer = observer_state()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .current
        .as_ref()
        .map(|(_, observer)| Arc::clone(observer));
    if let Some(observer) = observer {
        observer.observe(stage, duration);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Observer(Mutex<Vec<(&'static str, Duration)>>);

    impl PluginRuntimeStageObserver for Observer {
        fn observe(&self, stage: PluginRuntimeStage, duration: Duration) {
            self.0
                .lock()
                .expect("observations lock")
                .push((stage.as_str(), duration));
        }
    }

    #[test]
    fn catalog_is_closed_and_observer_is_bounded_single_attachment() {
        assert_eq!(PLUGIN_RUNTIME_STAGE_CATALOG.len(), 12);
        let observer = Arc::new(Observer::default());
        let guard = attach_plugin_runtime_stage_observer(observer.clone())
            .expect("first observer attaches");
        assert!(attach_plugin_runtime_stage_observer(observer.clone()).is_none());
        record_plugin_runtime_stage(PluginRuntimeStage::Bridge, Duration::from_millis(3));
        record_plugin_runtime_stage(PluginRuntimeStage::Sdk, Duration::from_secs(61));
        assert_eq!(
            observer.0.lock().expect("observations lock").as_slice(),
            &[("bridge", Duration::from_millis(3))]
        );
        drop(guard);
        assert!(attach_plugin_runtime_stage_observer(observer).is_some());
    }
}
