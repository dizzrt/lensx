use crate::plugin_manifest::{
    validate_plugin_manifest, NormalizedPluginManifest, PluginHostVersions,
    PluginManifestCompatibility, PluginManifestValidationStatus,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Cursor, Read};

const PACKAGE_FORMAT_VERSION: &str = "0.1.0";
const MANIFEST_PATH: &str = "manifest.json";
const CHECKSUMS_PATH: &str = "checksums.json";
const MAX_COMPRESSED_BYTES: usize = 64 * 1024 * 1024;
const MAX_WINDOW_BYTES: u64 = 64 * 1024 * 1024;
pub(crate) const MAX_TAR_BYTES: u64 = 256 * 1024 * 1024;
pub(crate) const MAX_FILE_COUNT: usize = 4096;
pub(crate) const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
pub(crate) const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_CHECKSUMS_BYTES: u64 = 4 * 1024 * 1024;
const MAX_PATH_BYTES: usize = 100;
const MAX_PATH_SEGMENTS: usize = 16;
const TAR_BLOCK_BYTES: usize = 512;
const ZSTD_MAGIC: u32 = 0xfd2fb528;
const ZSTD_SKIPPABLE_MAGIC_MIN: u32 = 0x184d2a50;
const ZSTD_SKIPPABLE_MAGIC_MAX: u32 = 0x184d2a5f;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct PackageDiagnostic {
    pub code: &'static str,
    pub path: String,
    pub message: &'static str,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageFileFact {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    pub checksum_covered: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AlgorithmLabelledDigest {
    pub algorithm: &'static str,
    pub value: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageFacts {
    pub package_format_version: &'static str,
    pub compressed_size: usize,
    pub decompressed_size: u64,
    pub file_count: usize,
    pub files: Vec<PackageFileFact>,
    pub package_digest: AlgorithmLabelledDigest,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum PackageInspectionResult {
    Invalid {
        diagnostics: Vec<PackageDiagnostic>,
    },
    Compatible {
        manifest: NormalizedPluginManifest,
        compatibility: PluginManifestCompatibility,
        facts: PackageFacts,
        diagnostics: Vec<PackageDiagnostic>,
    },
    Incompatible {
        manifest: NormalizedPluginManifest,
        compatibility: PluginManifestCompatibility,
        facts: PackageFacts,
        diagnostics: Vec<PackageDiagnostic>,
    },
}

fn diagnostic(code: &'static str, path: impl Into<String>) -> PackageDiagnostic {
    let message = package_diagnostic_message(code).unwrap_or("The plugin package is invalid.");
    PackageDiagnostic {
        code,
        path: path.into(),
        message,
    }
}

pub(crate) fn package_diagnostic_message(code: &str) -> Option<&'static str> {
    Some(match code {
        "archive_header_invalid" => "The package TAR header is invalid.",
        "archive_incomplete" => "The package TAR stream is incomplete.",
        "archive_metadata_invalid" => "The package TAR metadata is not canonical.",
        "archive_order_invalid" => "The package TAR entries are not in canonical order.",
        "archive_termination_invalid" => "The package TAR termination is not canonical.",
        "checksum_algorithm_invalid" => "The package checksum algorithm is unsupported.",
        "checksum_coverage_invalid" => {
            "The package checksum records do not exactly cover the files."
        }
        "checksum_digest_invalid" => "A package file checksum does not match its content.",
        "checksum_record_invalid" => "A package checksum record is invalid.",
        "checksum_size_invalid" => "A package file size does not match its checksum record.",
        "checksums_invalid" => "The package checksums record is not canonical.",
        "compressed_size_exceeded" => "The compressed package exceeds the size limit.",
        "file_count_exceeded" => "The package contains too many files.",
        "file_size_exceeded" => "A package file exceeds the size limit.",
        "frame_checksum_required" => "The Zstandard frame must include a content checksum.",
        "frame_content_size_invalid" => "The Zstandard frame content size is missing or invalid.",
        "frame_corrupt" => "The Zstandard frame is corrupt.",
        "frame_dictionary_forbidden" => "Zstandard dictionaries are not allowed.",
        "frame_invalid" => "The package is not a supported Zstandard frame.",
        "frame_multiple_forbidden" => "The package must contain exactly one Zstandard frame.",
        "frame_trailing_bytes" => "Trailing bytes after the Zstandard frame are not allowed.",
        "frame_window_exceeded" => "The Zstandard frame window exceeds the limit.",
        "manifest_invalid" => "The plugin Manifest is invalid.",
        "metadata_size_exceeded" => "A package metadata record exceeds the size limit.",
        "package_version_invalid" => "The plugin package format version is unsupported.",
        "path_case_collision" => "Package paths must be unique under ASCII case folding.",
        "path_invalid" => "The package path is not portable.",
        "path_reserved" => "The package path uses a reserved name.",
        "resource_missing" => "A Manifest resource does not resolve to a package file.",
        "tar_size_exceeded" => "The decompressed TAR stream exceeds the size limit.",
        _ => return None,
    })
}

pub(crate) fn sort_diagnostics(diagnostics: &mut Vec<PackageDiagnostic>) {
    diagnostics.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.code.cmp(right.code))
    });
    diagnostics.dedup_by(|left, right| left.path == right.path && left.code == right.code);
}

fn invalid(mut diagnostics: Vec<PackageDiagnostic>) -> PackageInspectionResult {
    sort_diagnostics(&mut diagnostics);
    PackageInspectionResult::Invalid { diagnostics }
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn read_le(bytes: &[u8], offset: usize, length: usize) -> Option<u64> {
    if length > 8 || offset.checked_add(length)? > bytes.len() {
        return None;
    }
    let mut value = 0_u64;
    for (index, byte) in bytes[offset..offset + length].iter().enumerate() {
        value |= u64::from(*byte) << (index * 8);
    }
    Some(value)
}

struct FrameProfile {
    content_size: u64,
}

fn scan_zstandard_frame(bytes: &[u8]) -> Result<FrameProfile, Vec<PackageDiagnostic>> {
    if bytes.len() > MAX_COMPRESSED_BYTES {
        return Err(vec![diagnostic("compressed_size_exceeded", "/frame")]);
    }
    let Some(magic) = read_le(bytes, 0, 4).map(|value| value as u32) else {
        return Err(vec![diagnostic("frame_invalid", "/frame")]);
    };
    if (ZSTD_SKIPPABLE_MAGIC_MIN..=ZSTD_SKIPPABLE_MAGIC_MAX).contains(&magic)
        || magic != ZSTD_MAGIC
        || bytes.len() < 6
    {
        return Err(vec![diagnostic("frame_invalid", "/frame")]);
    }
    let descriptor = bytes[4];
    if descriptor & 0x18 != 0 {
        return Err(vec![diagnostic("frame_invalid", "/frame")]);
    }
    let content_size_flag = descriptor >> 6;
    let single_segment = descriptor & 0x20 != 0;
    let checksum = descriptor & 0x04 != 0;
    let dictionary_flag = descriptor & 0x03;
    let mut offset = 5_usize;
    let mut window_size = None;
    if !single_segment {
        let Some(window_descriptor) = bytes.get(offset).copied() else {
            return Err(vec![diagnostic("frame_invalid", "/frame")]);
        };
        offset += 1;
        let exponent = u32::from(window_descriptor >> 3);
        let mantissa = u64::from(window_descriptor & 0x07);
        let base = 1_u64 << (10 + exponent);
        window_size = Some(base + (base / 8) * mantissa);
    }
    let dictionary_bytes = [0_usize, 1, 2, 4][usize::from(dictionary_flag)];
    let dictionary_id = read_le(bytes, offset, dictionary_bytes).unwrap_or(0);
    offset += dictionary_bytes;
    if dictionary_id != 0 {
        return Err(vec![diagnostic("frame_dictionary_forbidden", "/frame")]);
    }
    let content_size_bytes = if content_size_flag == 0 {
        usize::from(single_segment)
    } else {
        [0_usize, 2, 4, 8][usize::from(content_size_flag)]
    };
    if content_size_bytes == 0 {
        return Err(vec![diagnostic("frame_content_size_invalid", "/frame")]);
    }
    let Some(mut content_size) = read_le(bytes, offset, content_size_bytes) else {
        return Err(vec![diagnostic("frame_content_size_invalid", "/frame")]);
    };
    if content_size_bytes == 2 {
        content_size += 256;
    }
    offset += content_size_bytes;
    if single_segment {
        window_size = Some(content_size);
    }
    if content_size > MAX_TAR_BYTES {
        return Err(vec![diagnostic("frame_content_size_invalid", "/frame")]);
    }
    if window_size.unwrap_or(0) > MAX_WINDOW_BYTES {
        return Err(vec![diagnostic("frame_window_exceeded", "/frame")]);
    }
    if !checksum {
        return Err(vec![diagnostic("frame_checksum_required", "/frame")]);
    }
    let mut last_block = false;
    while !last_block {
        let Some(block_header) = read_le(bytes, offset, 3) else {
            return Err(vec![diagnostic("frame_invalid", "/frame")]);
        };
        offset += 3;
        last_block = block_header & 1 != 0;
        let block_type = (block_header >> 1) & 0x03;
        let block_size = (block_header >> 3) as usize;
        if block_type == 3 {
            return Err(vec![diagnostic("frame_invalid", "/frame")]);
        }
        let encoded_size = if block_type == 1 { 1 } else { block_size };
        let Some(next_offset) = offset.checked_add(encoded_size) else {
            return Err(vec![diagnostic("frame_invalid", "/frame")]);
        };
        offset = next_offset;
        if offset > bytes.len() {
            return Err(vec![diagnostic("frame_invalid", "/frame")]);
        }
    }
    let Some(frame_end) = offset.checked_add(4) else {
        return Err(vec![diagnostic("frame_invalid", "/frame")]);
    };
    if frame_end != bytes.len() {
        let code = if read_le(bytes, frame_end, 4).map(|value| value as u32) == Some(ZSTD_MAGIC) {
            "frame_multiple_forbidden"
        } else {
            "frame_trailing_bytes"
        };
        return Err(vec![diagnostic(code, "/frame")]);
    }
    Ok(FrameProfile { content_size })
}

fn write_octal(header: &mut [u8], offset: usize, length: usize, value: u64) {
    let digits = format!("{:0width$o}", value, width = length - 1);
    header[offset..offset + length - 1].copy_from_slice(digits.as_bytes());
    header[offset + length - 1] = 0;
}

fn canonical_tar_header(path: &str, size: u64) -> [u8; TAR_BLOCK_BYTES] {
    let mut header = [0_u8; TAR_BLOCK_BYTES];
    header[..path.len()].copy_from_slice(path.as_bytes());
    write_octal(&mut header, 100, 8, 0o644);
    write_octal(&mut header, 108, 8, 0);
    write_octal(&mut header, 116, 8, 0);
    write_octal(&mut header, 124, 12, size);
    write_octal(&mut header, 136, 12, 0);
    header[148..156].fill(b' ');
    header[156] = b'0';
    header[257..263].copy_from_slice(b"ustar\0");
    header[263..265].copy_from_slice(b"00");
    let checksum: u64 = header.iter().map(|byte| u64::from(*byte)).sum();
    let digits = format!("{:06o}", checksum);
    header[148..154].copy_from_slice(digits.as_bytes());
    header[154] = 0;
    header[155] = b' ';
    header
}

fn parse_tar_path(field: &[u8]) -> Option<String> {
    let end = field
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(field.len());
    if field[end..].iter().any(|byte| *byte != 0) {
        return None;
    }
    String::from_utf8(field[..end].to_vec()).ok()
}

pub(crate) fn ascii_fold(path: &str) -> String {
    path.to_ascii_lowercase()
}

pub(crate) fn validate_portable_path(path: &str) -> Vec<PackageDiagnostic> {
    let mut diagnostics = Vec::new();
    let segments: Vec<_> = path.split('/').collect();
    let valid_segment = |segment: &str| {
        let bytes = segment.as_bytes();
        !bytes.is_empty()
            && bytes.first().is_some_and(u8::is_ascii_alphanumeric)
            && bytes.last().is_some_and(u8::is_ascii_alphanumeric)
            && bytes
                .iter()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(*byte, b'.' | b'_' | b'-'))
    };
    if path.is_empty()
        || !path.is_ascii()
        || path.starts_with('/')
        || path.ends_with('/')
        || path.contains('\\')
        || path.len() > MAX_PATH_BYTES
        || segments.len() > MAX_PATH_SEGMENTS
        || segments
            .iter()
            .any(|segment| matches!(*segment, "" | "." | "..") || !valid_segment(segment))
    {
        diagnostics.push(diagnostic(
            "path_invalid",
            if path.is_empty() { "/archive" } else { path },
        ));
    }
    const RESERVED: [&str; 22] = [
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
        "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];
    if segments.iter().any(|segment| {
        let basename = segment
            .split('.')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();
        RESERVED.contains(&basename.as_str())
    }) {
        diagnostics.push(diagnostic("path_reserved", path));
    }
    diagnostics
}

fn read_exact_safe(reader: &mut impl Read, buffer: &mut [u8]) -> bool {
    let mut offset = 0;
    while offset < buffer.len() {
        match reader.read(&mut buffer[offset..]) {
            Ok(0) | Err(_) => return false,
            Ok(read) => offset += read,
        }
    }
    true
}

struct TarInspection {
    files: Vec<PackageFileFact>,
    manifest_bytes: Option<Vec<u8>>,
    checksums_bytes: Option<Vec<u8>>,
    decompressed_size: u64,
    diagnostics: Vec<PackageDiagnostic>,
}

pub(crate) trait PackageEntrySink {
    fn start_entry(&mut self, path: &str, size: u64) -> Result<(), ()>;
    fn write_chunk(&mut self, path: &str, bytes: &[u8]) -> Result<(), ()>;
    fn finish_entry(&mut self, path: &str) -> Result<(), ()>;
    fn finish_archive(&mut self) -> Result<(), ()>;
}

struct NoopEntrySink;

impl PackageEntrySink for NoopEntrySink {
    fn start_entry(&mut self, _path: &str, _size: u64) -> Result<(), ()> {
        Ok(())
    }

    fn write_chunk(&mut self, _path: &str, _bytes: &[u8]) -> Result<(), ()> {
        Ok(())
    }

    fn finish_entry(&mut self, _path: &str) -> Result<(), ()> {
        Ok(())
    }

    fn finish_archive(&mut self) -> Result<(), ()> {
        Ok(())
    }
}

pub(crate) enum PackageTraversalFailure {
    Invalid(Vec<PackageDiagnostic>),
    Sink,
}

pub(crate) struct CanonicalPackageTraversal {
    pub files: Vec<PackageFileFact>,
    pub decompressed_size: u64,
}

fn inspect_tar(
    reader: &mut impl Read,
    sink: &mut impl PackageEntrySink,
) -> Result<TarInspection, ()> {
    let mut files = Vec::new();
    let mut manifest_bytes = None;
    let mut checksums_bytes = None;
    let mut diagnostics = Vec::new();
    let mut paths = Vec::new();
    let mut folded = HashMap::new();
    let mut decompressed_size = 0_u64;
    let mut zero_blocks = 0;
    loop {
        let mut header = [0_u8; TAR_BLOCK_BYTES];
        if !read_exact_safe(reader, &mut header) {
            diagnostics.push(diagnostic("archive_incomplete", "/archive"));
            break;
        }
        decompressed_size += TAR_BLOCK_BYTES as u64;
        if header.iter().all(|byte| *byte == 0) {
            zero_blocks += 1;
            if zero_blocks == 2 {
                let mut trailing = [0_u8; 1];
                match reader.read(&mut trailing) {
                    Ok(0) => {}
                    _ => diagnostics.push(diagnostic("archive_termination_invalid", "/archive")),
                }
                if diagnostics.is_empty() {
                    sink.finish_archive()?;
                }
                break;
            }
            continue;
        }
        if zero_blocks > 0 {
            diagnostics.push(diagnostic("archive_termination_invalid", "/archive"));
            break;
        }
        let raw_header = tar::Header::from_byte_slice(&header);
        let path = parse_tar_path(&header[..100]);
        let size = raw_header.size().ok();
        if path.is_none() || size.is_none() {
            diagnostics.push(diagnostic("archive_header_invalid", "/archive"));
            break;
        }
        let path = path.expect("checked above");
        let size = size.expect("checked above");
        diagnostics.extend(validate_portable_path(&path));
        if paths.is_empty() && path != MANIFEST_PATH
            || paths.len() == 1 && path != CHECKSUMS_PATH
            || paths.len() > 2 && paths.last().is_some_and(|previous| previous >= &path)
        {
            diagnostics.push(diagnostic("archive_order_invalid", &path));
        }
        if paths.contains(&path) {
            diagnostics.push(diagnostic("path_invalid", &path));
        }
        let folded_path = ascii_fold(&path);
        if folded
            .insert(folded_path, path.clone())
            .is_some_and(|previous| previous != path)
        {
            diagnostics.push(diagnostic("path_case_collision", &path));
        }
        paths.push(path.clone());
        if paths.len() > MAX_FILE_COUNT {
            diagnostics.push(diagnostic("file_count_exceeded", "/archive"));
            break;
        }
        let limit = match path.as_str() {
            MANIFEST_PATH => MAX_MANIFEST_BYTES,
            CHECKSUMS_PATH => MAX_CHECKSUMS_BYTES,
            _ => MAX_FILE_BYTES,
        };
        if size > limit {
            diagnostics.push(diagnostic(
                if matches!(path.as_str(), MANIFEST_PATH | CHECKSUMS_PATH) {
                    "metadata_size_exceeded"
                } else {
                    "file_size_exceeded"
                },
                &path,
            ));
            break;
        }
        if header != canonical_tar_header(&path, size) {
            diagnostics.push(diagnostic("archive_metadata_invalid", &path));
        }
        if !diagnostics.is_empty() {
            break;
        }
        sink.start_entry(&path, size)?;
        let mut hasher = Sha256::new();
        let mut metadata = if matches!(path.as_str(), MANIFEST_PATH | CHECKSUMS_PATH) {
            Some(Vec::with_capacity(size as usize))
        } else {
            None
        };
        let mut remaining = size;
        let mut chunk = [0_u8; 64 * 1024];
        let mut complete = true;
        while remaining > 0 {
            let length = usize::try_from(remaining.min(chunk.len() as u64)).unwrap_or(chunk.len());
            if !read_exact_safe(reader, &mut chunk[..length]) {
                diagnostics.push(diagnostic("archive_incomplete", &path));
                complete = false;
                break;
            }
            hasher.update(&chunk[..length]);
            sink.write_chunk(&path, &chunk[..length])?;
            if let Some(bytes) = metadata.as_mut() {
                bytes.extend_from_slice(&chunk[..length]);
            }
            remaining -= length as u64;
            decompressed_size += length as u64;
        }
        if !complete {
            break;
        }
        let padding_size =
            (TAR_BLOCK_BYTES as u64 - size % TAR_BLOCK_BYTES as u64) % TAR_BLOCK_BYTES as u64;
        let mut padding = vec![0_u8; padding_size as usize];
        if !read_exact_safe(reader, &mut padding) {
            diagnostics.push(diagnostic("archive_incomplete", &path));
            break;
        }
        decompressed_size += padding_size;
        if padding.iter().any(|byte| *byte != 0) {
            diagnostics.push(diagnostic("archive_metadata_invalid", &path));
        }
        if path == MANIFEST_PATH {
            manifest_bytes = metadata;
        } else if path == CHECKSUMS_PATH {
            checksums_bytes = metadata;
        }
        files.push(PackageFileFact {
            path: path.clone(),
            size,
            sha256: format!("{:x}", hasher.finalize()),
            checksum_covered: path != CHECKSUMS_PATH,
        });
        sink.finish_entry(&path)?;
        if decompressed_size > MAX_TAR_BYTES {
            diagnostics.push(diagnostic("tar_size_exceeded", "/archive"));
            break;
        }
    }
    sort_diagnostics(&mut diagnostics);
    Ok(TarInspection {
        files,
        manifest_bytes,
        checksums_bytes,
        decompressed_size,
        diagnostics,
    })
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ChecksumRecord {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ChecksumsRecord {
    package_format_version: String,
    algorithm: String,
    files: Vec<ChecksumRecord>,
}

fn validate_checksums(bytes: &[u8], files: &[PackageFileFact]) -> Vec<PackageDiagnostic> {
    let Ok(record) = serde_json::from_slice::<ChecksumsRecord>(bytes) else {
        return vec![diagnostic("checksums_invalid", CHECKSUMS_PATH)];
    };
    let Ok(mut canonical) = serde_json::to_vec(&record) else {
        return vec![diagnostic("checksums_invalid", CHECKSUMS_PATH)];
    };
    canonical.push(b'\n');
    if canonical != bytes {
        return vec![diagnostic("checksums_invalid", CHECKSUMS_PATH)];
    }
    if record.package_format_version != PACKAGE_FORMAT_VERSION {
        return vec![diagnostic("package_version_invalid", CHECKSUMS_PATH)];
    }
    if record.algorithm != "sha256" {
        return vec![diagnostic("checksum_algorithm_invalid", CHECKSUMS_PATH)];
    }
    let checksum_paths: Vec<_> = record.files.iter().map(|file| file.path.as_str()).collect();
    if checksum_paths.windows(2).any(|pair| pair[0] >= pair[1])
        || record.files.iter().any(|file| {
            file.sha256.len() != 64
                || !file
                    .sha256
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
    {
        return vec![diagnostic("checksum_record_invalid", CHECKSUMS_PATH)];
    }
    let mut diagnostics = Vec::new();
    let mut expected: BTreeMap<_, _> = files
        .iter()
        .filter(|file| file.path != CHECKSUMS_PATH)
        .map(|file| (file.path.as_str(), file))
        .collect();
    if expected.len() != record.files.len() {
        diagnostics.push(diagnostic("checksum_coverage_invalid", CHECKSUMS_PATH));
    }
    for checksum in &record.files {
        let Some(file) = expected.remove(checksum.path.as_str()) else {
            diagnostics.push(diagnostic("checksum_coverage_invalid", &checksum.path));
            continue;
        };
        if checksum.size != file.size {
            diagnostics.push(diagnostic("checksum_size_invalid", &checksum.path));
        }
        if checksum.sha256 != file.sha256 {
            diagnostics.push(diagnostic("checksum_digest_invalid", &checksum.path));
        }
    }
    diagnostics.extend(
        expected
            .keys()
            .map(|path| diagnostic("checksum_coverage_invalid", *path)),
    );
    sort_diagnostics(&mut diagnostics);
    diagnostics
}

fn manifest_resources(manifest: &NormalizedPluginManifest) -> Vec<(&str, String)> {
    let mut resources = vec![(manifest.runtime.entry.as_str(), "/runtime/entry".to_owned())];
    if let Some(icon) = &manifest.display.icon {
        resources.push((icon.path.as_str(), "/display/icon/path".to_owned()));
    }
    for (index, page) in manifest.contributes.pages.iter().enumerate() {
        if let Some(icon) = &page.icon {
            resources.push((
                icon.path.as_str(),
                format!("/contributes/pages/{index}/icon/path"),
            ));
        }
    }
    for (index, action) in manifest.contributes.actions.iter().enumerate() {
        if let Some(icon) = &action.icon {
            resources.push((
                icon.path.as_str(),
                format!("/contributes/actions/{index}/icon/path"),
            ));
        }
    }
    resources
}

fn validate_manifest(
    bytes: &[u8],
    files: &[PackageFileFact],
    current_versions: &PluginHostVersions,
) -> Result<
    (
        PluginManifestValidationStatus,
        NormalizedPluginManifest,
        PluginManifestCompatibility,
    ),
    Vec<PackageDiagnostic>,
> {
    let Ok(value) = serde_json::from_slice::<Value>(bytes) else {
        return Err(vec![diagnostic("manifest_invalid", MANIFEST_PATH)]);
    };
    let validation = validate_plugin_manifest(&value, current_versions);
    if validation.status == PluginManifestValidationStatus::Invalid {
        return Err(validation
            .diagnostics
            .iter()
            .map(|item| diagnostic("manifest_invalid", &item.path))
            .collect());
    }
    let manifest = validation
        .manifest
        .expect("non-invalid Manifest validation includes normalized data");
    let compatibility = validation
        .compatibility
        .expect("non-invalid Manifest validation includes compatibility");
    let paths: HashSet<_> = files.iter().map(|file| file.path.as_str()).collect();
    let mut diagnostics = Vec::new();
    for (resource, pointer) in manifest_resources(&manifest) {
        if !paths.contains(resource) || matches!(resource, MANIFEST_PATH | CHECKSUMS_PATH) {
            diagnostics.push(diagnostic("resource_missing", pointer));
        }
    }
    if diagnostics.is_empty() {
        Ok((validation.status, manifest, compatibility))
    } else {
        Err(diagnostics)
    }
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(not(feature = "plugin-development-mode"), allow(dead_code))]
pub(crate) enum UnpackedPayloadValidation {
    Invalid(Vec<PackageDiagnostic>),
    Valid {
        status: PluginManifestValidationStatus,
        manifest: NormalizedPluginManifest,
        compatibility: PluginManifestCompatibility,
    },
}

#[cfg_attr(not(feature = "plugin-development-mode"), allow(dead_code))]
pub(crate) fn validate_unpacked_payload(
    manifest_bytes: &[u8],
    files: &[PackageFileFact],
    current_versions: &PluginHostVersions,
) -> UnpackedPayloadValidation {
    match validate_manifest(manifest_bytes, files, current_versions) {
        Ok((status, manifest, compatibility)) => UnpackedPayloadValidation::Valid {
            status,
            manifest,
            compatibility,
        },
        Err(mut diagnostics) => {
            sort_diagnostics(&mut diagnostics);
            UnpackedPayloadValidation::Invalid(diagnostics)
        }
    }
}

fn traverse_package_with_sink(
    package_bytes: &[u8],
    sink: &mut impl PackageEntrySink,
) -> Result<TarInspection, PackageTraversalFailure> {
    let frame = scan_zstandard_frame(package_bytes).map_err(PackageTraversalFailure::Invalid)?;
    let mut decoder =
        zstd::stream::read::Decoder::new(Cursor::new(package_bytes)).map_err(|_| {
            PackageTraversalFailure::Invalid(vec![diagnostic("frame_corrupt", "/frame")])
        })?;
    decoder.window_log_max(26).map_err(|_| {
        PackageTraversalFailure::Invalid(vec![diagnostic("frame_corrupt", "/frame")])
    })?;
    let mut decoder = decoder.single_frame();
    let archive = inspect_tar(&mut decoder, sink).map_err(|()| PackageTraversalFailure::Sink)?;
    if !archive.diagnostics.is_empty() {
        return Err(PackageTraversalFailure::Invalid(archive.diagnostics));
    }
    if archive.decompressed_size != frame.content_size {
        return Err(PackageTraversalFailure::Invalid(vec![diagnostic(
            "frame_content_size_invalid",
            "/frame",
        )]));
    }
    Ok(archive)
}

pub(crate) fn traverse_plugin_package(
    package_bytes: &[u8],
    sink: &mut impl PackageEntrySink,
) -> Result<CanonicalPackageTraversal, PackageTraversalFailure> {
    let archive = traverse_package_with_sink(package_bytes, sink)?;
    Ok(CanonicalPackageTraversal {
        files: archive.files,
        decompressed_size: archive.decompressed_size,
    })
}

pub fn inspect_plugin_package(
    package_bytes: &[u8],
    current_versions: &PluginHostVersions,
) -> PackageInspectionResult {
    let archive = match traverse_package_with_sink(package_bytes, &mut NoopEntrySink) {
        Ok(archive) => archive,
        Err(PackageTraversalFailure::Invalid(diagnostics)) => return invalid(diagnostics),
        Err(PackageTraversalFailure::Sink) => unreachable!("the no-op package sink cannot fail"),
    };
    let mut missing = Vec::new();
    if archive.manifest_bytes.is_none() {
        missing.push(diagnostic("archive_order_invalid", MANIFEST_PATH));
    }
    if archive.checksums_bytes.is_none() {
        missing.push(diagnostic("archive_order_invalid", CHECKSUMS_PATH));
    }
    if !missing.is_empty() {
        return invalid(missing);
    }
    let manifest_bytes = archive
        .manifest_bytes
        .expect("presence checked before package validation");
    let checksums_bytes = archive
        .checksums_bytes
        .expect("presence checked before package validation");
    let checksum_diagnostics = validate_checksums(&checksums_bytes, &archive.files);
    if !checksum_diagnostics.is_empty() {
        return invalid(checksum_diagnostics);
    }
    let (status, manifest, compatibility) =
        match validate_manifest(&manifest_bytes, &archive.files, current_versions) {
            Ok(value) => value,
            Err(diagnostics) => return invalid(diagnostics),
        };
    let facts = PackageFacts {
        package_format_version: PACKAGE_FORMAT_VERSION,
        compressed_size: package_bytes.len(),
        decompressed_size: archive.decompressed_size,
        file_count: archive.files.len(),
        files: archive.files,
        package_digest: AlgorithmLabelledDigest {
            algorithm: "sha256",
            value: sha256_hex(package_bytes),
        },
    };
    match status {
        PluginManifestValidationStatus::Compatible => PackageInspectionResult::Compatible {
            manifest,
            compatibility,
            facts,
            diagnostics: Vec::new(),
        },
        PluginManifestValidationStatus::Incompatible => PackageInspectionResult::Incompatible {
            manifest,
            compatibility,
            facts,
            diagnostics: Vec::new(),
        },
        PluginManifestValidationStatus::Invalid => unreachable!("handled before facts are built"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[derive(Deserialize)]
    struct SharedFixtureCase {
        name: String,
        file: String,
        expected: Value,
    }

    #[test]
    fn shared_fixtures_match_typescript_status_facts_diagnostics_and_digest() {
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/plugin-package-format");
        let cases: Vec<SharedFixtureCase> = serde_json::from_slice(
            &fs::read(root.join("expectations.json")).expect("fixture expectations should exist"),
        )
        .expect("fixture expectations should be valid JSON");
        let versions = PluginHostVersions {
            lensx: "0.1.0".to_owned(),
            host_api: "0.1.0".to_owned(),
        };
        for case in cases {
            let bytes = fs::read(root.join(&case.file)).expect("fixture package should exist");
            let actual = serde_json::to_value(inspect_plugin_package(&bytes, &versions))
                .expect("inspection result should serialize");
            assert_eq!(
                actual, case.expected,
                "shared fixture mismatch: {}",
                case.name
            );
        }
    }

    #[test]
    fn low_level_errors_do_not_expose_private_details() {
        let result = inspect_plugin_package(
            b"/Users/private/plugin.lxp: codec failed",
            &PluginHostVersions {
                lensx: "0.1.0".to_owned(),
                host_api: "0.1.0".to_owned(),
            },
        );
        let serialized = serde_json::to_string(&result).expect("result should serialize");
        assert!(!serialized.contains("/Users/private"));
        assert!(!serialized.contains("codec failed"));
        assert!(serialized.contains("frame_invalid"));
    }

    #[test]
    fn inspector_has_no_host_mutation_or_runtime_boundary() {
        let source = include_str!("plugin_package_format.rs");
        for forbidden in [
            concat!("tauri::", "command"),
            concat!("Plugin", "Manager"),
            concat!("create", "_dir"),
            concat!("write", "_all"),
            concat!("Action", "Descriptor"),
            concat!("Runtime", "Session"),
            concat!("Permission", "Grant"),
        ] {
            assert!(
                !source.contains(forbidden),
                "package inspector must not expose downstream boundary {forbidden}"
            );
        }
    }
}
