import { validateHostApiResult } from '@lensx/plugin-contract';

import {
  PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION,
  type PluginScopedStorageBoundaryErrorPayload,
  type PluginScopedStorageBoundaryRequest,
  type PluginScopedStorageBoundaryResult,
  type PluginScopedStorageErrorCode,
  type PluginScopedStorageIdentity,
  type PluginScopedStorageOperation,
  type PluginScopedStorageRequest,
  type PluginScopedStorageResult,
} from './types';

const ENTRY_ID_PATTERN = /^entry_[0-9a-f]{16}$/u;
const PLUGIN_ID_PATTERN = /^(?:[a-z][a-z0-9_-]{0,63}\.)+[a-z][a-z0-9_-]{0,63}$/u;
const SEMVER_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export const PLUGIN_SCOPED_STORAGE_ERROR_MESSAGES = Object.freeze({
  cancelled: 'Plugin storage request was cancelled.',
  conflict: 'Plugin storage state changed.',
  internal_error: 'Plugin storage request failed.',
  invalid_params: 'Plugin storage parameters are invalid.',
  limit_exceeded: 'Plugin storage limit was exceeded.',
  unavailable: 'Plugin storage is unavailable.',
}) satisfies Readonly<Record<PluginScopedStorageErrorCode, string>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exact = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new TypeError('Plugin storage payload has an invalid field set.');
  }
  return value;
};

const freeze = <Value>(value: Value): Value => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
};

const parseIdentity = (value: unknown): PluginScopedStorageIdentity => {
  const identity = exact(value, ['entry_id', 'plugin_id', 'version']);
  if (
    typeof identity.entry_id !== 'string' ||
    !ENTRY_ID_PATTERN.test(identity.entry_id) ||
    typeof identity.plugin_id !== 'string' ||
    identity.plugin_id.length > 255 ||
    !PLUGIN_ID_PATTERN.test(identity.plugin_id) ||
    typeof identity.version !== 'string' ||
    !SEMVER_PATTERN.test(identity.version)
  ) {
    throw new TypeError('Plugin storage identity is invalid.');
  }
  return freeze({
    entry_id: identity.entry_id,
    plugin_id: identity.plugin_id,
    version: identity.version,
  });
};

const parseOperation = (value: unknown): PluginScopedStorageOperation => {
  if (!isRecord(value) || typeof value.kind !== 'string') throw new TypeError('Plugin storage operation is invalid.');
  switch (value.kind) {
    case 'delete':
    case 'get': {
      const operation = exact(value, ['kind', 'key']);
      if (typeof operation.key !== 'string') throw new TypeError('Plugin storage key is invalid.');
      return freeze({ kind: value.kind, key: operation.key });
    }
    case 'get_quota':
      exact(value, ['kind']);
      return freeze({ kind: 'get_quota' });
    case 'list': {
      const keys = [
        'kind',
        ...(Object.hasOwn(value, 'cursor') ? ['cursor'] : []),
        ...(Object.hasOwn(value, 'limit') ? ['limit'] : []),
      ];
      const operation = exact(value, keys);
      if (
        (operation.cursor !== undefined && typeof operation.cursor !== 'string') ||
        (operation.limit !== undefined &&
          (!Number.isInteger(operation.limit) || Number(operation.limit) < 1 || Number(operation.limit) > 1000))
      ) {
        throw new TypeError('Plugin storage list operation is invalid.');
      }
      return freeze({
        kind: 'list',
        ...(typeof operation.cursor === 'string' ? { cursor: operation.cursor } : {}),
        ...(typeof operation.limit === 'number' ? { limit: operation.limit } : {}),
      });
    }
    case 'set': {
      const operation = exact(value, ['kind', 'key', 'value']);
      if (typeof operation.key !== 'string') throw new TypeError('Plugin storage key is invalid.');
      return freeze({ kind: 'set', key: operation.key, value: operation.value });
    }
    default:
      throw new TypeError('Plugin storage operation is invalid.');
  }
};

export const toPluginScopedStorageBoundaryRequest = (
  identity: PluginScopedStorageIdentity,
  request: PluginScopedStorageRequest,
): PluginScopedStorageBoundaryRequest => {
  const operation: PluginScopedStorageOperation =
    request.method === 'storage.get'
      ? { kind: 'get', key: request.params.key }
      : request.method === 'storage.set'
        ? { kind: 'set', key: request.params.key, value: request.params.value }
        : request.method === 'storage.delete'
          ? { kind: 'delete', key: request.params.key }
          : request.method === 'storage.list'
            ? { kind: 'list', ...request.params }
            : { kind: 'get_quota' };
  return parsePluginScopedStorageBoundaryRequest({
    contract_version: PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION,
    identity,
    operation,
  });
};

export const parsePluginScopedStorageBoundaryRequest = (value: unknown): PluginScopedStorageBoundaryRequest => {
  const request = exact(value, ['contract_version', 'identity', 'operation']);
  if (request.contract_version !== PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION) {
    throw new TypeError('Unsupported plugin storage contract.');
  }
  return freeze({
    contract_version: PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION,
    identity: parseIdentity(request.identity),
    operation: parseOperation(request.operation),
  });
};

export const parsePluginScopedStorageBoundaryResult = (
  value: unknown,
  method: PluginScopedStorageRequest['method'],
): PluginScopedStorageResult => {
  const payload = exact(value, ['contract_version', 'operation', 'result']);
  if (payload.contract_version !== PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION) {
    throw new TypeError('Unsupported plugin storage contract.');
  }
  const expectedOperation = method.slice('storage.'.length);
  if (payload.operation !== expectedOperation) throw new TypeError('Plugin storage operation does not match.');
  const result = validateHostApiResult({ method, result: payload.result });
  if (result.status === 'invalid') throw new TypeError('Plugin storage result is invalid.');
  return result.value as PluginScopedStorageResult;
};

export const parsePluginScopedStorageBoundaryError = (value: unknown): PluginScopedStorageBoundaryErrorPayload => {
  const payload = exact(value, ['contract_version', 'code', 'operation', 'message']);
  if (
    payload.contract_version !== PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION ||
    typeof payload.code !== 'string' ||
    !(payload.code in PLUGIN_SCOPED_STORAGE_ERROR_MESSAGES) ||
    !['delete', 'get', 'get_quota', 'list', 'set'].includes(String(payload.operation)) ||
    payload.message !== PLUGIN_SCOPED_STORAGE_ERROR_MESSAGES[payload.code as PluginScopedStorageErrorCode]
  ) {
    throw new TypeError('Plugin storage error is invalid.');
  }
  return freeze(payload as unknown as PluginScopedStorageBoundaryErrorPayload);
};

export const parsePluginScopedStorageBoundaryResultEnvelope = (value: unknown): PluginScopedStorageBoundaryResult => {
  const payload = exact(value, ['contract_version', 'operation', 'result']);
  if (
    payload.contract_version !== PLUGIN_SCOPED_STORAGE_CONTRACT_VERSION ||
    !['delete', 'get', 'get_quota', 'list', 'set'].includes(String(payload.operation))
  ) {
    throw new TypeError('Plugin storage result envelope is invalid.');
  }
  return freeze(payload as unknown as PluginScopedStorageBoundaryResult);
};
