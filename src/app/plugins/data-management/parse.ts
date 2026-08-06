import {
  type ClearPluginDataRequest,
  type ClearPluginDataResult,
  PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION,
  type PluginDataManagementErrorCode,
  type PluginDataManagementErrorPayload,
} from './types';

const ENTRY_ID_PATTERN = /^entry_[0-9a-f]{16}$/u;
const REVISION_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const ERROR_MESSAGES: Readonly<Record<PluginDataManagementErrorCode, string>> = Object.freeze({
  conflict: 'Plugin data management request conflicts with current state.',
  internal: 'Plugin data management operation failed.',
  invalid_request: 'Plugin data management request is invalid.',
  not_found: 'Plugin data management entry was not found.',
  operation_not_supported: 'Plugin data management is not supported for this entry.',
  plugin_enabled: 'Plugin data can be cleared only while the plugin is disabled.',
  unavailable: 'Plugin data management is unavailable.',
  unsafe_storage: 'Plugin data storage cannot be cleared safely.',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exact = (value: unknown, keys: readonly string[]) => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new TypeError('Plugin data management payload has an invalid field set.');
  }
  return value;
};

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

const version = (value: unknown) => {
  if (value !== PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION) {
    throw new TypeError('Plugin data management contract version is unsupported.');
  }
  return value;
};

const entryId = (value: unknown) => {
  if (typeof value !== 'string' || !ENTRY_ID_PATTERN.test(value)) {
    throw new TypeError('Plugin data management entry identity is invalid.');
  }
  return value;
};

const revision = (value: unknown) => {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
    throw new TypeError('Plugin data management revision is invalid.');
  }
  return value;
};

export const parseClearPluginDataRequest = (value: unknown): ClearPluginDataRequest => {
  const payload = exact(value, ['contract_version', 'entry_id', 'expected_revision']);
  return freeze({
    contract_version: version(payload.contract_version),
    entry_id: entryId(payload.entry_id),
    expected_revision: revision(payload.expected_revision),
  });
};

export const parseClearPluginDataResult = (value: unknown): ClearPluginDataResult => {
  const payload = exact(value, ['contract_version', 'current_revision', 'changed']);
  if (typeof payload.changed !== 'boolean') {
    throw new TypeError('Plugin data management result is invalid.');
  }
  return freeze({
    contract_version: version(payload.contract_version),
    current_revision: revision(payload.current_revision),
    changed: payload.changed,
  });
};

export const parsePluginDataManagementError = (value: unknown): PluginDataManagementErrorPayload => {
  const payload = exact(value, ['contract_version', 'code', 'operation', 'message']);
  if (
    payload.contract_version !== PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION ||
    typeof payload.code !== 'string' ||
    !(payload.code in ERROR_MESSAGES) ||
    payload.operation !== 'clear_plugin_data' ||
    payload.message !== ERROR_MESSAGES[payload.code as PluginDataManagementErrorCode]
  ) {
    throw new TypeError('Plugin data management error is invalid.');
  }
  return freeze(payload as unknown as PluginDataManagementErrorPayload);
};
