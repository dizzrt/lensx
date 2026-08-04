export const PLUGIN_RESOURCE_CONTRACT_VERSION = '0.1.0' as const;
export const RESOLVE_PLUGIN_RESOURCE_ENTRY_COMMAND = 'resolve_plugin_resource_entry' as const;

export interface ResolvePluginResourceEntryRequest {
  readonly contract_version: typeof PLUGIN_RESOURCE_CONTRACT_VERSION;
  readonly entry_id: string;
  readonly expected_revision: string;
}

export interface PluginResourceEntry {
  readonly contract_version: typeof PLUGIN_RESOURCE_CONTRACT_VERSION;
  readonly entry_id: string;
  readonly revision: string;
  readonly plugin_id: string;
  readonly version: string;
  readonly entry_url: string;
}

export type PluginResourceErrorCode =
  | 'invalid_request'
  | 'stale_revision'
  | 'not_found'
  | 'unavailable'
  | 'unsafe_state'
  | 'internal';

export type PluginResourceOperation = 'resolve_entry';

export interface PluginResourceErrorPayload {
  readonly contract_version: typeof PLUGIN_RESOURCE_CONTRACT_VERSION;
  readonly code: PluginResourceErrorCode;
  readonly operation: PluginResourceOperation;
  readonly message: string;
}

export class PluginResourceError extends Error {
  readonly code: PluginResourceErrorCode | 'invalid_boundary_payload';
  readonly operation: PluginResourceOperation;

  constructor(
    payload:
      | PluginResourceErrorPayload
      | {
          readonly code: 'invalid_boundary_payload';
          readonly operation: PluginResourceOperation;
          readonly message: string;
        },
  ) {
    super(payload.message);
    this.name = 'PluginResourceError';
    this.code = payload.code;
    this.operation = payload.operation;
  }
}

export interface PluginResourceDesktopAdapter {
  resolveEntry: (request: ResolvePluginResourceEntryRequest) => Promise<PluginResourceEntry>;
}
