export const PLUGIN_REPLACEMENT_CONTRACT_VERSION = '0.1.0' as const;
export const PREPARE_LOCAL_PLUGIN_REPLACEMENT_COMMAND = 'prepare_local_plugin_replacement' as const;
export const COMMIT_LOCAL_PLUGIN_REPLACEMENT_COMMAND = 'commit_local_plugin_replacement' as const;
export const CANCEL_PLUGIN_REPLACEMENT_COMMAND = 'cancel_plugin_replacement' as const;

export type PluginReplacementClassification = 'upgrade' | 'downgrade' | 'reinstall';
export type PluginReplacementCleanupConclusion = 'complete' | 'pending';

export interface PreparePluginReplacementRequest {
  readonly contract_version: typeof PLUGIN_REPLACEMENT_CONTRACT_VERSION;
  readonly entry_id: string;
  readonly expected_revision: string;
}

export interface CommitPluginReplacementRequest extends PreparePluginReplacementRequest {
  readonly preparation_token: string;
}

export interface CancelPluginReplacementRequest {
  readonly contract_version: typeof PLUGIN_REPLACEMENT_CONTRACT_VERSION;
  readonly preparation_token: string;
}

export type PluginReplacementResult =
  | { readonly status: 'cancelled'; readonly contract_version: typeof PLUGIN_REPLACEMENT_CONTRACT_VERSION }
  | {
      readonly status: 'duplicate';
      readonly contract_version: typeof PLUGIN_REPLACEMENT_CONTRACT_VERSION;
      readonly entry_id: string;
      readonly current_version: string;
      readonly candidate_version: string;
    }
  | {
      readonly status: 'prepared';
      readonly contract_version: typeof PLUGIN_REPLACEMENT_CONTRACT_VERSION;
      readonly preparation_token: string;
      readonly entry_id: string;
      readonly current_version: string;
      readonly candidate_version: string;
      readonly classification: PluginReplacementClassification;
      readonly added_permission_ids: readonly string[];
      readonly removed_permission_ids: readonly string[];
    }
  | {
      readonly status: 'committed';
      readonly contract_version: typeof PLUGIN_REPLACEMENT_CONTRACT_VERSION;
      readonly entry_id: string;
      readonly plugin_id: string;
      readonly version: string;
      readonly classification: PluginReplacementClassification;
      readonly revision: string;
      readonly cleanup: PluginReplacementCleanupConclusion;
    };

export type PluginReplacementOperation =
  | 'prepare'
  | 'select'
  | 'read'
  | 'inspect'
  | 'extract'
  | 'commit'
  | 'register'
  | 'cleanup'
  | 'cancel';

export type PluginReplacementErrorCode =
  | 'invalid_request'
  | 'invalid_package'
  | 'incompatible'
  | 'identity_mismatch'
  | 'identity_quarantined'
  | 'unsafe_state'
  | 'stale_revision'
  | 'invalid_preparation'
  | 'busy'
  | 'unavailable'
  | 'source_read_failed'
  | 'extraction_failed'
  | 'commit_failed'
  | 'registration_failed'
  | 'internal';

export interface PluginReplacementErrorPayload {
  readonly contract_version: typeof PLUGIN_REPLACEMENT_CONTRACT_VERSION;
  readonly code: PluginReplacementErrorCode;
  readonly operation: PluginReplacementOperation;
  readonly message: string;
}

export class PluginReplacementError extends Error {
  readonly code: PluginReplacementErrorCode | 'invalid_boundary_payload';
  readonly operation: PluginReplacementOperation;
  readonly committed_revision?: string;

  constructor(
    payload:
      | PluginReplacementErrorPayload
      | {
          readonly code: 'invalid_boundary_payload';
          readonly operation: PluginReplacementOperation;
          readonly message: string;
          readonly committed_revision?: string;
        },
  ) {
    super(payload.message);
    this.name = 'PluginReplacementError';
    this.code = payload.code;
    this.operation = payload.operation;
    this.committed_revision = 'committed_revision' in payload ? payload.committed_revision : undefined;
  }
}

export interface PluginReplacementDesktopAdapter {
  readonly prepare: (request: PreparePluginReplacementRequest) => Promise<PluginReplacementResult>;
  readonly commit: (request: CommitPluginReplacementRequest) => Promise<PluginReplacementResult>;
  readonly cancel: (request: CancelPluginReplacementRequest) => Promise<PluginReplacementResult>;
}
