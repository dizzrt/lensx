import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, rs, test } from '@rstest/core';
import invalidCases from '../fixtures/plugin-resource-service/invalid/cases.json';
import validCases from '../fixtures/plugin-resource-service/valid/cases.json';
import {
  createPluginResourceDesktopAdapter,
  PLUGIN_RESOURCE_CONTRACT_VERSION,
  PluginResourceError,
  parsePluginResourceEntry,
  parsePluginResourceError,
  parseResolvePluginResourceEntryRequest,
  RESOLVE_PLUGIN_RESOURCE_ENTRY_COMMAND,
  type ResolvePluginResourceEntryRequest,
} from '../src/app/plugins/resource';

const parse = (fixture: { readonly type: string; readonly value: unknown }) => {
  if (fixture.type === 'request') return parseResolvePluginResourceEntryRequest(structuredClone(fixture.value));
  if (fixture.type === 'result') return parsePluginResourceEntry(structuredClone(fixture.value));
  if (fixture.type === 'error') return parsePluginResourceError(structuredClone(fixture.value));
  throw new TypeError('Unknown fixture type.');
};

const request: ResolvePluginResourceEntryRequest = {
  contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION,
  entry_id: 'entry_0123456789abcdef',
  expected_revision: '7',
};

const result = structuredClone(validCases.find(({ type }) => type === 'result')?.value);

describe('Host-private Plugin Resource Contract', () => {
  test('accepts shared exact fixtures and rejects version, field, type, URL, error, and private-field drift', () => {
    for (const fixture of validCases) {
      const parsed = parse(fixture);
      expect(Object.isFrozen(parsed), fixture.name).toBe(true);
    }
    for (const fixture of invalidCases) {
      expect(() => parse(fixture), fixture.name).toThrow(TypeError);
    }
  });

  test('returns detached frozen results while preserving entry_url as an opaque string', () => {
    const input = structuredClone(result) as { entry_url: string; plugin_id: string };
    const parsed = parsePluginResourceEntry(input);
    const originalUrl = input.entry_url;
    input.entry_url = 'https://attacker.invalid/';
    input.plugin_id = 'com.attacker.changed';
    expect(parsed.entry_url).toBe(originalUrl);
    expect(parsed.plugin_id).toBe('com.acme.workspace');
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  test('invokes the exact request envelope and never caches across calls or revisions', async () => {
    const invoke = rs.fn(async () => structuredClone(result));
    const adapter = createPluginResourceDesktopAdapter(invoke);
    await expect(adapter.resolveEntry(request)).resolves.toMatchObject({ entry_id: request.entry_id });
    await expect(adapter.resolveEntry(request)).resolves.toMatchObject({ entry_id: request.entry_id });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenNthCalledWith(1, RESOLVE_PLUGIN_RESOURCE_ENTRY_COMMAND, { request });
    expect(invoke).toHaveBeenNthCalledWith(2, RESOLVE_PLUGIN_RESOURCE_ENTRY_COMMAND, { request });
  });

  test.each([
    'stale_revision',
    'not_found',
    'unavailable',
    'unsafe_state',
    'internal',
  ] as const)('maps canonical %s errors without exposing raw values', async (code) => {
    const messages = {
      stale_revision: 'Plugin registration revision is stale.',
      not_found: 'Plugin resource entry was not found.',
      unavailable: 'Plugin resource entry is unavailable.',
      unsafe_state: 'Plugin resource storage state is unsafe.',
      internal: 'Plugin resource resolution failed.',
    } as const;
    const adapter = createPluginResourceDesktopAdapter(async () =>
      Promise.reject({
        contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION,
        code,
        operation: 'resolve_entry',
        message: messages[code],
      }),
    );
    await expect(adapter.resolveEntry(request)).rejects.toEqual(
      new PluginResourceError({
        contract_version: PLUGIN_RESOURCE_CONTRACT_VERSION,
        code,
        operation: 'resolve_entry',
        message: messages[code],
      }),
    );
  });

  test('maps invalid requests, malformed responses, private fields, and invoke failures to canonical safe errors', async () => {
    const adapter = createPluginResourceDesktopAdapter(async () => ({
      ...(result as Record<string, unknown>),
      installation_path: '/private/plugin',
    }));
    await expect(
      adapter.resolveEntry({ ...request, expected_revision: '01' } as ResolvePluginResourceEntryRequest),
    ).rejects.toMatchObject({ code: 'invalid_request', operation: 'resolve_entry' });
    await expect(adapter.resolveEntry(request)).rejects.toMatchObject({
      code: 'invalid_boundary_payload',
      message: 'Plugin resource boundary returned an invalid payload.',
      operation: 'resolve_entry',
    });

    const failed = createPluginResourceDesktopAdapter(async () => {
      throw new Error('/private/plugin native stack');
    });
    await expect(failed.resolveEntry(request)).rejects.toMatchObject({
      code: 'invalid_boundary_payload',
      message: 'Plugin resource boundary returned an invalid payload.',
      operation: 'resolve_entry',
    });
  });

  test('does not connect the contract to the App Shell or replace the Host-owned plugin placeholder', () => {
    const shell = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8');
    expect(shell).not.toContain('plugins/resource');
    expect(shell).not.toContain('resolve_plugin_resource_entry');
    expect(shell).not.toContain('<iframe');
  });
});
