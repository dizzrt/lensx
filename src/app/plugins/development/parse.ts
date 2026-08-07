import { isPluginRegistrationEntryId } from '../registration';
import {
  PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
  type PluginDevelopmentCapabilitySnapshot,
  type PluginDevelopmentErrorPayload,
  type PluginDevelopmentResult,
} from './types';

const REVISION = /^(?:0|[1-9][0-9]*)$/u;
const ERROR_CODES = new Set([
  'invalid_request',
  'disabled',
  'unavailable',
  'invalid',
  'incompatible',
  'source_changed',
  'conflict',
  'unsafe_state',
  'cleanup_pending',
  'internal',
]);
const OPERATIONS = new Set(['read_capability', 'set_mode', 'register', 'reload', 'remove', 'cleanup']);
const MESSAGES: Record<string, string> = {
  invalid_request: 'The plugin development request is invalid.',
  disabled: 'Plugin Development Mode is disabled.',
  unavailable: 'Plugin Development Mode is unavailable.',
  invalid: 'The selected development directory is invalid.',
  incompatible: 'The selected plugin is not compatible with this version of lensX.',
  source_changed: 'The development directory changed while it was being read.',
  conflict: 'Plugin development state changed before the operation completed.',
  unsafe_state: 'Plugin development storage state is unsafe.',
  cleanup_pending: 'The operation completed, but snapshot cleanup is still pending.',
  internal: 'The plugin development operation failed.',
};

const record = (value: unknown, keys: readonly string[]) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Invalid payload.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).sort().join('|') !== [...keys].sort().join('|')) throw new TypeError('Invalid payload.');
  return result;
};
const version = (value: unknown) => {
  if (value !== PLUGIN_DEVELOPMENT_CONTRACT_VERSION) throw new TypeError('Unsupported contract.');
};
const revision = (value: unknown) => {
  if (typeof value !== 'string' || !REVISION.test(value)) throw new TypeError('Invalid revision.');
};
const text = (value: unknown) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) throw new TypeError('Invalid text.');
};

export const parsePluginDevelopmentCapability = (value: unknown): PluginDevelopmentCapabilitySnapshot => {
  const input = record(value, ['contract_version', 'supported', 'enabled']);
  version(input.contract_version);
  if (
    typeof input.supported !== 'boolean' ||
    typeof input.enabled !== 'boolean' ||
    (!input.supported && input.enabled)
  ) {
    throw new TypeError('Invalid capability.');
  }
  return Object.freeze({
    contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
    supported: input.supported,
    enabled: input.enabled,
  });
};

export const parsePluginDevelopmentResult = (value: unknown): PluginDevelopmentResult => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Invalid result.');
  const status = (value as Record<string, unknown>).status;
  const keys: Record<string, readonly string[]> = {
    cancelled: ['status', 'contract_version'],
    mode_updated: ['status', 'contract_version', 'enabled', 'changed'],
    registered: ['status', 'contract_version', 'entry_id', 'plugin_id', 'version', 'revision'],
    reloaded: ['status', 'contract_version', 'entry_id', 'plugin_id', 'version', 'revision', 'cleanup'],
    removed: ['status', 'contract_version', 'revision', 'cleanup'],
  };
  if (typeof status !== 'string' || !(status in keys)) throw new TypeError('Invalid result status.');
  const resultKeys = keys[status];
  if (!resultKeys) throw new TypeError('Invalid result status.');
  const input = record(value, resultKeys);
  version(input.contract_version);
  if (status === 'mode_updated') {
    if (typeof input.enabled !== 'boolean' || typeof input.changed !== 'boolean')
      throw new TypeError('Invalid mode result.');
  } else if (status !== 'cancelled') {
    revision(input.revision);
    if (status !== 'removed') {
      if (!isPluginRegistrationEntryId(input.entry_id)) throw new TypeError('Invalid entry identity.');
      text(input.plugin_id);
      text(input.version);
    }
    if (
      (status === 'reloaded' || status === 'removed') &&
      input.cleanup !== 'complete' &&
      input.cleanup !== 'pending'
    ) {
      throw new TypeError('Invalid cleanup status.');
    }
  }
  return Object.freeze(structuredClone(input)) as PluginDevelopmentResult;
};

export const parsePluginDevelopmentError = (value: unknown): PluginDevelopmentErrorPayload => {
  const input = record(value, ['contract_version', 'code', 'operation', 'message']);
  version(input.contract_version);
  if (
    typeof input.code !== 'string' ||
    !ERROR_CODES.has(input.code) ||
    typeof input.operation !== 'string' ||
    !OPERATIONS.has(input.operation) ||
    input.message !== MESSAGES[input.code]
  )
    throw new TypeError('Invalid error payload.');
  return Object.freeze(structuredClone(input)) as unknown as PluginDevelopmentErrorPayload;
};
