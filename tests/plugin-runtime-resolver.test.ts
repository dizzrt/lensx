import { describe, expect, rs, test } from '@rstest/core';
import validRegistrationCases from '../fixtures/plugin-registration-contract/valid/cases.json';
import validResourceCases from '../fixtures/plugin-resource-service/valid/cases.json';
import type { ActivePage, PageResolution } from '../src/app/navigation';
import {
  type PluginRegistrationDetailResponse,
  type PluginRegistrationSnapshot,
  type PluginRegistrationSummary,
  parsePluginRegistrationDetailResponse,
} from '../src/app/plugins/registration';
import { type PluginResourceEntry, PluginResourceError, parsePluginResourceEntry } from '../src/app/plugins/resource';
import {
  createPluginPageRuntimeResolver,
  isValidIsolatedPluginRuntimeEntryUrl,
  isValidPluginRuntimeRoute,
  PluginPageRuntimeError,
} from '../src/app/plugins/runtime';

const entry = parsePluginResourceEntry(
  structuredClone(validResourceCases.find(({ name }) => name === 'resolved_entry')?.value),
);
const activePage: ActivePage = {
  owner_id: entry.plugin_id,
  page_id: 'home',
  opened_by_action_id: `${entry.plugin_id}.open`,
};
const pageResolution: PageResolution = {
  provider: {
    kind: 'plugin',
    owner_id: entry.plugin_id,
    display_name: { 'en-US': 'Workspace' },
  },
  page: {
    owner_id: entry.plugin_id,
    page_id: 'home',
    available: true,
    required_permission_ids: [],
    route: '/route-probe',
    title: { 'en-US': 'Home' },
  },
};

const registeredEntry: Extract<PluginRegistrationSummary, { readonly kind: 'registered' }> = {
  kind: 'registered',
  entry_id: entry.entry_id,
  plugin_id: entry.plugin_id,
  version: entry.version,
  display: { name: { 'en-US': 'Workspace' }, description: { 'en-US': 'Plugin' } },
  source: 'external',
  enabled: true,
  compatibility: { lensx: true, host_api: true },
  runtime: { kind: 'inactive' },
};

const parsedDetail = parsePluginRegistrationDetailResponse(
  structuredClone(validRegistrationCases.find(({ name }) => name === 'healthy_detail')?.value),
);
if (parsedDetail.detail.kind !== 'registered') throw new Error('Expected registered detail fixture.');
const [firstManifestPage, ...remainingManifestPages] = parsedDetail.detail.manifest.contributes.pages;
const registrationDetail: Extract<PluginRegistrationDetailResponse['detail'], { readonly kind: 'registered' }> = {
  ...parsedDetail.detail,
  entry_id: entry.entry_id,
  manifest: {
    ...parsedDetail.detail.manifest,
    plugin_id: entry.plugin_id,
    version: entry.version,
    contributes: {
      ...parsedDetail.detail.manifest.contributes,
      pages: [
        {
          ...firstManifestPage,
          id: activePage.page_id,
          route: pageResolution.page.route,
          required_permissions: [],
        },
        ...remainingManifestPages,
      ],
    },
  },
  granted_permission_ids: [],
};

const snapshot = (overrides: Partial<PluginRegistrationSnapshot> = {}): PluginRegistrationSnapshot => ({
  contract_version: '0.2.0',
  revision: entry.revision,
  availability: { kind: 'available' },
  entries: [registeredEntry],
  ...overrides,
});

const harness = (
  initial: PluginRegistrationSnapshot | undefined | null = null,
  result: PluginResourceEntry = entry,
) => {
  let current: PluginRegistrationSnapshot | undefined = initial === null ? snapshot() : initial;
  let currentDetail = registrationDetail;
  let detailRevision: string | undefined;
  const refresh = rs.fn(async () => undefined);
  const whenIdle = rs.fn(async () => undefined);
  const resolveEntry = rs.fn(async () => ({ ...result, revision: current?.revision ?? result.revision }));
  const readRegistrationDetail = rs.fn(
    async (): Promise<PluginRegistrationDetailResponse> => ({
      contract_version: '0.2.0' as const,
      revision: detailRevision ?? current?.revision ?? entry.revision,
      detail: currentDetail,
    }),
  );
  const listeners = new Set<(snapshot: PluginRegistrationSnapshot) => void>();
  const resolver = createPluginPageRuntimeResolver({
    resourceAdapter: { resolveEntry },
    surfaceProjectionService: {
      currentSnapshot: () => current,
      readRegistrationDetail,
      refresh,
      subscribeSnapshot: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      whenIdle,
    },
  });
  return {
    resolver,
    refresh,
    readRegistrationDetail,
    resolveEntry,
    publish: (value: PluginRegistrationSnapshot) => {
      current = value;
      for (const listener of listeners) listener(value);
    },
    setCurrent: (value: PluginRegistrationSnapshot | undefined) => {
      current = value;
    },
    setDetail: (value: typeof registrationDetail, revision?: string) => {
      currentDetail = value;
      detailRevision = revision;
    },
    whenIdle,
  };
};

describe('Host-private Plugin Page Runtime resolver', () => {
  test('derives a fragment target from current eligible Host facts without mutating public Page data', async () => {
    const { resolver, resolveEntry } = harness();
    const descriptor = await resolver.resolve({ activePage, pageResolution, attempt: 0 });
    expect(resolveEntry).toHaveBeenCalledWith({
      contract_version: '0.1.0',
      entry_id: entry.entry_id,
      expected_revision: entry.revision,
    });
    expect(descriptor).toMatchObject({
      entry_url: entry.entry_url,
      host_fragment: '/route-probe',
      iframe_src: `${entry.entry_url}#/route-probe`,
      entry_id: entry.entry_id,
      plugin_id: entry.plugin_id,
      version: entry.version,
      page_id: activePage.page_id,
      expected_origin: 'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost',
      resource_generation: '0123456789abcdef0123456789abcdef',
      registration_revision: entry.revision,
      granted_permission_ids: [],
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(pageResolution.page).not.toHaveProperty('entry_id');
    expect(activePage).not.toHaveProperty('entry_url');
  });

  test.each([
    [
      'degraded snapshot',
      snapshot({
        availability: {
          kind: 'degraded',
          diagnostic: { code: 'io', phase: 'read', message: 'Unavailable.' },
        },
      }),
    ],
    ['missing entry', snapshot({ entries: [] })],
    ['disabled entry', snapshot({ entries: [{ ...registeredEntry, enabled: false }] })],
    [
      'incompatible entry',
      snapshot({
        entries: [
          {
            ...registeredEntry,
            compatibility: { lensx: true, host_api: false },
          },
        ],
      }),
    ],
  ] as const)('fails closed for %s', async (_name, current) => {
    const { resolver, resolveEntry } = harness(current);
    await expect(resolver.resolve({ activePage, pageResolution, attempt: 0 })).rejects.toMatchObject({
      code: 'runtime_unavailable',
    });
    expect(resolveEntry).not.toHaveBeenCalled();
  });

  test('fails closed when no snapshot is available', async () => {
    const current = harness();
    current.setCurrent(undefined);
    await expect(current.resolver.resolve({ activePage, pageResolution, attempt: 0 })).rejects.toMatchObject({
      code: 'runtime_unavailable',
    });
    expect(current.resolveEntry).not.toHaveBeenCalled();
  });

  test('rejects typed resource errors, identity mismatch, shared origins, and invalid routes with bounded errors', async () => {
    const typed = harness();
    typed.resolveEntry.mockRejectedValue(
      new PluginResourceError({
        contract_version: '0.1.0',
        code: 'stale_revision',
        operation: 'resolve_entry',
        message: 'Plugin registration revision is stale.',
      }),
    );
    await expect(typed.resolver.resolve({ activePage, pageResolution, attempt: 0 })).rejects.toMatchObject({
      code: 'runtime_stale',
    });

    const mismatch = harness(undefined, { ...entry, plugin_id: 'com.other.plugin' });
    mismatch.setCurrent(snapshot());
    await expect(mismatch.resolver.resolve({ activePage, pageResolution, attempt: 0 })).rejects.toEqual(
      new PluginPageRuntimeError('runtime_stale'),
    );

    const shared = harness(undefined, { ...entry, entry_url: 'lensx-plugin://localhost/v1/index.html' });
    shared.setCurrent(snapshot());
    await expect(shared.resolver.resolve({ activePage, pageResolution, attempt: 0 })).rejects.toMatchObject({
      code: 'runtime_invalid',
    });

    const invalidRoute = harness();
    await expect(
      invalidRoute.resolver.resolve({
        activePage,
        pageResolution: { ...pageResolution, page: { ...pageResolution.page, route: '/home?secret=1' } },
        attempt: 0,
      }),
    ).rejects.toMatchObject({ code: 'runtime_invalid' });
  });

  test('rejects a concurrent stale result and refreshes only for explicit retry with a new identity', async () => {
    const current = harness();
    current.resolveEntry.mockImplementation(async () => {
      current.setCurrent(snapshot({ revision: '8' }));
      return entry;
    });
    await expect(current.resolver.resolve({ activePage, pageResolution, attempt: 0 })).rejects.toMatchObject({
      code: 'runtime_stale',
    });

    const retry = harness();
    const first = await retry.resolver.resolve({ activePage, pageResolution, attempt: 0 });
    const second = await retry.resolver.resolve({ activePage, pageResolution, attempt: 1 });
    expect(retry.refresh).toHaveBeenCalledTimes(1);
    expect(retry.whenIdle).toHaveBeenCalledTimes(1);
    expect(retry.resolveEntry).toHaveBeenCalledTimes(2);
    expect(second.runtime_key).not.toBe(first.runtime_key);
  });

  test('binds only sorted actual grants and rejects detail/Page/revision divergence', async () => {
    const granted = harness();
    granted.setDetail({
      ...registrationDetail,
      granted_permission_ids: ['lensx.runtime.actual'],
    });
    const descriptor = await granted.resolver.resolve({ activePage, pageResolution, attempt: 0 });
    expect(descriptor.granted_permission_ids).toEqual(['lensx.runtime.actual']);
    expect(Object.isFrozen(descriptor.granted_permission_ids)).toBe(true);
    expect(descriptor.granted_permission_ids).not.toEqual(
      registrationDetail.manifest.requested_permissions.map(({ permission_id: permissionId }) => permissionId),
    );

    const staleDetail = harness();
    staleDetail.setDetail(registrationDetail, '999');
    await expect(staleDetail.resolver.resolve({ activePage, pageResolution, attempt: 0 })).rejects.toMatchObject({
      code: 'runtime_stale',
    });

    const wrongPage = harness();
    wrongPage.setDetail({
      ...registrationDetail,
      manifest: {
        ...registrationDetail.manifest,
        contributes: {
          ...registrationDetail.manifest.contributes,
          pages: [
            { ...firstManifestPage, id: activePage.page_id, route: '/different', required_permissions: [] },
            ...remainingManifestPages,
          ],
        },
      },
    });
    await expect(wrongPage.resolver.resolve({ activePage, pageResolution, attempt: 0 })).rejects.toMatchObject({
      code: 'runtime_stale',
    });
  });

  test('keeps current facts across unrelated global revisions and invalidates affected identity facts', async () => {
    const current = harness();
    const request = { activePage, pageResolution, attempt: 0 };
    const descriptor = await current.resolver.resolve(request);
    const invalidated = rs.fn();
    const unsubscribe = current.resolver.subscribeInvalidation?.(invalidated);

    current.publish(
      snapshot({
        revision: '8',
        entries: [
          registeredEntry,
          {
            ...registeredEntry,
            entry_id: 'entry_fedcba9876543210',
            plugin_id: 'com.other.plugin',
          },
        ],
      }),
    );
    expect(invalidated).toHaveBeenCalledTimes(1);
    await expect(current.resolver.isCurrent?.(request, descriptor)).resolves.toBe(true);

    current.setDetail({
      ...registrationDetail,
      granted_permission_ids: ['lensx.filesystem.read_selected'],
    });
    current.publish(snapshot({ revision: '9' }));
    await expect(current.resolver.isCurrent?.(request, descriptor)).resolves.toBe(false);
    unsubscribe?.();
    current.publish(snapshot({ revision: '10' }));
    expect(invalidated).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['disabled', { ...registeredEntry, enabled: false }],
    ['incompatible', { ...registeredEntry, compatibility: { lensx: false, host_api: true } }],
    [
      'quarantined',
      {
        kind: 'quarantined',
        entry_id: entry.entry_id,
        diagnostic: { code: 'bad', phase: 'read', message: 'Unavailable.' },
      },
    ],
  ] as const)('invalidates the current descriptor when the provider becomes %s', async (_name, changedEntry) => {
    const current = harness();
    const request = { activePage, pageResolution, attempt: 0 };
    const descriptor = await current.resolver.resolve(request);
    current.publish(snapshot({ revision: '8', entries: [changedEntry] }));
    await expect(current.resolver.isCurrent?.(request, descriptor)).resolves.toBe(false);
  });

  test('invalidates retry, cross-Page, old generation, and same-version replacement', async () => {
    const current = harness();
    const request = { activePage, pageResolution, attempt: 0 };
    const descriptor = await current.resolver.resolve(request);
    await expect(current.resolver.isCurrent?.({ ...request, attempt: 1 }, descriptor)).resolves.toBe(false);
    await expect(
      current.resolver.isCurrent?.(
        {
          ...request,
          activePage: { ...activePage, page_id: 'other' },
          pageResolution: {
            ...pageResolution,
            page: { ...pageResolution.page, page_id: 'other' },
          },
        },
        descriptor,
      ),
    ).resolves.toBe(false);

    current.publish(
      snapshot({
        revision: '8',
        entries: [{ ...registeredEntry, entry_id: 'entry_fedcba9876543210' }],
      }),
    );
    await expect(current.resolver.isCurrent?.(request, descriptor)).resolves.toBe(false);

    const oldGeneration = harness(undefined, {
      ...entry,
      entry_url: entry.entry_url.replaceAll('0123456789abcdef0123456789abcdef', 'fedcba9876543210fedcba9876543210'),
    });
    await expect(oldGeneration.resolver.isCurrent?.(request, descriptor)).resolves.toBe(false);
  });

  test('accepts only the isolated native/translated origin and strict Host route grammar', () => {
    expect(isValidIsolatedPluginRuntimeEntryUrl(entry.entry_url)).toBe(true);
    expect(
      isValidIsolatedPluginRuntimeEntryUrl(entry.entry_url.replace('lensx-plugin://', 'https://lensx-plugin.')),
    ).toBe(true);
    for (const invalid of [
      'lensx-plugin://localhost/v1/index.html',
      entry.entry_url.replace('/v1/0123456789abcdef0123456789abcdef/', '/v1/ffffffffffffffffffffffffffffffff/'),
      `${entry.entry_url}?query=1`,
      `${entry.entry_url}#author`,
      'file:///private/index.html',
    ]) {
      expect(isValidIsolatedPluginRuntimeEntryUrl(invalid), invalid).toBe(false);
    }
    for (const valid of ['/', '/home', '/nested/page']) expect(isValidPluginRuntimeRoute(valid), valid).toBe(true);
    for (const invalid of ['//home', '/a/../b', '/a?b', '/a#b', '/a%2fb', 'https://example.invalid']) {
      expect(isValidPluginRuntimeRoute(invalid), invalid).toBe(false);
    }
  });
});
