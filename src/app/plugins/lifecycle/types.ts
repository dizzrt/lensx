export const PLUGIN_LIFECYCLE_CONTRACT_VERSION = '0.1.0' as const;
export const SET_PLUGIN_ENABLED_COMMAND = 'set_plugin_enabled' as const;
export const UNINSTALL_PLUGIN_COMMAND = 'uninstall_plugin' as const;

export type PluginLifecycleOutcome = 'changed' | 'unchanged';
export type PluginLifecycleCleanupConclusion = 'not_applicable' | 'complete' | 'pending';
export type PluginLifecycleDataPolicy = 'retain_data' | 'delete_data';

export interface SetPluginEnabledRequest {
  readonly contract_version: typeof PLUGIN_LIFECYCLE_CONTRACT_VERSION;
  readonly entry_id: string;
  readonly expected_revision: string;
  readonly enabled: boolean;
}

export interface UninstallPluginRequest {
  readonly contract_version: typeof PLUGIN_LIFECYCLE_CONTRACT_VERSION;
  readonly entry_id: string;
  readonly expected_revision: string;
  readonly data_policy: PluginLifecycleDataPolicy;
}

export interface SetPluginEnabledResult {
  readonly operation: 'set_enabled';
  readonly contract_version: typeof PLUGIN_LIFECYCLE_CONTRACT_VERSION;
  readonly outcome: PluginLifecycleOutcome;
  readonly entry_id: string;
  readonly plugin_id: string;
  readonly revision: string;
  readonly enabled: boolean;
  readonly effective_available: boolean;
  readonly cleanup: 'not_applicable';
}

export interface UninstallPluginResult {
  readonly operation: 'uninstall';
  readonly contract_version: typeof PLUGIN_LIFECYCLE_CONTRACT_VERSION;
  readonly outcome: PluginLifecycleOutcome;
  readonly entry_id: string;
  readonly plugin_id?: string;
  readonly revision: string;
  readonly effective_available: false;
  readonly cleanup: 'complete' | 'pending';
  readonly data_policy: PluginLifecycleDataPolicy;
}

export type PluginLifecycleResult = SetPluginEnabledResult | UninstallPluginResult;

export type PluginLifecycleErrorCode =
  | 'invalid_request'
  | 'conflict'
  | 'invalid_state'
  | 'not_found'
  | 'busy'
  | 'unavailable'
  | 'persist_failed'
  | 'operation_not_supported'
  | 'unsafe_cleanup'
  | 'internal';

export type PluginLifecycleOperation = 'set_enabled' | 'uninstall';

export interface PluginLifecycleErrorPayload {
  readonly contract_version: typeof PLUGIN_LIFECYCLE_CONTRACT_VERSION;
  readonly code: PluginLifecycleErrorCode;
  readonly operation: PluginLifecycleOperation;
  readonly message: string;
}

export class PluginLifecycleError extends Error {
  readonly code: PluginLifecycleErrorCode | 'invalid_boundary_payload';
  readonly operation: PluginLifecycleOperation;

  constructor(
    payload:
      | PluginLifecycleErrorPayload
      | {
          readonly code: 'invalid_boundary_payload';
          readonly operation: PluginLifecycleOperation;
          readonly message: string;
        },
  ) {
    super(payload.message);
    this.name = 'PluginLifecycleError';
    this.code = payload.code;
    this.operation = payload.operation;
  }
}

export interface PluginLifecycleDesktopAdapter {
  setEnabled: (request: SetPluginEnabledRequest) => Promise<SetPluginEnabledResult>;
  uninstall: (request: UninstallPluginRequest) => Promise<UninstallPluginResult>;
}
