pub(crate) fn plugin_record_key(plugin_id: &str) -> String {
    let encoded = plugin_id
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("v1-{encoded}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_key_is_versioned_lowercase_utf8_hex() {
        assert_eq!(
            plugin_record_key("com.acme.plugin"),
            "v1-636f6d2e61636d652e706c7567696e"
        );
        assert_eq!(plugin_record_key("插件.id"), "v1-e68f92e4bbb62e6964");
    }
}
