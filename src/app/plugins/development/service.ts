import type { PluginSurfaceProjectionService } from '../surfaces';
import { PLUGIN_DEVELOPMENT_MODE_BUILD_CAPABILITY } from './build-capability';
import {
  PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
  type PluginDevelopmentDesktopAdapter,
  PluginDevelopmentError,
  type PluginDevelopmentFeedbackCode,
  type PluginDevelopmentPending,
  type PluginDevelopmentResult,
  type PluginDevelopmentService,
  type PluginDevelopmentView,
} from './types';

export const createPluginDevelopmentService = ({
  adapter,
  surfaceProjection,
  buildSupported = PLUGIN_DEVELOPMENT_MODE_BUILD_CAPABILITY,
}: {
  readonly adapter: PluginDevelopmentDesktopAdapter;
  readonly surfaceProjection: PluginSurfaceProjectionService;
  readonly buildSupported?: boolean;
}): PluginDevelopmentService => {
  const listeners = new Set<(view: PluginDevelopmentView) => void>();
  let view: PluginDevelopmentView = Object.freeze({ visible: false, enabled: false });
  let destroyed = false;
  const publish = (next: PluginDevelopmentView) => {
    view = Object.freeze(next);
    for (const listener of listeners) listener(view);
  };
  const feedbackCode = (error: unknown): PluginDevelopmentFeedbackCode =>
    error instanceof Error && error.message === 'convergence_failed'
      ? 'convergence_failed'
      : error instanceof PluginDevelopmentError &&
          ['invalid', 'incompatible', 'source_changed', 'conflict', 'unsafe_state', 'unavailable'].includes(error.code)
        ? (error.code as PluginDevelopmentFeedbackCode)
        : 'failed';
  const run = async (pending: PluginDevelopmentPending, operation: () => Promise<void>) => {
    if (destroyed || !view.visible || view.pending) return;
    publish({ ...view, pending, feedback: undefined });
    try {
      await operation();
    } catch (error) {
      publish({ ...view, feedback: { kind: 'error', code: feedbackCode(error) } });
    } finally {
      publish({ ...view, pending: undefined });
    }
  };
  const converge = async (revision: string, pluginId?: string) => {
    try {
      await surfaceProjection.reconcileRevision(revision, pluginId);
      await surfaceProjection.whenIdle();
    } catch {
      throw new Error('convergence_failed');
    }
  };
  const currentDevelopmentEntry = (entryId: string, expectedRevision: string) => {
    const snapshot = surfaceProjection.currentSnapshot();
    const entry = snapshot?.entries.find((item) => item.entry_id === entryId);
    return snapshot?.revision === expectedRevision && entry?.kind === 'registered' && entry.source === 'development'
      ? entry
      : undefined;
  };
  const restore = async (revision: string, pluginId?: string) => {
    try {
      await surfaceProjection.reconcileRevision(revision, pluginId);
      await surfaceProjection.whenIdle();
    } catch {
      /* primary failure wins */
    }
  };
  return Object.freeze({
    current: () => view,
    subscribe(listener: (view: PluginDevelopmentView) => void) {
      listeners.add(listener);
      listener(view);
      return () => listeners.delete(listener);
    },
    async initialize() {
      if (destroyed || !buildSupported) return;
      try {
        const capability = await adapter.readCapability();
        publish({ visible: buildSupported && capability.supported, enabled: capability.enabled });
      } catch {
        publish({ visible: false, enabled: false });
      }
    },
    async setEnabled(enabled: boolean) {
      await run('set_mode', async () => {
        const before = surfaceProjection.currentSnapshot();
        const providers = !enabled
          ? (before?.entries ?? []).filter(
              (entry): entry is Extract<typeof entry, { readonly kind: 'registered' }> =>
                entry.kind === 'registered' && entry.source === 'development',
            )
          : [];
        for (const entry of [...providers].sort((left, right) => left.plugin_id.localeCompare(right.plugin_id))) {
          await surfaceProjection.quiesceProvider(entry.plugin_id);
        }
        let result: PluginDevelopmentResult;
        try {
          result = await adapter.setMode({ contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION, enabled });
        } catch (error) {
          if (before) await restore(before.revision);
          throw error;
        }
        if (result.status !== 'mode_updated' || result.enabled !== enabled)
          throw new TypeError('Unexpected mode result.');
        await surfaceProjection.refresh();
        await surfaceProjection.whenIdle();
        publish({ ...view, enabled, feedback: { kind: 'status', code: enabled ? 'enabled' : 'disabled' } });
      });
    },
    async register() {
      await run('register', async () => {
        const result = await adapter.register();
        if (result.status === 'cancelled') {
          publish({ ...view, feedback: { kind: 'status', code: 'cancelled' } });
          return;
        }
        if (result.status !== 'registered') throw new TypeError('Unexpected register result.');
        await converge(result.revision, result.plugin_id);
        publish({ ...view, feedback: { kind: 'status', code: 'registered' } });
      });
    },
    async reload(entryId: string, expectedRevision: string) {
      await run('reload', async () => {
        const entry = currentDevelopmentEntry(entryId, expectedRevision);
        if (!entry)
          throw new PluginDevelopmentError({
            code: 'conflict',
            operation: 'reload',
            message: 'Plugin development state changed before the operation completed.',
          });
        await surfaceProjection.quiesceProvider(entry.plugin_id);
        let result: PluginDevelopmentResult;
        try {
          result = await adapter.reload({
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
            entry_id: entryId,
            expected_revision: expectedRevision,
          });
        } catch (error) {
          await restore(expectedRevision, entry.plugin_id);
          throw error;
        }
        if (result.status !== 'reloaded') throw new TypeError('Unexpected reload result.');
        await converge(result.revision, result.plugin_id);
        publish({
          ...view,
          feedback: { kind: 'status', code: result.cleanup === 'pending' ? 'cleanup_pending' : 'reloaded' },
        });
      });
    },
    async remove(entryId: string, expectedRevision: string) {
      await run('remove', async () => {
        const entry = currentDevelopmentEntry(entryId, expectedRevision);
        if (!entry)
          throw new PluginDevelopmentError({
            code: 'conflict',
            operation: 'remove',
            message: 'Plugin development state changed before the operation completed.',
          });
        await surfaceProjection.quiesceProvider(entry.plugin_id);
        let result: PluginDevelopmentResult;
        try {
          result = await adapter.remove({
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
            entry_id: entryId,
            expected_revision: expectedRevision,
          });
        } catch (error) {
          await restore(expectedRevision, entry.plugin_id);
          throw error;
        }
        if (result.status !== 'removed') throw new TypeError('Unexpected remove result.');
        await converge(result.revision);
        publish({
          ...view,
          feedback: { kind: 'status', code: result.cleanup === 'pending' ? 'cleanup_pending' : 'removed' },
        });
      });
    },
    destroy() {
      destroyed = true;
      listeners.clear();
    },
  });
};
