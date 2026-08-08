import { describe, expect, rs, test } from '@rstest/core';
import {
  createPluginLifecycleService,
  PLUGIN_LIFECYCLE_CONTRACT_VERSION,
  type PluginLifecycleDesktopAdapter,
  PluginLifecycleError,
  PluginLifecycleServiceError,
} from '../src/app/plugins/lifecycle';
import type { PluginRegistrationSnapshot } from '../src/app/plugins/registration';
import type { PluginSurfaceProjectionService } from '../src/app/plugins/surfaces';

const entryId = 'entry_0123456789abcdef';
const pluginId = 'com.acme.lifecycle';

const snapshot = (revision = '1', enabled = true): PluginRegistrationSnapshot => ({
  contract_version: '0.3.0',
  revision,
  availability: { kind: 'available' },
  entries: [
    {
      kind: 'registered',
      entry_id: entryId,
      plugin_id: pluginId,
      version: '1.0.0',
      display: { name: { 'en-US': 'Lifecycle' } },
      source: 'external',
      enabled,
      compatibility: { lensx: true, host_api: true },
      runtime: { kind: 'inactive' },
    },
  ],
});

const surface = (
  operations: string[],
  overrides: Partial<PluginSurfaceProjectionService> = {},
): PluginSurfaceProjectionService => {
  let current = snapshot();
  return {
    currentSnapshot: () => current,
    readRegistrationDetail: async () => {
      throw new Error('not used');
    },
    subscribeSnapshot: () => () => undefined,
    initialize: async () => undefined,
    refresh: async () => undefined,
    handleLauncherActivation: async () => undefined,
    recoverListener: async () => undefined,
    whenIdle: async () => undefined,
    quiesceProvider: async (owner) => {
      operations.push(`quiesce:${owner}`);
    },
    reconcileRevision: async (revision, owner) => {
      operations.push(`reconcile:${revision}:${owner ?? 'none'}`);
      current = snapshot(revision, false);
    },
    destroy: async () => undefined,
    ...overrides,
  };
};

const changedSetResult = {
  operation: 'set_enabled',
  contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
  outcome: 'changed',
  entry_id: entryId,
  plugin_id: pluginId,
  revision: '2',
  enabled: false,
  effective_available: false,
  cleanup: 'not_applicable',
} as const;

describe('PluginLifecycleService', () => {
  test('quiesces before disable, invokes Rust, and actively reconciles the returned revision', async () => {
    const operations: string[] = [];
    const lifecycleAdapter: PluginLifecycleDesktopAdapter = {
      setEnabled: rs.fn(async () => {
        operations.push('rust:set_enabled');
        return changedSetResult;
      }),
      uninstall: rs.fn(),
    };
    const service = createPluginLifecycleService({ lifecycleAdapter, surfaceProjection: surface(operations) });
    await expect(service.setEnabled({ entry_id: entryId, expected_revision: '1', enabled: false })).resolves.toEqual(
      changedSetResult,
    );
    expect(operations).toEqual([`quiesce:${pluginId}`, 'rust:set_enabled', `reconcile:2:${pluginId}`]);
  });

  test('does not invoke Rust after quiesce failure and refreshes the current revision', async () => {
    const operations: string[] = [];
    const setEnabled = rs.fn(async () => changedSetResult);
    const projection = surface(operations, {
      quiesceProvider: async () => {
        operations.push('quiesce:failed');
        throw new Error('/private raw surface failure');
      },
    });
    const service = createPluginLifecycleService({
      lifecycleAdapter: { setEnabled, uninstall: rs.fn() },
      surfaceProjection: projection,
    });
    await expect(service.setEnabled({ entry_id: entryId, expected_revision: '1', enabled: false })).rejects.toEqual(
      new PluginLifecycleServiceError('surface_quiesce_failed'),
    );
    expect(setEnabled).not.toHaveBeenCalled();
    expect(operations).toEqual(['quiesce:failed', `reconcile:1:${pluginId}`]);
  });

  test('restores projection after Rust conflict and preserves the stable adapter error', async () => {
    const operations: string[] = [];
    const conflict = new PluginLifecycleError({
      contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
      code: 'conflict',
      operation: 'set_enabled',
      message: 'Plugin lifecycle request conflicts with current state.',
    });
    const service = createPluginLifecycleService({
      lifecycleAdapter: {
        setEnabled: async () => Promise.reject(conflict),
        uninstall: rs.fn(),
      },
      surfaceProjection: surface(operations),
    });
    await expect(service.setEnabled({ entry_id: entryId, expected_revision: '1', enabled: false })).rejects.toBe(
      conflict,
    );
    expect(operations).toEqual([`quiesce:${pluginId}`, `reconcile:1:${pluginId}`]);
  });

  test('enable commits without quiesce and reports bounded convergence failure without rollback', async () => {
    const operations: string[] = [];
    const enabledResult = { ...changedSetResult, enabled: true, effective_available: true } as const;
    const setEnabled = rs.fn(async () => enabledResult);
    const service = createPluginLifecycleService({
      lifecycleAdapter: { setEnabled, uninstall: rs.fn() },
      surfaceProjection: surface(operations, {
        reconcileRevision: async () => {
          operations.push('reconcile:failed');
          throw new Error('raw projection failure');
        },
      }),
    });
    await expect(service.setEnabled({ entry_id: entryId, expected_revision: '1', enabled: true })).rejects.toEqual(
      new PluginLifecycleServiceError('surface_convergence_failed'),
    );
    expect(setEnabled).toHaveBeenCalledTimes(1);
    expect(operations).toEqual(['reconcile:failed']);
    expect(JSON.stringify(operations)).not.toMatch(/private|stack|Tauri|Rust/u);
  });

  test('uninstall quiesces, preserves explicit data policy, and converges after event loss', async () => {
    const operations: string[] = [];
    const uninstall = rs.fn(async () => ({
      operation: 'uninstall' as const,
      contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
      outcome: 'changed' as const,
      entry_id: entryId,
      plugin_id: pluginId,
      revision: '2',
      effective_available: false as const,
      cleanup: 'pending' as const,
      data_policy: 'retain_data' as const,
    }));
    const service = createPluginLifecycleService({
      lifecycleAdapter: { setEnabled: rs.fn(), uninstall },
      surfaceProjection: surface(operations),
    });
    await expect(
      service.uninstall({ entry_id: entryId, expected_revision: '1', data_policy: 'retain_data' }),
    ).resolves.toMatchObject({ operation: 'uninstall', cleanup: 'pending', revision: '2' });
    expect(uninstall).toHaveBeenCalledWith({
      contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
      entry_id: entryId,
      expected_revision: '1',
      data_policy: 'retain_data',
    });
    expect(operations).toEqual([`quiesce:${pluginId}`, `reconcile:2:${pluginId}`]);
  });

  test('rejects stale displayed state and late work after destroy', async () => {
    const operations: string[] = [];
    const setEnabled = rs.fn(async () => changedSetResult);
    const service = createPluginLifecycleService({
      lifecycleAdapter: { setEnabled, uninstall: rs.fn() },
      surfaceProjection: surface(operations),
    });
    await expect(service.setEnabled({ entry_id: entryId, expected_revision: '0', enabled: false })).rejects.toEqual(
      new PluginLifecycleServiceError('invalid_current_state'),
    );
    expect(setEnabled).not.toHaveBeenCalled();
    service.destroy();
    await expect(service.setEnabled({ entry_id: entryId, expected_revision: '1', enabled: false })).rejects.toEqual(
      new PluginLifecycleServiceError('destroyed'),
    );
  });
});
