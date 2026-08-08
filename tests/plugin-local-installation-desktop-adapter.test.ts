import { describe, expect, rs, test } from '@rstest/core';
import {
  CANCEL_LOCAL_PLUGIN_INSTALLATION_COMMAND,
  COMMIT_LOCAL_PLUGIN_INSTALLATION_COMMAND,
  createLocalPluginInstallationClient,
  type LocalPluginInstallationError,
  PREPARE_LOCAL_PLUGIN_INSTALLATION_COMMAND,
} from '../src/app/plugins/installation';

const candidate = {
  plugin_id: 'com.acme.workspace',
  version: '1.2.3',
  display_name: { 'en-US': 'Workspace' },
  publisher: { author: 'Acme', homepage: 'https://example.com', repository: 'https://example.com/repository' },
};
const token = 'abcdefghijklmnopqrstuvwxyzABCDEF';

describe('local plugin installation desktop client', () => {
  test('invokes strict pathless prepare, token-only commit, and token-only cancel commands', async () => {
    const invoke = rs.fn(async (command: string) => {
      if (command === PREPARE_LOCAL_PLUGIN_INSTALLATION_COMMAND)
        return {
          status: 'prepared',
          contract_version: '0.3.0',
          operation: 'prepare',
          preparation_token: token,
          candidate,
        };
      if (command === COMMIT_LOCAL_PLUGIN_INSTALLATION_COMMAND)
        return {
          status: 'installed',
          contract_version: '0.3.0',
          operation: 'commit',
          plugin_id: candidate.plugin_id,
          version: candidate.version,
          revision: '7',
        };
      return { status: 'cancelled', contract_version: '0.3.0', operation: 'cancel' };
    });
    const client = createLocalPluginInstallationClient(invoke);
    await expect(client.prepare()).resolves.toMatchObject({ status: 'prepared' });
    await expect(client.commit(token)).resolves.toMatchObject({ status: 'installed' });
    await expect(client.cancel(token)).resolves.toMatchObject({ status: 'cancelled', operation: 'cancel' });
    expect(invoke).toHaveBeenNthCalledWith(1, PREPARE_LOCAL_PLUGIN_INSTALLATION_COMMAND, undefined);
    expect(invoke).toHaveBeenNthCalledWith(2, COMMIT_LOCAL_PLUGIN_INSTALLATION_COMMAND, {
      request: { contract_version: '0.3.0', preparation_token: token },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, CANCEL_LOCAL_PLUGIN_INSTALLATION_COMMAND, {
      request: { contract_version: '0.3.0', preparation_token: token },
    });
  });

  test('maps a strict native error without exposing raw details', async () => {
    const client = createLocalPluginInstallationClient(async () => {
      throw {
        contract_version: '0.3.0',
        code: 'busy',
        operation: 'prepare',
        message: 'Another plugin installation is in progress.',
      };
    });
    await expect(client.prepare()).rejects.toMatchObject({
      name: 'LocalPluginInstallationError',
      code: 'busy',
      operation: 'prepare',
    });
  });

  test('rejects cross-operation and malformed payloads with a stable boundary error', async () => {
    for (const value of [
      {
        status: 'installed',
        contract_version: '0.3.0',
        operation: 'commit',
        plugin_id: 'com.acme.workspace',
        version: '1.2.3',
        revision: '1',
      },
      { code: 'internal', message: '/Users/private/plugin.lxp: failed' },
    ]) {
      const client = createLocalPluginInstallationClient(async () => value);
      await expect(client.prepare()).rejects.toEqual(
        expect.objectContaining<Partial<LocalPluginInstallationError>>({
          code: 'invalid_boundary_payload',
          operation: 'prepare',
          message: 'Local plugin installation returned an invalid response.',
        }),
      );
    }
  });
});
