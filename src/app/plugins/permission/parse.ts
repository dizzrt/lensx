import type { HostApiPermission, HostApiRequest } from '@lensx/plugin-contract';
import {
  PLUGIN_CLIPBOARD_MAX_TEXT_LENGTH,
  PLUGIN_PERMISSION_CONTRACT_VERSION,
  PluginClipboardBoundaryError,
  type PluginClipboardBoundaryRequest,
  type PluginClipboardBoundaryResult,
  type PluginClipboardErrorCode,
  PluginPermissionGrantError,
  type PluginPermissionGrantErrorCode,
  type SetPluginPermissionGrantRequest,
  type SetPluginPermissionGrantResult,
} from './types';

const ENTRY_ID_PATTERN = /^entry_[0-9a-f]{16}$/u;
const REVISION_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const GRANT_CODES = new Set<PluginPermissionGrantErrorCode>([
  'invalid_request',
  'conflict',
  'not_found',
  'unsupported',
  'persist_failed',
  'unavailable',
  'internal',
]);
const CLIPBOARD_CODES = new Set<PluginClipboardErrorCode>([
  'invalid_request',
  'permission_denied',
  'unavailable',
  'limit_exceeded',
  'cancelled',
  'internal_error',
]);
const GRANT_MESSAGES: Record<PluginPermissionGrantErrorCode, string> = {
  invalid_request: 'Plugin permission request is invalid.',
  conflict: 'Plugin permission state changed.',
  not_found: 'Plugin permission target was not found.',
  unsupported: 'Plugin permission is unsupported.',
  persist_failed: 'Plugin permission could not be saved.',
  unavailable: 'Plugin permission service is unavailable.',
  internal: 'Plugin permission request failed.',
};
const CLIPBOARD_MESSAGES: Record<PluginClipboardErrorCode, string> = {
  invalid_request: 'Plugin clipboard request is invalid.',
  permission_denied: 'Plugin clipboard permission was denied.',
  unavailable: 'Plugin clipboard is unavailable.',
  limit_exceeded: 'Plugin clipboard text limit was exceeded.',
  cancelled: 'Plugin clipboard request was cancelled.',
  internal_error: 'Plugin clipboard request failed.',
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const operationFromRequest = (request: HostApiRequest): 'read' | 'write' =>
  request.method === 'clipboard.read' ? 'read' : 'write';
const canonicalRevision = (value: unknown): value is string =>
  typeof value === 'string' && REVISION_PATTERN.test(value);
const knownPermission = (value: unknown): value is HostApiPermission =>
  value === 'clipboard.read' || value === 'clipboard.write';

export const parseSetPluginPermissionGrantRequest = (value: unknown): SetPluginPermissionGrantRequest => {
  if (
    !isRecord(value) ||
    !exact(value, ['contract_version', 'entry_id', 'expected_revision', 'permission_id', 'granted']) ||
    value.contract_version !== PLUGIN_PERMISSION_CONTRACT_VERSION ||
    typeof value.entry_id !== 'string' ||
    !ENTRY_ID_PATTERN.test(value.entry_id) ||
    !canonicalRevision(value.expected_revision) ||
    !knownPermission(value.permission_id) ||
    typeof value.granted !== 'boolean'
  ) {
    throw new PluginPermissionGrantError({
      code: 'invalid_boundary_payload',
      message: 'Plugin permission boundary request is invalid.',
    });
  }
  return Object.freeze({
    contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION,
    entry_id: value.entry_id,
    expected_revision: value.expected_revision,
    permission_id: value.permission_id,
    granted: value.granted,
  });
};

export const toSetPluginPermissionGrantRequest = (input: {
  readonly entry_id: string;
  readonly expected_revision: string;
  readonly permission_id: HostApiPermission;
  readonly granted: boolean;
}): SetPluginPermissionGrantRequest => {
  if (!ENTRY_ID_PATTERN.test(input.entry_id) || !REVISION_PATTERN.test(input.expected_revision)) {
    throw new PluginPermissionGrantError({
      code: 'invalid_boundary_payload',
      message: 'Plugin permission boundary request is invalid.',
    });
  }
  return parseSetPluginPermissionGrantRequest({ contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION, ...input });
};

export const parsePluginClipboardBoundaryRequest = (value: unknown): PluginClipboardBoundaryRequest => {
  if (
    !isRecord(value) ||
    !exact(value, ['contract_version', 'identity', 'operation']) ||
    value.contract_version !== PLUGIN_PERMISSION_CONTRACT_VERSION
  ) {
    throw new TypeError('Plugin clipboard boundary request is invalid.');
  }
  const identity = value.identity;
  const operation = value.operation;
  if (
    !isRecord(identity) ||
    !exact(identity, ['entry_id', 'plugin_id', 'version', 'registration_revision']) ||
    typeof identity.entry_id !== 'string' ||
    !ENTRY_ID_PATTERN.test(identity.entry_id) ||
    typeof identity.plugin_id !== 'string' ||
    identity.plugin_id.length === 0 ||
    identity.plugin_id.length > 255 ||
    typeof identity.version !== 'string' ||
    identity.version.length === 0 ||
    identity.version.length > 128 ||
    !canonicalRevision(identity.registration_revision) ||
    !isRecord(operation) ||
    (operation.kind === 'read'
      ? !exact(operation, ['kind'])
      : operation.kind === 'write'
        ? !exact(operation, ['kind', 'text']) ||
          typeof operation.text !== 'string' ||
          Array.from(operation.text).length > PLUGIN_CLIPBOARD_MAX_TEXT_LENGTH
        : true)
  ) {
    throw new TypeError('Plugin clipboard boundary request is invalid.');
  }
  const trustedIdentity = Object.freeze({
    entry_id: identity.entry_id,
    plugin_id: identity.plugin_id,
    version: identity.version,
    registration_revision: identity.registration_revision,
  });
  return operation.kind === 'read'
    ? Object.freeze({
        contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION,
        identity: trustedIdentity,
        operation: Object.freeze({ kind: 'read' as const }),
      })
    : Object.freeze({
        contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION,
        identity: trustedIdentity,
        operation: Object.freeze({ kind: 'write' as const, text: operation.text as string }),
      });
};

export const parseSetPluginPermissionGrantResult = (value: unknown): SetPluginPermissionGrantResult => {
  if (
    !isRecord(value) ||
    !exact(value, ['contract_version', 'status', 'revision']) ||
    value.contract_version !== PLUGIN_PERMISSION_CONTRACT_VERSION ||
    (value.status !== 'changed' && value.status !== 'unchanged') ||
    !canonicalRevision(value.revision)
  ) {
    throw new PluginPermissionGrantError({
      code: 'invalid_boundary_payload',
      message: 'Plugin permission boundary result is invalid.',
    });
  }
  return Object.freeze({
    contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION,
    status: value.status,
    revision: value.revision,
  });
};

export const parsePluginPermissionGrantError = (value: unknown) => {
  if (
    !isRecord(value) ||
    !exact(value, ['contract_version', 'code', 'operation', 'message']) ||
    value.contract_version !== PLUGIN_PERMISSION_CONTRACT_VERSION ||
    typeof value.code !== 'string' ||
    !GRANT_CODES.has(value.code as PluginPermissionGrantErrorCode) ||
    value.operation !== 'set_grant' ||
    value.message !== GRANT_MESSAGES[value.code as PluginPermissionGrantErrorCode]
  )
    throw new TypeError('Plugin permission boundary error is invalid.');
  return Object.freeze({
    contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION,
    code: value.code as PluginPermissionGrantErrorCode,
    operation: 'set_grant' as const,
    message: value.message as string,
  });
};

export const toPluginClipboardBoundaryRequest = (
  identity: {
    readonly entry_id: string;
    readonly plugin_id: string;
    readonly version: string;
    readonly registration_revision: string;
  },
  request: Extract<HostApiRequest, { readonly method: 'clipboard.read' | 'clipboard.write' }>,
): PluginClipboardBoundaryRequest => {
  const operation = operationFromRequest(request);
  if (
    !ENTRY_ID_PATTERN.test(identity.entry_id) ||
    !canonicalRevision(identity.registration_revision) ||
    identity.plugin_id.length === 0 ||
    identity.plugin_id.length > 255 ||
    identity.version.length === 0 ||
    identity.version.length > 128
  )
    throw new PluginClipboardBoundaryError({
      code: 'invalid_boundary_payload',
      operation,
      message: 'Plugin clipboard boundary request is invalid.',
    });
  const trustedIdentity = Object.freeze({
    entry_id: identity.entry_id,
    plugin_id: identity.plugin_id,
    version: identity.version,
    registration_revision: identity.registration_revision,
  });
  return parsePluginClipboardBoundaryRequest(
    request.method === 'clipboard.read'
      ? Object.freeze({
          contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION,
          identity: trustedIdentity,
          operation: Object.freeze({ kind: 'read' as const }),
        })
      : Object.freeze({
          contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION,
          identity: trustedIdentity,
          operation: Object.freeze({ kind: 'write' as const, text: request.params.text }),
        }),
  );
};

export const parsePluginClipboardBoundaryResult = (
  value: unknown,
  request: Extract<HostApiRequest, { readonly method: 'clipboard.read' | 'clipboard.write' }>,
): PluginClipboardBoundaryResult => {
  const operation = operationFromRequest(request);
  const valid =
    isRecord(value) &&
    value.contract_version === PLUGIN_PERMISSION_CONTRACT_VERSION &&
    value.operation === operation &&
    (operation === 'read'
      ? exact(value, ['contract_version', 'operation', 'text']) &&
        typeof value.text === 'string' &&
        Array.from(value.text).length <= PLUGIN_CLIPBOARD_MAX_TEXT_LENGTH
      : exact(value, ['contract_version', 'operation', 'written']) && value.written === true);
  if (!valid)
    throw new PluginClipboardBoundaryError({
      code: 'invalid_boundary_payload',
      operation,
      message: 'Plugin clipboard boundary result is invalid.',
    });
  return Object.freeze({ ...value }) as PluginClipboardBoundaryResult;
};

export const parsePluginClipboardBoundaryError = (value: unknown) => {
  if (
    !isRecord(value) ||
    !exact(value, ['contract_version', 'code', 'operation', 'message']) ||
    value.contract_version !== PLUGIN_PERMISSION_CONTRACT_VERSION ||
    typeof value.code !== 'string' ||
    !CLIPBOARD_CODES.has(value.code as PluginClipboardErrorCode) ||
    (value.operation !== 'read' && value.operation !== 'write') ||
    value.message !== CLIPBOARD_MESSAGES[value.code as PluginClipboardErrorCode]
  )
    throw new TypeError('Plugin clipboard boundary error is invalid.');
  return Object.freeze({
    contract_version: PLUGIN_PERMISSION_CONTRACT_VERSION,
    code: value.code as PluginClipboardErrorCode,
    operation: value.operation,
    message: value.message as string,
  });
};
