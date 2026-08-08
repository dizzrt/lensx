import { describe, expect, rs, test } from '@rstest/core';
import { createPluginManagementService } from '../src/app/plugins/management';
import type { PluginRegistrationSnapshot } from '../src/app/plugins/registration';
import type { PluginSurfaceProjectionService } from '../src/app/plugins/surfaces';

const emptySnapshot = (revision = '0'): PluginRegistrationSnapshot => ({
  contract_version: '0.3.0',
  revision,
  availability: { kind: 'available' },
  entries: [],
});

const surface = (): PluginSurfaceProjectionService => {
  let current = emptySnapshot();
  const listeners = new Set<(snapshot: PluginRegistrationSnapshot) => void>();
  return {
    currentSnapshot: () => current,
    readRegistrationDetail: async () => {
      throw new Error('unused');
    },
    subscribeSnapshot(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize: async () => undefined,
    refresh: async () => undefined,
    reconcileRevision: async (revision) => {
      current = emptySnapshot(revision);
      for (const listener of listeners) listener(current);
    },
    whenIdle: async () => undefined,
    quiesceProvider: async () => undefined,
    handleLauncherActivation: async () => undefined,
    recoverListener: async () => undefined,
    destroy: async () => undefined,
  };
};

describe('Plugin Management service without permission authority', () => {
  test('projects an empty current Registration snapshot without permission composition', async () => {
    const service = createPluginManagementService({
      surfaceProjection: surface(),
      installationService: {
        prepare: async () => ({ status: 'cancelled', contract_version: '0.3.0', operation: 'prepare' }),
        commitPrepared: async () => {
          throw new Error('unused');
        },
        cancelPrepared: async () => undefined,
        destroy: async () => undefined,
      },
      lifecycleService: {
        setEnabled: async () => {
          throw new Error('unused');
        },
        uninstall: async () => {
          throw new Error('unused');
        },
        destroy: () => undefined,
      },
      replacementService: {
        prepare: async () => ({ status: 'cancelled', contract_version: '0.2.0' }),
        commitPrepared: async () => ({ status: 'cancelled', contract_version: '0.2.0' }),
        cancelPrepared: async () => undefined,
        replace: async () => ({ status: 'cancelled', contract_version: '0.2.0' }),
        destroy: async () => undefined,
      },
      dataManagementService: {
        clear: async () => {
          throw new Error('unused');
        },
      },
    });

    await service.initialize();
    expect(service.current()).toMatchObject({ state: 'empty', operations: { install: true } });
    expect(service.current()).not.toHaveProperty('permission_confirmation');
    expect(service).not.toHaveProperty('openPermissionConfirmation');
    await service.destroy();
  });

  test('commits installation directly after bounded trust confirmation', async () => {
    const commitPrepared = rs.fn(async () => ({
      status: 'installed' as const,
      contract_version: '0.3.0' as const,
      operation: 'commit' as const,
      plugin_id: 'com.acme.plugin',
      version: '1.0.0',
      revision: '1',
    }));
    const service = createPluginManagementService({
      surfaceProjection: surface(),
      installationService: {
        prepare: async () => ({
          status: 'prepared',
          contract_version: '0.3.0',
          operation: 'prepare',
          preparation_token: 'abcdefghijklmnopqrstuvwxyzABCDEF',
          candidate: {
            plugin_id: 'com.acme.plugin',
            version: '1.0.0',
            display_name: { 'en-US': 'Plugin' },
            publisher: {
              author: 'Acme',
              homepage: 'https://example.com',
              repository: 'https://example.com/repository',
            },
          },
        }),
        commitPrepared,
        cancelPrepared: async () => undefined,
        destroy: async () => undefined,
      },
      lifecycleService: {
        setEnabled: async () => {
          throw new Error('unused');
        },
        uninstall: async () => {
          throw new Error('unused');
        },
        destroy: () => undefined,
      },
      replacementService: {
        prepare: async () => ({ status: 'cancelled', contract_version: '0.2.0' }),
        commitPrepared: async () => ({ status: 'cancelled', contract_version: '0.2.0' }),
        cancelPrepared: async () => undefined,
        replace: async () => ({ status: 'cancelled', contract_version: '0.2.0' }),
        destroy: async () => undefined,
      },
      dataManagementService: {
        clear: async () => {
          throw new Error('unused');
        },
      },
    });

    await service.initialize();
    await service.prepareInstallation();
    expect(service.current().confirmation).toMatchObject({
      kind: 'installation',
      candidate: { plugin_id: 'com.acme.plugin', version: '1.0.0' },
    });
    expect(JSON.stringify(service.current().confirmation)).not.toMatch(/permission|grant/u);
    await service.commitInstallation();
    expect(commitPrepared).toHaveBeenCalledTimes(1);
    expect(service.current().feedback).toMatchObject({ code: 'install_succeeded' });
    await service.destroy();
  });
});
