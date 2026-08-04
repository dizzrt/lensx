import { describe, expect, rs, test } from '@rstest/core';
import {
  ACTIVATE_PLUGIN_RUNTIME_NAVIGATION_COMMAND,
  createPluginRuntimeNavigationAdapter,
  DISPOSE_PLUGIN_RUNTIME_NAVIGATION_COMMAND,
} from '../src/app/plugins/runtime';

describe('Plugin Runtime navigation desktop adapter', () => {
  test('uses exact Host-private activate/dispose envelopes and bounded lease results', async () => {
    const invoke = rs.fn(async (command: string) =>
      command === ACTIVATE_PLUGIN_RUNTIME_NAVIGATION_COMMAND
        ? { contract_version: '0.1.0', lease_id: '0000000000000001' }
        : { contract_version: '0.1.0', disposed: true },
    );
    const adapter = createPluginRuntimeNavigationAdapter(invoke);
    const target = { entry_url: 'lensx-plugin://isolated.invalid/index.html', host_fragment: '/home' };
    const lease = await adapter.activate(target);
    expect(invoke).toHaveBeenNthCalledWith(1, ACTIVATE_PLUGIN_RUNTIME_NAVIGATION_COMMAND, {
      request: { contract_version: '0.1.0', ...target },
    });
    await expect(adapter.dispose(lease)).resolves.toBe(true);
    expect(invoke).toHaveBeenNthCalledWith(2, DISPOSE_PLUGIN_RUNTIME_NAVIGATION_COMMAND, {
      request: { contract_version: '0.1.0', lease_id: lease.lease_id },
    });
  });

  test('fails malformed activation closed and makes malformed/late disposal inert', async () => {
    await expect(
      createPluginRuntimeNavigationAdapter(async () => ({ contract_version: '0.1.0', lease_id: 'raw-path' })).activate({
        entry_url: 'file:///private/plugin',
        host_fragment: '/home',
      }),
    ).rejects.toMatchObject({ code: 'runtime_activation_failed' });
    await expect(
      createPluginRuntimeNavigationAdapter(async () => ({ contract_version: '0.1.0', disposed: 'yes' })).dispose({
        lease_id: '0000000000000001',
      }),
    ).resolves.toBe(false);
  });
});
