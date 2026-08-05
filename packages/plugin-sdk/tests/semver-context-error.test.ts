import { describe, expect, test } from '@rstest/core';

import { validateRuntimeContext } from '../src/context.js';
import { PluginSdkError, toPluginSdkError } from '../src/error.js';
import { compareSemVer, isSupportedHostApiVersion, parseSemVer } from '../src/semver.js';

describe('SemVer and Host API compatibility', () => {
  test('parses boundaries and follows prerelease precedence', () => {
    const alpha = parseSemVer('0.1.0-alpha.2');
    const beta = parseSemVer('0.1.0-alpha.10');
    const release = parseSemVer('0.1.0+build.7');

    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    expect(release).toBeDefined();
    if (alpha === undefined || beta === undefined || release === undefined) {
      throw new Error('Expected valid SemVer values.');
    }
    expect(compareSemVer(alpha, beta)).toBeLessThan(0);
    expect(compareSemVer(beta, release)).toBeLessThan(0);
    expect(parseSemVer('0.01.0')).toBeUndefined();
    expect(parseSemVer('0.1.0-01')).toBeUndefined();
  });

  test('enforces the half-open supported Host API range', () => {
    expect(isSupportedHostApiVersion('0.1.0-alpha.1')).toBe(false);
    expect(isSupportedHostApiVersion('0.1.0')).toBe(true);
    expect(isSupportedHostApiVersion('0.1.99')).toBe(true);
    expect(isSupportedHostApiVersion('0.2.0-alpha.1')).toBe(true);
    expect(isSupportedHostApiVersion('0.2.0')).toBe(false);
  });
});

describe('Runtime context validation', () => {
  test('copies and freezes valid and empty capability snapshots', () => {
    const sourceCapabilities = ['runtime.get_context'];
    const context = validateRuntimeContext({
      capabilities: sourceCapabilities,
      hostApiVersion: '0.1.8',
      locale: 'zh-CN',
      theme: 'dark',
    });
    sourceCapabilities.push('storage.get');

    expect(context.capabilities).toEqual(['runtime.get_context']);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.capabilities)).toBe(true);
    expect(() => (context.capabilities as string[]).push('forbidden')).toThrow();
    expect(
      validateRuntimeContext({ capabilities: [], hostApiVersion: '0.1.0', locale: 'en-US', theme: 'light' })
        .capabilities,
    ).toEqual([]);
  });

  test.each([
    undefined,
    {},
    { capabilities: [], hostApiVersion: 'invalid', locale: 'en-US', theme: 'light' },
    { capabilities: [], hostApiVersion: '0.1.0', locale: 'fr-FR', theme: 'light' },
    { capabilities: [], hostApiVersion: '0.1.0', locale: 'en-US', theme: 'system' },
    { capabilities: ['unknown.method'], hostApiVersion: '0.1.0', locale: 'en-US', theme: 'light' },
    { capabilities: ['storage.get', 'storage.get'], hostApiVersion: '0.1.0', locale: 'en-US', theme: 'light' },
    { capabilities: ['storage.get', 'actions.open'], hostApiVersion: '0.1.0', locale: 'en-US', theme: 'light' },
    {
      capabilities: [],
      hostApiVersion: '0.1.0',
      locale: 'en-US',
      pluginIdentity: 'untrusted',
      theme: 'light',
    },
  ])('atomically rejects invalid context %#', (input) => {
    expect(() => validateRuntimeContext(input)).toThrow(expect.objectContaining({ code: 'invalid_runtime_context' }));
  });
});

describe('safe SDK errors', () => {
  test('maps unknown transport failures without retaining the raw exception', () => {
    const raw = new Error('secret transport envelope');
    const mapped = toPluginSdkError(raw);

    expect(mapped).toBeInstanceOf(PluginSdkError);
    expect(mapped).toMatchObject({ code: 'transport_failure', message: 'The SDK transport operation failed.' });
    expect(mapped).not.toHaveProperty('cause');
    expect(mapped).not.toHaveProperty('raw');
    expect(mapped.message).not.toContain(raw.message);
  });
});
