import type { NormalizedPluginManifest } from '@lensx/plugin-contract';

type NormalizedPluginDisplay = NormalizedPluginManifest['display'];

export const PLUGIN_REGISTRATION_CONTRACT_VERSION = '0.3.0' as const;
export const PLUGIN_REGISTRATION_CHANGED_EVENT = 'plugin-registration://snapshot-changed' as const;
export const READ_PLUGIN_REGISTRATION_SNAPSHOT_COMMAND = 'read_plugin_registration_snapshot' as const;
export const READ_PLUGIN_REGISTRATION_DETAIL_COMMAND = 'read_plugin_registration_detail' as const;

export interface PluginRegistrationDiagnostic {
  readonly code: string;
  readonly phase: string;
  readonly message: string;
}

export interface PluginRegistrationCompatibility {
  readonly lensx: boolean;
  readonly host_api: boolean;
}

export interface PluginRegistrationRuntimeStatus {
  readonly kind: 'inactive';
}

export type PluginManagerAvailability =
  | { readonly kind: 'available' }
  | { readonly kind: 'degraded'; readonly diagnostic: PluginRegistrationDiagnostic };

export interface RegisteredPluginRegistrationSummary {
  readonly kind: 'registered';
  readonly entry_id: string;
  readonly plugin_id: string;
  readonly version: string;
  readonly display: NormalizedPluginDisplay;
  readonly source: 'builtin' | 'external' | 'development';
  readonly enabled: boolean;
  readonly compatibility: PluginRegistrationCompatibility;
  readonly runtime: PluginRegistrationRuntimeStatus;
}

export interface QuarantinedPluginRegistrationSummary {
  readonly kind: 'quarantined';
  readonly entry_id: string;
  readonly plugin_id?: string;
  readonly diagnostic: PluginRegistrationDiagnostic;
}

export type PluginRegistrationSummary = RegisteredPluginRegistrationSummary | QuarantinedPluginRegistrationSummary;

export interface PluginRegistrationSnapshot {
  readonly contract_version: typeof PLUGIN_REGISTRATION_CONTRACT_VERSION;
  readonly revision: string;
  readonly availability: PluginManagerAvailability;
  readonly entries: readonly PluginRegistrationSummary[];
}

export interface RegisteredPluginRegistrationDetail {
  readonly kind: 'registered';
  readonly entry_id: string;
  readonly manifest: NormalizedPluginManifest;
  readonly source: 'builtin' | 'external' | 'development';
  readonly enabled: boolean;
  readonly compatibility: PluginRegistrationCompatibility;
  readonly runtime: PluginRegistrationRuntimeStatus;
  readonly diagnostics: readonly PluginRegistrationDiagnostic[];
}

export interface QuarantinedPluginRegistrationDetail {
  readonly kind: 'quarantined';
  readonly entry_id: string;
  readonly plugin_id?: string;
  readonly diagnostic: PluginRegistrationDiagnostic;
}

export type PluginRegistrationDetail = RegisteredPluginRegistrationDetail | QuarantinedPluginRegistrationDetail;

export interface PluginRegistrationDetailResponse {
  readonly contract_version: typeof PLUGIN_REGISTRATION_CONTRACT_VERSION;
  readonly revision: string;
  readonly detail: PluginRegistrationDetail;
}

export interface PluginRegistrationChangedEvent {
  readonly contract_version: typeof PLUGIN_REGISTRATION_CONTRACT_VERSION;
  readonly revision: string;
}

export type PluginRegistrationQueryErrorCode = 'invalid_request' | 'not_found' | 'unavailable' | 'internal';
export type PluginRegistrationQueryOperation = 'read_snapshot' | 'read_detail';

export interface PluginRegistrationQueryErrorPayload {
  readonly code: PluginRegistrationQueryErrorCode;
  readonly operation: PluginRegistrationQueryOperation;
  readonly message: string;
}

export class PluginRegistrationQueryError extends Error {
  readonly code: PluginRegistrationQueryErrorCode | 'invalid_boundary_payload';
  readonly operation: PluginRegistrationQueryOperation;

  constructor(
    payload:
      | PluginRegistrationQueryErrorPayload
      | {
          readonly code: 'invalid_boundary_payload';
          readonly operation: PluginRegistrationQueryOperation;
          readonly message: string;
        },
  ) {
    super(payload.message);
    this.name = 'PluginRegistrationQueryError';
    this.code = payload.code;
    this.operation = payload.operation;
  }
}

export interface PluginRegistrationDesktopAdapter {
  initialize: () => Promise<PluginRegistrationSnapshot>;
  refresh: () => Promise<PluginRegistrationSnapshot>;
  readDetail: (entryId: string) => Promise<PluginRegistrationDetailResponse>;
  handleLauncherActivation: () => Promise<PluginRegistrationSnapshot>;
  recoverListener: () => Promise<PluginRegistrationSnapshot>;
  subscribe: (
    listener: (snapshot: PluginRegistrationSnapshot) => void,
    onError?: (error: PluginRegistrationQueryError) => void,
  ) => () => void;
  destroy: () => Promise<void>;
}
