import { describe, expect, rs, test } from '@rstest/core';
import invalidCases from '../fixtures/plugin-lifecycle-controls/invalid/cases.json';
import validCases from '../fixtures/plugin-lifecycle-controls/valid/cases.json';
import {
  createPluginLifecycleDesktopAdapter,
  PLUGIN_LIFECYCLE_CONTRACT_VERSION,
  PluginLifecycleError,
  parsePluginLifecycleError,
  parsePluginLifecycleResult,
  SET_PLUGIN_ENABLED_COMMAND,
  UNINSTALL_PLUGIN_COMMAND,
} from '../src/app/plugins/lifecycle';

describe('Host-private Plugin Lifecycle Contract', () => {
  test('accepts and freezes shared valid fixtures and rejects invalid drift fixtures', () => {
    for (const fixture of validCases) {
      const parsed =
        fixture.type === 'result'
          ? parsePluginLifecycleResult(structuredClone(fixture.value))
          : parsePluginLifecycleError(structuredClone(fixture.value));
      expect(Object.isFrozen(parsed), fixture.name).toBe(true);
    }
    for (const fixture of invalidCases) {
      const parse = () =>
        fixture.type === 'result'
          ? parsePluginLifecycleResult(structuredClone(fixture.value))
          : parsePluginLifecycleError(structuredClone(fixture.value));
      expect(parse, fixture.name).toThrow(TypeError);
    }
  });

  test('invokes strict command names and request envelopes', async () => {
    const entryId = 'entry_0123456789abcdef';
    const invoke = rs.fn(async (command: string) => {
      if (command === SET_PLUGIN_ENABLED_COMMAND) {
        return structuredClone(validCases[0]?.value);
      }
      return structuredClone(validCases[1]?.value);
    });
    const adapter = createPluginLifecycleDesktopAdapter(invoke);
    await expect(
      adapter.setEnabled({
        contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
        entry_id: entryId,
        expected_revision: '6',
        enabled: true,
      }),
    ).resolves.toMatchObject({ operation: 'set_enabled', revision: '7' });
    await expect(
      adapter.uninstall({
        contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
        entry_id: 'entry_fedcba9876543210',
        expected_revision: '7',
        data_policy: 'delete_data',
      }),
    ).resolves.toMatchObject({ operation: 'uninstall', cleanup: 'pending' });
    expect(invoke).toHaveBeenNthCalledWith(1, SET_PLUGIN_ENABLED_COMMAND, {
      request: {
        contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
        entry_id: entryId,
        expected_revision: '6',
        enabled: true,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, UNINSTALL_PLUGIN_COMMAND, {
      request: {
        contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
        entry_id: 'entry_fedcba9876543210',
        expected_revision: '7',
        data_policy: 'delete_data',
      },
    });
  });

  test('maps stable Rust errors and invalid boundary payloads without raw values', async () => {
    const stable = createPluginLifecycleDesktopAdapter(async () =>
      Promise.reject(structuredClone(validCases[2]?.value)),
    );
    await expect(
      stable.uninstall({
        contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
        entry_id: 'entry_fedcba9876543210',
        expected_revision: '7',
        data_policy: 'retain_data',
      }),
    ).rejects.toMatchObject({ code: 'conflict', operation: 'uninstall' });

    const invalid = createPluginLifecycleDesktopAdapter(async () => ({ path: '/private/plugin', stack: 'raw' }));
    await expect(
      invalid.setEnabled({
        contract_version: PLUGIN_LIFECYCLE_CONTRACT_VERSION,
        entry_id: 'entry_0123456789abcdef',
        expected_revision: '1',
        enabled: false,
      }),
    ).rejects.toEqual(
      new PluginLifecycleError({
        code: 'invalid_boundary_payload',
        operation: 'set_enabled',
        message: 'Plugin lifecycle boundary returned an invalid payload.',
      }),
    );
  });
});
