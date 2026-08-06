export const PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION = '0.1.0' as const;
export const CLEAR_PLUGIN_DATA_COMMAND = 'clear_plugin_data' as const;

export interface ClearPluginDataRequest {
  readonly contract_version: typeof PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION;
  readonly entry_id: string;
  readonly expected_revision: string;
}

export interface ClearPluginDataResult {
  readonly contract_version: typeof PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION;
  readonly current_revision: string;
  readonly changed: boolean;
}

export type PluginDataManagementErrorCode =
  | 'invalid_request'
  | 'conflict'
  | 'not_found'
  | 'plugin_enabled'
  | 'operation_not_supported'
  | 'unsafe_storage'
  | 'unavailable'
  | 'internal';

export interface PluginDataManagementErrorPayload {
  readonly contract_version: typeof PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION;
  readonly code: PluginDataManagementErrorCode;
  readonly operation: 'clear_plugin_data';
  readonly message: string;
}

export class PluginDataManagementError extends Error {
  readonly code: PluginDataManagementErrorCode | 'invalid_boundary_payload';

  constructor(
    payload: PluginDataManagementErrorPayload | { readonly code: 'invalid_boundary_payload'; readonly message: string },
  ) {
    super(payload.message);
    this.name = 'PluginDataManagementError';
    this.code = payload.code;
  }
}

export interface PluginDataManagementDesktopAdapter {
  readonly clear: (request: ClearPluginDataRequest) => Promise<ClearPluginDataResult>;
}

export interface PluginDataManagementService {
  readonly clear: (input: {
    readonly entry_id: string;
    readonly expected_revision: string;
  }) => Promise<ClearPluginDataResult>;
}
