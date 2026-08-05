import { type HostApiMethod, PLUGIN_HOST_API_VERSION } from '@lensx/plugin-contract';
import { describe, expect, test } from '@rstest/core';

import {
  createDeferred,
  createInvalidPluginRuntimeContextFixture,
  createPluginRuntimeContextFixture,
  PluginTestCancellationController,
} from '../src/index.js';

describe('Plugin Runtime context fixture', () => {
  test('creates frozen current-version English light defaults with isolated capabilities', () => {
    const first = createPluginRuntimeContextFixture();
    const second = createPluginRuntimeContextFixture();

    expect(first).toEqual({
      capabilities: [],
      hostApiVersion: PLUGIN_HOST_API_VERSION,
      locale: 'en-US',
      theme: 'light',
    });
    expect(first).not.toBe(second);
    expect(first.capabilities).not.toBe(second.capabilities);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.capabilities)).toBe(true);
  });

  test('copies and freezes whole-field Chinese dark capability overrides', () => {
    const capabilities: HostApiMethod[] = ['clipboard.read'];
    const context = createPluginRuntimeContextFixture({ capabilities, locale: 'zh-CN', theme: 'dark' });
    capabilities.push('clipboard.write');

    expect(context).toEqual({
      capabilities: ['clipboard.read'],
      hostApiVersion: PLUGIN_HOST_API_VERSION,
      locale: 'zh-CN',
      theme: 'dark',
    });
    expect(() => (context.capabilities as string[]).push('mutation')).toThrow();
    expect('permission' in context).toBe(false);
    expect('pluginIdentity' in context).toBe(false);
  });

  test('provides explicit invalid Context fixtures without pretending they are grants', () => {
    expect(createInvalidPluginRuntimeContextFixture('unknown-capability')).toMatchObject({
      capabilities: ['system.open_external'],
    });
    expect(createInvalidPluginRuntimeContextFixture('duplicate-capability')).toMatchObject({
      capabilities: ['storage.get', 'storage.get'],
    });
    expect(createInvalidPluginRuntimeContextFixture('unsorted-capability')).toMatchObject({
      capabilities: ['storage.get', 'actions.open'],
    });
    expect(createInvalidPluginRuntimeContextFixture('trusted-field')).toHaveProperty('pluginId');
  });
});

describe('runner-neutral async controls', () => {
  test('adds and removes cancellation listeners and aborts idempotently', () => {
    const controller = new PluginTestCancellationController();
    const retained: string[] = [];
    const removed = () => retained.push('removed');
    controller.addEventListener('abort', () => retained.push('retained'));
    controller.addEventListener('abort', removed);
    controller.removeEventListener('abort', removed);

    controller.abort();
    controller.abort();
    expect(controller.aborted).toBe(true);
    expect(controller.signal).toBe(controller);
    expect(retained).toEqual(['retained']);
    controller.addEventListener('abort', () => retained.push('late'));
    expect(retained).toEqual(['retained', 'late']);
  });

  test('settles deferred promises only once and isolates instances', async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    first.resolve('first');
    first.reject(new Error('late rejection'));
    first.resolve('late resolution');
    second.resolve('second');

    await expect(first.promise).resolves.toBe('first');
    await expect(second.promise).resolves.toBe('second');
  });
});
