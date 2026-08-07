import type { NormalizedPluginManifest } from '@lensx/plugin-contract';
import type { PluginDataManagementService } from '../data-management';
import type { PluginDevelopmentService, PluginDevelopmentView } from '../development';
import type { LocalPluginInstallationService } from '../installation';
import type { PluginLifecycleDataPolicy, PluginLifecycleService } from '../lifecycle';
import type {
  EffectivePluginPermission,
  PluginPermissionPromptCandidate,
  PluginPermissionPromptItem,
  PluginPermissionService,
} from '../permission';
import type {
  PluginRegistrationDiagnostic,
  PluginRegistrationRuntimeStatus,
  PluginRegistrationSummary,
} from '../registration';
import type { PluginReplacementService } from '../replacement';
import type { PluginSurfaceProjectionService } from '../surfaces';

export type PluginManagementState = 'loading' | 'empty' | 'ready' | 'degraded' | 'error';
export type PluginManagementMutation =
  | 'prepare_installation'
  | 'commit_installation'
  | 'set_enabled'
  | 'prepare_replacement'
  | 'commit_replacement'
  | 'set_permission'
  | 'uninstall'
  | 'clear_data';

export type PluginManagementFeedbackCode =
  | 'busy'
  | 'cancelled'
  | 'cleanup_pending'
  | 'clear_changed'
  | 'clear_unchanged'
  | 'conflict'
  | 'convergence_failed'
  | 'detail_failed'
  | 'duplicate'
  | 'install_succeeded'
  | 'install_permissions_partial'
  | 'install_permissions_failed'
  | 'load_failed'
  | 'mutation_failed'
  | 'not_found'
  | 'plugin_enabled'
  | 'replacement_succeeded'
  | 'replacement_permissions_partial'
  | 'permission_granted'
  | 'permission_revoked'
  | 'permission_unchanged'
  | 'permissions_deferred'
  | 'set_enabled_succeeded'
  | 'unavailable'
  | 'uninstall_succeeded'
  | 'unsafe_storage';

export interface PluginManagementFeedback {
  readonly kind: 'error' | 'status';
  readonly code: PluginManagementFeedbackCode;
  readonly plugin_id?: string;
  readonly version?: string;
}

export type PluginManagementEntry =
  | {
      readonly kind: 'registered';
      readonly entry_id: string;
      readonly plugin_id: string;
      readonly version: string;
      readonly display: PluginRegistrationSummary extends infer Summary
        ? Summary extends { readonly kind: 'registered'; readonly display: infer Display }
          ? Display
          : never
        : never;
      readonly source: 'builtin' | 'external' | 'development';
      readonly enabled: boolean;
      readonly compatibility: { readonly lensx: boolean; readonly host_api: boolean };
      readonly runtime: PluginRegistrationRuntimeStatus;
    }
  | {
      readonly kind: 'quarantined';
      readonly entry_id: string;
      readonly plugin_id?: string;
      readonly diagnostic: PluginRegistrationDiagnostic;
    };

export interface PluginManagementPermissionView {
  readonly permission_id: string;
  readonly requested: boolean;
  readonly supported: boolean;
  readonly granted: boolean;
  readonly effective: EffectivePluginPermission['state'];
  readonly methods: readonly string[];
  readonly reason?: NormalizedPluginManifest['requested_permissions'][number]['reason'];
  readonly prompt: PluginPermissionPromptItem;
}

export interface PluginManagementOperationAvailability {
  readonly install: boolean;
  readonly enable: boolean;
  readonly disable: boolean;
  readonly replace: boolean;
  readonly uninstall: boolean;
  readonly clear_data: boolean;
  readonly retry: boolean;
}

export type PluginManagementDetailView =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading'; readonly entry_id: string }
  | { readonly kind: 'error'; readonly entry_id: string; readonly code: 'detail_failed' }
  | {
      readonly kind: 'quarantined';
      readonly entry_id: string;
      readonly plugin_id?: string;
      readonly diagnostic: PluginRegistrationDiagnostic;
    }
  | {
      readonly kind: 'registered';
      readonly entry_id: string;
      readonly manifest: NormalizedPluginManifest;
      readonly source: 'builtin' | 'external' | 'development';
      readonly enabled: boolean;
      readonly compatibility: { readonly lensx: boolean; readonly host_api: boolean };
      readonly runtime: PluginRegistrationRuntimeStatus;
      readonly permissions: readonly PluginManagementPermissionView[];
      readonly diagnostics: readonly PluginRegistrationDiagnostic[];
    };

export interface PluginReplacementConfirmationView {
  readonly kind: 'replacement';
  readonly entry_id: string;
  readonly expected_revision: string;
  readonly current_version: string;
  readonly candidate_version: string;
  readonly classification: 'upgrade' | 'downgrade' | 'reinstall';
  readonly added_permission_ids: readonly string[];
  readonly removed_permission_ids: readonly string[];
  readonly retained_permissions: readonly PluginPermissionPromptItem[];
  readonly added_permissions: readonly PluginPermissionPromptItem[];
  readonly removed_permissions: readonly PluginPermissionPromptItem[];
  readonly selected_permission_ids: readonly string[];
  readonly publisher_unverified: true;
}

export interface PluginInstallationConfirmationView {
  readonly kind: 'installation';
  readonly candidate: PluginPermissionPromptCandidate;
  readonly selected_permission_ids: readonly string[];
}

export interface PluginPermissionConfirmationView {
  readonly context: 'installation' | 'replacement' | 'settings';
  readonly action: 'grant' | 'revoke';
  readonly permission: PluginPermissionPromptItem;
}

export interface PluginManagementViewModel {
  readonly state: PluginManagementState;
  readonly revision?: string;
  readonly entries: readonly PluginManagementEntry[];
  readonly selected_entry_id?: string;
  readonly detail: PluginManagementDetailView;
  readonly operations: PluginManagementOperationAvailability;
  readonly mutation?: PluginManagementMutation;
  readonly confirmation?: PluginReplacementConfirmationView | PluginInstallationConfirmationView;
  readonly permission_confirmation?: PluginPermissionConfirmationView;
  readonly feedback?: PluginManagementFeedback;
  readonly diagnostic?: PluginRegistrationDiagnostic;
  readonly development?: PluginDevelopmentView;
}

export interface PluginManagementService {
  readonly current: () => PluginManagementViewModel;
  readonly subscribe: (listener: (view: PluginManagementViewModel) => void) => () => void;
  readonly initialize: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly select: (entryId: string) => Promise<void>;
  readonly prepareInstallation: () => Promise<void>;
  readonly commitInstallation: () => Promise<void>;
  readonly cancelInstallation: () => Promise<void>;
  readonly setEnabled: (enabled: boolean) => Promise<void>;
  readonly prepareReplacement: () => Promise<void>;
  readonly commitReplacement: () => Promise<void>;
  readonly cancelReplacement: () => Promise<void>;
  readonly openPermissionConfirmation: (permissionId: string, granted: boolean) => void;
  readonly confirmPermissionDecision: () => Promise<void>;
  readonly cancelPermissionDecision: () => void;
  readonly deferPreparedPermissions: () => void;
  readonly uninstall: (dataPolicy: PluginLifecycleDataPolicy) => Promise<void>;
  readonly clearData: () => Promise<void>;
  readonly setDevelopmentMode: (enabled: boolean) => Promise<void>;
  readonly registerDevelopmentDirectory: () => Promise<void>;
  readonly reloadDevelopmentEntry: () => Promise<void>;
  readonly removeDevelopmentEntry: () => Promise<void>;
  readonly destroy: () => Promise<void>;
}

export interface PluginManagementServiceDependencies {
  readonly surfaceProjection: PluginSurfaceProjectionService;
  readonly installationService: LocalPluginInstallationService;
  readonly lifecycleService: PluginLifecycleService;
  readonly replacementService: PluginReplacementService;
  readonly permissionService: Pick<PluginPermissionService, 'catalog' | 'view' | 'setGrant'>;
  readonly dataManagementService: PluginDataManagementService;
  readonly developmentService?: PluginDevelopmentService;
}
