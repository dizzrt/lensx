export const LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION = '0.1.0' as const;
export const INSTALL_LOCAL_PLUGIN_COMMAND = 'install_local_plugin' as const;

export type LocalPluginInstallationResult =
  | {
      readonly status: 'cancelled';
      readonly contract_version: typeof LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION;
    }
  | {
      readonly status: 'installed';
      readonly contract_version: typeof LOCAL_PLUGIN_INSTALLATION_CONTRACT_VERSION;
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
  | 'invalid_package'
  | 'incompatible'
  | 'already_installed'
  | 'identity_quarantined'
  | 'busy'
  | 'unavailable'
  | 'source_read_failed'
  | 'extraction_failed'
  | 'commit_failed'
  | 'registration_failed'
  | 'internal';

export type LocalPluginInstallationOperation =
  | 'select'
  | 'read'
  | 'inspect'
  | 'extract'
  | 'commit'
  | 'register'
  | 'recover';

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
  install: () => Promise<LocalPluginInstallationResult>;
}
