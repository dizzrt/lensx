export const PLUGIN_RUNTIME_SESSION_CONTRACT_VERSION = '0.1.0' as const;
export const PLUGIN_RUNTIME_SESSION_BOOTSTRAP_TYPE = 'lensx.plugin_runtime.bootstrap' as const;
export const PLUGIN_RUNTIME_SESSION_READY_TYPE = 'lensx.plugin_runtime.ready' as const;

const NONCE_PATTERN = /^[0-9a-f]{32}$/u;
const ENTRY_ID_PATTERN = /^entry_[0-9a-f]{16}$/u;
const RESOURCE_GENERATION_PATTERN = /^[0-9a-f]{32}$/u;
const REVISION_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const PERMISSION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,253}[a-z0-9])?$/u;

export interface PluginRuntimeSessionBootstrap {
  readonly contract_version: typeof PLUGIN_RUNTIME_SESSION_CONTRACT_VERSION;
  readonly type: typeof PLUGIN_RUNTIME_SESSION_BOOTSTRAP_TYPE;
  readonly nonce: string;
}

export interface PluginRuntimeSessionReadyAcknowledgement {
  readonly contract_version: typeof PLUGIN_RUNTIME_SESSION_CONTRACT_VERSION;
  readonly type: typeof PLUGIN_RUNTIME_SESSION_READY_TYPE;
  readonly nonce: string;
}

export type PluginRuntimeSessionState = 'awaiting_handshake' | 'ready' | 'disconnected' | 'disposed';

export type PluginRuntimeSessionErrorCode =
  | 'invalid_identity'
  | 'bootstrap_failed'
  | 'invalid_acknowledgement'
  | 'port_disconnected';

export class PluginRuntimeSessionError extends Error {
  readonly code: PluginRuntimeSessionErrorCode;

  constructor(code: PluginRuntimeSessionErrorCode) {
    super(
      code === 'invalid_identity'
        ? 'Plugin Runtime Session identity is invalid.'
        : code === 'bootstrap_failed'
          ? 'Plugin Runtime Session bootstrap failed.'
          : code === 'port_disconnected'
            ? 'Plugin Runtime Session port disconnected.'
            : 'Plugin Runtime Session acknowledgement is invalid.',
    );
    this.name = 'PluginRuntimeSessionError';
    this.code = code;
  }
}

export interface PluginRuntimeSessionIdentityInput {
  readonly entry_id: string;
  readonly plugin_id: string;
  readonly version: string;
  readonly page_id: string;
  readonly expected_origin: string;
  readonly resource_generation: string;
  readonly runtime_attempt_key: string;
  readonly registration_revision: string;
  readonly granted_permission_ids: readonly string[];
}

export interface PluginRuntimeSessionIdentity extends PluginRuntimeSessionIdentityInput {
  readonly granted_permission_ids: readonly string[];
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export const isPluginRuntimeSessionNonce = (value: unknown): value is string =>
  typeof value === 'string' && NONCE_PATTERN.test(value);

export const createPluginRuntimeSessionBootstrap = (nonce: string): PluginRuntimeSessionBootstrap => {
  if (!isPluginRuntimeSessionNonce(nonce)) throw new PluginRuntimeSessionError('bootstrap_failed');
  return Object.freeze({
    contract_version: PLUGIN_RUNTIME_SESSION_CONTRACT_VERSION,
    type: PLUGIN_RUNTIME_SESSION_BOOTSTRAP_TYPE,
    nonce,
  });
};

export const parsePluginRuntimeSessionReadyAcknowledgement = (
  value: unknown,
): PluginRuntimeSessionReadyAcknowledgement => {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['contract_version', 'type', 'nonce']) ||
    value.contract_version !== PLUGIN_RUNTIME_SESSION_CONTRACT_VERSION ||
    value.type !== PLUGIN_RUNTIME_SESSION_READY_TYPE ||
    !isPluginRuntimeSessionNonce(value.nonce)
  ) {
    throw new PluginRuntimeSessionError('invalid_acknowledgement');
  }
  return Object.freeze({
    contract_version: PLUGIN_RUNTIME_SESSION_CONTRACT_VERSION,
    type: PLUGIN_RUNTIME_SESSION_READY_TYPE,
    nonce: value.nonce,
  });
};

const isBoundedText = (value: string, maximum: number) =>
  value.length > 0 && value.length <= maximum && /^[\x20-\x7e]+$/u.test(value);

export const freezePluginRuntimeSessionIdentity = (
  input: PluginRuntimeSessionIdentityInput,
): PluginRuntimeSessionIdentity => {
  const grants = [...input.granted_permission_ids];
  const sortedGrants = [...new Set(grants)].sort();
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(input.expected_origin);
  } catch {
    throw new PluginRuntimeSessionError('invalid_identity');
  }
  if (
    !ENTRY_ID_PATTERN.test(input.entry_id) ||
    !isBoundedText(input.plugin_id, 255) ||
    !isBoundedText(input.version, 128) ||
    !isBoundedText(input.page_id, 255) ||
    !isBoundedText(input.expected_origin, 2048) ||
    (parsedOrigin.pathname !== '' && parsedOrigin.pathname !== '/') ||
    parsedOrigin.search !== '' ||
    parsedOrigin.hash !== '' ||
    !RESOURCE_GENERATION_PATTERN.test(input.resource_generation) ||
    !isBoundedText(input.runtime_attempt_key, 512) ||
    !REVISION_PATTERN.test(input.registration_revision) ||
    grants.length !== sortedGrants.length ||
    grants.some((grant, index) => grant !== sortedGrants[index] || !PERMISSION_ID_PATTERN.test(grant))
  ) {
    throw new PluginRuntimeSessionError('invalid_identity');
  }
  return Object.freeze({
    ...input,
    granted_permission_ids: Object.freeze(sortedGrants),
  });
};
