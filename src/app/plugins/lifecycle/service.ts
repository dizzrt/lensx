import type { PluginRegistrationSnapshot, PluginRegistrationSummary } from '../registration';
import type { PluginSurfaceProjectionService } from '../surfaces';
import {
  PLUGIN_LIFECYCLE_CONTRACT_VERSION,
  type PluginLifecycleDataPolicy,
  type PluginLifecycleDesktopAdapter,
  type PluginLifecycleResult,
  type SetPluginEnabledResult,
  type UninstallPluginResult,
} from './types';

export type PluginLifecycleServiceErrorCode =
  | 'destroyed'
  | 'invalid_current_state'
  | 'surface_quiesce_failed'
  | 'surface_convergence_failed';

const SERVICE_MESSAGES: Readonly<Record<PluginLifecycleServiceErrorCode, string>> = Object.freeze({
  destroyed: 'Plugin lifecycle service is unavailable.',
  invalid_current_state: 'Plugin lifecycle state is not current.',
  surface_quiesce_failed: 'Plugin surfaces could not be withdrawn safely.',
  surface_convergence_failed: 'Plugin surfaces could not converge to the committed state.',
});

export class PluginLifecycleServiceError extends Error {
  readonly code: PluginLifecycleServiceErrorCode;

  constructor(code: PluginLifecycleServiceErrorCode) {
    super(SERVICE_MESSAGES[code]);
    this.name = 'PluginLifecycleServiceError';
    this.code = code;
  }
}

export interface PluginLifecycleService {
  readonly destroy: () => void;
  readonly setEnabled: (input: PluginSetEnabledInput) => Promise<SetPluginEnabledResult>;
  readonly uninstall: (input: PluginUninstallInput) => Promise<UninstallPluginResult>;
}

export interface PluginSetEnabledInput {
  readonly entry_id: string;
  readonly expected_revision: string;
  readonly enabled: boolean;
}

export interface PluginUninstallInput {
  readonly entry_id: string;
  readonly expected_revision: string;
  readonly data_policy: PluginLifecycleDataPolicy;
}

export interface PluginLifecycleServiceDependencies {
  readonly lifecycleAdapter: PluginLifecycleDesktopAdapter;
  readonly surfaceProjection: PluginSurfaceProjectionService;
}

const entryFor = (snapshot: PluginRegistrationSnapshot, entryId: string): PluginRegistrationSummary | undefined =>
  snapshot.entries.find((entry) => entry.entry_id === entryId);

export const createPluginLifecycleService = ({
  lifecycleAdapter,
  surfaceProjection,
}: PluginLifecycleServiceDependencies): PluginLifecycleService => {
  let destroyed = false;

  const assertAlive = () => {
    if (destroyed) {
      throw new PluginLifecycleServiceError('destroyed');
    }
  };

  const currentEntry = async (entryId: string, expectedRevision: string) => {
    assertAlive();
    if (surfaceProjection.currentSnapshot() === undefined) {
      await surfaceProjection.initialize();
    }
    assertAlive();
    const snapshot = surfaceProjection.currentSnapshot();
    if (
      snapshot === undefined ||
      snapshot.availability.kind !== 'available' ||
      snapshot.revision !== expectedRevision
    ) {
      throw new PluginLifecycleServiceError('invalid_current_state');
    }
    const entry = entryFor(snapshot, entryId);
    if (entry === undefined) {
      throw new PluginLifecycleServiceError('invalid_current_state');
    }
    return entry;
  };

  const restoreAfterFailure = async (revision: string, pluginId?: string) => {
    try {
      await surfaceProjection.reconcileRevision(revision, pluginId);
      await surfaceProjection.whenIdle();
    } catch {
      // The original stable lifecycle failure remains primary; projection stays fail closed.
    }
  };

  const converge = async (result: PluginLifecycleResult, pluginId?: string) => {
    try {
      await surfaceProjection.reconcileRevision(result.revision, pluginId);
      await surfaceProjection.whenIdle();
    } catch {
      throw new PluginLifecycleServiceError('surface_convergence_failed');
    }
    assertAlive();
  };

  const quiesce = async (pluginId: string, revision: string) => {
    try {
      await surfaceProjection.quiesceProvider(pluginId);
    } catch {
      await restoreAfterFailure(revision, pluginId);
      throw new PluginLifecycleServiceError('surface_quiesce_failed');
    }
  };

  return Object.freeze({
    destroy() {
      destroyed = true;
    },
    async setEnabled(input: PluginSetEnabledInput) {
      const entry = await currentEntry(input.entry_id, input.expected_revision);
      if (entry.kind !== 'registered') {
        throw new PluginLifecycleServiceError('invalid_current_state');
      }
      if (!input.enabled) {
        await quiesce(entry.plugin_id, input.expected_revision);
      }
      assertAlive();
      let result: SetPluginEnabledResult;
      try {
        result = await lifecycleAdapter.setEnabled(
          Object.freeze({
            contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
            entry_id: input.entry_id,
            expected_revision: input.expected_revision,
            enabled: input.enabled,
          }),
        );
      } catch (error) {
        if (!input.enabled) {
          await restoreAfterFailure(input.expected_revision, entry.plugin_id);
        }
        throw error;
      }
      assertAlive();
      await converge(result, entry.plugin_id);
      return result;
    },
    async uninstall(input: PluginUninstallInput) {
      const entry = await currentEntry(input.entry_id, input.expected_revision);
      const pluginId = entry.plugin_id;
      if (pluginId !== undefined) {
        await quiesce(pluginId, input.expected_revision);
      }
      assertAlive();
      let result: UninstallPluginResult;
      try {
        result = await lifecycleAdapter.uninstall(
          Object.freeze({
            contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
            entry_id: input.entry_id,
            expected_revision: input.expected_revision,
            data_policy: input.data_policy,
          }),
        );
      } catch (error) {
        if (pluginId !== undefined) {
          await restoreAfterFailure(input.expected_revision, pluginId);
        }
        throw error;
      }
      assertAlive();
      await converge(result, pluginId);
      return result;
    },
  });
};
