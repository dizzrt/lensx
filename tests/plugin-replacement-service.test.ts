import { describe, expect, rs, test } from '@rstest/core';
import type { PluginRegistrationSnapshot } from '../src/app/plugins/registration';
import {
  createPluginReplacementService,
  PLUGIN_REPLACEMENT_CONTRACT_VERSION,
  type PluginReplacementDesktopAdapter,
  PluginReplacementServiceError,
} from '../src/app/plugins/replacement';
import type { PluginSurfaceProjectionService } from '../src/app/plugins/surfaces';

const entryId = 'entry_0123456789abcdef';
const pluginId = 'com.acme.workspace';
const token = 'prep_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const snapshot: PluginRegistrationSnapshot = {
  contract_version: '0.1.0',
  revision: '7',
  availability: { kind: 'available' },
  entries: [
    {
      kind: 'registered',
      entry_id: entryId,
      plugin_id: pluginId,
      version: '1.0.0',
      display: { name: { 'en-US': 'Workspace' } },
      source: 'external',
      enabled: true,
      compatibility: { lensx: true, host_api: true },
      runtime: { kind: 'inactive' },
    },
  ],
};
const prepared = {
  status: 'prepared',
  contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
  preparation_token: token,
  entry_id: entryId,
  current_version: '1.0.0',
  candidate_version: '2.0.0',
  classification: 'upgrade',
  added_permission_ids: ['new.permission'],
  removed_permission_ids: ['old.permission'],
} as const;
const committed = {
  status: 'committed',
  contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
  entry_id: entryId,
  plugin_id: pluginId,
  version: '2.0.0',
  classification: 'upgrade',
  revision: '8',
  cleanup: 'complete',
} as const;

const setup = (
  overrides: Partial<PluginSurfaceProjectionService> = {},
  adapterOverrides: Partial<PluginReplacementDesktopAdapter> = {},
) => {
  const operations: string[] = [];
  const surface: PluginSurfaceProjectionService = {
    currentSnapshot: () => snapshot,
    readRegistrationDetail: async () => {
      throw new Error('not used');
    },
    subscribeSnapshot: () => () => undefined,
    initialize: async () => {
      operations.push('initialize');
    },
    refresh: async () => undefined,
    handleLauncherActivation: async () => undefined,
    recoverListener: async () => undefined,
    quiesceProvider: async (id) => {
      operations.push(`quiesce:${id}`);
    },
    reconcileRevision: async (revision, id) => {
      operations.push(`reconcile:${revision}:${id ?? ''}`);
    },
    whenIdle: async () => undefined,
    destroy: async () => undefined,
    ...overrides,
  };
  const adapter: PluginReplacementDesktopAdapter = {
    prepare: rs.fn(async () => prepared),
    commit: rs.fn(async () => committed),
    cancel: rs.fn(
      async () => ({ status: 'cancelled', contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION }) as const,
    ),
    ...adapterOverrides,
  };
  return { operations, surface, adapter };
};

describe('plugin replacement service', () => {
  test('exposes confirmation facts, quiesces, commits, and converges after event loss', async () => {
    const { operations, surface, adapter } = setup();
    const confirmation = rs.fn();
    const service = createPluginReplacementService({
      replacementAdapter: adapter,
      surfaceProjection: surface,
      onPrepared: confirmation,
    });
    await expect(service.replace({ entry_id: entryId, expected_revision: '7' })).resolves.toEqual(committed);
    expect(confirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        current_version: '1.0.0',
        candidate_version: '2.0.0',
        classification: 'upgrade',
        added_permission_ids: ['new.permission'],
        removed_permission_ids: ['old.permission'],
      }),
    );
    expect(operations).toEqual([`quiesce:${pluginId}`, `reconcile:8:${pluginId}`]);
    expect(adapter.commit).toHaveBeenCalledWith({
      contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
      preparation_token: token,
      entry_id: entryId,
      expected_revision: '7',
    });
  });

  test('cancels and restores the old revision after quiesce or pre-commit failure', async () => {
    for (const mode of ['quiesce', 'commit'] as const) {
      const { operations, surface, adapter } = setup(
        mode === 'quiesce'
          ? {
              quiesceProvider: async () => {
                throw new Error('raw');
              },
            }
          : {},
        mode === 'commit'
          ? {
              commit: async () => {
                throw new Error('native failure');
              },
            }
          : {},
      );
      const service = createPluginReplacementService({ replacementAdapter: adapter, surfaceProjection: surface });
      await expect(service.replace({ entry_id: entryId, expected_revision: '7' })).rejects.toBeInstanceOf(Error);
      expect(adapter.cancel).toHaveBeenCalledWith({
        contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
        preparation_token: token,
      });
      expect(operations).toContain(`reconcile:7:${pluginId}`);
      if (mode === 'quiesce') expect(adapter.commit).not.toHaveBeenCalled();
    }
  });

  test('reports committed revision when post-commit convergence fails and keeps the new record', async () => {
    const { surface, adapter } = setup({
      reconcileRevision: async () => {
        throw new Error('event lost');
      },
    });
    const service = createPluginReplacementService({ replacementAdapter: adapter, surfaceProjection: surface });
    await expect(service.replace({ entry_id: entryId, expected_revision: '7' })).rejects.toEqual(
      new PluginReplacementServiceError('surface_convergence_failed', '8'),
    );
    expect(adapter.commit).toHaveBeenCalledTimes(1);
    expect(adapter.cancel).not.toHaveBeenCalled();
  });

  test('accepts disabled targets, returns cancellation and duplicate without touching surfaces, and rejects stale state', async () => {
    const disabledSnapshot: PluginRegistrationSnapshot = {
      ...structuredClone(snapshot),
      entries: snapshot.entries.map((entry) => (entry.kind === 'registered' ? { ...entry, enabled: false } : entry)),
    };
    const disabled = setup({ currentSnapshot: () => disabledSnapshot });
    const disabledService = createPluginReplacementService({
      replacementAdapter: disabled.adapter,
      surfaceProjection: disabled.surface,
    });
    await expect(disabledService.replace({ entry_id: entryId, expected_revision: '7' })).resolves.toEqual(committed);
    expect(disabled.operations).toEqual([`quiesce:${pluginId}`, `reconcile:8:${pluginId}`]);

    for (const result of [
      { status: 'cancelled', contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION } as const,
      {
        status: 'duplicate',
        contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
        entry_id: entryId,
        current_version: '1.0.0',
        candidate_version: '1.0.0',
      } as const,
    ]) {
      const { operations, surface, adapter } = setup({}, { prepare: async () => result });
      const service = createPluginReplacementService({ replacementAdapter: adapter, surfaceProjection: surface });
      await expect(service.replace({ entry_id: entryId, expected_revision: '7' })).resolves.toEqual(result);
      expect(operations).toEqual([]);
    }
    const { surface, adapter } = setup();
    const service = createPluginReplacementService({ replacementAdapter: adapter, surfaceProjection: surface });
    await expect(service.replace({ entry_id: entryId, expected_revision: '6' })).rejects.toEqual(
      new PluginReplacementServiceError('invalid_current_state'),
    );
    expect(adapter.prepare).not.toHaveBeenCalled();
  });
});
