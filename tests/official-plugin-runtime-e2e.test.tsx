import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import { render, waitFor } from '@testing-library/react';

import { AppProviders } from '../src/app/AppProviders';
import type { ActivePage, PageResolution } from '../src/app/navigation';
import type { PluginRegistrationSnapshot } from '../src/app/plugins/registration';
import { createPluginReplacementService, PLUGIN_REPLACEMENT_CONTRACT_VERSION } from '../src/app/plugins/replacement';
import {
  createPluginRuntimeLifecycleService,
  type PluginChildWebviewPresentationController,
  type PluginPageRuntimeDescriptor,
  PluginRuntimeSlot,
} from '../src/app/plugins/runtime';
import type { PluginSurfaceProjectionService } from '../src/app/plugins/surfaces';

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 20, top: 40, right: 320, bottom: 240, width: 300, height: 200 }) as DOMRect;
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

test('official candidate opens through the ordinary Child WebView slot and closed Host boundary', async () => {
  const pluginId = process.env.LENSX_OFFICIAL_CANDIDATE_PLUGIN_ID ?? 'dev.lensx.fixture.alpha';
  const version = process.env.LENSX_OFFICIAL_CANDIDATE_VERSION ?? '1.0.0';
  const candidatePath = process.env.LENSX_OFFICIAL_CANDIDATE_PATH;
  const candidateDigest = process.env.LENSX_OFFICIAL_CANDIDATE_DIGEST;
  if (candidatePath !== undefined || candidateDigest !== undefined) {
    expect(candidatePath).toBeDefined();
    expect(candidateDigest).toMatch(/^[0-9a-f]{64}$/u);
    const candidateBytes = readFileSync(candidatePath as string);
    expect(candidateBytes.length).toBeGreaterThan(0);
    expect(createHash('sha256').update(candidateBytes).digest('hex')).toBe(candidateDigest);
  }
  const activePage: ActivePage = {
    owner_id: pluginId,
    page_id: 'main',
    opened_by_action_id: `${pluginId}.open`,
  };
  const pageResolution: PageResolution = {
    provider: { kind: 'plugin', owner_id: pluginId, display_name: { 'en-US': 'Official fixture' } },
    page: {
      owner_id: pluginId,
      page_id: 'main',
      available: true,
      route: '/',
      title: { 'en-US': 'Official fixture' },
    },
  };
  const origin = 'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost';
  const encodedPluginId = Buffer.from(pluginId).toString('hex');
  const entryUrl = `${origin}/v1/0123456789abcdef0123456789abcdef/v1-${encodedPluginId}/${version}/index.html`;
  const descriptor: PluginPageRuntimeDescriptor = {
    runtime_key: 'official-candidate-runtime',
    entry_url: entryUrl,
    host_fragment: '/',
    entry_id: 'entry_0123456789abcdef',
    plugin_id: pluginId,
    version,
    page_id: 'main',
    expected_origin: origin,
    resource_generation: '0123456789abcdef0123456789abcdef',
    runtime_attempt_key: 'official-candidate-attempt',
    registration_revision: '1',
  };
  const create = rs.fn(async () => ({ attemptId: 'attempt_0123456789abcdef' as const }));
  const setVisible = rs.fn(async () => undefined);
  const destroy = rs.fn(async () => true);
  const presentationController: PluginChildWebviewPresentationController = {
    create,
    updateSlot: rs.fn(async () => undefined),
    readReadiness: rs.fn(async () => ({ status: 'ready' as const })),
    waitReadiness: rs.fn(async () => ({ status: 'ready' as const })),
    setVisible,
    destroy,
  };
  const resolver = { resolve: async () => descriptor };
  const view = render(
    <AppProviders>
      <PluginRuntimeSlot
        activePage={activePage}
        lifecycleService={createPluginRuntimeLifecycleService()}
        pageResolution={pageResolution}
        pageTitle="Official fixture"
        presentationController={presentationController}
        resolver={resolver}
      />
    </AppProviders>,
  );
  await waitFor(() => expect(setVisible).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }, true));
  expect(document.querySelector('iframe')).toBeNull();
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      identity: {
        entryId: descriptor.entry_id,
        pluginId,
        version,
        pageId: 'main',
        expectedRevision: '1',
      },
    }),
  );
  window.dispatchEvent(new Event('resize'));
  await waitFor(() => expect(presentationController.updateSlot).toHaveBeenCalledTimes(1));
  view.unmount();
  await waitFor(() => expect(setVisible).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }, false));
  await waitFor(() => expect(destroy).toHaveBeenCalledWith({ attemptId: 'attempt_0123456789abcdef' }));
  expect(document.querySelector('[data-plugin-runtime-slot="true"]')).toBeNull();
});

test('ordinary ConfigLens replacement terminates the old provider without gaining official authority', async () => {
  const pluginId = 'dev.lensx.config-lens';
  const oldVersion = process.env.LENSX_OFFICIAL_CANDIDATE_VERSION ?? '0.1.0';
  const nextVersion = process.env.LENSX_OFFICIAL_REPLACEMENT_VERSION ?? '0.1.1';
  const oldBytes = process.env.LENSX_OFFICIAL_CANDIDATE_PATH
    ? readFileSync(process.env.LENSX_OFFICIAL_CANDIDATE_PATH)
    : Buffer.from('config-lens-old');
  const nextBytes = process.env.LENSX_OFFICIAL_REPLACEMENT_PATH
    ? readFileSync(process.env.LENSX_OFFICIAL_REPLACEMENT_PATH)
    : Buffer.from('config-lens-next');
  expect(createHash('sha256').update(oldBytes).digest('hex')).not.toBe(
    createHash('sha256').update(nextBytes).digest('hex'),
  );
  if (process.env.LENSX_OFFICIAL_REPLACEMENT_DIGEST !== undefined) {
    expect(createHash('sha256').update(nextBytes).digest('hex')).toBe(process.env.LENSX_OFFICIAL_REPLACEMENT_DIGEST);
  }
  const snapshot: PluginRegistrationSnapshot = {
    contract_version: '0.3.0',
    revision: '1',
    availability: { kind: 'available' },
    entries: [
      {
        kind: 'registered',
        entry_id: 'entry_0123456789abcdef',
        plugin_id: pluginId,
        version: oldVersion,
        display: { name: { 'en-US': 'ConfigLens', 'zh-CN': 'ConfigLens' } },
        source: 'external',
        enabled: true,
        compatibility: { lensx: true, host_api: true },
        runtime: { kind: 'inactive' },
      },
    ],
  };
  const operations: string[] = [];
  const surface = {
    currentSnapshot: () => snapshot,
    initialize: async () => undefined,
    quiesceProvider: async (id: string) => {
      operations.push(`quiesce:${id}`);
    },
    reconcileRevision: async (revision: string, id?: string) => {
      operations.push(`reconcile:${revision}:${id ?? ''}`);
    },
    whenIdle: async () => undefined,
  } as unknown as PluginSurfaceProjectionService;
  const service = createPluginReplacementService({
    surfaceProjection: surface,
    replacementAdapter: {
      prepare: async () => ({
        status: 'prepared',
        contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
        preparation_token: 'prep_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        entry_id: 'entry_0123456789abcdef',
        current_version: oldVersion,
        candidate_version: nextVersion,
        classification: 'upgrade',
      }),
      commit: async () => ({
        status: 'committed',
        contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
        entry_id: 'entry_0123456789abcdef',
        plugin_id: pluginId,
        version: nextVersion,
        classification: 'upgrade',
        revision: '2',
        cleanup: 'complete',
      }),
      cancel: async () => ({ status: 'cancelled', contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION }),
    },
  });
  await expect(service.replace({ entry_id: 'entry_0123456789abcdef', expected_revision: '1' })).resolves.toMatchObject({
    status: 'committed',
    plugin_id: pluginId,
    version: nextVersion,
  });
  expect(snapshot.entries[0]).toMatchObject({ source: 'external' });
  expect(operations).toEqual([`quiesce:${pluginId}`, `reconcile:2:${pluginId}`]);
});
