import { describe, expect, rs, test } from '@rstest/core';
import validRegistrationCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import type { LocalPluginInstallationService } from '../src/app/plugins/installation';
import type { PluginLifecycleService } from '../src/app/plugins/lifecycle';
import { createPluginManagementService } from '../src/app/plugins/management';
import { createPluginClipboardProviderFactory, createPluginPermissionService } from '../src/app/plugins/permission';
import {
  type PluginRegistrationDetailResponse,
  type PluginRegistrationSnapshot,
  parsePluginRegistrationDetailResponse,
} from '../src/app/plugins/registration';
import { PLUGIN_REPLACEMENT_CONTRACT_VERSION, type PluginReplacementService } from '../src/app/plugins/replacement';
import {
  createMutablePluginHostApiContextSource,
  createPluginHostApiDispatcherFactory,
  type PluginRuntimeSessionIdentity,
} from '../src/app/plugins/runtime';
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
    const response = detail(this.detailRevision ?? this.current.revision, entryId, entry.plugin_id, entry.enabled);
    if (response.detail.kind !== 'registered') return response;
    return {
      ...response,
      detail: {
        ...response.detail,
        manifest: {
          ...response.detail.manifest,
          requested_permissions:
            this.requestedPermissionsByPlugin.get(entry.plugin_id) ?? response.detail.manifest.requested_permissions,
        },
        granted_permission_ids: this.grantsByPlugin.get(entry.plugin_id) ?? response.detail.granted_permission_ids,
      },
    };
  });
  detailRevision?: string;
  readFailure = false;
  onReconcile?: () => void;
  readonly requestedPermissionsByPlugin = new Map<string, typeof baseDetail.manifest.requested_permissions>();
  readonly grantsByPlugin = new Map<string, readonly string[]>();

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
    prepareInstallation: LocalPluginInstallationService['prepare'];
    commitInstallation: LocalPluginInstallationService['commitPrepared'];
    setEnabled: PluginLifecycleService['setEnabled'];
    uninstall: PluginLifecycleService['uninstall'];
    prepare: PluginReplacementService['prepare'];
    commitPrepared: PluginReplacementService['commitPrepared'];
  } = {
    prepareInstallation: async () => ({ status: 'cancelled', contract_version: '0.2.0', operation: 'prepare' }),
    commitInstallation: async () => Promise.reject(new Error('commit installation test handler is not configured')),
    setEnabled: async () => Promise.reject(new Error('setEnabled test handler is not configured')),
    uninstall: async () => Promise.reject(new Error('uninstall test handler is not configured')),
    prepare: async () => ({ status: 'cancelled', contract_version: '0.1.0' }),
    commitPrepared: async () => ({ status: 'cancelled', contract_version: '0.1.0' }),
  };
  const installationService: LocalPluginInstallationService = {
    prepare: () => handlers.prepareInstallation(),
    commitPrepared: () => handlers.commitInstallation(),
    cancelPrepared: rs.fn(async () => undefined),
    destroy: rs.fn(async () => undefined),
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
  const setGrant = rs.fn(async (request) => {
    const entry = surface.current.entries.find((item) => item.entry_id === request.entry_id);
    if (entry?.kind !== 'registered') throw { code: 'not_found' };
    const grants = new Set(surface.grantsByPlugin.get(entry.plugin_id) ?? []);
    if (request.granted) grants.add(request.permission_id);
    else grants.delete(request.permission_id);
    surface.grantsByPlugin.set(entry.plugin_id, Object.freeze([...grants].sort()));
    const revision = String(Number(request.expected_revision) + 1);
    surface.current = snapshot(revision, surface.current.entries);
    return { contract_version: '0.1.0', status: 'changed', revision } as const;
  });
  const permissionService = createPluginPermissionService({ setGrant });
  const clear = rs.fn(
    async () => ({ contract_version: '0.1.0', current_revision: initial.revision, changed: true }) as const,
  );
  const service = createPluginManagementService({
    surfaceProjection: surface,
    installationService,
    lifecycleService,
    replacementService,
    permissionService,
    dataManagementService: { clear },
  });
  return { clear, handlers, installationService, lifecycleService, replacementService, service, setGrant, surface };
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

    handlers.prepareInstallation = rs.fn(
      async () =>
        ({
          status: 'prepared',
          contract_version: '0.2.0',
          operation: 'prepare',
          preparation_token: 'abcdefghijklmnopqrstuvwxyzABCDEF',
          candidate: {
            plugin_id: installed.plugin_id,
            version: installed.version,
            display_name: baseDetail.manifest.display.name,
            publisher: baseDetail.manifest.publisher,
            requested_permissions: [],
          },
        }) as const,
    );
    handlers.commitInstallation = rs.fn(
      async () =>
        ({
          status: 'installed',
          contract_version: '0.2.0',
          operation: 'commit',
          plugin_id: installed.plugin_id,
          version: installed.version,
          revision: '2',
        }) as const,
    );
    surface.onReconcile = () => {
      surface.current = snapshot('2', [first, second, installed]);
    };
    await service.prepareInstallation();
    expect(service.current().confirmation?.kind).toBe('installation');
    await service.commitInstallation();
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

  test('keeps installation grants transient, applies them sequentially after durable commit, and stops on partial failure', async () => {
    const installed = summary('entry_0000000000000031', 'com.acme.permissions');
    const { handlers, service, setGrant, surface } = setup(snapshot('1'));
    surface.requestedPermissionsByPlugin.set(
      installed.plugin_id,
      Object.freeze([
        Object.freeze({ permission_id: 'clipboard.read', reason: Object.freeze({ 'en-US': 'Read.' }) }),
        Object.freeze({ permission_id: 'clipboard.write', reason: Object.freeze({ 'en-US': 'Write.' }) }),
      ]),
    );
    const requestedPermissions = surface.requestedPermissionsByPlugin.get(installed.plugin_id);
    if (!requestedPermissions) throw new Error('installation permission fixture is required');
    handlers.prepareInstallation = async () => ({
      status: 'prepared',
      contract_version: '0.2.0',
      operation: 'prepare',
      preparation_token: 'abcdefghijklmnopqrstuvwxyzABCDEF',
      candidate: {
        plugin_id: installed.plugin_id,
        version: installed.version,
        display_name: baseDetail.manifest.display.name,
        publisher: baseDetail.manifest.publisher,
        requested_permissions: requestedPermissions,
      },
    });
    handlers.commitInstallation = async () => ({
      status: 'installed',
      contract_version: '0.2.0',
      operation: 'commit',
      plugin_id: installed.plugin_id,
      version: installed.version,
      revision: '2',
    });
    surface.onReconcile = () => {
      if (surface.current.revision === '1') surface.current = snapshot('2', [installed]);
    };
    await service.initialize();
    await service.prepareInstallation();
    service.openPermissionConfirmation('clipboard.write', true);
    await service.confirmPermissionDecision();
    service.openPermissionConfirmation('clipboard.read', true);
    await service.confirmPermissionDecision();
    expect(setGrant).not.toHaveBeenCalled();
    await service.commitInstallation();
    await tick();
    expect(setGrant.mock.calls.map(([request]) => [request.permission_id, request.expected_revision])).toEqual([
      ['clipboard.read', '2'],
      ['clipboard.write', '3'],
    ]);
    expect(service.current().feedback?.code).toBe('install_succeeded');

    const failed = setup(snapshot('1'));
    failed.surface.requestedPermissionsByPlugin.set(installed.plugin_id, requestedPermissions);
    failed.handlers.prepareInstallation = handlers.prepareInstallation;
    failed.handlers.commitInstallation = handlers.commitInstallation;
    failed.surface.onReconcile = () => {
      if (failed.surface.current.revision === '1') failed.surface.current = snapshot('2', [installed]);
    };
    failed.setGrant.mockImplementationOnce(async () => {
      throw { code: 'persist_failed' };
    });
    await failed.service.initialize();
    await failed.service.prepareInstallation();
    failed.service.openPermissionConfirmation('clipboard.read', true);
    await failed.service.confirmPermissionDecision();
    failed.service.openPermissionConfirmation('clipboard.write', true);
    await failed.service.confirmPermissionDecision();
    await failed.service.commitInstallation();
    expect(failed.setGrant).toHaveBeenCalledTimes(1);
    expect(failed.service.current().feedback?.code).toBe('install_permissions_failed');

    const partial = setup(snapshot('1'));
    partial.surface.requestedPermissionsByPlugin.set(installed.plugin_id, requestedPermissions);
    partial.handlers.prepareInstallation = handlers.prepareInstallation;
    partial.handlers.commitInstallation = handlers.commitInstallation;
    partial.surface.onReconcile = () => {
      if (partial.surface.current.revision === '1') partial.surface.current = snapshot('2', [installed]);
    };
    partial.setGrant
      .mockImplementationOnce(async (request) => {
        partial.surface.grantsByPlugin.set(installed.plugin_id, Object.freeze([request.permission_id]));
        partial.surface.current = snapshot('3', [installed]);
        return { contract_version: '0.1.0', status: 'changed', revision: '3' } as const;
      })
      .mockImplementationOnce(async () => {
        throw { code: 'persist_failed' };
      });
    await partial.service.initialize();
    await partial.service.prepareInstallation();
    partial.service.openPermissionConfirmation('clipboard.read', true);
    await partial.service.confirmPermissionDecision();
    partial.service.openPermissionConfirmation('clipboard.write', true);
    await partial.service.confirmPermissionDecision();
    await partial.service.commitInstallation();
    expect(partial.setGrant).toHaveBeenCalledTimes(2);
    expect(partial.service.current().feedback?.code).toBe('install_permissions_partial');
  });

  test('serializes revision-bound settings grant and revoke without optimistic authority', async () => {
    const entry = summary('entry_0000000000000041', 'com.acme.settings-permission');
    const { service, setGrant, surface } = setup(snapshot('1', [entry]));
    surface.requestedPermissionsByPlugin.set(
      entry.plugin_id,
      Object.freeze([Object.freeze({ permission_id: 'clipboard.read', reason: Object.freeze({ 'en-US': 'Read.' }) })]),
    );
    await service.initialize();
    await tick();
    service.openPermissionConfirmation('clipboard.read', true);
    expect(service.current().permission_confirmation).toMatchObject({ action: 'grant', context: 'settings' });
    expect(surface.grantsByPlugin.get(entry.plugin_id)).toBeUndefined();
    await service.confirmPermissionDecision();
    await tick();
    expect(setGrant).toHaveBeenLastCalledWith(
      expect.objectContaining({ expected_revision: '1', permission_id: 'clipboard.read', granted: true }),
    );
    expect(service.current().feedback?.code).toBe('permission_granted');
    const grantedDetail = service.current().detail;
    expect(grantedDetail.kind === 'registered' && grantedDetail.permissions[0]?.granted).toBe(true);

    service.openPermissionConfirmation('clipboard.read', false);
    await service.confirmPermissionDecision();
    await tick();
    expect(setGrant).toHaveBeenLastCalledWith(
      expect.objectContaining({ expected_revision: '2', permission_id: 'clipboard.read', granted: false }),
    );
    expect(service.current().feedback?.code).toBe('permission_revoked');
    const revokedDetail = service.current().detail;
    expect(revokedDetail.kind === 'registered' && revokedDetail.permissions[0]?.granted).toBe(false);
  });

  test('propagates a management revoke through the surface and fails old Runtime authority closed', async () => {
    const entry = summary('entry_0000000000000042', 'com.acme.runtime-revoke');
    const unrelated = summary('entry_0000000000000043', 'com.acme.unrelated');
    const { service, surface } = setup(snapshot('1', [entry]));
    surface.requestedPermissionsByPlugin.set(
      entry.plugin_id,
      Object.freeze([Object.freeze({ permission_id: 'clipboard.read', reason: Object.freeze({ 'en-US': 'Read.' }) })]),
    );
    surface.grantsByPlugin.set(entry.plugin_id, Object.freeze(['clipboard.read']));
    const identity: PluginRuntimeSessionIdentity = Object.freeze({
      entry_id: entry.entry_id,
      plugin_id: entry.plugin_id,
      version: entry.version,
      page_id: 'home',
      expected_origin: 'https://lensx-plugin.0123456789abcdef0123456789abcdef.runtime.localhost',
      resource_generation: '0123456789abcdef0123456789abcdef',
      runtime_attempt_key: 'attempt-permission-revoke',
      registration_revision: '1',
      granted_permission_ids: Object.freeze(['clipboard.read']),
    });
    let pendingResolve: ((value: unknown) => void) | undefined;
    const invoke = rs
      .fn<(_command: string, args?: Record<string, unknown>) => Promise<unknown>>()
      .mockImplementationOnce(async () => ({ contract_version: '0.1.0', operation: 'read', text: 'current' }) as const)
      .mockImplementationOnce(
        async () =>
          new Promise((resolve) => {
            pendingResolve = resolve;
          }),
      );
    const registry = new LauncherActionRegistry();
    const factory = createPluginHostApiDispatcherFactory({
      actions: { registry, dispatcher: new LauncherActionDispatcher(registry) },
      clipboard: createPluginClipboardProviderFactory(invoke),
      context: createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'light' }),
      navigation: { isActivePage: () => true, closePageIfMatches: () => true },
    });
    const isCurrent = () =>
      surface.current.entries.some(
        (current) => current.kind === 'registered' && current.entry_id === entry.entry_id && current.enabled,
      ) &&
      (surface.grantsByPlugin.get(entry.plugin_id)?.includes('clipboard.read') ?? false);
    const binding = factory.create({ identity, isCurrent });
    const request = () =>
      binding.handler({
        identity,
        request: { method: 'clipboard.read', params: {} },
        signal: new AbortController().signal,
      });

    await service.initialize();
    await tick();
    surface.current = snapshot('2', [entry, unrelated]);
    surface.publish();
    await tick();
    await expect(request()).resolves.toEqual({ method: 'clipboard.read', result: { text: 'current' } });

    const pending = request();
    await Promise.resolve();
    service.openPermissionConfirmation('clipboard.read', false);
    await service.confirmPermissionDecision();
    await tick();
    pendingResolve?.({ contract_version: '0.1.0', operation: 'read', text: 'late' });
    await expect(pending).resolves.toMatchObject({ code: 'unavailable' });
    await expect(request()).resolves.toMatchObject({ code: 'unavailable' });
    expect(surface.current.entries).toContainEqual(unrelated);

    const narrowedIdentity = Object.freeze({
      ...identity,
      registration_revision: surface.current.revision,
      granted_permission_ids: Object.freeze([]),
    });
    const narrowed = factory.create({ identity: narrowedIdentity, isCurrent: () => true });
    await expect(
      narrowed.handler({
        identity: narrowedIdentity,
        request: { method: 'clipboard.read', params: {} },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ code: 'permission_denied' });
    expect(invoke).toHaveBeenCalledTimes(2);
    binding.dispose();
    narrowed.dispose();
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
          added_permission_ids: ['clipboard.write'],
          removed_permission_ids: ['clipboard.read'],
        }) as const,
    );
    await service.initialize();
    await service.prepareReplacement();
    expect(service.current().confirmation).toMatchObject({
      classification: 'upgrade',
      added_permission_ids: ['clipboard.write'],
      removed_permission_ids: ['clipboard.read'],
    });

    surface.publish(snapshot('8', [entry]));
    expect(replacementService.cancelPrepared).toHaveBeenCalled();
    expect(service.current()).toMatchObject({ feedback: { code: 'conflict' } });
    expect(service.current().confirmation).toBeUndefined();
    await service.destroy();
  });

  test('keeps replacement choices transient and grants supported additions only after commit', async () => {
    const entry = summary('entry_0000000000000032', 'com.acme.replace-permissions');
    const { handlers, service, setGrant, surface } = setup(snapshot('7', [entry]));
    surface.requestedPermissionsByPlugin.set(
      entry.plugin_id,
      Object.freeze([Object.freeze({ permission_id: 'clipboard.read', reason: Object.freeze({ 'en-US': 'Read.' }) })]),
    );
    surface.grantsByPlugin.set(entry.plugin_id, Object.freeze(['clipboard.read']));
    handlers.prepare = async () => ({
      status: 'prepared',
      contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
      preparation_token: 'prep_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      entry_id: entry.entry_id,
      current_version: '1.0.0',
      candidate_version: '2.0.0',
      classification: 'upgrade',
      added_permission_ids: ['clipboard.write'],
      removed_permission_ids: ['clipboard.read'],
    });
    handlers.commitPrepared = async () => ({
      status: 'committed',
      contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
      entry_id: entry.entry_id,
      plugin_id: entry.plugin_id,
      version: '2.0.0',
      classification: 'upgrade',
      revision: '8',
      cleanup: 'complete',
    });
    surface.onReconcile = () => {
      if (surface.current.revision === '7') {
        surface.requestedPermissionsByPlugin.set(
          entry.plugin_id,
          Object.freeze([
            Object.freeze({ permission_id: 'clipboard.write', reason: Object.freeze({ 'en-US': 'Write.' }) }),
          ]),
        );
        surface.grantsByPlugin.set(entry.plugin_id, Object.freeze([]));
        surface.current = snapshot('8', [Object.freeze({ ...entry, version: '2.0.0' })]);
      }
    };
    await service.initialize();
    await tick();
    await service.prepareReplacement();
    expect(service.current().confirmation).toMatchObject({
      retained_permissions: [],
      removed_permissions: [expect.objectContaining({ permission_id: 'clipboard.read', persisted_grant: true })],
      added_permissions: [expect.objectContaining({ permission_id: 'clipboard.write', grant_available: true })],
      selected_permission_ids: [],
    });
    service.openPermissionConfirmation('clipboard.write', true);
    await service.confirmPermissionDecision();
    expect(setGrant).not.toHaveBeenCalled();
    await service.commitReplacement();
    expect(setGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        permission_id: 'clipboard.write',
        expected_revision: '8',
        granted: true,
      }),
    );
    expect(service.current().feedback?.code).toBe('replacement_succeeded');
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
