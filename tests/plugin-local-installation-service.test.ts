import { describe, expect, rs, test } from '@rstest/core';
import type { LocalPluginInstallationClient } from '../src/app/plugins/installation';
import { createLocalPluginInstallationService } from '../src/app/plugins/installation';

const token = 'abcdefghijklmnopqrstuvwxyzABCDEF';
const prepared = (preparationToken = token) => ({
  status: 'prepared' as const,
  contract_version: '0.2.0' as const,
  operation: 'prepare' as const,
  preparation_token: preparationToken,
  candidate: {
    plugin_id: 'com.acme.workspace',
    version: '1.2.3',
    display_name: { 'en-US': 'Workspace' },
    publisher: { author: 'Acme', homepage: 'https://example.com', repository: 'https://example.com/repository' },
    requested_permissions: [],
  },
});

describe('local plugin installation service', () => {
  test('cancels an old preparation before a new prepare and destroys the current token', async () => {
    const cancel = rs.fn(
      async () => ({ status: 'cancelled', contract_version: '0.2.0', operation: 'cancel' }) as const,
    );
    const prepare = rs
      .fn<LocalPluginInstallationClient['prepare']>()
      .mockResolvedValueOnce(prepared())
      .mockResolvedValueOnce(prepared('0123456789abcdefghijklmnopqrstuv'));
    const client: LocalPluginInstallationClient = { prepare, cancel, commit: rs.fn() };
    const service = createLocalPluginInstallationService(client);
    await service.prepare();
    await service.prepare();
    expect(cancel).toHaveBeenNthCalledWith(1, token);
    await service.destroy();
    expect(cancel).toHaveBeenNthCalledWith(2, '0123456789abcdefghijklmnopqrstuv');
  });

  test('makes commit terminal on success or failure and never retries automatically', async () => {
    const commit = rs.fn(
      async () =>
        ({
          status: 'installed',
          contract_version: '0.2.0',
          operation: 'commit',
          plugin_id: 'com.acme.workspace',
          version: '1.2.3',
          revision: '1',
        }) as const,
    );
    const client: LocalPluginInstallationClient = { prepare: async () => prepared(), cancel: rs.fn(), commit };
    const service = createLocalPluginInstallationService(client);
    await service.prepare();
    await expect(service.commitPrepared()).resolves.toMatchObject({ status: 'installed' });
    await expect(service.commitPrepared()).rejects.toMatchObject({ code: 'invalid_current_state' });
    expect(commit).toHaveBeenCalledTimes(1);

    const failing = createLocalPluginInstallationService({
      ...client,
      commit: async () => {
        throw { code: 'conflict' };
      },
    });
    await failing.prepare();
    await expect(failing.commitPrepared()).rejects.toEqual({ code: 'conflict' });
    await expect(failing.commitPrepared()).rejects.toMatchObject({ code: 'invalid_current_state' });
  });
});
