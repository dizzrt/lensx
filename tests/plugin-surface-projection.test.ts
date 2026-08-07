import type { NormalizedPluginManifest } from '@lensx/plugin-contract';
import { describe, expect, rs, test } from '@rstest/core';
import validCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import { LauncherActionRegistry } from '../src/app/launcher/actions';
import { AppNavigationService, PageRegistry } from '../src/app/navigation';
import {
  type PluginRegistrationDesktopAdapter,
  type PluginRegistrationDetailResponse,
  type PluginRegistrationSnapshot,
  type PluginRegistrationSummary,
  parsePluginRegistrationDetailResponse,
} from '../src/app/plugins/registration';
import {
  createPluginSurfaceProjectionService,
  type PluginSurfaceProjectionDiagnostic,
} from '../src/app/plugins/surfaces';

const parsed = parsePluginRegistrationDetailResponse(
  structuredClone(validCases.find(({ name }) => name === 'healthy_detail')?.value),
);
if (parsed.detail.kind !== 'registered') {
  throw new Error('Healthy detail fixture must contain a registered plugin.');
}
const baseDetail = parsed.detail;

const manifestFor = (pluginId: string, actionTitle = 'Open Project'): NormalizedPluginManifest => ({
  ...structuredClone(baseDetail.manifest),
  plugin_id: pluginId,
  contributes: {
    ...structuredClone(baseDetail.manifest.contributes),
    actions: baseDetail.manifest.contributes.actions.map((action) => ({
      ...structuredClone(action),
      title: { 'en-US': actionTitle },
    })),
  },
});

const summaryFor = (pluginId: string, entryId: string): PluginRegistrationSummary => ({
  kind: 'registered',
  entry_id: entryId,
  plugin_id: pluginId,
  version: '1.0.0',
  display: structuredClone(baseDetail.manifest.display),
  source: 'external',
  enabled: true,
  compatibility: { lensx: true, host_api: true },
  runtime: { kind: 'inactive' },
});

const snapshotFor = (
  revision: string,
  entries: readonly PluginRegistrationSummary[] = [],
  availability: PluginRegistrationSnapshot['availability'] = { kind: 'available' },
): PluginRegistrationSnapshot => ({
  contract_version: '0.2.0',
  revision,
  availability,
  entries,
});

const detailFor = (
  revision: string,
  entryId: string,
  pluginId: string,
  actionTitle = 'Open Project',
): PluginRegistrationDetailResponse => ({
  contract_version: '0.2.0',
  revision,
  detail: {
    ...structuredClone(baseDetail),
    entry_id: entryId,
    manifest: manifestFor(pluginId, actionTitle),
    granted_permission_ids: ['lensx.filesystem.read_selected'],
  },
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

class ControlledAdapter implements PluginRegistrationDesktopAdapter {
  readonly listeners = new Set<(snapshot: PluginRegistrationSnapshot) => void>();
  readonly destroyCalls = rs.fn();
  readonly activationCalls = rs.fn();
  readonly recoveryCalls = rs.fn();
  current: PluginRegistrationSnapshot;
  readDetailHandler: (entryId: string) => Promise<PluginRegistrationDetailResponse>;

  constructor(
    initial: PluginRegistrationSnapshot,
    readDetail: (entryId: string) => Promise<PluginRegistrationDetailResponse>,
  ) {
    this.current = initial;
    this.readDetailHandler = readDetail;
  }

  publish(snapshot = this.current) {
    this.current = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  initialize = async () => this.publish();
  refresh = async () => this.publish();
  readDetail = (entryId: string) => this.readDetailHandler(entryId);
  handleLauncherActivation = async () => {
    this.activationCalls();
    return this.publish();
  };
  recoverListener = async () => {
    this.recoveryCalls();
    return this.publish();
  };
  subscribe = (listener: (snapshot: PluginRegistrationSnapshot) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  destroy = async () => {
    this.destroyCalls();
    this.listeners.clear();
  };
}

const hostPage = {
  owner_id: 'lensx.core',
  page_id: 'settings',
  enabled: true,
} as const;

describe('Plugin surface projection coordinator', () => {
  test('reads one current detail and commits Page-before-Action, then removes Action-before-Page', async () => {
    const pluginId = 'com.acme.surface';
    const entryId = 'entry_0000000000000041';
    const summary = summaryFor(pluginId, entryId);
    const adapter = new ControlledAdapter(snapshotFor('1', [summary]), async () => detailFor('1', entryId, pluginId));
    const actionRegistry = new LauncherActionRegistry();
    const pageRegistry = new PageRegistry([hostPage]);
    const navigationService = new AppNavigationService(pageRegistry);
    const operations: string[] = [];
    const projection = createPluginSurfaceProjectionService({
      registrationAdapter: adapter,
      navigationService,
      actionRegistry: {
        replaceProviderBatch: (owner, registrations) => {
          operations.push(`action:${owner}:${registrations.length}`);
          return actionRegistry.replaceProviderBatch(owner, registrations);
        },
      },
      pageRegistry: {
        replaceProviderBatch: (owner, batch) => {
          operations.push(`page:${owner}:${'pages' in batch ? batch.pages.length : 0}`);
          return pageRegistry.replaceProviderBatch(owner, batch);
        },
      },
    });

    await projection.initialize();
    expect(operations.slice(0, 2)).toEqual([`page:${pluginId}:2`, `action:${pluginId}:1`]);
    expect(actionRegistry.get(`${pluginId}.open_project`)).toBeDefined();
    expect(pageRegistry.lookup({ owner_id: pluginId, page_id: 'open_project' })?.page.available).toBe(true);

    operations.length = 0;
    adapter.publish(snapshotFor('2'));
    await projection.whenIdle();
    expect(operations.slice(0, 2)).toEqual([`action:${pluginId}:0`, `page:${pluginId}:0`]);
    expect(actionRegistry.get(`${pluginId}.open_project`)).toBeUndefined();
    expect(pageRegistry.hasAvailablePage(hostPage)).toBe(true);
    await projection.destroy();
  });

  test('filters permission-blocked Actions and fails closed on degraded snapshots while preserving Host state', async () => {
    const pluginId = 'com.acme.permissions';
    const entryId = 'entry_0000000000000042';
    const summary = summaryFor(pluginId, entryId);
    let adapter!: ControlledAdapter;
    adapter = new ControlledAdapter(snapshotFor('1', [summary]), async () => ({
      ...detailFor(adapter.current.revision, entryId, pluginId),
      detail: {
        ...baseDetail,
        entry_id: entryId,
        manifest: manifestFor(pluginId),
        granted_permission_ids: [],
      },
    }));
    const actionRegistry = new LauncherActionRegistry();
    const pageRegistry = new PageRegistry([hostPage]);
    const projection = createPluginSurfaceProjectionService({
      registrationAdapter: adapter,
      navigationService: new AppNavigationService(pageRegistry),
      actionRegistry,
      pageRegistry,
    });

    await projection.initialize();
    expect(actionRegistry.get(`${pluginId}.open_project`)).toBeUndefined();
    expect(pageRegistry.lookup({ owner_id: pluginId, page_id: 'open_project' })?.page.available).toBe(false);
    adapter.publish(
      snapshotFor('2', [summary], {
        kind: 'degraded',
        diagnostic: { code: 'store_unavailable', phase: 'initialize', message: 'Store unavailable.' },
      }),
    );
    await projection.whenIdle();
    expect(pageRegistry.lookup({ owner_id: pluginId, page_id: 'home' })).toBeUndefined();
    expect(pageRegistry.hasAvailablePage(hostPage)).toBe(true);
    await projection.destroy();
  });

  test('drops stale detail, coalesces rapid revisions, and refreshes through activation and listener recovery', async () => {
    const pluginId = 'com.acme.revision';
    const entryId = 'entry_0000000000000043';
    const summary = summaryFor(pluginId, entryId);
    const first = deferred<PluginRegistrationDetailResponse>();
    const readDetail = rs.fn(async () => {
      if (adapter.current.revision === '1') {
        return first.promise;
      }
      return detailFor(adapter.current.revision, entryId, pluginId, `Revision ${adapter.current.revision}`);
    });
    const adapter = new ControlledAdapter(snapshotFor('1', [summary]), readDetail);
    const actionRegistry = new LauncherActionRegistry();
    const pageRegistry = new PageRegistry([hostPage]);
    const projection = createPluginSurfaceProjectionService({
      registrationAdapter: adapter,
      navigationService: new AppNavigationService(pageRegistry),
      actionRegistry,
      pageRegistry,
    });

    const initializing = projection.initialize();
    await Promise.resolve();
    adapter.publish(snapshotFor('2', [summary]));
    adapter.publish(snapshotFor('3', [summary]));
    first.resolve(detailFor('1', entryId, pluginId, 'Stale'));
    await initializing;
    await projection.whenIdle();
    expect(actionRegistry.get(`${pluginId}.open_project`)?.title['en-US']).toBe('Revision 3');
    expect(readDetail).toHaveBeenCalledTimes(2);

    await projection.handleLauncherActivation();
    await projection.recoverListener();
    expect(adapter.activationCalls).toHaveBeenCalledTimes(1);
    expect(adapter.recoveryCalls).toHaveBeenCalledTimes(1);
    await projection.destroy();
  });

  test('rolls back a provider on commit failure and reports only bounded diagnostics', async () => {
    const pluginId = 'com.acme.failure';
    const entryId = 'entry_0000000000000044';
    const summary = summaryFor(pluginId, entryId);
    const adapter = new ControlledAdapter(snapshotFor('1', [summary]), async () => detailFor('1', entryId, pluginId));
    const pageRegistry = new PageRegistry([hostPage]);
    const actionRegistry = new LauncherActionRegistry();
    const diagnostics: PluginSurfaceProjectionDiagnostic[] = [];
    const pageReplace = rs.fn(pageRegistry.replaceProviderBatch.bind(pageRegistry));
    const projection = createPluginSurfaceProjectionService({
      registrationAdapter: adapter,
      navigationService: new AppNavigationService(pageRegistry),
      pageRegistry: { replaceProviderBatch: pageReplace },
      actionRegistry: {
        replaceProviderBatch: (owner, registrations) =>
          registrations.length > 0
            ? {
                ok: false,
                diagnostics: [{ code: 'invalid_type', path: '/private/route', message: 'raw stack from Tauri Rust' }],
              }
            : actionRegistry.replaceProviderBatch(owner, registrations),
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    await projection.initialize();
    expect(pageRegistry.lookup({ owner_id: pluginId, page_id: 'home' })).toBeUndefined();
    expect(diagnostics).toEqual([
      {
        code: 'action_registry_replacement_failed',
        plugin_id: pluginId,
        message: 'Plugin Actions could not be published.',
      },
    ]);
    expect(pageReplace.mock.calls.some(([, batch]) => 'pages' in batch)).toBe(true);
    expect(pageReplace.mock.calls.some(([, batch]) => Array.isArray(batch))).toBe(true);
    expect(JSON.stringify(diagnostics)).not.toMatch(/private|route|raw|stack|Tauri|Rust/u);
    await projection.destroy();
  });

  test('rejects identity and revision mismatch and forbids pending commits after destroy', async () => {
    const pluginId = 'com.acme.destroyed';
    const entryId = 'entry_0000000000000045';
    const summary = summaryFor(pluginId, entryId);
    const mismatchAdapter = new ControlledAdapter(snapshotFor('1', [summary]), async () =>
      detailFor('2', entryId, 'com.other.plugin'),
    );
    const mismatchPages = new PageRegistry([hostPage]);
    const mismatchActions = new LauncherActionRegistry();
    const diagnostics: PluginSurfaceProjectionDiagnostic[] = [];
    const mismatchProjection = createPluginSurfaceProjectionService({
      registrationAdapter: mismatchAdapter,
      navigationService: new AppNavigationService(mismatchPages),
      pageRegistry: mismatchPages,
      actionRegistry: mismatchActions,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    await mismatchProjection.initialize();
    expect(diagnostics).toEqual([
      {
        code: 'detail_mismatch',
        plugin_id: pluginId,
        message: 'Plugin surface detail did not match the current registration.',
      },
    ]);
    expect(mismatchPages.lookup({ owner_id: pluginId, page_id: 'home' })).toBeUndefined();
    await mismatchProjection.destroy();

    const pending = deferred<PluginRegistrationDetailResponse>();
    const adapter = new ControlledAdapter(snapshotFor('1', [summary]), async () => pending.promise);
    const pageRegistry = new PageRegistry([hostPage]);
    const pageReplace = rs.fn(pageRegistry.replaceProviderBatch.bind(pageRegistry));
    const projection = createPluginSurfaceProjectionService({
      registrationAdapter: adapter,
      navigationService: new AppNavigationService(pageRegistry),
      pageRegistry: { replaceProviderBatch: pageReplace },
      actionRegistry: new LauncherActionRegistry(),
    });
    const initializing = projection.initialize();
    await Promise.resolve();
    const destroying = projection.destroy();
    pending.resolve(detailFor('1', entryId, pluginId));
    await initializing;
    await destroying;
    expect(adapter.destroyCalls).toHaveBeenCalledTimes(1);
    expect(pageReplace.mock.calls.every(([, batch]) => Array.isArray(batch))).toBe(true);
  });

  test('explicit quiesce withdraws Action before Page, closes the active Page, and can reconcile', async () => {
    const pluginId = 'com.acme.quiesce';
    const entryId = 'entry_0000000000000046';
    const summary = summaryFor(pluginId, entryId);
    let adapter!: ControlledAdapter;
    adapter = new ControlledAdapter(snapshotFor('1', [summary]), async () =>
      detailFor(adapter.current.revision, entryId, pluginId),
    );
    const actionRegistry = new LauncherActionRegistry();
    const pageRegistry = new PageRegistry([hostPage]);
    const navigationService = new AppNavigationService(pageRegistry);
    const activePages: Array<{ readonly owner_id: string; readonly page_id: string } | undefined> = [];
    navigationService.registerHandler((page) => activePages.push(page));
    const operations: string[] = [];
    const projection = createPluginSurfaceProjectionService({
      registrationAdapter: adapter,
      navigationService,
      actionRegistry: {
        replaceProviderBatch: (owner, registrations) => {
          operations.push(`action:${registrations.length}`);
          return actionRegistry.replaceProviderBatch(owner, registrations);
        },
      },
      pageRegistry: {
        replaceProviderBatch: (owner, batch) => {
          operations.push(`page:${'pages' in batch ? batch.pages.length : 0}`);
          return pageRegistry.replaceProviderBatch(owner, batch);
        },
      },
    });
    await projection.initialize();
    navigationService.openPage({ owner_id: pluginId, page_id: 'home' }, `${pluginId}.open_project`);
    operations.length = 0;
    await projection.quiesceProvider(pluginId);
    expect(operations).toEqual(['action:0', 'page:0']);
    expect(activePages.at(-1)).toBeUndefined();
    expect(actionRegistry.get(`${pluginId}.open_project`)).toBeUndefined();

    adapter.current = snapshotFor('2', [summary]);
    await projection.reconcileRevision('2', pluginId);
    expect(operations.slice(-2)).toEqual(['page:2', 'action:1']);
    expect(actionRegistry.get(`${pluginId}.open_project`)).toBeDefined();
    await projection.destroy();
  });
});
