import { describe, expect, rs, test } from '@rstest/core';
import validResourceCases from '../fixtures/plugin-resource-service/valid/cases.json';
import type { ActivePage, PageResolution } from '../src/app/navigation';
import type { PluginRegistrationSnapshot, PluginRegistrationSummary } from '../src/app/plugins/registration';
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

const snapshot = (overrides: Partial<PluginRegistrationSnapshot> = {}): PluginRegistrationSnapshot => ({
  contract_version: '0.1.0',
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
  const refresh = rs.fn(async () => undefined);
  const whenIdle = rs.fn(async () => undefined);
  const resolveEntry = rs.fn(async () => result);
  const resolver = createPluginPageRuntimeResolver({
    resourceAdapter: { resolveEntry },
    surfaceProjectionService: {
      currentSnapshot: () => current,
      refresh,
      whenIdle,
    },
  });
  return {
    resolver,
    refresh,
    resolveEntry,
    setCurrent: (value: PluginRegistrationSnapshot | undefined) => {
      current = value;
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
      plugin_id: entry.plugin_id,
      version: entry.version,
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
