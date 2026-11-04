//! Host-private ownership identities. A parsed label is never authority: callers
//! must also prove the actual native Host source and the registry binding.
use crate::plugin_child_webview_service::PluginChildWebviewAttempt;
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewOwner {
    pub(crate) window_label: String,
    pub(crate) revision: u64,
}

impl PluginChildWebviewOwner {
    pub(crate) fn main() -> Self {
        Self {
            window_label: "main".into(),
            revision: 1,
        }
    }

    pub(crate) fn from_parts(window_label: &str, revision: u64) -> Option<Self> {
        if revision == 0 {
            return None;
        }
        let mut owner = if window_label == "main" {
            Self::main()
        } else {
            Self::detached(parse_opaque_sequence(window_label, "plugin-window-")?)?
        };
        owner.revision = revision;
        Some(owner)
    }

    pub(crate) fn detached(sequence: u64) -> Option<Self> {
        (sequence != 0).then(|| Self {
            window_label: format!("plugin-window-{sequence:016x}"),
            revision: 1,
        })
    }

    pub(crate) fn is_valid(&self) -> bool {
        self.revision != 0
            && (self.window_label == "main"
                || parse_opaque_sequence(&self.window_label, "plugin-window-").is_some())
    }

    pub(crate) fn matches_host_source(&self, actual_source_label: &str) -> bool {
        self.is_valid() && self.window_label == actual_source_label
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewMigrationToken(u64);

impl PluginChildWebviewMigrationToken {
    pub(crate) fn new(sequence: u64) -> Option<Self> {
        (sequence != 0).then_some(Self(sequence))
    }
    pub(crate) fn opaque_id(self) -> String {
        format!("migration_{:016x}", self.0)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum TransferPublication {
    Committed,
    Cancelled,
}

#[derive(Clone, Debug)]
pub(crate) struct TransferPublicationReceipt(Arc<AtomicU8>);
impl Default for TransferPublicationReceipt {
    fn default() -> Self {
        Self(Arc::new(AtomicU8::new(0)))
    }
}
impl PartialEq for TransferPublicationReceipt {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}
impl Eq for TransferPublicationReceipt {}
impl TransferPublicationReceipt {
    pub(crate) fn read(&self) -> Option<TransferPublication> {
        match self.0.load(Ordering::Acquire) {
            1 => Some(TransferPublication::Committed),
            2 => Some(TransferPublication::Cancelled),
            _ => None,
        }
    }
    pub(crate) fn publish(&self, publication: TransferPublication) {
        self.0.store(
            match publication {
                TransferPublication::Committed => 1,
                TransferPublication::Cancelled => 2,
            },
            Ordering::Release,
        );
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginChildWebviewOwnershipTransfer {
    pub(crate) attempt: PluginChildWebviewAttempt,
    pub(crate) source_label: String,
    pub(crate) token: PluginChildWebviewMigrationToken,
    pub(crate) source: PluginChildWebviewOwner,
    pub(crate) target: PluginChildWebviewOwner,
    pub(crate) publication_receipt: TransferPublicationReceipt,
}

fn parse_opaque_sequence(value: &str, prefix: &str) -> Option<u64> {
    let hex = value.strip_prefix(prefix)?;
    if hex.len() != 16
        || !hex
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return None;
    }
    u64::from_str_radix(hex, 16)
        .ok()
        .filter(|value| *value != 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owner_parser_is_exact_and_private_tokens_are_nonzero() {
        assert_eq!(
            PluginChildWebviewOwner::from_parts("main", 1),
            Some(PluginChildWebviewOwner::main())
        );
        assert!(PluginChildWebviewOwner::detached(1)
            .unwrap()
            .matches_host_source("plugin-window-0000000000000001"));
        for label in [
            "",
            "main/",
            "plugin-child-0000000000000001",
            "plugin-window-0000000000000000",
            "plugin-window-000000000000000A",
            "plugin-window-1",
            "plugin-window-0000000000000001?host=main",
        ] {
            assert!(
                PluginChildWebviewOwner::from_parts(label, 1).is_none(),
                "{label}"
            );
        }
        assert!(PluginChildWebviewOwner::from_parts("main", 0).is_none());
        assert!(
            !PluginChildWebviewOwner::main().matches_host_source("plugin-child-0000000000000001")
        );
        assert!(PluginChildWebviewMigrationToken::new(0).is_none());
        assert_ne!(
            PluginChildWebviewMigrationToken::new(1),
            PluginChildWebviewMigrationToken::new(2)
        );
    }
}
