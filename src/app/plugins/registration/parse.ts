import { type NormalizedPluginManifest, normalizePluginManifest, validatePluginManifest } from '@lensx/plugin-contract';
import {
  PLUGIN_REGISTRATION_CONTRACT_VERSION,
  type PluginManagerAvailability,
  type PluginRegistrationChangedEvent,
  type PluginRegistrationCompatibility,
  type PluginRegistrationDetail,
  type PluginRegistrationDetailResponse,
  type PluginRegistrationDiagnostic,
  type PluginRegistrationQueryErrorPayload,
  type PluginRegistrationRuntimeStatus,
  type PluginRegistrationSnapshot,
  type PluginRegistrationSummary,
} from './types';

type NormalizedPluginDisplay = NormalizedPluginManifest['display'];

const ENTRY_ID_PATTERN = /^entry_[0-9a-f]{16}$/u;
const REVISION_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const PERMISSION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,254}$/u;
const QUERY_ERROR_MESSAGES = {
  internal: 'Plugin registration query failed.',
  invalid_request: 'Plugin registration request is invalid.',
  not_found: 'Plugin registration entry was not found.',
  unavailable: 'Plugin registration data is unavailable.',
} as const;
const MANAGER_DIAGNOSTIC_MESSAGES = {
  duplicate_identity: 'Plugin identity is already registered.',
  identity_mismatch: 'Plugin record identity does not match its record key.',
  invalid_registration: 'Plugin registration is invalid.',
  persist_failed: 'Plugin registration could not be saved.',
  record_invalid: 'Plugin record is invalid.',
  record_unreadable: 'Plugin record could not be read.',
  store_unavailable: 'Plugin Manager storage is unavailable.',
  unsupported_format_version: 'Plugin record format version is unsupported.',
} as const;
const MANAGER_DIAGNOSTIC_PHASES = new Set(['validate', 'persist', 'recover', 'initialize']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) => {
  const keys = Object.keys(value).sort();
  const allowed = [...required, ...optional].sort();
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.includes(key));
};

const assertRecord = (value: unknown, required: readonly string[], optional: readonly string[] = []) => {
  if (!isRecord(value) || !hasExactKeys(value, required, optional)) {
    throw new TypeError('Plugin registration payload has an invalid field set.');
  }
  return value;
};

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    deepFreeze(item);
  }
  return Object.freeze(value);
};

const cloneJson = <T>(value: T): T => structuredClone(value);

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const parseContractVersion = (value: unknown) => {
  if (value !== PLUGIN_REGISTRATION_CONTRACT_VERSION) {
    throw new TypeError('Plugin registration contract version is unsupported.');
  }
  return value;
};

const parseRevision = (value: unknown): string => {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
    throw new TypeError('Plugin registration revision is invalid.');
  }
  return value;
};

export const isPluginRegistrationEntryId = (value: unknown): value is string =>
  typeof value === 'string' && ENTRY_ID_PATTERN.test(value);

const parseEntryId = (value: unknown): string => {
  if (!isPluginRegistrationEntryId(value)) {
    throw new TypeError('Plugin registration entry identity is invalid.');
  }
  return value;
};

const parseDiagnostic = (value: unknown): PluginRegistrationDiagnostic => {
  const record = assertRecord(value, ['code', 'phase', 'message']);
  if (
    typeof record.code !== 'string' ||
    !(record.code in MANAGER_DIAGNOSTIC_MESSAGES) ||
    typeof record.phase !== 'string' ||
    !MANAGER_DIAGNOSTIC_PHASES.has(record.phase) ||
    record.message !== MANAGER_DIAGNOSTIC_MESSAGES[record.code as keyof typeof MANAGER_DIAGNOSTIC_MESSAGES]
  ) {
    throw new TypeError('Plugin registration diagnostic is invalid.');
  }
  return { code: record.code, phase: record.phase, message: record.message as string };
};

const parseCompatibility = (value: unknown): PluginRegistrationCompatibility => {
  const record = assertRecord(value, ['lensx', 'host_api']);
  if (typeof record.lensx !== 'boolean' || typeof record.host_api !== 'boolean') {
    throw new TypeError('Plugin registration compatibility is invalid.');
  }
  return { lensx: record.lensx, host_api: record.host_api };
};

const parseRuntime = (value: unknown): PluginRegistrationRuntimeStatus => {
  const record = assertRecord(value, ['kind']);
  if (record.kind !== 'inactive') {
    throw new TypeError('Plugin registration Runtime status is invalid.');
  }
  return { kind: 'inactive' };
};

const parseLocalizedText = (value: unknown): { readonly 'en-US': string; readonly 'zh-CN'?: string } => {
  const record = assertRecord(value, ['en-US'], ['zh-CN']);
  if (
    typeof record['en-US'] !== 'string' ||
    record['en-US'].trim().length === 0 ||
    (record['zh-CN'] !== undefined && (typeof record['zh-CN'] !== 'string' || record['zh-CN'].trim().length === 0))
  ) {
    throw new TypeError('Plugin registration localized text is invalid.');
  }
  return {
    'en-US': record['en-US'],
    ...(typeof record['zh-CN'] === 'string' ? { 'zh-CN': record['zh-CN'] } : {}),
  };
};

const parseDisplay = (value: unknown): NormalizedPluginDisplay => {
  const record = assertRecord(value, ['name'], ['description', 'icon']);
  const icon = record.icon;
  if (icon !== undefined) {
    const iconRecord = assertRecord(icon, ['kind', 'path']);
    if (iconRecord.kind !== 'asset' || typeof iconRecord.path !== 'string' || iconRecord.path.length === 0) {
      throw new TypeError('Plugin registration display icon is invalid.');
    }
  }
  return {
    name: parseLocalizedText(record.name),
    ...(record.description === undefined ? {} : { description: parseLocalizedText(record.description) }),
    ...(icon === undefined ? {} : { icon: cloneJson(icon) as NormalizedPluginDisplay['icon'] }),
  };
};

const parseSource = (value: unknown): 'builtin' | 'external' => {
  if (value !== 'builtin' && value !== 'external') {
    throw new TypeError('Plugin registration source is invalid.');
  }
  return value;
};

const parseNormalizedManifest = (value: unknown): NormalizedPluginManifest => {
  if (!isRecord(value) || !isRecord(value.compatibility)) {
    throw new TypeError('Plugin registration Manifest is invalid.');
  }
  const validation = validatePluginManifest(value);
  if (validation.status !== 'valid') {
    throw new TypeError('Plugin registration Manifest is invalid.');
  }
  const lensx = value.compatibility.lensx;
  const hostApi = value.compatibility.host_api;
  if (
    !isRecord(lensx) ||
    !isRecord(hostApi) ||
    typeof lensx.min_version !== 'string' ||
    typeof hostApi.min_version !== 'string'
  ) {
    throw new TypeError('Plugin registration Manifest compatibility is invalid.');
  }
  const normalized = normalizePluginManifest(validation, {
    lensx: lensx.min_version,
    host_api: hostApi.min_version,
  }).manifest;
  if (canonicalJson(normalized) !== canonicalJson(value)) {
    throw new TypeError('Plugin registration Manifest is not normalized.');
  }
  return cloneJson(normalized);
};

const parseAvailability = (value: unknown): PluginManagerAvailability => {
  const record = assertRecord(
    value,
    ['kind'],
    value && isRecord(value) && value.kind === 'degraded' ? ['diagnostic'] : [],
  );
  if (record.kind === 'available') {
    return { kind: 'available' };
  }
  if (record.kind === 'degraded' && Object.hasOwn(record, 'diagnostic')) {
    return { kind: 'degraded', diagnostic: parseDiagnostic(record.diagnostic) };
  }
  throw new TypeError('Plugin Manager availability is invalid.');
};

const parseSummary = (value: unknown): PluginRegistrationSummary => {
  if (!isRecord(value)) {
    throw new TypeError('Plugin registration summary is invalid.');
  }
  if (value.kind === 'registered') {
    const record = assertRecord(value, [
      'kind',
      'entry_id',
      'plugin_id',
      'version',
      'display',
      'source',
      'enabled',
      'compatibility',
      'runtime',
    ]);
    if (
      typeof record.plugin_id !== 'string' ||
      record.plugin_id.length === 0 ||
      typeof record.version !== 'string' ||
      record.version.length === 0 ||
      typeof record.enabled !== 'boolean'
    ) {
      throw new TypeError('Registered plugin summary is invalid.');
    }
    return {
      kind: 'registered',
      entry_id: parseEntryId(record.entry_id),
      plugin_id: record.plugin_id,
      version: record.version,
      display: parseDisplay(record.display),
      source: parseSource(record.source),
      enabled: record.enabled,
      compatibility: parseCompatibility(record.compatibility),
      runtime: parseRuntime(record.runtime),
    };
  }
  if (value.kind === 'quarantined') {
    const record = assertRecord(value, ['kind', 'entry_id', 'diagnostic'], ['plugin_id']);
    if (record.plugin_id !== undefined && (typeof record.plugin_id !== 'string' || record.plugin_id.length === 0)) {
      throw new TypeError('Quarantine plugin identity is invalid.');
    }
    return {
      kind: 'quarantined',
      entry_id: parseEntryId(record.entry_id),
      ...(typeof record.plugin_id === 'string' ? { plugin_id: record.plugin_id } : {}),
      diagnostic: parseDiagnostic(record.diagnostic),
    };
  }
  throw new TypeError('Plugin registration summary variant is invalid.');
};

const parseDetail = (value: unknown): PluginRegistrationDetail => {
  if (!isRecord(value)) {
    throw new TypeError('Plugin registration detail is invalid.');
  }
  if (value.kind === 'registered') {
    const record = assertRecord(value, [
      'kind',
      'entry_id',
      'manifest',
      'source',
      'enabled',
      'compatibility',
      'granted_permission_ids',
      'runtime',
      'diagnostics',
    ]);
    if (
      typeof record.enabled !== 'boolean' ||
      !Array.isArray(record.granted_permission_ids) ||
      !Array.isArray(record.diagnostics)
    ) {
      throw new TypeError('Registered plugin detail is invalid.');
    }
    const grants = record.granted_permission_ids;
    if (
      grants.some((grant) => typeof grant !== 'string' || !PERMISSION_ID_PATTERN.test(grant)) ||
      grants.some((grant, index) => index > 0 && grants[index - 1] >= grant)
    ) {
      throw new TypeError('Plugin registration grants must be sorted and unique.');
    }
    return {
      kind: 'registered',
      entry_id: parseEntryId(record.entry_id),
      manifest: parseNormalizedManifest(record.manifest),
      source: parseSource(record.source),
      enabled: record.enabled,
      compatibility: parseCompatibility(record.compatibility),
      granted_permission_ids: [...grants] as string[],
      runtime: parseRuntime(record.runtime),
      diagnostics: record.diagnostics.map(parseDiagnostic),
    };
  }
  if (value.kind === 'quarantined') {
    const record = assertRecord(value, ['kind', 'entry_id', 'diagnostic'], ['plugin_id']);
    if (record.plugin_id !== undefined && (typeof record.plugin_id !== 'string' || record.plugin_id.length === 0)) {
      throw new TypeError('Quarantine plugin identity is invalid.');
    }
    return {
      kind: 'quarantined',
      entry_id: parseEntryId(record.entry_id),
      ...(typeof record.plugin_id === 'string' ? { plugin_id: record.plugin_id } : {}),
      diagnostic: parseDiagnostic(record.diagnostic),
    };
  }
  throw new TypeError('Plugin registration detail variant is invalid.');
};

export const parsePluginRegistrationSnapshot = (value: unknown): PluginRegistrationSnapshot => {
  const record = assertRecord(value, ['contract_version', 'revision', 'availability', 'entries']);
  if (!Array.isArray(record.entries)) {
    throw new TypeError('Plugin registration snapshot entries are invalid.');
  }
  const entries = record.entries.map(parseSummary);
  if (entries.some((entry, index) => index > 0 && entries[index - 1].entry_id >= entry.entry_id)) {
    throw new TypeError('Plugin registration snapshot entries must be sorted and unique.');
  }
  return deepFreeze({
    contract_version: parseContractVersion(record.contract_version),
    revision: parseRevision(record.revision),
    availability: parseAvailability(record.availability),
    entries,
  });
};

export const parsePluginRegistrationDetailResponse = (value: unknown): PluginRegistrationDetailResponse => {
  const record = assertRecord(value, ['contract_version', 'revision', 'detail']);
  return deepFreeze({
    contract_version: parseContractVersion(record.contract_version),
    revision: parseRevision(record.revision),
    detail: parseDetail(record.detail),
  });
};

export const parsePluginRegistrationChangedEvent = (value: unknown): PluginRegistrationChangedEvent => {
  const record = assertRecord(value, ['contract_version', 'revision']);
  return deepFreeze({
    contract_version: parseContractVersion(record.contract_version),
    revision: parseRevision(record.revision),
  });
};

export const parsePluginRegistrationQueryError = (value: unknown): PluginRegistrationQueryErrorPayload => {
  const record = assertRecord(value, ['code', 'operation', 'message']);
  if (
    typeof record.code !== 'string' ||
    !(record.code in QUERY_ERROR_MESSAGES) ||
    (record.operation !== 'read_snapshot' && record.operation !== 'read_detail') ||
    record.message !== QUERY_ERROR_MESSAGES[record.code as keyof typeof QUERY_ERROR_MESSAGES]
  ) {
    throw new TypeError('Plugin registration query error is invalid.');
  }
  if ((record.code === 'invalid_request' || record.code === 'not_found') && record.operation !== 'read_detail') {
    throw new TypeError('Plugin registration query error operation is invalid.');
  }
  return deepFreeze({
    code: record.code as PluginRegistrationQueryErrorPayload['code'],
    operation: record.operation,
    message: record.message as string,
  });
};
