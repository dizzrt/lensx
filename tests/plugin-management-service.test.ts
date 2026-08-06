import { describe, expect, rs, test } from '@rstest/core';
import validRegistrationCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import type { LocalPluginInstallationClient } from '../src/app/plugins/installation';
import type { PluginLifecycleService } from '../src/app/plugins/lifecycle';
import { createPluginManagementService } from '../src/app/plugins/management';
import { createPluginPermissionService } from '../src/app/plugins/permission';
import {
  type PluginRegistrationDetailResponse,
  type PluginRegistrationSnapshot,
  parsePluginRegistrationDetailResponse,
} from '../src/app/plugins/registration';
import { PLUGIN_REPLACEMENT_CONTRACT_VERSION, type PluginReplacementService } from '../src/app/plugins/replacement';
import type { PluginSurfaceProjectionService } from '../src/app/plugins/surfaces';

const parsedDetail = parsePluginRegistrationDetailResponse(
  structuredClone(validRegistrationCases.find(({ name }) => name === 'healthy_detail')?.value),
);
if (parsedDetail.detail.kind !== 'registered') throw new Error('healthy detail fixture is required');
const baseDetail = parsedDetail.detail;

const summary = (entryId: string, pluginId: string, enabled = true) => ({
  kind: 'registered' as const,
  entry_id: entryId,
  plugin_id: pluginId,
  version: '1.0.0',
  display: structuredClone(baseDetail.manifest.display),
  source: 'external' as const,
  enabled,
  compatibility: { lensx: true, host_api: true },
  runtime: { kind: 'inactive' as const },
});

const snapshot = (
  revision: string,
  entries: PluginRegistrationSnapshot['entries'] = [],
  availability: PluginRegistrationSnapshot['availability'] = { kind: 'available' },
): PluginRegistrationSnapshot => ({
  contract_version: '0.1.0',
  revision,
  availability,
  entries,
});

const detail = (
  revision: string,
  entryId: string,
  pluginId: string,
  enabled = true,
): PluginRegistrationDetailResponse => ({
  contract_version: '0.1.0',
  revision,
  detail: {
    ...structuredClone(baseDetail),
    entry_id: entryId,
    manifest: { ...structuredClone(baseDetail.manifest), plugin_id: pluginId },
    enabled,
    granted_permission_ids: [],
  },
});

class ControlledSurface implements PluginSurfaceProjectionService {
  readonly listeners = new Set<(value: PluginRegistrationSnapshot) => void>();
  readonly refresh = rs.fn(async () => {
    this.publish();
  });
  readonly reconcileRevision = rs.fn(async () => {
    this.onReconcile?.();
    this.publish();
  });
  readonly readRegistrationDetail = rs.fn(async (entryId: string) => {
    if (this.readFailure) throw new Error('/private/raw/native stack');
    const entry = this.current.entries.find((item) => item.entry_id === entryId);
    if (entry?.kind !== 'registered') {
      return {
        contract_version: '0.1.0',
        revision: this.current.revision,
        detail: {
          kind: 'quarantined',
          entry_id: entryId,
          diagnostic: { code: 'record_invalid', phase: 'recover', message: 'Plugin record is invalid.' },
        },
      } as const;
    }
    return detail(this.detailRevision ?? this.current.revision, entryId, entry.plugin_id, entry.enabled);
  });
  detailRevision?: string;
  readFailure = false;
  onReconcile?: () => void;

  constructor(public current: PluginRegistrationSnapshot) {}

  publish(next = this.current) {
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }

  currentSnapshot = () => this.current;
  subscribeSnapshot = (listener: (value: PluginRegistrationSnapshot) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  initialize = async () => this.publish();
  handleLauncherActivation = async () => this.publish();
  recoverListener = async () => this.publish();
  quiesceProvider = async () => undefined;
  whenIdle = async () => undefined;
  destroy = async () => undefined;
}

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const setup = (initial: PluginRegistrationSnapshot) => {
  const surface = new ControlledSurface(initial);
  const handlers: {
    install: LocalPluginInstallationClient['install'];
    setEnabled: PluginLifecycleService['setEnabled'];
    uninstall: PluginLifecycleService['uninstall'];
    prepare: PluginReplacementService['prepare'];
    commitPrepared: PluginReplacementService['commitPrepared'];
  } = {
    install: async () => ({ status: 'cancelled', contract_version: '0.1.0' }),
    setEnabled: async () => Promise.reject(new Error('setEnabled test handler is not configured')),
    uninstall: async () => Promise.reject(new Error('uninstall test handler is not configured')),
    prepare: async () => ({ status: 'cancelled', contract_version: '0.1.0' }),
    commitPrepared: async () => ({ status: 'cancelled', contract_version: '0.1.0' }),
  };
  const installationClient: LocalPluginInstallationClient = {
    install: () => handlers.install(),
  };
  const lifecycleService: PluginLifecycleService = {
    destroy: rs.fn(),
    setEnabled: (input) => handlers.setEnabled(input),
    uninstall: (input) => handlers.uninstall(input),
  };
  const replacementService: PluginReplacementService = {
    prepare: (input) => handlers.prepare(input),
    commitPrepared: () => handlers.commitPrepared(),
    cancelPrepared: rs.fn(async () => undefined),
    replace: rs.fn(async () => ({ status: 'cancelled', contract_version: '0.1.0' }) as const),
    destroy: rs.fn(async () => undefined),
  };
  const permissionService = createPluginPermissionService({
    setGrant: rs.fn(),
  });
  const clear = rs.fn(
    async () => ({ contract_version: '0.1.0', current_revision: initial.revision, changed: true }) as const,
  );
  const service = createPluginManagementService({
    surfaceProjection: surface,
    installationClient,
    lifecycleService,
    replacementService,
    permissionService,
    dataManagementService: { clear },
  });
  return { clear, handlers, installationClient, lifecycleService, replacementService, service, surface };
};

describe('PluginManagementService', () => {
  test('projects frozen current list, detail, read-only permissions, degraded and retry states', async () => {
    const entryId = 'entry_0000000000000011';
    const { service, surface } = setup(snapshot('1', [summary(entryId, 'com.acme.one')]));
    await service.initialize();
    await tick();

    const ready = service.current();
    expect(ready).toMatchObject({ state: 'ready', revision: '1', selected_entry_id: entryId });
    expect(ready.detail.kind).toBe('registered');
    if (ready.detail.kind !== 'registered') throw new Error('registered detail expected');
    expect(ready.detail.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          permission_id: 'lensx.filesystem.read_selected',
          requested: true,
          supported: false,
          granted: false,
          effective: 'unsupported',
        }),
        expect.objectContaining({
          permission_id: 'clipboard.read',
          requested: false,
          supported: true,
          granted: false,
          effective: 'not_requested',
        }),
      ]),
    );
    expect(Object.isFrozen(ready)).toBe(true);
    expect(Object.isFrozen(ready.entries)).toBe(true);
    expect(Object.isFrozen(ready.detail.permissions)).toBe(true);

    surface.publish(
      snapshot('2', [summary(entryId, 'com.acme.one')], {
        kind: 'degraded',
        diagnostic: {
          code: 'store_unavailable',
          phase: 'initialize',
          message: 'Plugin Manager storage is unavailable.',
        },
      }),
    );
    expect(service.current()).toMatchObject({
      state: 'degraded',
      operations: {
        install: false,
        enable: false,
        disable: false,
        replace: false,
        uninstall: false,
        clear_data: false,
      },
    });
    await service.destroy();
  });

  test('recovers event loss, rejects revision-mixed detail, and never exposes raw errors', async () => {
    const entryId = 'entry_0000000000000012';
    const { service, surface } = setup(snapshot('1', [summary(entryId, 'com.acme.two')]));
    await service.initialize();
    await tick();

    surface.current = snapshot('2', [summary(entryId, 'com.acme.two', false)]);
    await service.refresh();
    await tick();
    expect(service.current()).toMatchObject({ revision: '2', detail: { kind: 'registered', enabled: false } });

    surface.detailRevision = '1';
    await service.select(entryId);
    expect(surface.refresh).toHaveBeenCalled();
    expect(service.current().feedback?.code).toBe('conflict');

    surface.detailRevision = undefined;
    surface.readFailure = true;
    await service.select(entryId);
    expect(service.current()).toMatchObject({ detail: { kind: 'error' }, feedback: { code: 'detail_failed' } });
    expect(JSON.stringify(service.current())).not.toMatch(/private|raw|native|stack/u);
    await service.destroy();
  });

  test('selects a converged installation and restores adjacent selection after uninstall', async () => {
    const first = summary('entry_0000000000000021', 'com.acme.first');
    const second = summary('entry_0000000000000022', 'com.acme.second');
    const installed = summary('entry_0000000000000023', 'com.acme.installed');
    const { handlers, service, surface } = setup(snapshot('1', [first, second]));
    await service.initialize();
    await service.select(second.entry_id);

    handlers.install = rs.fn(
      async () =>
        ({
          status: 'installed',
          contract_version: '0.1.0',
          plugin_id: installed.plugin_id,
          version: installed.version,
          revision: '2',
        }) as const,
    );
    surface.onReconcile = () => {
      surface.current = snapshot('2', [first, second, installed]);
    };
    await service.install();
    await tick();
    expect(service.current()).toMatchObject({
      selected_entry_id: installed.entry_id,
      feedback: { code: 'install_succeeded' },
    });

    handlers.uninstall = rs.fn(async () => {
      surface.publish(snapshot('3', [first, second]));
      return {
        operation: 'uninstall',
        contract_version: '0.1.0',
        outcome: 'changed',
        entry_id: installed.entry_id,
        plugin_id: installed.plugin_id,
        revision: '3',
        effective_available: false,
        cleanup: 'pending',
        data_policy: 'delete_data',
      } as const;
    });
    await service.uninstall('delete_data');
    await tick();
    expect(service.current()).toMatchObject({
      selected_entry_id: second.entry_id,
      feedback: { code: 'cleanup_pending' },
    });
    await service.destroy();
  });

  test('holds replacement permission diff for confirmation and invalidates stale confirmation', async () => {
    const entry = summary('entry_0000000000000031', 'com.acme.replace');
    const { handlers, replacementService, service, surface } = setup(snapshot('7', [entry]));
    handlers.prepare = rs.fn(
      async () =>
        ({
          status: 'prepared',
          contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
          preparation_token: 'prep_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          entry_id: entry.entry_id,
          current_version: '1.0.0',
          candidate_version: '2.0.0',
          classification: 'upgrade',
          added_permission_ids: ['lensx.clipboard.write'],
          removed_permission_ids: ['lensx.clipboard.read'],
        }) as const,
    );
    await service.initialize();
    await service.prepareReplacement();
    expect(service.current().confirmation).toMatchObject({
      classification: 'upgrade',
      added_permission_ids: ['lensx.clipboard.write'],
      removed_permission_ids: ['lensx.clipboard.read'],
    });

    surface.publish(snapshot('8', [entry]));
    expect(replacementService.cancelPrepared).toHaveBeenCalled();
    expect(service.current()).toMatchObject({ feedback: { code: 'conflict' } });
    expect(service.current().confirmation).toBeUndefined();
    await service.destroy();
  });

  test('serializes mutations and distinguishes data clear, conflict, and durable convergence outcomes', async () => {
    const entry = summary('entry_0000000000000041', 'com.acme.disabled', false);
    const { clear, handlers, service } = setup(snapshot('4', [entry]));
    await service.initialize();
    await tick();
    await service.clearData();
    expect(clear).toHaveBeenCalledWith({ entry_id: entry.entry_id, expected_revision: '4' });
    expect(service.current().feedback?.code).toBe('clear_changed');

    handlers.setEnabled = rs.fn(async () => Promise.reject({ code: 'conflict', path: '/private/path' }));
    await service.setEnabled(true);
    expect(service.current().feedback?.code).toBe('conflict');
    expect(JSON.stringify(service.current())).not.toContain('/private/path');

    handlers.setEnabled = rs.fn(async () =>
      Promise.reject({ code: 'surface_convergence_failed', committed_revision: '5', stack: 'raw' }),
    );
    await service.setEnabled(true);
    expect(service.current().feedback?.code).toBe('convergence_failed');
    expect(JSON.stringify(service.current())).not.toMatch(/committed_revision|stack|raw/u);
    await service.destroy();
  });
});
