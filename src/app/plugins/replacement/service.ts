import type { PluginRegistrationSnapshot, PluginRegistrationSummary } from '../registration';
import type { PluginSurfaceProjectionService } from '../surfaces';
import {
  PLUGIN_REPLACEMENT_CONTRACT_VERSION,
  type PluginReplacementDesktopAdapter,
  type PluginReplacementResult,
} from './types';

type PreparedReplacement = Extract<PluginReplacementResult, { readonly status: 'prepared' }>;
type CommittedReplacement = Extract<PluginReplacementResult, { readonly status: 'committed' }>;

export type PluginReplacementServiceErrorCode =
  | 'destroyed'
  | 'invalid_current_state'
  | 'invalid_boundary_result'
  | 'surface_quiesce_failed'
  | 'surface_convergence_failed';

const MESSAGES: Readonly<Record<PluginReplacementServiceErrorCode, string>> = Object.freeze({
  destroyed: 'Plugin replacement service is unavailable.',
  invalid_current_state: 'Plugin replacement state is not current.',
  invalid_boundary_result: 'Plugin replacement returned an unexpected result.',
  surface_quiesce_failed: 'Plugin surfaces could not be withdrawn safely.',
  surface_convergence_failed: 'Plugin surfaces could not converge to the committed replacement.',
});

export class PluginReplacementServiceError extends Error {
  readonly code: PluginReplacementServiceErrorCode;
  readonly committed_revision?: string;

  constructor(code: PluginReplacementServiceErrorCode, committedRevision?: string) {
    super(MESSAGES[code]);
    this.name = 'PluginReplacementServiceError';
    this.code = code;
    this.committed_revision = committedRevision;
  }
}

export interface PluginReplacementServiceInput {
  readonly entry_id: string;
  readonly expected_revision: string;
}

export interface PluginReplacementService {
  readonly replace: (input: PluginReplacementServiceInput) => Promise<PluginReplacementResult>;
  readonly destroy: () => Promise<void>;
}

export interface PluginReplacementServiceDependencies {
  readonly replacementAdapter: PluginReplacementDesktopAdapter;
  readonly surfaceProjection: PluginSurfaceProjectionService;
  readonly onPrepared?: (prepared: PreparedReplacement) => void;
}

const findEntry = (snapshot: PluginRegistrationSnapshot, entryId: string): PluginRegistrationSummary | undefined =>
  snapshot.entries.find((entry) => entry.entry_id === entryId);

export const createPluginReplacementService = ({
  replacementAdapter,
  surfaceProjection,
  onPrepared,
}: PluginReplacementServiceDependencies): PluginReplacementService => {
  let destroyed = false;
  let activeToken: string | undefined;

  const assertAlive = () => {
    if (destroyed) throw new PluginReplacementServiceError('destroyed');
  };

  const cancel = async (token: string) => {
    try {
      await replacementAdapter.cancel(
        Object.freeze({ contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION, preparation_token: token }),
      );
    } catch {
      // Cancellation is best effort; the native preparation remains bounded and process-local.
    } finally {
      if (activeToken === token) activeToken = undefined;
    }
  };

  const restore = async (revision: string, pluginId: string) => {
    try {
      await surfaceProjection.reconcileRevision(revision, pluginId);
      await surfaceProjection.whenIdle();
    } catch {
      // The originating replacement failure remains primary and surfaces stay fail closed.
    }
  };

  const currentEntry = async (input: PluginReplacementServiceInput) => {
    assertAlive();
    if (surfaceProjection.currentSnapshot() === undefined) await surfaceProjection.initialize();
    assertAlive();
    const snapshot = surfaceProjection.currentSnapshot();
    const entry = snapshot === undefined ? undefined : findEntry(snapshot, input.entry_id);
    if (
      snapshot === undefined ||
      snapshot.availability.kind !== 'available' ||
      snapshot.revision !== input.expected_revision ||
      entry?.kind !== 'registered'
    ) {
      throw new PluginReplacementServiceError('invalid_current_state');
    }
    return entry;
  };

  return Object.freeze({
    async replace(input: PluginReplacementServiceInput) {
      const entry = await currentEntry(input);
      const prepared = await replacementAdapter.prepare(
        Object.freeze({
          contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
          entry_id: input.entry_id,
          expected_revision: input.expected_revision,
        }),
      );
      assertAlive();
      if (prepared.status === 'cancelled' || prepared.status === 'duplicate') return prepared;
      if (prepared.status !== 'prepared' || prepared.entry_id !== input.entry_id) {
        throw new PluginReplacementServiceError('invalid_boundary_result');
      }
      activeToken = prepared.preparation_token;
      try {
        onPrepared?.(prepared);
      } catch {
        await cancel(prepared.preparation_token);
        throw new PluginReplacementServiceError('invalid_current_state');
      }
      try {
        await surfaceProjection.quiesceProvider(entry.plugin_id);
      } catch {
        await cancel(prepared.preparation_token);
        await restore(input.expected_revision, entry.plugin_id);
        throw new PluginReplacementServiceError('surface_quiesce_failed');
      }
      if (destroyed) {
        await cancel(prepared.preparation_token);
        await restore(input.expected_revision, entry.plugin_id);
        throw new PluginReplacementServiceError('destroyed');
      }
      let committed: PluginReplacementResult;
      try {
        committed = await replacementAdapter.commit(
          Object.freeze({
            contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
            preparation_token: prepared.preparation_token,
            entry_id: input.entry_id,
            expected_revision: input.expected_revision,
          }),
        );
        activeToken = undefined;
      } catch (error) {
        await cancel(prepared.preparation_token);
        await restore(input.expected_revision, entry.plugin_id);
        throw error;
      }
      if (committed.status !== 'committed') {
        await restore(input.expected_revision, entry.plugin_id);
        throw new PluginReplacementServiceError('invalid_boundary_result');
      }
      try {
        await surfaceProjection.reconcileRevision(committed.revision, entry.plugin_id);
        await surfaceProjection.whenIdle();
      } catch {
        throw new PluginReplacementServiceError('surface_convergence_failed', committed.revision);
      }
      if (destroyed) {
        throw new PluginReplacementServiceError('surface_convergence_failed', committed.revision);
      }
      return committed as CommittedReplacement;
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      const token = activeToken;
      if (token !== undefined) await cancel(token);
    },
  });
};
