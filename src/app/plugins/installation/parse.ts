import {
  LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION,
  type LocalPluginInstallationDiagnostic,
  type LocalPluginInstallationErrorPayload,
  type LocalPluginInstallationOperation,
  type LocalPluginInstallationResult,
} from './types';

const PLUGIN_ID_PATTERN = /^(?:[a-z][a-z0-9_-]{0,63}\.)+[a-z][a-z0-9_-]{0,63}$/u;
const SEMVER_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const REVISION_PATTERN = /^(?:0|[1-9][0-9]*)$/u;

const ERROR_MESSAGES = {
  already_installed: 'A plugin with this identity is already installed.',
  busy: 'Another plugin installation is in progress.',
  commit_failed: 'The plugin package could not be committed.',
  extraction_failed: 'The plugin package could not be extracted safely.',
  identity_quarantined: 'This plugin identity is quarantined and cannot be replaced by installation.',
  incompatible: 'The selected plugin is not compatible with this version of lensX.',
  internal: 'Local plugin installation failed.',
  invalid_package: 'The selected file is not a valid lensX plugin package.',
  registration_failed: 'The plugin registration could not be saved.',
  source_read_failed: 'The selected plugin package could not be read.',
  unavailable: 'Local plugin installation is unavailable.',
} as const;

const PACKAGE_DIAGNOSTIC_MESSAGES = {
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
} as const;

const OPERATIONS = new Set<LocalPluginInstallationOperation>([
  'select',
  'read',
  'inspect',
  'extract',
  'commit',
  'register',
  'recover',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertRecord = (value: unknown, required: readonly string[], optional: readonly string[] = []) => {
  if (!isRecord(value)) {
    throw new TypeError('Local plugin installation payload is not an object.');
  }
  const allowed = new Set([...required, ...optional]);
  if (!required.every((key) => Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError('Local plugin installation payload has an invalid field set.');
  }
  return value;
};

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
};

const parseContractVersion = (value: unknown) => {
  if (value !== LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION) {
    throw new TypeError('Local plugin installation contract version is unsupported.');
  }
  return value;
};

const parseDiagnostic = (value: unknown): LocalPluginInstallationDiagnostic => {
  const record = assertRecord(value, ['code', 'path', 'message']);
  if (
    typeof record.code !== 'string' ||
    !(record.code in PACKAGE_DIAGNOSTIC_MESSAGES) ||
    typeof record.path !== 'string' ||
    record.path.length === 0 ||
    record.message !== PACKAGE_DIAGNOSTIC_MESSAGES[record.code as keyof typeof PACKAGE_DIAGNOSTIC_MESSAGES]
  ) {
    throw new TypeError('Local plugin installation package diagnostic is invalid.');
  }
  return { code: record.code, path: record.path, message: record.message } as LocalPluginInstallationDiagnostic;
};

export const parseLocalPluginInstallationResult = (value: unknown): LocalPluginInstallationResult => {
  if (!isRecord(value)) {
    throw new TypeError('Local plugin installation result is invalid.');
  }
  if (value.status === 'cancelled') {
    const record = assertRecord(value, ['status', 'contract_version']);
    return deepFreeze({ status: 'cancelled', contract_version: parseContractVersion(record.contract_version) });
  }
  if (value.status === 'installed') {
    const record = assertRecord(value, ['status', 'contract_version', 'plugin_id', 'version', 'revision']);
    if (
      typeof record.plugin_id !== 'string' ||
      !PLUGIN_ID_PATTERN.test(record.plugin_id) ||
      record.plugin_id.length > 255 ||
      typeof record.version !== 'string' ||
      !SEMVER_PATTERN.test(record.version) ||
      typeof record.revision !== 'string' ||
      !REVISION_PATTERN.test(record.revision)
    ) {
      throw new TypeError('Installed local plugin result is invalid.');
    }
    return deepFreeze({
      status: 'installed',
      contract_version: parseContractVersion(record.contract_version),
      plugin_id: record.plugin_id,
      version: record.version,
      revision: record.revision,
    });
  }
  throw new TypeError('Local plugin installation result variant is invalid.');
};

export const parseLocalPluginInstallationError = (value: unknown): LocalPluginInstallationErrorPayload => {
  const record = assertRecord(value, ['contract_version', 'code', 'operation', 'message'], ['diagnostics']);
  if (
    typeof record.code !== 'string' ||
    !(record.code in ERROR_MESSAGES) ||
    typeof record.operation !== 'string' ||
    !OPERATIONS.has(record.operation as LocalPluginInstallationOperation) ||
    typeof record.message !== 'string' ||
    record.message !== ERROR_MESSAGES[record.code as keyof typeof ERROR_MESSAGES] ||
    (record.diagnostics !== undefined && !Array.isArray(record.diagnostics)) ||
    (record.code !== 'invalid_package' && record.diagnostics !== undefined)
  ) {
    throw new TypeError('Local plugin installation error is invalid.');
  }
  return deepFreeze({
    contract_version: parseContractVersion(record.contract_version),
    code: record.code as LocalPluginInstallationErrorPayload['code'],
    operation: record.operation as LocalPluginInstallationOperation,
    message: record.message,
    ...(Array.isArray(record.diagnostics) ? { diagnostics: record.diagnostics.map(parseDiagnostic) } : {}),
  });
};
