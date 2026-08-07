import { describe, expect, rs, test } from '@rstest/core';
import {
  createPluginDevelopmentDesktopAdapter,
  createPluginDevelopmentService,
  PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
  type PluginDevelopmentDesktopAdapter,
  PluginDevelopmentError,
} from '../src/app/plugins/development';
import type { PluginRegistrationSnapshot } from '../src/app/plugins/registration';
import type { PluginSurfaceProjectionService } from '../src/app/plugins/surfaces';

const entryId = 'entry_0123456789abcdef';
const pluginId = 'com.acme.development';
const capability = { contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION, supported: true, enabled: true } as const;

const snapshot = (revision = '1'): PluginRegistrationSnapshot => ({
  contract_version: '0.2.0',
  revision,
  availability: { kind: 'available' },
  entries: [
    {
      kind: 'registered',
      entry_id: entryId,
      plugin_id: pluginId,
      version: '1.0.0',
      display: { name: { 'en-US': 'Development' } },
      source: 'development',
      enabled: true,
      compatibility: { lensx: true, host_api: true },
      runtime: { kind: 'inactive' },
    },
  ],
});

const projection = (operations: string[]): PluginSurfaceProjectionService => {
  let current = snapshot();
  return {
    currentSnapshot: () => current,
    readRegistrationDetail: async () => {
      throw new Error('unused');
    },
    subscribeSnapshot: () => () => undefined,
    initialize: async () => {
      operations.push('initialize');
    },
    refresh: async () => {
      operations.push('refresh');
    },
    handleLauncherActivation: async () => undefined,
    recoverListener: async () => undefined,
    whenIdle: async () => {
      operations.push('idle');
    },
    quiesceProvider: async (owner) => {
      operations.push(`quiesce:${owner}`);
    },
    reconcileRevision: async (revision, owner) => {
      operations.push(`reconcile:${revision}:${owner ?? 'none'}`);
      current = snapshot(revision);
    },
    destroy: async () => undefined,
  };
};

const adapter = (overrides: Partial<PluginDevelopmentDesktopAdapter> = {}): PluginDevelopmentDesktopAdapter => ({
  readCapability: async () => capability,
  setMode: async (request) => ({
    status: 'mode_updated',
    contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
    enabled: request.enabled,
    changed: true,
  }),
  register: async () => ({
    status: 'registered',
    contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
    entry_id: entryId,
    plugin_id: pluginId,
    version: '1.0.0',
    revision: '2',
  }),
  reload: async () => ({
    status: 'reloaded',
    contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
    entry_id: entryId,
    plugin_id: pluginId,
    version: '1.0.0',
    revision: '2',
    cleanup: 'complete',
  }),
  remove: async () => ({
    status: 'removed',
    contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
    revision: '2',
    cleanup: 'complete',
  }),
  ...overrides,
});

describe('Plugin development desktop adapter', () => {
  test('strictly parses capability/results and maps malformed or stable native errors', async () => {
    const invoke = rs.fn(async (command: string) =>
      command === 'read_plugin_development_capability'
        ? capability
        : {
            status: 'removed',
            contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
            revision: '2',
            cleanup: 'pending',
          },
    );
    const desktop = createPluginDevelopmentDesktopAdapter(invoke);
    await expect(desktop.readCapability()).resolves.toEqual(capability);
    await expect(
      desktop.remove({
        contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
        entry_id: entryId,
        expected_revision: '1',
      }),
    ).resolves.toMatchObject({ status: 'removed', cleanup: 'pending' });

    const malformed = createPluginDevelopmentDesktopAdapter(async () => ({ ...capability, path: '/private/source' }));
    await expect(malformed.readCapability()).rejects.toMatchObject({ code: 'invalid_boundary_payload' });
    const conflict = createPluginDevelopmentDesktopAdapter(async () =>
      Promise.reject({
        contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
        code: 'conflict',
        operation: 'reload',
        message: 'Plugin development state changed before the operation completed.',
      }),
    );
    await expect(
      conflict.reload({
        contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
        entry_id: entryId,
        expected_revision: '1',
      }),
    ).rejects.toMatchObject({ code: 'conflict', operation: 'reload' });
    expect(JSON.stringify(await invoke.mock.results)).not.toMatch(/snapshot_identity|operation_token|raw_error/u);
  });
});

describe('Plugin development service', () => {
  test('fails closed across build/native gates and never invokes native in a production build', async () => {
    const readCapability = rs.fn(async () => capability);
    const service = createPluginDevelopmentService({
      adapter: adapter({ readCapability }),
      surfaceProjection: projection([]),
      buildSupported: false,
    });
    await service.initialize();
    expect(service.current()).toEqual({ visible: false, enabled: false });
    expect(readCapability).not.toHaveBeenCalled();
  });

  test('registers and converges after event loss while suppressing duplicate pending operations', async () => {
    const operations: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const register = rs.fn(async () => {
      await gate;
      return adapter().register();
    });
    const service = createPluginDevelopmentService({
      adapter: adapter({ register }),
      surfaceProjection: projection(operations),
      buildSupported: true,
    });
    await service.initialize();
    const first = service.register();
    const duplicate = service.register();
    expect(service.current().pending).toBe('register');
    release();
    await Promise.all([first, duplicate]);
    expect(register).toHaveBeenCalledTimes(1);
    expect(operations).toEqual([`reconcile:2:${pluginId}`, 'idle']);
    expect(service.current().feedback).toEqual({ kind: 'status', code: 'registered' });
  });

  test('quiesces reload/remove/mode shutdown before native mutation and reconciles cleanup-pending commits', async () => {
    const operations: string[] = [];
    const reload = rs.fn(async () => {
      operations.push('native:reload');
      return {
        status: 'reloaded',
        contract_version: PLUGIN_DEVELOPMENT_CONTRACT_VERSION,
        entry_id: entryId,
        plugin_id: pluginId,
        version: '1.0.0',
        revision: '2',
        cleanup: 'pending',
      } as const;
    });
    const service = createPluginDevelopmentService({
      adapter: adapter({ reload }),
      surfaceProjection: projection(operations),
      buildSupported: true,
    });
    await service.initialize();
    await service.reload(entryId, '1');
    expect(operations).toEqual([`quiesce:${pluginId}`, 'native:reload', `reconcile:2:${pluginId}`, 'idle']);
    expect(service.current().feedback).toEqual({ kind: 'status', code: 'cleanup_pending' });
  });

  test('restores the old projection after stable native conflict and suppresses late publications after destroy', async () => {
    const operations: string[] = [];
    const conflict = new PluginDevelopmentError({
      code: 'conflict',
      operation: 'reload',
      message: 'Plugin development state changed before the operation completed.',
    });
    const service = createPluginDevelopmentService({
      adapter: adapter({ reload: async () => Promise.reject(conflict) }),
      surfaceProjection: projection(operations),
      buildSupported: true,
    });
    await service.initialize();
    await service.reload(entryId, '1');
    expect(operations).toEqual([`quiesce:${pluginId}`, `reconcile:1:${pluginId}`, 'idle']);
    expect(service.current().feedback).toEqual({ kind: 'error', code: 'conflict' });
    service.destroy();
    await service.remove(entryId, '1');
    expect(operations).toHaveLength(3);
  });
});
