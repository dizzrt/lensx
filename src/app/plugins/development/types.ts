export const PLUGIN_DEVELOPMENT_CONTRACT_VERSION = '0.1.0' as const;

export const READ_PLUGIN_DEVELOPMENT_CAPABILITY_COMMAND = 'read_plugin_development_capability';
export const SET_PLUGIN_DEVELOPMENT_MODE_COMMAND = 'set_plugin_development_mode';
export const REGISTER_PLUGIN_DEVELOPMENT_DIRECTORY_COMMAND = 'register_plugin_development_directory';
export const RELOAD_PLUGIN_DEVELOPMENT_ENTRY_COMMAND = 'reload_plugin_development_entry';
export const REMOVE_PLUGIN_DEVELOPMENT_ENTRY_COMMAND = 'remove_plugin_development_entry';

export type PluginDevelopmentOperation = 'read_capability' | 'set_mode' | 'register' | 'reload' | 'remove' | 'cleanup';
export type PluginDevelopmentErrorCode =
  | 'invalid_request'
  | 'disabled'
  | 'unavailable'
  | 'invalid'
  | 'incompatible'
  | 'source_changed'
  | 'conflict'
  | 'unsafe_state'
  | 'cleanup_pending'
  | 'internal'
  | 'invalid_boundary_payload';

export interface PluginDevelopmentCapabilitySnapshot {
  readonly contract_version: typeof PLUGIN_DEVELOPMENT_CONTRACT_VERSION;
  readonly supported: boolean;
  readonly enabled: boolean;
}

export interface PluginDevelopmentEntryRequest {
  readonly contract_version: typeof PLUGIN_DEVELOPMENT_CONTRACT_VERSION;
  readonly entry_id: string;
  readonly expected_revision: string;
}

export interface SetPluginDevelopmentModeRequest {
  readonly contract_version: typeof PLUGIN_DEVELOPMENT_CONTRACT_VERSION;
  readonly enabled: boolean;
}

export type PluginDevelopmentResult =
  | { readonly status: 'cancelled'; readonly contract_version: typeof PLUGIN_DEVELOPMENT_CONTRACT_VERSION }
  | {
      readonly status: 'mode_updated';
      readonly contract_version: typeof PLUGIN_DEVELOPMENT_CONTRACT_VERSION;
      readonly enabled: boolean;
      readonly changed: boolean;
    }
  | {
      readonly status: 'registered';
      readonly contract_version: typeof PLUGIN_DEVELOPMENT_CONTRACT_VERSION;
      readonly entry_id: string;
      readonly plugin_id: string;
      readonly version: string;
      readonly revision: string;
    }
  | {
      readonly status: 'reloaded';
      readonly contract_version: typeof PLUGIN_DEVELOPMENT_CONTRACT_VERSION;
      readonly entry_id: string;
      readonly plugin_id: string;
      readonly version: string;
      readonly revision: string;
      readonly cleanup: 'complete' | 'pending';
    }
  | {
      readonly status: 'removed';
      readonly contract_version: typeof PLUGIN_DEVELOPMENT_CONTRACT_VERSION;
      readonly revision: string;
      readonly cleanup: 'complete' | 'pending';
    };

export interface PluginDevelopmentErrorPayload {
  readonly contract_version: typeof PLUGIN_DEVELOPMENT_CONTRACT_VERSION;
  readonly code: Exclude<PluginDevelopmentErrorCode, 'invalid_boundary_payload'>;
  readonly operation: PluginDevelopmentOperation;
  readonly message: string;
}

export class PluginDevelopmentError extends Error {
  readonly code: PluginDevelopmentErrorCode;
  readonly operation: PluginDevelopmentOperation;

  constructor(input: {
    readonly code: PluginDevelopmentErrorCode;
    readonly operation: PluginDevelopmentOperation;
    readonly message: string;
  }) {
    super(input.message);
    this.name = 'PluginDevelopmentError';
    this.code = input.code;
    this.operation = input.operation;
  }
}

export interface PluginDevelopmentDesktopAdapter {
  readonly readCapability: () => Promise<PluginDevelopmentCapabilitySnapshot>;
  readonly setMode: (request: SetPluginDevelopmentModeRequest) => Promise<PluginDevelopmentResult>;
  readonly register: () => Promise<PluginDevelopmentResult>;
  readonly reload: (request: PluginDevelopmentEntryRequest) => Promise<PluginDevelopmentResult>;
  readonly remove: (request: PluginDevelopmentEntryRequest) => Promise<PluginDevelopmentResult>;
}

export type PluginDevelopmentPending = 'set_mode' | 'register' | 'reload' | 'remove';
export type PluginDevelopmentFeedbackCode =
  | 'enabled'
  | 'disabled'
  | 'cancelled'
  | 'registered'
  | 'reloaded'
  | 'removed'
  | 'cleanup_pending'
  | 'invalid'
  | 'incompatible'
  | 'source_changed'
  | 'conflict'
  | 'unsafe_state'
  | 'unavailable'
  | 'convergence_failed'
  | 'failed';

export interface PluginDevelopmentView {
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly pending?: PluginDevelopmentPending;
  readonly feedback?: { readonly kind: 'status' | 'error'; readonly code: PluginDevelopmentFeedbackCode };
}

export interface PluginDevelopmentService {
  readonly current: () => PluginDevelopmentView;
  readonly subscribe: (listener: (view: PluginDevelopmentView) => void) => () => void;
  readonly initialize: () => Promise<void>;
  readonly setEnabled: (enabled: boolean) => Promise<void>;
  readonly register: () => Promise<void>;
  readonly reload: (entryId: string, expectedRevision: string) => Promise<void>;
  readonly remove: (entryId: string, expectedRevision: string) => Promise<void>;
  readonly destroy: () => void;
}
