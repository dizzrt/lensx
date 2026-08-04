import { describe, expect, rs, test } from '@rstest/core';
import {
  createLocalPluginInstallationClient,
  INSTALL_LOCAL_PLUGIN_COMMAND,
  type LocalPluginInstallationError,
} from '../src/app/plugins/installation';

describe('local plugin installation desktop client', () => {
  test('invokes the pathless Host command and parses an installed result', async () => {
    const invoke = rs.fn(async () => ({
      status: 'installed',
      contract_version: '0.1.0',
      plugin_id: 'com.acme.workspace',
      version: '1.2.3',
      revision: '7',
    }));

    await expect(createLocalPluginInstallationClient(invoke).install()).resolves.toMatchObject({
      status: 'installed',
      plugin_id: 'com.acme.workspace',
    });
    expect(invoke).toHaveBeenCalledWith(INSTALL_LOCAL_PLUGIN_COMMAND);
  });

  test('maps a strict native error without exposing raw details', async () => {
    const client = createLocalPluginInstallationClient(async () => {
      throw {
        contract_version: '0.1.0',
        code: 'busy',
        operation: 'commit',
        message: 'Another plugin installation is in progress.',
      };
    });

    await expect(client.install()).rejects.toMatchObject({
      name: 'LocalPluginInstallationError',
      code: 'busy',
      operation: 'commit',
    });
  });

  test('maps malformed success and error values to one stable boundary error', async () => {
    for (const value of [
      { status: 'installed', path: '/Users/private/plugin.lxp' },
      { code: 'internal', message: '/Users/private/plugin.lxp: failed' },
    ]) {
      const client = createLocalPluginInstallationClient(async () => value);
      await expect(client.install()).rejects.toEqual(
        expect.objectContaining<Partial<LocalPluginInstallationError>>({
          code: 'invalid_boundary_payload',
          operation: 'register',
          message: 'Local plugin installation returned an invalid response.',
        }),
      );
    }
  });
});
