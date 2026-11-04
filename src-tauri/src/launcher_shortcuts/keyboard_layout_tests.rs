use super::{current_layout, KeyboardLayout};
use crate::launcher_shortcuts::{
    model::{BindingStatus, Configuration, DetachMigration, Trigger, DETACH},
    service::{RegistrationFailure, Registry, ShortcutService, Store, Stored},
    NativeRegistry,
};

fn chord(key: &str, modifiers: &[&str]) -> Trigger {
    Trigger::Chord {
        key: key.into(),
        modifiers: modifiers
            .iter()
            .map(|modifier| (*modifier).into())
            .collect(),
    }
}

// A modifier double tap needs no native chord registration. The real service
// can therefore publish its normal snapshot without creating any native window.
struct InitialConfiguration;

impl Store for InitialConfiguration {
    fn read(&self) -> Stored {
        Stored::Configuration(Configuration {
            launcher: Trigger::ModifierDoubleTap {
                modifier: "ctrl".into(),
            },
            ..Configuration::default()
        })
    }

    fn stage(&mut self, _: &Configuration, _: Option<&DetachMigration>) -> Result<(), ()> {
        unreachable!("reading a shortcut snapshot must not stage configuration")
    }

    fn commit(&mut self) -> Result<(), ()> {
        unreachable!("reading a shortcut snapshot must not commit configuration")
    }

    fn discard(&mut self) {
        unreachable!("reading a shortcut snapshot must not discard configuration")
    }
}

#[test]
fn worker_snapshot_and_detach_availability_read_the_owned_native_registry_layout() {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();
    let mut layout = KeyboardLayout::default();
    layout.record("KeyD", true, "d");
    std::thread::spawn(move || {
        assert!(objc2::MainThreadMarker::new().is_none());
        assert!(current_layout().is_none());

        let mut registry = NativeRegistry {
            app: handle,
            gates: Default::default(),
            layout,
        };
        let key = chord("KeyD", &["cmd"]);
        assert!(registry.valid_in_layout(&key));
        assert!(matches!(
            registry.register(&key, 1),
            Err(RegistrationFailure::Rejected)
        ));
        let service = ShortcutService::start(InitialConfiguration, registry);
        service.local_availability().set(true);

        assert!(service.local_available());
        let snapshot = service.snapshot();
        assert_eq!(
            snapshot.key_labels.get("cmd:KeyD").map(String::as_str),
            Some("D")
        );
        assert_eq!(
            snapshot
                .bindings
                .iter()
                .find(|binding| binding.target == DETACH)
                .map(|binding| binding.status),
            Some(BindingStatus::Active)
        );
    })
    .join()
    .expect("the monitor worker must publish the detach snapshot without consulting Carbon");
}

#[test]
fn command_translation_rejects_reserved_semantic_aliases_without_changing_plain_key_policy() {
    let mut layout = KeyboardLayout::default();
    layout.record("KeyD", false, "d");
    layout.record("KeyD", true, "w");

    assert!(layout.allows(&chord("KeyD", &["ctrl"])));
    assert!(!layout.allows(&chord("KeyD", &["cmd"])));
    assert!(!layout.allows(&chord("KeyD", &["cmd", "shift"])));
    assert_eq!(layout.labels.get("KeyD").map(String::as_str), Some("D"));
    assert_eq!(layout.labels.get("cmd:KeyD").map(String::as_str), Some("W"));
}

#[test]
fn missing_or_multiunit_translation_cannot_authorize_a_character_chord() {
    let mut layout = KeyboardLayout::default();
    assert!(!layout.allows(&chord("KeyD", &["cmd"])));
    assert!(layout.allows(&chord("ArrowDown", &["ctrl"])));
    assert!(layout.allows(&Trigger::ModifierDoubleTap {
        modifier: "shift".into()
    }));

    layout.record("KeyD", true, "ab");
    assert!(!layout.allows(&chord("KeyD", &["cmd"])));
    assert_eq!(
        layout.labels.get("cmd:KeyD").map(String::as_str),
        Some("AB")
    );

    layout.record("KeyE", false, "\u{0007}");
    assert!(!layout.allows(&chord("KeyE", &["ctrl"])));
    assert!(!layout.labels.contains_key("KeyE"));
}

#[test]
fn replacing_a_layout_updates_native_registry_authorization_and_labels_together() {
    let app = tauri::test::mock_app();
    let mut first = KeyboardLayout::default();
    first.record("KeyD", true, "d");
    first.record("KeyE", false, "e");
    let registry = NativeRegistry {
        app: app.handle().clone(),
        gates: Default::default(),
        layout: first,
    };
    let mut service = ShortcutService::start(InitialConfiguration, registry);
    service.local_availability().set(true);
    assert!(service.local_available());
    let first_labels = service.snapshot().key_labels;

    let mut replacement = KeyboardLayout::default();
    replacement.record("KeyD", true, "q");
    service.registry.layout = replacement;
    service.refresh_layout();

    assert!(!service.local_available());
    let snapshot = service.snapshot();
    assert_eq!(
        snapshot
            .bindings
            .iter()
            .find(|binding| binding.target == DETACH)
            .map(|binding| binding.status),
        Some(BindingStatus::LocalUnavailable)
    );
    let current_labels = snapshot.key_labels;
    assert_eq!(
        current_labels.get("cmd:KeyD").map(String::as_str),
        Some("Q")
    );
    assert!(!current_labels.contains_key("KeyE"));
    assert_eq!(first_labels.get("cmd:KeyD").map(String::as_str), Some("D"));
}
