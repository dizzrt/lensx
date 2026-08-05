import type {
  HostApiMethod,
  HostApiPermission,
  HostApiRequest,
  HostApiResult,
  NormalizedPluginManifest,
} from '@lensx/plugin-contract';

import type { PluginRuntimeSessionIdentity } from '../runtime/session-contract';

export const PLUGIN_PERMISSION_CONTRACT_VERSION = '0.1.0' as const;
export const SET_PLUGIN_PERMISSION_GRANT_COMMAND = 'set_plugin_permission_grant' as const;
export const PLUGIN_CLIPBOARD_COMMAND = 'plugin_clipboard' as const;
export const PLUGIN_CLIPBOARD_MAX_TEXT_LENGTH = 1_048_576;

export type PluginPermissionRisk = 'standard' | 'sensitive';
export interface PluginPermissionCatalogEntry {
  readonly permission_id: HostApiPermission;
  readonly risk: PluginPermissionRisk;
  readonly methods: readonly HostApiMethod[];
  readonly supported: boolean;
}
export type EffectivePluginPermissionState = 'not_requested' | 'unsupported' | 'not_granted' | 'granted';
export interface EffectivePluginPermission {
  readonly permission_id: string;
  readonly risk?: PluginPermissionRisk;
  readonly methods: readonly HostApiMethod[];
  readonly supported: boolean;
  readonly state: EffectivePluginPermissionState;
  readonly reason?: NormalizedPluginManifest['requested_permissions'][number]['reason'];
}

export interface SetPluginPermissionGrantRequest {
  readonly contract_version: typeof PLUGIN_PERMISSION_CONTRACT_VERSION;
  readonly entry_id: string;
  readonly expected_revision: string;
  readonly permission_id: HostApiPermission;
  readonly granted: boolean;
}
export interface SetPluginPermissionGrantResult {
  readonly contract_version: typeof PLUGIN_PERMISSION_CONTRACT_VERSION;
  readonly status: 'changed' | 'unchanged';
  readonly revision: string;
}
export type PluginPermissionGrantErrorCode =
  | 'invalid_request'
  | 'conflict'
  | 'not_found'
  | 'unsupported'
  | 'persist_failed'
  | 'unavailable'
  | 'internal';
export interface PluginPermissionGrantErrorPayload {
  readonly contract_version: typeof PLUGIN_PERMISSION_CONTRACT_VERSION;
  readonly code: PluginPermissionGrantErrorCode;
  readonly operation: 'set_grant';
  readonly message: string;
}
export class PluginPermissionGrantError extends Error {
  readonly code: PluginPermissionGrantErrorCode | 'invalid_boundary_payload';
  constructor(
    payload:
      | PluginPermissionGrantErrorPayload
      | { readonly code: 'invalid_boundary_payload'; readonly message: string },
  ) {
    super(payload.message);
    this.name = 'PluginPermissionGrantError';
    this.code = payload.code;
  }
}

export interface PluginClipboardIdentity {
  readonly entry_id: string;
  readonly plugin_id: string;
  readonly version: string;
  readonly registration_revision: string;
}
export type PluginClipboardBoundaryRequest =
  | {
      readonly contract_version: typeof PLUGIN_PERMISSION_CONTRACT_VERSION;
      readonly identity: PluginClipboardIdentity;
      readonly operation: { readonly kind: 'read' };
    }
  | {
      readonly contract_version: typeof PLUGIN_PERMISSION_CONTRACT_VERSION;
      readonly identity: PluginClipboardIdentity;
      readonly operation: { readonly kind: 'write'; readonly text: string };
    };
export type PluginClipboardBoundaryResult =
  | {
      readonly contract_version: typeof PLUGIN_PERMISSION_CONTRACT_VERSION;
      readonly operation: 'read';
      readonly text: string;
    }
  | {
      readonly contract_version: typeof PLUGIN_PERMISSION_CONTRACT_VERSION;
      readonly operation: 'write';
      readonly written: true;
    };
export type PluginClipboardErrorCode =
  | 'invalid_request'
  | 'permission_denied'
  | 'unavailable'
  | 'limit_exceeded'
  | 'cancelled'
  | 'internal_error';
export interface PluginClipboardErrorPayload {
  readonly contract_version: typeof PLUGIN_PERMISSION_CONTRACT_VERSION;
  readonly code: PluginClipboardErrorCode;
  readonly operation: 'read' | 'write';
  readonly message: string;
}
export class PluginClipboardBoundaryError extends Error {
  readonly code: PluginClipboardErrorCode | 'invalid_boundary_payload';
  readonly operation: 'read' | 'write';
  constructor(
    payload:
      | PluginClipboardErrorPayload
      | { readonly code: 'invalid_boundary_payload'; readonly operation: 'read' | 'write'; readonly message: string },
  ) {
    super(payload.message);
    this.name = 'PluginClipboardBoundaryError';
    this.code = payload.code;
    this.operation = payload.operation;
  }
}
export type PluginClipboardRequest = Extract<HostApiRequest, { readonly method: 'clipboard.read' | 'clipboard.write' }>;
export type PluginClipboardResult = Extract<HostApiResult, { readonly method: 'clipboard.read' | 'clipboard.write' }>;
export interface PluginClipboardProviderBinding {
  readonly available: () => boolean;
  readonly execute: (request: PluginClipboardRequest, signal: AbortSignal) => Promise<PluginClipboardResult>;
  readonly subscribeAvailability: (listener: () => void) => () => void;
  readonly dispose: () => void;
}
export interface PluginClipboardProviderFactory {
  readonly create: (input: {
    readonly identity: PluginRuntimeSessionIdentity;
    readonly isCurrent: () => boolean;
  }) => PluginClipboardProviderBinding;
}
export interface PluginPermissionMutationAdapter {
  readonly setGrant: (request: SetPluginPermissionGrantRequest) => Promise<SetPluginPermissionGrantResult>;
}
