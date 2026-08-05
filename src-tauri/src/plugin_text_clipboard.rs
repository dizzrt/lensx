pub const MAX_CLIPBOARD_TEXT_CHARS: usize = 1_048_576;

pub(crate) fn bounded_text(value: &str) -> bool {
    value.chars().count() <= MAX_CLIPBOARD_TEXT_CHARS
        && value.len() <= MAX_CLIPBOARD_TEXT_CHARS.saturating_mul(4)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PluginTextClipboardError {
    Unavailable,
    LimitExceeded,
    Internal,
}

pub(crate) trait PluginTextClipboard: Send + Sync {
    fn available(&self) -> bool;
    fn read_text(&self) -> Result<String, PluginTextClipboardError>;
    fn write_text(&self, text: &str) -> Result<(), PluginTextClipboardError>;
}

#[cfg(target_os = "macos")]
#[derive(Default)]
pub(crate) struct SystemPluginTextClipboard;

#[cfg(target_os = "macos")]
impl PluginTextClipboard for SystemPluginTextClipboard {
    fn available(&self) -> bool {
        objc2_foundation::NSThread::isMainThread_class()
    }

    fn read_text(&self) -> Result<String, PluginTextClipboardError> {
        use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
        if !self.available() {
            return Err(PluginTextClipboardError::Unavailable);
        }
        let pasteboard = NSPasteboard::generalPasteboard();
        let text = pasteboard
            .stringForType(unsafe { NSPasteboardTypeString })
            .map(|value| value.to_string())
            .unwrap_or_default();
        if !bounded_text(&text) {
            return Err(PluginTextClipboardError::LimitExceeded);
        }
        Ok(text)
    }

    fn write_text(&self, text: &str) -> Result<(), PluginTextClipboardError> {
        use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
        use objc2_foundation::NSString;
        if !self.available() {
            return Err(PluginTextClipboardError::Unavailable);
        }
        if !bounded_text(text) {
            return Err(PluginTextClipboardError::LimitExceeded);
        }
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();
        if !pasteboard
            .setString_forType(&NSString::from_str(text), unsafe { NSPasteboardTypeString })
        {
            return Err(PluginTextClipboardError::Internal);
        }
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
#[derive(Default)]
pub(crate) struct SystemPluginTextClipboard;

#[cfg(not(target_os = "macos"))]
impl PluginTextClipboard for SystemPluginTextClipboard {
    fn available(&self) -> bool {
        false
    }

    fn read_text(&self) -> Result<String, PluginTextClipboardError> {
        Err(PluginTextClipboardError::Unavailable)
    }

    fn write_text(&self, _text: &str) -> Result<(), PluginTextClipboardError> {
        Err(PluginTextClipboardError::Unavailable)
    }
}

#[cfg(target_os = "macos")]
#[allow(dead_code)]
pub(crate) fn run_native_smoke() -> Result<(), &'static str> {
    use objc2::{rc::Retained, runtime::ProtocolObject};
    use objc2_app_kit::{NSApplication, NSPasteboard, NSPasteboardItem, NSPasteboardWriting};
    use objc2_foundation::NSArray;

    let provider = SystemPluginTextClipboard;
    if !provider.available() {
        return Err("native smoke must run on the macOS main thread");
    }
    #[allow(deprecated)]
    let marker = objc2_foundation::MainThreadMarker::new()
        .ok_or("native smoke must run on the macOS main thread")?;
    let application = NSApplication::sharedApplication(marker);
    application.finishLaunching();
    let pasteboard = NSPasteboard::generalPasteboard();
    let original = provider
        .read_text()
        .map_err(|_| "original clipboard text should be readable")?;

    let original_items = pasteboard
        .pasteboardItems()
        .map(|items| {
            (0..items.count())
                .map(|index| {
                    let source = items.objectAtIndex(index);
                    let copy = NSPasteboardItem::new();
                    let types = source.types();
                    for type_index in 0..types.count() {
                        let data_type = types.objectAtIndex(type_index);
                        let data = source
                            .dataForType(&data_type)
                            .ok_or("clipboard item data should be readable")?;
                        if !copy.setData_forType(&data, &data_type) {
                            return Err("clipboard item data should be copied");
                        }
                    }
                    Ok(copy)
                })
                .collect::<Result<Vec<_>, &'static str>>()
        })
        .transpose()?
        .unwrap_or_default();

    struct RestoreClipboard<'a> {
        provider: &'a SystemPluginTextClipboard,
        original: String,
        items: Vec<Retained<NSPasteboardItem>>,
    }

    impl Drop for RestoreClipboard<'_> {
        fn drop(&mut self) {
            let pasteboard = NSPasteboard::generalPasteboard();
            pasteboard.clearContents();
            let objects: Vec<Retained<ProtocolObject<dyn NSPasteboardWriting>>> = self
                .items
                .drain(..)
                .map(ProtocolObject::from_retained)
                .collect();
            if objects.is_empty() {
                let _ = self.provider.write_text(&self.original);
            } else {
                let objects = NSArray::from_retained_slice(&objects);
                let _ = pasteboard.writeObjects(&objects);
            }
        }
    }

    let restore = RestoreClipboard {
        provider: &provider,
        original: original.clone(),
        items: original_items,
    };
    provider
        .write_text("lensx-permission-native-smoke")
        .map_err(|_| "controlled write should succeed")?;
    if provider.read_text().as_deref() != Ok("lensx-permission-native-smoke") {
        return Err("controlled clipboard text should round trip");
    }
    provider
        .write_text("")
        .map_err(|_| "empty write should succeed")?;
    if provider.read_text().as_deref() != Ok("") {
        return Err("empty clipboard text should round trip");
    }
    drop(restore);
    if provider.read_text().as_deref() != Ok(original.as_str()) {
        return Err("original clipboard text should be restored");
    }
    Ok(())
}
