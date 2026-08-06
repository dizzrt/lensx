import type { PluginPackageDiagnostic, PluginPackageDiagnosticCode } from './types.js';

const DIAGNOSTIC_MESSAGES: Readonly<Record<PluginPackageDiagnosticCode, string>> = Object.freeze({
  archive_header_invalid: 'The package TAR header is invalid.',
  archive_incomplete: 'The package TAR stream is incomplete.',
  archive_metadata_invalid: 'The package TAR metadata is not canonical.',
  archive_order_invalid: 'The package TAR entries are not in canonical order.',
  archive_termination_invalid: 'The package TAR termination is not canonical.',
  checksum_algorithm_invalid: 'The package checksum algorithm is unsupported.',
  checksum_coverage_invalid: 'The package checksum records do not exactly cover the files.',
  checksum_digest_invalid: 'A package file checksum does not match its content.',
  checksum_record_invalid: 'A package checksum record is invalid.',
  checksum_size_invalid: 'A package file size does not match its checksum record.',
  checksums_invalid: 'The package checksums record is not canonical.',
  compressed_size_exceeded: 'The compressed package exceeds the size limit.',
  file_count_exceeded: 'The package contains too many files.',
  file_size_exceeded: 'A package file exceeds the size limit.',
  frame_checksum_required: 'The Zstandard frame must include a content checksum.',
  frame_content_size_invalid: 'The Zstandard frame content size is missing or invalid.',
  frame_corrupt: 'The Zstandard frame is corrupt.',
  frame_dictionary_forbidden: 'Zstandard dictionaries are not allowed.',
  frame_invalid: 'The package is not a supported Zstandard frame.',
  frame_multiple_forbidden: 'The package must contain exactly one Zstandard frame.',
  frame_trailing_bytes: 'Trailing bytes after the Zstandard frame are not allowed.',
  frame_window_exceeded: 'The Zstandard frame window exceeds the limit.',
  manifest_invalid: 'The plugin Manifest is invalid.',
  metadata_size_exceeded: 'A package metadata record exceeds the size limit.',
  package_version_invalid: 'The plugin package format version is unsupported.',
  path_case_collision: 'Package paths must be unique under ASCII case folding.',
  path_invalid: 'The package path is not portable.',
  path_reserved: 'The package path uses a reserved name.',
  resource_missing: 'A Manifest resource does not resolve to a package file.',
  tar_size_exceeded: 'The decompressed TAR stream exceeds the size limit.',
});

export const packageDiagnostic = (code: PluginPackageDiagnosticCode, path: string): PluginPackageDiagnostic => ({
  code,
  path,
  message: DIAGNOSTIC_MESSAGES[code],
});

export const sortPackageDiagnostics = (diagnostics: readonly PluginPackageDiagnostic[]): PluginPackageDiagnostic[] => {
  const deduplicated = new Map<string, PluginPackageDiagnostic>();
  for (const diagnostic of diagnostics) {
    deduplicated.set(`${diagnostic.path}\0${diagnostic.code}`, diagnostic);
  }
  return [...deduplicated.values()].sort(
    (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
  );
};

export class PluginPackageFormatError extends Error {
  readonly diagnostics: readonly PluginPackageDiagnostic[];

  constructor(diagnostics: readonly PluginPackageDiagnostic[]) {
    super('Plugin package format validation failed.');
    this.name = 'PluginPackageFormatError';
    this.diagnostics = sortPackageDiagnostics(diagnostics);
  }
}
