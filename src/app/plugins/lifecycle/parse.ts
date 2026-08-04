import {
  PLUGIN_LIFECYCLE_CONTRACT_VERSION,
  type PluginLifecycleDataPolicy,
  type PluginLifecycleErrorCode,
  type PluginLifecycleErrorPayload,
  type PluginLifecycleOperation,
  type PluginLifecycleResult,
  type SetPluginEnabledResult,
  type UninstallPluginResult,
} from './types';

const ENTRY_ID_PATTERN = /^entry_[0-9a-f]{16}$/u;
const PLUGIN_ID_PATTERN = /^(?:[a-z][a-z0-9_-]{0,63}\.)+[a-z][a-z0-9_-]{0,63}$/u;
const REVISION_PATTERN = /^(?:0|[1-9][0-9]*)$/u;

const ERROR_MESSAGES: Readonly<Record<PluginLifecycleErrorCode, string>> = Object.freeze({
  invalid_request: 'Plugin lifecycle request is invalid.',
  conflict: 'Plugin lifecycle request conflicts with current state.',
  invalid_state: 'Plugin lifecycle operation is not valid for this entry.',
  not_found: 'Plugin lifecycle entry was not found.',
  busy: 'Another plugin lifecycle operation is in progress.',
  unavailable: 'Plugin lifecycle storage is unavailable.',
  persist_failed: 'Plugin lifecycle state could not be saved.',
  operation_not_supported: 'Plugin lifecycle operation is not supported for this entry.',
  unsafe_cleanup: 'Plugin lifecycle cleanup evidence is unsafe.',
  internal: 'Plugin lifecycle operation failed.',
});

const OPERATIONS = new Set<PluginLifecycleOperation>(['set_enabled', 'uninstall']);
const OUTCOMES = new Set(['changed', 'unchanged']);
const DATA_POLICIES = new Set<PluginLifecycleDataPolicy>(['retain_data', 'delete_data']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertRecord = (value: unknown, required: readonly string[], optional: readonly string[] = []) => {
  if (!isRecord(value)) {
    throw new TypeError('Plugin lifecycle payload is not an object.');
  }
  const allowed = new Set([...required, ...optional]);
  if (!required.every((key) => Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError('Plugin lifecycle payload has an invalid field set.');
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

const parseCommon = (record: Record<string, unknown>) => {
  if (
    record.contract_version !== PLUGIN_LIFECYCLE_CONTRACT_VERSION ||
    typeof record.outcome !== 'string' ||
    !OUTCOMES.has(record.outcome) ||
    typeof record.entry_id !== 'string' ||
    !ENTRY_ID_PATTERN.test(record.entry_id) ||
    typeof record.revision !== 'string' ||
    !REVISION_PATTERN.test(record.revision)
  ) {
    throw new TypeError('Plugin lifecycle result has invalid common fields.');
  }
  return {
    contract_version: record.contract_version,
    outcome: record.outcome as 'changed' | 'unchanged',
    entry_id: record.entry_id,
    revision: record.revision,
  } as const;
};

export const parsePluginLifecycleResult = (value: unknown): PluginLifecycleResult => {
  if (!isRecord(value)) {
    throw new TypeError('Plugin lifecycle result is invalid.');
  }
  if (value.operation === 'set_enabled') {
    const record = assertRecord(value, [
      'operation',
      'contract_version',
      'outcome',
      'entry_id',
      'plugin_id',
      'revision',
      'enabled',
      'effective_available',
      'cleanup',
    ]);
    const common = parseCommon(record);
    if (
      typeof record.plugin_id !== 'string' ||
      !PLUGIN_ID_PATTERN.test(record.plugin_id) ||
      typeof record.enabled !== 'boolean' ||
      typeof record.effective_available !== 'boolean' ||
      record.cleanup !== 'not_applicable'
    ) {
      throw new TypeError('Set-enabled lifecycle result is invalid.');
    }
    return deepFreeze({
      operation: 'set_enabled',
      ...common,
      plugin_id: record.plugin_id,
      enabled: record.enabled,
      effective_available: record.effective_available,
      cleanup: 'not_applicable',
    } satisfies SetPluginEnabledResult);
  }
  if (value.operation === 'uninstall') {
    const record = assertRecord(
      value,
      [
        'operation',
        'contract_version',
        'outcome',
        'entry_id',
        'revision',
        'effective_available',
        'cleanup',
        'data_policy',
      ],
      ['plugin_id'],
    );
    const common = parseCommon(record);
    if (
      (record.plugin_id !== undefined &&
        (typeof record.plugin_id !== 'string' || !PLUGIN_ID_PATTERN.test(record.plugin_id))) ||
      record.effective_available !== false ||
      (record.cleanup !== 'complete' && record.cleanup !== 'pending') ||
      typeof record.data_policy !== 'string' ||
      !DATA_POLICIES.has(record.data_policy as PluginLifecycleDataPolicy)
    ) {
      throw new TypeError('Uninstall lifecycle result is invalid.');
    }
    return deepFreeze({
      operation: 'uninstall',
      ...common,
      ...(record.plugin_id === undefined ? {} : { plugin_id: record.plugin_id }),
      effective_available: false,
      cleanup: record.cleanup,
      data_policy: record.data_policy as PluginLifecycleDataPolicy,
    } satisfies UninstallPluginResult);
  }
  throw new TypeError('Plugin lifecycle result operation is invalid.');
};

export const parsePluginLifecycleError = (value: unknown): PluginLifecycleErrorPayload => {
  const record = assertRecord(value, ['contract_version', 'code', 'operation', 'message']);
  if (
    record.contract_version !== PLUGIN_LIFECYCLE_CONTRACT_VERSION ||
    typeof record.code !== 'string' ||
    !(record.code in ERROR_MESSAGES) ||
    typeof record.operation !== 'string' ||
    !OPERATIONS.has(record.operation as PluginLifecycleOperation) ||
    record.message !== ERROR_MESSAGES[record.code as PluginLifecycleErrorCode]
  ) {
    throw new TypeError('Plugin lifecycle error is invalid.');
  }
  return deepFreeze({
    contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
    code: record.code as PluginLifecycleErrorCode,
    operation: record.operation as PluginLifecycleOperation,
    message: record.message,
  });
};
