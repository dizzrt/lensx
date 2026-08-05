import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, rs, test } from '@rstest/core';
import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import {
  createPluginClipboardProviderFactory,
  createPluginPermissionCatalog,
  createPluginPermissionMutationAdapter,
  deriveEffectivePluginPermissions,
  PLUGIN_PERMISSION_CATALOG,
  PluginClipboardBoundaryError,
  PluginPermissionGrantError,
  parsePluginClipboardBoundaryError,
  parsePluginClipboardBoundaryRequest,
  parsePluginClipboardBoundaryResult,
  parsePluginPermissionGrantError,
  parseSetPluginPermissionGrantRequest,
  parseSetPluginPermissionGrantResult,
  toPluginClipboardBoundaryRequest,
} from '../src/app/plugins/permission';
import {
  createMutablePluginHostApiContextSource,
  createPluginHostApiDispatcherFactory,
  type PluginRuntimeSessionIdentity,
} from '../src/app/plugins/runtime';
import fixtures from './fixtures/plugin-permission-management/cases.json';

const identity: PluginRuntimeSessionIdentity = Object.freeze({
  entry_id: 'entry_0123456789abcdef',
  plugin_id: 'com.acme.workspace',
  version: '1.2.0',
  page_id: 'home',
  expected_origin: 'https://lensx-plugin.0123456789abcdef0123456789abcdef.runtime.localhost',
  resource_generation: '0123456789abcdef0123456789abcdef',
  runtime_attempt_key: 'attempt-1',
  registration_revision: '8',
  granted_permission_ids: Object.freeze(['clipboard.read', 'clipboard.write']),
});

const parseFixture = (kind: string, value: unknown) => {
  switch (kind) {
    case 'grant_request':
      return parseSetPluginPermissionGrantRequest(value);
    case 'grant_result':
      return parseSetPluginPermissionGrantResult(value);
    case 'grant_error':
      return parsePluginPermissionGrantError(value);
    case 'clipboard_request':
      return parsePluginClipboardBoundaryRequest(value);
    case 'clipboard_result': {
      const operation = (value as { operation?: unknown }).operation;
      return parsePluginClipboardBoundaryResult(
        value,
        operation === 'read'
          ? { method: 'clipboard.read', params: {} }
          : { method: 'clipboard.write', params: { text: 'controlled' } },
      );
    }
    case 'clipboard_error':
      return parsePluginClipboardBoundaryError(value);
    default:
      throw new TypeError('Unknown permission fixture kind.');
  }
};

describe('Plugin Permission contracts and catalog', () => {
  test.each(fixtures)('$valid validity matches for $name', ({ kind, valid, value }) => {
    if (valid) expect(parseFixture(kind, value)).toEqual(value);
    else expect(() => parseFixture(kind, value)).toThrow();
  });

  test('derives the frozen closed catalog from the public method requirements', () => {
    expect(PLUGIN_PERMISSION_CATALOG).toEqual([
      { permission_id: 'clipboard.read', risk: 'sensitive', methods: ['clipboard.read'], supported: true },
      { permission_id: 'clipboard.write', risk: 'sensitive', methods: ['clipboard.write'], supported: true },
    ]);
    expect(Object.isFrozen(PLUGIN_PERMISSION_CATALOG)).toBe(true);
    expect(Object.isFrozen(PLUGIN_PERMISSION_CATALOG[0]?.methods)).toBe(true);
    expect(createPluginPermissionCatalog(false).every(({ supported }) => !supported)).toBe(true);
  });

  test('keeps request, support, grant, reason, and source-independent conclusions separate', () => {
    const manifest = {
      requested_permissions: [
        { permission_id: 'clipboard.read', reason: { 'en-US': 'Author reason', 'zh-CN': '作者原因' } },
        { permission_id: 'files.read', reason: { 'en-US': 'Unknown request' } },
      ],
    } as const;
    expect(
      deriveEffectivePluginPermissions(manifest as never, ['clipboard.read', 'clipboard.write', 'files.read']),
    ).toEqual([
      {
        permission_id: 'clipboard.read',
        risk: 'sensitive',
        methods: ['clipboard.read'],
        supported: true,
        state: 'granted',
        reason: manifest.requested_permissions[0]?.reason,
      },
      {
        permission_id: 'clipboard.write',
        risk: 'sensitive',
        methods: ['clipboard.write'],
        supported: true,
        state: 'not_requested',
      },
      {
        permission_id: 'files.read',
        methods: [],
        supported: false,
        state: 'unsupported',
        reason: manifest.requested_permissions[1]?.reason,
      },
    ]);
    expect(
      deriveEffectivePluginPermissions(manifest as never, [], createPluginPermissionCatalog(false))[0]?.state,
    ).toBe('unsupported');
  });

  test('keeps Host-private authority out of public package exports and package metadata', () => {
    for (const packageName of ['plugin-contract', 'plugin-sdk', 'plugin-testkit']) {
      const root = join(process.cwd(), 'packages', packageName);
      const source = readFileSync(join(root, 'src/index.ts'), 'utf8');
      const metadata = readFileSync(join(root, 'package.json'), 'utf8');
      for (const forbidden of [
        'PluginPermissionState',
        'set_plugin_permission_grant',
        'PluginTextClipboard',
        'registration_revision',
      ]) {
        expect(source).not.toContain(forbidden);
        expect(metadata).not.toContain(forbidden);
      }
    }
  });
});

describe('Plugin Permission desktop adapters', () => {
  test('exposes and routes read/write grants independently through the closed Dispatcher', async () => {
    const readIdentity = Object.freeze({ ...identity, granted_permission_ids: Object.freeze(['clipboard.read']) });
    const invoke = rs.fn(async () => ({ contract_version: '0.1.0', operation: 'read', text: 'controlled' }));
    const registry = new LauncherActionRegistry();
    const binding = createPluginHostApiDispatcherFactory({
      actions: { registry, dispatcher: new LauncherActionDispatcher(registry) },
      clipboard: createPluginClipboardProviderFactory(invoke),
      context: createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'light' }),
      navigation: { isActivePage: () => true, closePageIfMatches: () => true },
    }).create({ identity: readIdentity, isCurrent: () => true });
    await expect(
      binding.handler({
        identity: readIdentity,
        request: { method: 'runtime.get_context', params: {} },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ result: { capabilities: expect.arrayContaining(['clipboard.read']) } });
    await expect(
      binding.handler({
        identity: readIdentity,
        request: { method: 'clipboard.write', params: { text: 'blocked' } },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ code: 'permission_denied' });
    expect(invoke).not.toHaveBeenCalled();
    await expect(
      binding.handler({
        identity: readIdentity,
        request: { method: 'clipboard.read', params: {} },
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ method: 'clipboard.read', result: { text: 'controlled' } });
    expect(invoke).toHaveBeenCalledTimes(1);
    binding.dispose();
  });

  test('sends one strict grant target and parses safe results and errors', async () => {
    const invoke = rs.fn(async (_command: string, args?: Record<string, unknown>) => {
      expect(args?.request).toEqual({
        contract_version: '0.1.0',
        entry_id: identity.entry_id,
        expected_revision: '8',
        permission_id: 'clipboard.read',
        granted: true,
      });
      return { contract_version: '0.1.0', status: 'changed', revision: '9' };
    });
    const adapter = createPluginPermissionMutationAdapter(invoke);
    await expect(
      adapter.setGrant({
        contract_version: '0.1.0',
        entry_id: identity.entry_id,
        expected_revision: '8',
        permission_id: 'clipboard.read',
        granted: true,
      }),
    ).resolves.toEqual({ contract_version: '0.1.0', status: 'changed', revision: '9' });
    expect(invoke).toHaveBeenCalledWith('set_plugin_permission_grant', expect.any(Object));

    const rejected = createPluginPermissionMutationAdapter(async () =>
      Promise.reject({
        contract_version: '0.1.0',
        code: 'unsupported',
        operation: 'set_grant',
        message: 'Plugin permission is unsupported.',
      }),
    );
    await expect(
      rejected.setGrant({
        contract_version: '0.1.0',
        entry_id: identity.entry_id,
        expected_revision: '8',
        permission_id: 'clipboard.read',
        granted: true,
      }),
    ).rejects.toMatchObject({ name: 'PluginPermissionGrantError', code: 'unsupported' });
  });

  test('injects trusted Session identity, contains late/cancelled results, and never sends grants', async () => {
    let resolveRead: ((value: unknown) => void) | undefined;
    const invoke = rs.fn(async (_command: string, args?: Record<string, unknown>) => {
      const request = args?.request as Record<string, unknown>;
      expect(request).toEqual(toPluginClipboardBoundaryRequest(identity, { method: 'clipboard.read', params: {} }));
      expect(JSON.stringify(request)).not.toContain('granted_permission_ids');
      return new Promise((resolve) => {
        resolveRead = resolve;
      });
    });
    let current = true;
    const provider = createPluginClipboardProviderFactory(invoke).create({ identity, isCurrent: () => current });
    const pending = provider.execute({ method: 'clipboard.read', params: {} }, new AbortController().signal);
    await Promise.resolve();
    current = false;
    resolveRead?.({ contract_version: '0.1.0', operation: 'read', text: 'late' });
    await expect(pending).rejects.toMatchObject({ code: 'unavailable' });

    const controller = new AbortController();
    controller.abort();
    await expect(provider.execute({ method: 'clipboard.read', params: {} }, controller.signal)).rejects.toMatchObject({
      code: 'cancelled',
    });
    provider.dispose();
  });

  test('maps safe Rust errors exactly and marks unavailable provider state', async () => {
    const provider = createPluginClipboardProviderFactory(async () =>
      Promise.reject({
        contract_version: '0.1.0',
        code: 'permission_denied',
        operation: 'write',
        message: 'Plugin clipboard permission was denied.',
      }),
    ).create({ identity, isCurrent: () => true });
    await expect(
      provider.execute({ method: 'clipboard.write', params: { text: 'controlled' } }, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'PluginClipboardBoundaryError', code: 'permission_denied', operation: 'write' });

    const unavailable = createPluginClipboardProviderFactory(async () =>
      Promise.reject({
        contract_version: '0.1.0',
        code: 'unavailable',
        operation: 'read',
        message: 'Plugin clipboard is unavailable.',
      }),
    ).create({ identity, isCurrent: () => true });
    await expect(
      unavailable.execute({ method: 'clipboard.read', params: {} }, new AbortController().signal),
    ).rejects.toBeInstanceOf(PluginClipboardBoundaryError);
    expect(unavailable.available()).toBe(false);
  });

  test('rejects invalid native payloads without surfacing their contents', async () => {
    const provider = createPluginClipboardProviderFactory(async () => ({
      contract_version: '0.1.0',
      operation: 'read',
      text: 'value',
      native: 'object',
    })).create({ identity, isCurrent: () => true });
    const error = await provider
      .execute({ method: 'clipboard.read', params: {} }, new AbortController().signal)
      .catch((value) => value);
    expect(error).toBeInstanceOf(PluginClipboardBoundaryError);
    expect(error.code).toBe('invalid_boundary_payload');
    expect(error.message).not.toContain('value');
    expect(error).not.toBeInstanceOf(PluginPermissionGrantError);
  });
});
