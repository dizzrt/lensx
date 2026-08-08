import { describe, expect, rs, test } from '@rstest/core';

import type { PluginRuntimeSessionIdentity } from '../src/app/plugins/runtime';
import {
  createPluginScopedStorageProviderFactory,
  PLUGIN_SCOPED_STORAGE_COMMAND,
  PluginScopedStorageBoundaryError,
} from '../src/app/plugins/storage';

const identity: PluginRuntimeSessionIdentity = Object.freeze({
  entry_id: 'entry_0123456789abcdef',
  plugin_id: 'com.acme.workspace',
  version: '1.2.3',
  page_id: 'home',
  expected_origin: 'https://lensx-plugin.0123456789abcdef0123456789abcdef.runtime.localhost',
  resource_generation: '0123456789abcdef0123456789abcdef',
  runtime_attempt_key: 'attempt-1',
  registration_revision: '7',
});

describe('Host-private plugin scoped storage desktop provider', () => {
  test('injects only the trusted identity and strictly parses every operation result', async () => {
    const invoke = rs.fn(async (command: string, args?: Record<string, unknown>) => {
      expect(command).toBe(PLUGIN_SCOPED_STORAGE_COMMAND);
      const request = args?.request as {
        readonly identity: unknown;
        readonly operation: { readonly kind: string };
      };
      expect(request.identity).toEqual({
        entry_id: identity.entry_id,
        plugin_id: identity.plugin_id,
        version: identity.version,
      });
      expect(JSON.stringify(request)).not.toMatch(/page_id|origin|revision|namespace|path|plugin_key/u);
      const results: Record<string, unknown> = {
        get: { found: true, value: { theme: 'dark' } },
        set: { stored: true },
        delete: { deleted: true },
        list: { keys: ['alpha'] },
        get_quota: { usedBytes: 12, limitBytes: 1_048_576 },
      };
      return {
        contract_version: '0.1.0',
        operation: request.operation.kind,
        result: results[request.operation.kind],
      };
    });
    const binding = createPluginScopedStorageProviderFactory(invoke).create({ identity, isCurrent: () => true });
    await expect(
      binding.execute({ method: 'storage.get', params: { key: 'settings' } }, new AbortController().signal),
    ).resolves.toEqual({ method: 'storage.get', result: { found: true, value: { theme: 'dark' } } });
    await expect(
      binding.execute(
        { method: 'storage.set', params: { key: 'settings', value: { theme: 'dark' } } },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ method: 'storage.set', result: { stored: true } });
    await expect(
      binding.execute({ method: 'storage.delete', params: { key: 'settings' } }, new AbortController().signal),
    ).resolves.toEqual({ method: 'storage.delete', result: { deleted: true } });
    await expect(
      binding.execute({ method: 'storage.list', params: {} }, new AbortController().signal),
    ).resolves.toEqual({ method: 'storage.list', result: { keys: ['alpha'] } });
    await expect(
      binding.execute({ method: 'storage.get_quota', params: {} }, new AbortController().signal),
    ).resolves.toEqual({ method: 'storage.get_quota', result: { usedBytes: 12, limitBytes: 1_048_576 } });
  });

  test('maps safe errors, degrades availability once, and rejects invalid provider results', async () => {
    const unavailable = {
      contract_version: '0.1.0',
      code: 'unavailable',
      operation: 'get',
      message: 'Plugin storage is unavailable.',
    };
    const invoke = rs.fn(async () => Promise.reject(unavailable));
    const binding = createPluginScopedStorageProviderFactory(invoke).create({ identity, isCurrent: () => true });
    const changed = rs.fn();
    binding.subscribeAvailability(changed);
    await expect(
      binding.execute({ method: 'storage.get', params: { key: 'safe' } }, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(binding.available()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);

    const invalid = createPluginScopedStorageProviderFactory(async () => ({
      contract_version: '0.1.0',
      operation: 'get',
      result: { found: true, value: undefined, path: '/private' },
    })).create({ identity, isCurrent: () => true });
    await expect(
      invalid.execute({ method: 'storage.get', params: { key: 'safe' } }, new AbortController().signal),
    ).rejects.toEqual(expect.objectContaining({ code: 'internal_error' }));
  });

  test('checks cancellation and currentness before and after the asynchronous boundary', async () => {
    let complete: ((value: unknown) => void) | undefined;
    const binding = createPluginScopedStorageProviderFactory(
      () => new Promise((resolve) => (complete = resolve)),
    ).create({ identity, isCurrent: () => true });
    const controller = new AbortController();
    const pending = binding.execute({ method: 'storage.get', params: { key: 'safe' } }, controller.signal);
    controller.abort();
    complete?.({ contract_version: '0.1.0', operation: 'get', result: { found: false } });
    await expect(pending).rejects.toBeInstanceOf(PluginScopedStorageBoundaryError);
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });

    const stale = createPluginScopedStorageProviderFactory(async () => ({
      contract_version: '0.1.0',
      operation: 'get',
      result: { found: false },
    })).create({ identity, isCurrent: () => false });
    await expect(
      stale.execute({ method: 'storage.get', params: { key: 'safe' } }, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
});
