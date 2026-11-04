//! One native UI turn for the final interactive presentation and publication.
//! JavaScript preparation has already acknowledged; no bridge wait occurs here.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ShellLossCleanup {
    RetireDestroyed,
    CloseLive,
    RetainForRetry,
}
pub(crate) fn shell_loss_cleanup(destroyed: bool, teardown_confirmed: bool) -> ShellLossCleanup {
    if destroyed {
        ShellLossCleanup::RetireDestroyed
    } else if teardown_confirmed {
        ShellLossCleanup::CloseLive
    } else {
        ShellLossCleanup::RetainForRetry
    }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InteractiveStep {
    MainHome,
    TargetBoundsAndClip,
    RevealOriginal,
    RevealTarget,
    FocusTarget,
    HideMain,
    SourceBoundsAndClip,
    RevealSource,
    FocusSource,
}

pub(crate) trait InteractiveBatch {
    fn current(&self) -> bool;
    fn apply(&mut self, step: InteractiveStep) -> Result<(), ()>;
    fn publish(&mut self) -> Result<bool, ()>;
    fn published(&self) -> bool;
    /// Exact original/transaction windows only. This is cleanup before yielding,
    /// not successful rollback and never a reason to reload or destroy a view.
    fn quiesce(&mut self);
}

pub(crate) fn execute_batch(
    adapter: &mut impl InteractiveBatch,
    steps: &[InteractiveStep],
) -> Result<bool, ()> {
    for step in steps {
        if !adapter.current() || adapter.apply(*step).is_err() || !adapter.current() {
            if adapter.published() {
                return Ok(true);
            }
            adapter.quiesce();
            return Err(());
        }
    }
    if !adapter.current() {
        adapter.quiesce();
        return Err(());
    }
    let result = adapter.publish();
    if adapter.published() {
        Ok(true)
    } else {
        adapter.quiesce();
        result.and_then(|published| published.then_some(true).ok_or(()))
    }
}

pub(crate) const TARGET_BATCH: &[InteractiveStep] = &[
    InteractiveStep::MainHome,
    InteractiveStep::TargetBoundsAndClip,
    InteractiveStep::RevealOriginal,
    InteractiveStep::RevealTarget,
    InteractiveStep::FocusTarget,
    InteractiveStep::HideMain,
];
pub(crate) const SOURCE_BATCH: &[InteractiveStep] = &[
    InteractiveStep::SourceBoundsAndClip,
    InteractiveStep::RevealOriginal,
    InteractiveStep::RevealSource,
    InteractiveStep::FocusSource,
];

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn live_host_reload_keeps_close_metadata_until_confirmed_cleanup_and_retry() {
        assert_eq!(
            shell_loss_cleanup(false, false),
            ShellLossCleanup::RetainForRetry
        );
        assert_eq!(shell_loss_cleanup(false, true), ShellLossCleanup::CloseLive);
        assert_eq!(
            shell_loss_cleanup(true, false),
            ShellLossCleanup::RetireDestroyed
        );
        assert_eq!(
            shell_loss_cleanup(true, true),
            ShellLossCleanup::RetireDestroyed
        );
        // A failed Child/native close never selects broker retirement. The same
        // live shell remains identifiable when the next explicit close retries.
        let mut metadata_live = true;
        for confirmed in [false, false, true] {
            match shell_loss_cleanup(false, confirmed) {
                ShellLossCleanup::RetainForRetry => assert!(metadata_live),
                ShellLossCleanup::CloseLive => {
                    assert!(metadata_live);
                    metadata_live = false;
                }
                ShellLossCleanup::RetireDestroyed => {
                    panic!("a document reload is not WindowDestroyed")
                }
            }
        }
        assert!(!metadata_live);
    }
    #[derive(Default)]
    struct Adapter {
        calls: Vec<InteractiveStep>,
        fail: Option<InteractiveStep>,
        expire_after: Option<InteractiveStep>,
        expired: bool,
        visible: bool,
        focused: bool,
        published: bool,
        quiesced: usize,
        publish_lost: bool,
        publish_refused: bool,
    }
    impl InteractiveBatch for Adapter {
        fn current(&self) -> bool {
            !self.expired
        }
        fn apply(&mut self, step: InteractiveStep) -> Result<(), ()> {
            self.calls.push(step);
            match step {
                InteractiveStep::RevealOriginal => self.visible = true,
                InteractiveStep::FocusSource | InteractiveStep::FocusTarget => self.focused = true,
                _ => {}
            }
            if self.expire_after == Some(step) {
                self.expired = true;
            }
            if self.fail == Some(step) {
                Err(())
            } else {
                Ok(())
            }
        }
        fn publish(&mut self) -> Result<bool, ()> {
            if self.publish_refused {
                return Ok(false);
            }
            self.published = true;
            if self.publish_lost {
                Err(())
            } else {
                Ok(true)
            }
        }
        fn published(&self) -> bool {
            self.published
        }
        fn quiesce(&mut self) {
            self.quiesced += 1;
            self.visible = false;
            self.focused = false;
        }
    }
    #[test]
    fn each_final_native_failure_quiesces_before_a_rollback_ack_can_wait() {
        for steps in [TARGET_BATCH, SOURCE_BATCH] {
            for step in steps {
                let mut adapter = Adapter {
                    fail: Some(*step),
                    ..Adapter::default()
                };
                assert!(execute_batch(&mut adapter, steps).is_err());
                assert!(!adapter.published);
                assert!(!adapter.visible);
                assert!(!adapter.focused);
                assert_eq!(adapter.quiesced, 1);
                assert_eq!(adapter.calls.last(), Some(step));
            }
        }
    }
    #[test]
    fn native_presentation_publishes_last_and_lost_reply_never_hides_committed_original() {
        for lost in [false, true] {
            let mut adapter = Adapter {
                publish_lost: lost,
                ..Adapter::default()
            };
            assert_eq!(execute_batch(&mut adapter, TARGET_BATCH), Ok(true));
            assert_eq!(adapter.calls, TARGET_BATCH);
            assert!(adapter.visible && adapter.focused && adapter.published);
            assert_eq!(adapter.quiesced, 0);
        }
    }
    #[test]
    fn expired_batch_never_exposes_interactive_content() {
        let mut adapter = Adapter {
            expired: true,
            ..Adapter::default()
        };
        assert!(execute_batch(&mut adapter, TARGET_BATCH).is_err());
        assert!(adapter.calls.is_empty());
        assert_eq!(adapter.quiesced, 1);
    }
    #[test]
    fn expiration_after_each_mutation_stops_later_work_and_quiesces_before_yield() {
        for steps in [TARGET_BATCH, SOURCE_BATCH] {
            for step in steps {
                let mut adapter = Adapter {
                    expire_after: Some(*step),
                    ..Adapter::default()
                };
                assert!(execute_batch(&mut adapter, steps).is_err());
                assert_eq!(adapter.calls.last(), Some(step));
                assert!(!adapter.published);
                assert!(!adapter.visible && !adapter.focused);
                assert_eq!(adapter.quiesced, 1);
            }
        }
    }
    #[test]
    fn refused_final_publication_keeps_original_quiescent_for_recovery() {
        let mut adapter = Adapter {
            publish_refused: true,
            ..Adapter::default()
        };
        assert!(execute_batch(&mut adapter, TARGET_BATCH).is_err());
        assert!(!adapter.published && !adapter.visible && !adapter.focused);
        assert_eq!(adapter.quiesced, 1);
    }
}
