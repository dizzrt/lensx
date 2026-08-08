import type { NormalizedPluginManifest } from '@lensx/plugin-contract';
import { describe, expect, rs, test } from '@rstest/core';
import validCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import {
  createDefaultLauncherActionService,
  HIDE_LAUNCHER_ACTION_ID,
  LauncherActionRegistry,
  OPEN_SETTINGS_ACTION_ID,
  searchLauncherActions,
} from '../src/app/launcher/actions';
import { resolveLauncherActionCollection } from '../src/app/launcher/collections';
import {
  createPluginActionProjectionForLauncherService,
  createPluginActionProjectionService,
  type PluginActionProjectionDiagnostic,
  type PluginActionProjectionRegistry,
} from '../src/app/plugins/actions';
import {
  type PluginRegistrationDesktopAdapter,
  type PluginRegistrationDetailResponse,
  type PluginRegistrationSnapshot,
  type PluginRegistrationSummary,
  parsePluginRegistrationDetailResponse,
} from '../src/app/plugins/registration';

const parsedHealthyDetail = parsePluginRegistrationDetailResponse(
  structuredClone(validCases.find(({ name }) => name === 'healthy_detail')?.value),
);
if (parsedHealthyDetail.detail.kind !== 'registered') {
  throw new Error('Healthy detail fixture must contain a registered plugin.');
}
const baseDetail = parsedHealthyDetail.detail;
const baseAction = baseDetail.manifest.contributes.actions[0];
if (baseAction === undefined) {
  throw new Error('Healthy detail fixture must contribute one Action.');
}

const manifestFor = (
  pluginId: string,
  title = 'Open Project',
  actionId = 'open_project',
): NormalizedPluginManifest => ({
  ...structuredClone(baseDetail.manifest),
  plugin_id: pluginId,
  contributes: {
    ...structuredClone(baseDetail.manifest.contributes),
    actions: [
      {
        ...structuredClone(baseAction),
        id: actionId,
        title: { 'en-US': title, 'zh-CN': `${title} 中文` },
      },
    ],
    launcher: { default_action_id: actionId },
  },
});

const summaryFor = (
  pluginId: string,
  entryId: string,
  overrides: Partial<Extract<PluginRegistrationSummary, { readonly kind: 'registered' }>> = {},
): Extract<PluginRegistrationSummary, { readonly kind: 'registered' }> => ({
  kind: 'registered',
  entry_id: entryId,
  plugin_id: pluginId,
  version: '1.2.0',
  display: structuredClone(baseDetail.manifest.display),
  source: 'external',
  enabled: true,
  compatibility: { lensx: true, host_api: true },
  runtime: { kind: 'inactive' },
  ...overrides,
});

const snapshotFor = (
  revision: string,
  entries: readonly PluginRegistrationSummary[] = [],
  availability: PluginRegistrationSnapshot['availability'] = { kind: 'available' },
): PluginRegistrationSnapshot => ({
  contract_version: '0.3.0',
  revision,
  availability,
  entries,
});

const detailFor = (
  revision: string,
  entryId: string,
  manifest: NormalizedPluginManifest,
): PluginRegistrationDetailResponse => ({
  contract_version: '0.3.0',
  revision,
  detail: {
    ...structuredClone(baseDetail),
    entry_id: entryId,
    manifest,
  },
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

class ControlledRegistrationAdapter implements PluginRegistrationDesktopAdapter {
  readonly listeners = new Set<(snapshot: PluginRegistrationSnapshot) => void>();
  readonly initializeCalls = rs.fn();
  readonly refreshCalls = rs.fn();
  readonly activationCalls = rs.fn();
  readonly recoveryCalls = rs.fn();
  readonly destroyCalls = rs.fn();
  current: PluginRegistrationSnapshot;
  readDetailHandler: (entryId: string) => Promise<PluginRegistrationDetailResponse>;

  constructor(
    initial: PluginRegistrationSnapshot,
    readDetail: (entryId: string) => Promise<PluginRegistrationDetailResponse>,
  ) {
    this.current = initial;
    this.readDetailHandler = readDetail;
  }

  private publish = () => {
    for (const listener of this.listeners) {
      listener(this.current);
    }
    return this.current;
  };

  setSnapshot(snapshot: PluginRegistrationSnapshot) {
    this.current = snapshot;
    this.publish();
  }

  initialize = async () => {
    this.initializeCalls();
    return this.publish();
  };

  refresh = async () => {
    this.refreshCalls();
    return this.publish();
  };

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
    return () => this.listeners.delete(listener);
  };

  destroy = async () => {
    this.destroyCalls();
    this.listeners.clear();
  };
}

describe('Plugin Action projection service', () => {
  test('projects healthy builtin and external plugins through the default Registry without changing Host behavior', async () => {
    const builtin = summaryFor('com.acme.builtin', 'entry_0000000000000011', { source: 'builtin' });
    const external = summaryFor('com.acme.external', 'entry_0000000000000012', { source: 'external' });
    const adapter = new ControlledRegistrationAdapter(snapshotFor('1', [builtin, external]), async (entryId) => {
      const summary = entryId === builtin.entry_id ? builtin : external;
      return detailFor('1', summary.entry_id, manifestFor(summary.plugin_id));
    });
    const actionService = createDefaultLauncherActionService({ hideLauncher: async () => undefined });
    const openPage = rs.fn(
      async (_target: { readonly owner_id: string; readonly page_id: string }, _actionId: string) => undefined,
    );
    const projection = createPluginActionProjectionForLauncherService(actionService, adapter, { openPage });

    await projection.initialize();
    expect(actionService.registry.snapshot().map(({ action_id }) => action_id)).toEqual([
      'com.acme.builtin.open_project',
      'com.acme.external.open_project',
      HIDE_LAUNCHER_ACTION_ID,
      OPEN_SETTINGS_ACTION_ID,
    ]);
    expect(
      searchLauncherActions({
        query: 'Open Project',
        locale: 'en-US',
        snapshot: actionService.registry.snapshot(),
        limit: 8,
      }).map(({ action_id }) => action_id),
    ).toEqual(['com.acme.builtin.open_project', 'com.acme.external.open_project']);
    expect(
      resolveLauncherActionCollection(
        ['com.acme.external.open_project', 'missing.owner.action'],
        actionService.registry.snapshot(),
      ).map(({ action_id }) => action_id),
    ).toEqual(['com.acme.external.open_project']);
    await expect(actionService.dispatcher.dispatch('com.acme.builtin.open_project')).resolves.toMatchObject({
      ok: true,
    });
    expect(openPage).toHaveBeenCalledWith(
      { owner_id: 'com.acme.builtin', page_id: 'open_project' },
      'com.acme.builtin.open_project',
    );
    await projection.destroy();
  });

  test('fails closed for every ineligible lifecycle state and disappearance while preserving Host Actions', async () => {
    const pluginId = 'com.acme.lifecycle';
    const entryId = 'entry_0000000000000021';
    const eligible = summaryFor(pluginId, entryId);
    let adapter!: ControlledRegistrationAdapter;
    adapter = new ControlledRegistrationAdapter(
      snapshotFor('1', [eligible]),
      async (): Promise<PluginRegistrationDetailResponse> =>
        detailFor(adapter.current.revision, entryId, manifestFor(pluginId)),
    );
    const actionService = createDefaultLauncherActionService({ hideLauncher: async () => undefined });
    const projection = createPluginActionProjectionForLauncherService(actionService, adapter, { openPage: rs.fn() });
    const pluginActionId = `${pluginId}.open_project`;
    const expectPublished = (published: boolean) => {
      expect(actionService.registry.get(pluginActionId) !== undefined).toBe(published);
      expect(actionService.registry.get(HIDE_LAUNCHER_ACTION_ID)).toBeDefined();
    };

    await projection.initialize();
    expectPublished(true);

    adapter.setSnapshot(snapshotFor('2', [{ ...eligible, enabled: false }]));
    await projection.whenIdle();
    expectPublished(false);
    adapter.setSnapshot(snapshotFor('3', [eligible]));
    await projection.whenIdle();
    expectPublished(true);
    adapter.setSnapshot(snapshotFor('4', [{ ...eligible, compatibility: { lensx: false, host_api: true } }]));
    await projection.whenIdle();
    expectPublished(false);
    adapter.setSnapshot(snapshotFor('5', [eligible]));
    await projection.whenIdle();
    expectPublished(true);
    adapter.setSnapshot(
      snapshotFor('6', [
        {
          kind: 'quarantined',
          entry_id: entryId,
          plugin_id: pluginId,
          diagnostic: { code: 'record_invalid', phase: 'recover', message: 'Plugin record is invalid.' },
        },
      ]),
    );
    await projection.whenIdle();
    expectPublished(false);
    adapter.setSnapshot(snapshotFor('7', [eligible]));
    await projection.whenIdle();
    expectPublished(true);
    adapter.setSnapshot(
      snapshotFor('8', [eligible], {
        kind: 'degraded',
        diagnostic: { code: 'store_unavailable', phase: 'initialize', message: 'Storage unavailable.' },
      }),
    );
    await projection.whenIdle();
    expectPublished(false);
    adapter.setSnapshot(snapshotFor('9', [eligible]));
    await projection.whenIdle();
    expectPublished(true);
    adapter.setSnapshot(snapshotFor('10'));
    await projection.whenIdle();
    expectPublished(false);
    await projection.destroy();
  });

  test('contains detail identity, revision, read, and Registry failures per plugin with safe diagnostics', async () => {
    const pluginId = 'com.acme.failure';
    const entryId = 'entry_0000000000000031';
    const eligible = summaryFor(pluginId, entryId);
    const diagnostics: PluginActionProjectionDiagnostic[] = [];
    const backingRegistry = new LauncherActionRegistry();
    let rejectReplacement = false;
    let throwReplacement = false;
    const registry: PluginActionProjectionRegistry = {
      replaceProviderBatch(owner, registrations) {
        if (throwReplacement && registrations.length > 0) {
          throw new Error('/private/registry/path raw stack');
        }
        if (rejectReplacement && registrations.length > 0) {
          return {
            ok: false,
            diagnostics: [{ code: 'invalid_id', path: '/private/path', message: 'raw stack' }],
          };
        }
        return backingRegistry.replaceProviderBatch(owner, registrations);
      },
    };
    let adapter!: ControlledRegistrationAdapter;
    adapter = new ControlledRegistrationAdapter(
      snapshotFor('1', [eligible]),
      async (): Promise<PluginRegistrationDetailResponse> =>
        detailFor(adapter.current.revision, entryId, manifestFor(pluginId)),
    );
    const projection = createPluginActionProjectionService({
      registrationAdapter: adapter,
      registry,
      pageOpener: { openPage: rs.fn() },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const actionId = `${pluginId}.open_project`;

    await projection.initialize();
    expect(backingRegistry.get(actionId)).toBeDefined();

    adapter.readDetailHandler = async () => detailFor('2', 'entry_0000000000000099', manifestFor(pluginId));
    adapter.setSnapshot(snapshotFor('2', [eligible]));
    await projection.whenIdle();
    expect(backingRegistry.get(actionId)).toBeUndefined();

    adapter.readDetailHandler = async () => detailFor('999', entryId, manifestFor(pluginId));
    adapter.setSnapshot(snapshotFor('3', [eligible]));
    await projection.whenIdle();

    adapter.readDetailHandler = async () => {
      throw new Error('/private/plugin/path native stack');
    };
    adapter.setSnapshot(snapshotFor('4', [eligible]));
    await projection.whenIdle();

    rejectReplacement = true;
    adapter.readDetailHandler = async () => detailFor('5', entryId, manifestFor(pluginId));
    adapter.setSnapshot(snapshotFor('5', [eligible]));
    await projection.whenIdle();
    expect(backingRegistry.get(actionId)).toBeUndefined();

    rejectReplacement = false;
    throwReplacement = true;
    adapter.readDetailHandler = async () => detailFor('6', entryId, manifestFor(pluginId));
    adapter.setSnapshot(snapshotFor('6', [eligible]));
    await projection.whenIdle();
    expect(backingRegistry.get(actionId)).toBeUndefined();
    expect(diagnostics.map(({ code }) => code)).toEqual([
      'detail_mismatch',
      'detail_mismatch',
      'detail_read_failed',
      'registry_replacement_failed',
      'registry_replacement_failed',
    ]);
    expect(JSON.stringify(diagnostics)).not.toMatch(/private|path|stack|native/u);
    await projection.destroy();
  });

  test('serializes rapid revisions, drops stale detail, and treats duplicate refreshes idempotently', async () => {
    const pluginId = 'com.acme.rapid';
    const entryId = 'entry_0000000000000041';
    const eligible = summaryFor(pluginId, entryId);
    const oldDetail = deferred<PluginRegistrationDetailResponse>();
    let detailReads = 0;
    const adapter = new ControlledRegistrationAdapter(snapshotFor('6'), async () => {
      detailReads += 1;
      return detailReads === 1 ? oldDetail.promise : detailFor('8', entryId, manifestFor(pluginId, 'Revision Eight'));
    });
    const registry = new LauncherActionRegistry();
    const replace = rs.fn(registry.replaceProviderBatch.bind(registry));
    const projection = createPluginActionProjectionService({
      registrationAdapter: adapter,
      registry: { replaceProviderBatch: replace },
      pageOpener: { openPage: rs.fn() },
    });
    await projection.initialize();

    adapter.setSnapshot(snapshotFor('7', [eligible]));
    await tick();
    adapter.setSnapshot(snapshotFor('8', [eligible]));
    oldDetail.resolve(detailFor('7', entryId, manifestFor(pluginId, 'Stale Seven')));
    await projection.whenIdle();
    expect(registry.get(`${pluginId}.open_project`)?.title['en-US']).toBe('Revision Eight');

    const replacementCalls = replace.mock.calls.length;
    await projection.refresh();
    await projection.refresh();
    expect(replace).toHaveBeenCalledTimes(replacementCalls);
    await projection.destroy();
  });

  test('reconverges on Launcher activation and listener recovery, then prevents commits after destroy', async () => {
    const pluginId = 'com.acme.recovery';
    const entryId = 'entry_0000000000000051';
    const eligible = summaryFor(pluginId, entryId);
    const pending = deferred<PluginRegistrationDetailResponse>();
    const adapter = new ControlledRegistrationAdapter(snapshotFor('0'), async () => pending.promise);
    const registry = new LauncherActionRegistry();
    const projection = createPluginActionProjectionService({
      registrationAdapter: adapter,
      registry,
      pageOpener: { openPage: rs.fn() },
    });
    await projection.initialize();

    adapter.current = snapshotFor('1', [eligible]);
    const activation = projection.handleLauncherActivation();
    await tick();
    expect(adapter.activationCalls).toHaveBeenCalledTimes(1);
    await projection.destroy();
    pending.resolve(detailFor('1', entryId, manifestFor(pluginId)));
    await activation;
    expect(registry.get(`${pluginId}.open_project`)).toBeUndefined();
    expect(adapter.destroyCalls).toHaveBeenCalledTimes(1);

    const recoveryAdapter = new ControlledRegistrationAdapter(snapshotFor('2', [eligible]), async () =>
      detailFor('2', entryId, manifestFor(pluginId)),
    );
    const recoveryRegistry = new LauncherActionRegistry();
    const recoveryProjection = createPluginActionProjectionService({
      registrationAdapter: recoveryAdapter,
      registry: recoveryRegistry,
      pageOpener: { openPage: rs.fn() },
    });
    await recoveryProjection.initialize();
    recoveryAdapter.current = snapshotFor('3');
    await recoveryProjection.recoverListener();
    expect(recoveryAdapter.recoveryCalls).toHaveBeenCalledTimes(1);
    expect(recoveryRegistry.get(`${pluginId}.open_project`)).toBeUndefined();
    await recoveryProjection.destroy();
  });
});
