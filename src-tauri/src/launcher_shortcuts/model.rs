use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::OnceLock};

pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
pub const LAUNCHER: &str = "launcher";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutPolicy {
    pub modifiers: Vec<String>,
    pub modifier_aliases: BTreeMap<String, String>,
    pub key_aliases: BTreeMap<String, String>,
    pub keys: Vec<String>,
    pub reserved_chords: Vec<ReservedChord>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ReservedChord {
    pub modifiers: Vec<String>,
    pub key: String,
}

pub fn policy() -> &'static ShortcutPolicy {
    static POLICY: OnceLock<ShortcutPolicy> = OnceLock::new();
    POLICY.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src/app/shortcuts/policy.json"))
            .expect("reviewed shortcut policy must be valid")
    })
}

#[derive(Clone, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Trigger {
    Chord { modifiers: Vec<String>, key: String },
    ModifierDoubleTap { modifier: String },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct VersionOneLauncherBindings {
    pub chord: Trigger,
    pub double_tap: Option<Trigger>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Configuration {
    pub version: u32,
    pub revision: u64,
    pub launcher: Trigger,
    pub actions: BTreeMap<String, Trigger>,
}

impl Default for Configuration {
    fn default() -> Self {
        Self {
            version: 2,
            revision: 0,
            launcher: Trigger::Chord {
                modifiers: vec!["ctrl".into(), "shift".into()],
                key: "Space".into(),
            },
            actions: BTreeMap::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct VersionOneConfiguration {
    pub version: u32,
    pub revision: u64,
    pub launcher: VersionOneLauncherBindings,
    pub actions: BTreeMap<String, Trigger>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct LauncherMigration {
    pub chord: Trigger,
    pub double_tap: Trigger,
}

impl VersionOneConfiguration {
    pub fn project(self) -> Result<(Configuration, Option<LauncherMigration>), ShortcutError> {
        if self.version != 1 || !matches!(self.launcher.chord, Trigger::Chord { .. }) {
            return Err(ShortcutError::new("invalid_configuration"));
        }
        let configuration = Configuration {
            version: 2,
            revision: self.revision,
            launcher: self.launcher.chord,
            actions: self.actions,
        }
        .normalized()?;
        let migration = if let Some(double_tap) = self.launcher.double_tap {
            let double_tap = double_tap.normalized()?;
            if !matches!(double_tap, Trigger::ModifierDoubleTap { .. }) {
                return Err(ShortcutError::new("invalid_configuration"));
            }
            if configuration
                .bindings()
                .values()
                .any(|trigger| *trigger == double_tap)
            {
                return Err(ShortcutError::new("conflicting_trigger"));
            }
            Some(LauncherMigration {
                chord: configuration.launcher.clone(),
                double_tap,
            })
        } else {
            None
        };
        Ok((configuration, migration))
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BindingStatus {
    Active,
    PermissionRequired,
    TargetUnavailable,
    RegistrationFailed,
    MonitorUnavailable,
    Degraded,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct BindingState {
    pub target: String,
    pub status: BindingStatus,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Snapshot {
    pub configuration: Configuration,
    pub bindings: Vec<BindingState>,
    pub recovery_degraded: bool,
    pub diagnostics: Vec<&'static str>,
    pub key_labels: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launcher_migration: Option<LauncherMigration>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ShortcutError {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflicting_target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<Box<Snapshot>>,
}

impl ShortcutError {
    pub fn new(code: &'static str) -> Self {
        Self {
            code,
            conflicting_target: None,
            snapshot: None,
        }
    }

    pub fn with_snapshot(mut self, snapshot: Snapshot) -> Self {
        self.snapshot = Some(Box::new(snapshot));
        self
    }
}

impl Trigger {
    pub fn normalized(&self) -> Result<Self, ShortcutError> {
        let policy = policy();
        let normalize_modifier = |modifier: &str| {
            policy
                .modifier_aliases
                .get(&modifier.to_lowercase())
                .cloned()
                .ok_or_else(|| ShortcutError::new("invalid_trigger"))
        };
        match self {
            Self::Chord { modifiers, key } => {
                if modifiers.len() > 16 {
                    return Err(ShortcutError::new("invalid_trigger"));
                }
                let mut canonical = modifiers
                    .iter()
                    .map(|value| normalize_modifier(value))
                    .collect::<Result<Vec<_>, _>>()?;
                canonical
                    .sort_by_key(|value| policy.modifiers.iter().position(|item| item == value));
                canonical.dedup();
                if !canonical.iter().any(|value| value != "shift") {
                    return Err(ShortcutError::new("invalid_trigger"));
                }
                let key = policy
                    .key_aliases
                    .get(&key.to_lowercase())
                    .filter(|key| policy.keys.contains(key))
                    .cloned()
                    .ok_or_else(|| ShortcutError::new("invalid_trigger"))?;
                if policy
                    .reserved_chords
                    .iter()
                    .any(|reserved| reserved.modifiers == canonical && reserved.key == key)
                {
                    return Err(ShortcutError::new("reserved_trigger"));
                }
                Ok(Self::Chord {
                    modifiers: canonical,
                    key,
                })
            }
            Self::ModifierDoubleTap { modifier } => Ok(Self::ModifierDoubleTap {
                modifier: normalize_modifier(modifier)?,
            }),
        }
    }
}

pub fn valid_action_id(value: &str) -> bool {
    let segments: Vec<_> = value.split('.').collect();
    value.len() <= 255
        && segments.len() >= 3
        && segments.iter().all(|part| {
            part.len() <= 64
                && part.as_bytes().first().is_some_and(u8::is_ascii_lowercase)
                && part.bytes().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || matches!(byte, b'_' | b'-')
                })
        })
}

impl Configuration {
    pub fn bindings(&self) -> BTreeMap<String, Trigger> {
        let mut bindings = self.actions.clone();
        bindings.insert(LAUNCHER.into(), self.launcher.clone());
        bindings
    }

    pub fn normalized(mut self) -> Result<Self, ShortcutError> {
        if self.version != 2
            || self.revision > MAX_SAFE_INTEGER
            || self.actions.len() > 1024
            || self.actions.keys().any(|id| !valid_action_id(id))
        {
            return Err(ShortcutError::new("invalid_configuration"));
        }
        self.launcher = self.launcher.normalized()?;
        for trigger in self.actions.values_mut() {
            *trigger = trigger.normalized()?;
        }
        let mut occupied = BTreeMap::new();
        for (target, trigger) in self.bindings() {
            if let Some(previous) = occupied.insert(trigger, target) {
                return Err(ShortcutError {
                    code: "conflicting_trigger",
                    conflicting_target: Some(previous),
                    snapshot: None,
                });
            }
        }
        Ok(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_normalizes_aliases_order_and_duplicate_modifiers() {
        let trigger = Trigger::Chord {
            modifiers: vec!["SHIFT".into(), "Command".into(), "Cmd".into()],
            key: "k".into(),
        };
        assert_eq!(
            trigger.normalized().unwrap(),
            Trigger::Chord {
                modifiers: vec!["cmd".into(), "shift".into()],
                key: "KeyK".into()
            }
        );
        assert_eq!(
            Trigger::ModifierDoubleTap {
                modifier: "MetaRight".into()
            }
            .normalized()
            .unwrap(),
            Trigger::ModifierDoubleTap {
                modifier: "cmd".into()
            }
        );
    }

    #[test]
    fn complete_reserved_policy_rejects_every_alias_and_unknown_input() {
        for reserved in &policy().reserved_chords {
            let error = Trigger::Chord {
                modifiers: reserved.modifiers.clone(),
                key: reserved.key.clone(),
            }
            .normalized()
            .unwrap_err();
            assert_eq!(error.code, "reserved_trigger");
        }
        for (modifiers, key) in [
            (vec![], "a"),
            (vec!["shift"], "a"),
            (vec!["fn"], "Space"),
            (vec!["cmd"], "CapsLock"),
            (vec!["cmd"], "F21"),
        ] {
            assert!(Trigger::Chord {
                modifiers: modifiers.into_iter().map(String::from).collect(),
                key: key.into()
            }
            .normalized()
            .is_err());
        }
        assert!(serde_json::from_value::<Trigger>(
            serde_json::json!({"kind":"chord","modifiers":["ctrl"],"key":"K","extra":1})
        )
        .is_err());
        assert!(serde_json::from_value::<Configuration>(
            serde_json::json!({"version":1,"revision":0,"launcher":{},"actions":{}})
        )
        .is_err());
    }

    #[test]
    fn unavailable_actions_still_occupy_chords_and_double_tap_identity() {
        let mut configuration = Configuration::default();
        configuration.actions.insert(
            "com.test.unavailable".into(),
            configuration.launcher.clone(),
        );
        assert_eq!(
            configuration.normalized().unwrap_err().code,
            "conflicting_trigger"
        );
        let mut configuration = Configuration::default();
        configuration.launcher = Trigger::ModifierDoubleTap {
            modifier: "Cmd".into(),
        };
        configuration.actions.insert(
            "com.test.unavailable".into(),
            Trigger::ModifierDoubleTap {
                modifier: "MetaRight".into(),
            },
        );
        assert_eq!(
            configuration.normalized().unwrap_err().code,
            "conflicting_trigger"
        );
    }

    #[test]
    fn shared_trigger_boundaries_match_typescript_fixtures() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/launcher-shortcuts/triggers.json"
        ))
        .unwrap();
        for case in fixture["valid"].as_array().unwrap() {
            let trigger: Trigger = serde_json::from_value(case["input"].clone()).unwrap();
            assert_eq!(
                serde_json::to_value(trigger.normalized().unwrap()).unwrap(),
                case["canonical"]
            );
        }
        for input in fixture["invalid"].as_array().unwrap() {
            assert!(
                serde_json::from_value::<Trigger>(input.clone())
                    .ok()
                    .and_then(|trigger| trigger.normalized().ok())
                    .is_none(),
                "{input}"
            );
        }
    }

    #[test]
    fn rejects_unknown_version_fields_and_invalid_recovery_without_partial_acceptance() {
        let baseline = serde_json::to_value(Configuration::default()).unwrap();
        let mut cases = Vec::new();
        let mut unknown_version = baseline.clone();
        unknown_version["version"] = serde_json::json!(3);
        cases.push(unknown_version);
        let mut unsafe_revision = baseline.clone();
        unsafe_revision["revision"] = serde_json::json!(MAX_SAFE_INTEGER + 1);
        cases.push(unsafe_revision);
        let mut extra = baseline.clone();
        extra["extra"] = serde_json::json!(true);
        cases.push(extra);
        let mut cleared = baseline.clone();
        cleared["launcher"] = serde_json::Value::Null;
        cases.push(cleared);
        let mut nested = baseline.clone();
        nested["launcher"] = serde_json::json!({"chord":baseline["launcher"],"double_tap":null});
        cases.push(nested);
        let mut invalid_target = baseline;
        invalid_target["actions"]["../private"] =
            serde_json::json!({"kind":"modifier_double_tap","modifier":"shift"});
        cases.push(invalid_target);
        for input in cases {
            assert!(serde_json::from_value::<Configuration>(input)
                .ok()
                .and_then(|value| value.normalized().ok())
                .is_none());
        }
    }
}
