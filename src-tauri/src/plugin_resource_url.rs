use semver::Version;
use url::Url;

pub(crate) const RESOURCE_SCHEME: &str = "lensx-plugin";
pub(crate) const RESOURCE_VERSION: &str = "v1";
const NATIVE_HOST_SUFFIX: &str = ".runtime.localhost";
const TRANSLATED_HOST_PREFIX: &str = "lensx-plugin.";
const MAX_URL_BYTES: usize = 2048;
pub(crate) const MAX_PATH_BYTES: usize = 100;
pub(crate) const MAX_PATH_SEGMENTS: usize = 16;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PluginResourceUrl {
    pub(crate) origin_scope: String,
    pub(crate) path_scope: String,
    pub(crate) plugin_key: String,
    pub(crate) version: String,
    pub(crate) resource_path: String,
    pub(crate) fragment: Option<String>,
}

#[allow(dead_code)] // Standalone harnesses include this shared module with different call surfaces.
pub(crate) fn build_native_resource_url(
    scope: &str,
    plugin_key: &str,
    version: &str,
    resource_path: &str,
) -> String {
    format!(
        "{RESOURCE_SCHEME}://{scope}.runtime.localhost/{RESOURCE_VERSION}/{scope}/{plugin_key}/{version}/{resource_path}"
    )
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn translated_resource_url(native: &str, translated_scheme: &str) -> Option<String> {
    if !matches!(translated_scheme, "http" | "https") {
        return None;
    }
    let parsed = parse_plugin_resource_url(native, false)?;
    Some(format!(
        "{translated_scheme}://{TRANSLATED_HOST_PREFIX}{}.runtime.localhost/{RESOURCE_VERSION}/{}/{}/{}/{}",
        parsed.origin_scope,
        parsed.path_scope,
        parsed.plugin_key,
        parsed.version,
        parsed.resource_path
    ))
}

pub(crate) fn parse_plugin_resource_url(
    raw: &str,
    allow_fragment: bool,
) -> Option<PluginResourceUrl> {
    if raw.is_empty()
        || raw.len() > MAX_URL_BYTES
        || !raw.is_ascii()
        || raw.contains(['\\', '%', '\0'])
        || raw.bytes().any(|byte| byte.is_ascii_control())
    {
        return None;
    }
    let (raw_scheme, after_scheme) = raw.split_once("://")?;
    if raw_scheme.is_empty()
        || !raw_scheme.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'+' | b'-' | b'.')
        })
    {
        return None;
    }
    let raw_authority = after_scheme.split(['/', '?', '#']).next()?;
    if raw_authority.is_empty()
        || raw_authority.contains(['@', ':'])
        || raw_authority.bytes().any(|byte| byte.is_ascii_uppercase())
    {
        return None;
    }

    let url = Url::parse(raw).ok()?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || (!allow_fragment && url.fragment().is_some())
    {
        return None;
    }
    let origin_scope = match raw_scheme {
        RESOURCE_SCHEME => raw_authority.strip_suffix(NATIVE_HOST_SUFFIX)?,
        "http" | "https" => raw_authority
            .strip_prefix(TRANSLATED_HOST_PREFIX)?
            .strip_suffix(NATIVE_HOST_SUFFIX)?,
        _ => return None,
    };
    if !is_scope(origin_scope) || url.host_str()? != raw_authority {
        return None;
    }

    let path = url.path().strip_prefix('/')?;
    let mut parts = path.splitn(5, '/');
    if parts.next()? != RESOURCE_VERSION {
        return None;
    }
    let path_scope = parts.next()?;
    let plugin_key = parts.next()?;
    let version = parts.next()?;
    let resource_path = parts.next()?;
    if path_scope != origin_scope
        || !is_scope(path_scope)
        || !is_plugin_key(plugin_key)
        || Version::parse(version).is_err()
        || !is_portable_resource_path(resource_path)
    {
        return None;
    }

    Some(PluginResourceUrl {
        origin_scope: origin_scope.to_owned(),
        path_scope: path_scope.to_owned(),
        plugin_key: plugin_key.to_owned(),
        version: version.to_owned(),
        resource_path: resource_path.to_owned(),
        fragment: url.fragment().map(str::to_owned),
    })
}

pub(crate) fn is_scope(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn is_plugin_key(value: &str) -> bool {
    value.strip_prefix("v1-").is_some_and(|hex| {
        !hex.is_empty()
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    })
}

pub(crate) fn is_portable_resource_path(path: &str) -> bool {
    let segments = path.split('/').collect::<Vec<_>>();
    !path.is_empty()
        && path.is_ascii()
        && !path.starts_with('/')
        && !path.ends_with('/')
        && !path.contains(['\\', '\0', '%'])
        && path.len() <= MAX_PATH_BYTES
        && segments.len() <= MAX_PATH_SEGMENTS
        && segments.iter().all(|segment| {
            let bytes = segment.as_bytes();
            !matches!(*segment, "" | "." | "..")
                && bytes
                    .first()
                    .is_some_and(|byte| byte.is_ascii_alphanumeric())
                && bytes
                    .last()
                    .is_some_and(|byte| byte.is_ascii_alphanumeric())
                && bytes
                    .iter()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        })
        && !matches!(
            path.to_ascii_lowercase().as_str(),
            "manifest.json" | "checksums.json"
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCOPE: &str = "0123456789abcdef0123456789abcdef";
    const OTHER_SCOPE: &str = "fedcba9876543210fedcba9876543210";
    const NATIVE: &str = "lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d65/1.2.3/dist/index.html";

    #[test]
    fn native_and_translated_forms_preserve_one_origin_key() {
        let native = parse_plugin_resource_url(NATIVE, false).expect("native URL should parse");
        assert_eq!(native.origin_scope, SCOPE);
        assert_eq!(native.origin_scope, native.path_scope);
        let translated =
            translated_resource_url(NATIVE, "https").expect("translation should build");
        assert_eq!(
            translated,
            "https://lensx-plugin.0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d65/1.2.3/dist/index.html"
        );
        assert_eq!(parse_plugin_resource_url(&translated, false), Some(native));
    }

    #[test]
    fn shared_mismatched_and_ambiguous_authorities_fail_closed() {
        for invalid in [
            NATIVE.replace(&format!("{SCOPE}.runtime.localhost"), "localhost"),
            NATIVE.replacen(SCOPE, OTHER_SCOPE, 1),
            NATIVE.replace(".runtime.localhost", ".extra.runtime.localhost"),
            NATIVE.replace(SCOPE, &SCOPE.to_uppercase()),
            NATIVE.replace(SCOPE, "xn--0123456789abcdef0123456789abcdef"),
            NATIVE.replacen("://", "://user@", 1),
            NATIVE.replace(".localhost", ".localhost:443"),
            format!("{NATIVE}?query=1"),
            format!("{NATIVE}#route"),
            NATIVE.replace("index.html", "index%2ehtml"),
            NATIVE.replace("lensx-plugin", "ftp"),
        ] {
            assert!(
                parse_plugin_resource_url(&invalid, false).is_none(),
                "invalid URL should be rejected: {invalid}"
            );
        }
    }

    #[test]
    fn fragment_is_only_accepted_for_document_normalization() {
        let document = format!("{NATIVE}#/route");
        assert!(parse_plugin_resource_url(&document, false).is_none());
        assert_eq!(
            parse_plugin_resource_url(&document, true)
                .expect("document fragment should parse")
                .fragment
                .as_deref(),
            Some("/route")
        );
    }
}
