import { describe, expect, rs, test } from '@rstest/core';
import {
  CLEAR_PLUGIN_DATA_COMMAND,
  createPluginDataManagementDesktopAdapter,
  createPluginDataManagementService,
  PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION,
  PluginDataManagementError,
} from '../src/app/plugins/data-management';

const request = {
  contract_version: PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION,
  entry_id: 'entry_0123456789abcdef',
  expected_revision: '7',
} as const;

describe('Plugin data management desktop boundary', () => {
  test('invokes the private command with the exact request and parses an idempotent result', async () => {
    const invoke = rs.fn(async () => ({
      contract_version: PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION,
      current_revision: '7',
      changed: false,
    }));
    const adapter = createPluginDataManagementDesktopAdapter(invoke);
    await expect(adapter.clear(request)).resolves.toEqual({
      contract_version: PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION,
      current_revision: '7',
      changed: false,
    });
    expect(invoke).toHaveBeenCalledWith(CLEAR_PLUGIN_DATA_COMMAND, { request });
  });

  test('maps only canonical safe errors and rejects raw native payloads', async () => {
    const safe = createPluginDataManagementDesktopAdapter(async () =>
      Promise.reject({
        contract_version: PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION,
        code: 'plugin_enabled',
        operation: 'clear_plugin_data',
        message: 'Plugin data can be cleared only while the plugin is disabled.',
      }),
    );
    await expect(safe.clear(request)).rejects.toMatchObject({ code: 'plugin_enabled' });

    const raw = createPluginDataManagementDesktopAdapter(async () =>
      Promise.reject({ path: '/private/plugin/data', stack: 'native stack' }),
    );
    await expect(raw.clear(request)).rejects.toEqual(
      new PluginDataManagementError({
        code: 'invalid_boundary_payload',
        message: 'Plugin data management returned an invalid response.',
      }),
    );
  });

  test('service constructs and validates the versioned request', async () => {
    const clear = rs.fn(
      async () =>
        ({
          contract_version: PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION,
          current_revision: '7',
          changed: true,
        }) as const,
    );
    const service = createPluginDataManagementService({ clear });
    await expect(service.clear({ entry_id: request.entry_id, expected_revision: '7' })).resolves.toMatchObject({
      changed: true,
    });
    expect(clear).toHaveBeenCalledWith(request);
  });
});
