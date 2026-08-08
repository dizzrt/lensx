export const LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION = '0.3.0' as const;
export const PREPARE_LOCAL_PLUGIN_INSTALLATION_COMMAND = 'prepare_local_plugin_installation' as const;
export const COMMIT_LOCAL_PLUGIN_INSTALLATION_COMMAND = 'commit_local_plugin_installation' as const;
export const CANCEL_LOCAL_PLUGIN_INSTALLATION_COMMAND = 'cancel_local_plugin_installation' as const;

export type LocalPluginInstallationOperation = 'prepare' | 'commit' | 'cancel';

export interface LocalPluginInstallationLocalizedText {
  readonly 'en-US': string;
  readonly 'zh-CN'?: string;
}

export interface LocalPluginInstallationPublisher {
  readonly author: string;
  readonly homepage: string;
  readonly repository: string;
}

export interface LocalPluginInstallationCandidate {
  readonly plugin_id: string;
  readonly version: string;
  readonly display_name: LocalPluginInstallationLocalizedText;
  readonly publisher: LocalPluginInstallationPublisher;
}

export interface LocalPluginInstallationRequest {
  readonly contract_version: typeof LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION;
  readonly preparation_token: string;
}

export interface LocalPluginInstallationCancelledResult<Operation extends 'prepare' | 'cancel'> {
  readonly status: 'cancelled';
  readonly contract_version: typeof LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION;
  readonly operation: Operation;
}

export type LocalPluginInstallationResult =
  | LocalPluginInstallationCancelledResult<'prepare'>
  | LocalPluginInstallationCancelledResult<'cancel'>
  | {
      readonly status: 'prepared';
      readonly contract_version: typeof LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION;
      readonly operation: 'prepare';
      readonly preparation_token: string;
      readonly candidate: LocalPluginInstallationCandidate;
    }
  | {
      readonly status: 'installed';
      readonly contract_version: typeof LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION;
      readonly operation: 'commit';
      readonly plugin_id: string;
      readonly version: string;
      readonly revision: string;
    };

export interface LocalPluginInstallationDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type LocalPluginInstallationErrorCode =
  | 'invalid_request'
  | 'invalid_preparation'
  | 'invalid_package'
  | 'incompatible'
  | 'already_installed'
  | 'identity_quarantined'
  | 'busy'
  | 'unavailable'
  | 'source_read_failed'
  | 'extraction_failed'
  | 'unsafe_state'
  | 'commit_failed'
  | 'registration_failed'
  | 'cleanup_failed'
  | 'internal';

export interface LocalPluginInstallationErrorPayload {
  readonly contract_version: typeof LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION;
  readonly code: LocalPluginInstallationErrorCode;
  readonly operation: LocalPluginInstallationOperation;
  readonly message: string;
  readonly diagnostics?: readonly LocalPluginInstallationDiagnostic[];
}

export class LocalPluginInstallationError extends Error {
  readonly code: LocalPluginInstallationErrorCode | 'invalid_boundary_payload';
  readonly operation: LocalPluginInstallationOperation;

  constructor(
    payload:
      | LocalPluginInstallationErrorPayload
      | {
          readonly code: 'invalid_boundary_payload';
          readonly operation: LocalPluginInstallationOperation;
          readonly message: string;
        },
  ) {
    super(payload.message);
    this.name = 'LocalPluginInstallationError';
    this.code = payload.code;
    this.operation = payload.operation;
  }
}

export interface LocalPluginInstallationClient {
  readonly prepare: () => Promise<Extract<LocalPluginInstallationResult, { status: 'cancelled' | 'prepared' }>>;
  readonly commit: (
    preparationToken: string,
  ) => Promise<Extract<LocalPluginInstallationResult, { status: 'installed' }>>;
  readonly cancel: (preparationToken: string) => Promise<LocalPluginInstallationCancelledResult<'cancel'>>;
}
