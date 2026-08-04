import { describe, expect, rs, test } from '@rstest/core';
import {
  COMMIT_LOCAL_PLUGIN_REPLACEMENT_COMMAND,
  createPluginReplacementDesktopAdapter,
  PLUGIN_REPLACEMENT_CONTRACT_VERSION,
  PREPARE_LOCAL_PLUGIN_REPLACEMENT_COMMAND,
} from '../src/app/plugins/replacement';

const entryId = 'entry_0123456789abcdef';
const token = 'prep_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('plugin replacement desktop adapter', () => {
  test('invokes pathless prepare and strict commit requests', async () => {
    const invoke = rs.fn(async (command: string) =>
      command === PREPARE_LOCAL_PLUGIN_REPLACEMENT_COMMAND
        ? {
            status: 'prepared',
            contract_version: '0.1.0',
            preparation_token: token,
            entry_id: entryId,
            current_version: '1.0.0',
            candidate_version: '2.0.0',
            classification: 'upgrade',
            added_permission_ids: [],
            removed_permission_ids: [],
          }
        : {
            status: 'committed',
            contract_version: '0.1.0',
            entry_id: entryId,
            plugin_id: 'com.acme.workspace',
            version: '2.0.0',
            classification: 'upgrade',
            revision: '8',
            cleanup: 'pending',
          },
    );
    const adapter = createPluginReplacementDesktopAdapter(invoke);
    const prepared = await adapter.prepare({
      contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
      entry_id: entryId,
      expected_revision: '7',
    });
    expect(prepared.status).toBe('prepared');
    const committed = await adapter.commit({
      contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
      preparation_token: token,
      entry_id: entryId,
      expected_revision: '7',
    });
    expect(committed).toMatchObject({ status: 'committed', revision: '8', cleanup: 'pending' });
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      PREPARE_LOCAL_PLUGIN_REPLACEMENT_COMMAND,
      COMMIT_LOCAL_PLUGIN_REPLACEMENT_COMMAND,
    ]);
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(/path|digest|record_key|package_bytes/u);
  });

  test('maps native errors and malformed success or rejection payloads safely', async () => {
    const validError = createPluginReplacementDesktopAdapter(async () => {
      throw {
        contract_version: '0.1.0',
        code: 'stale_revision',
        operation: 'register',
        message: 'The plugin registration revision is stale.',
      };
    });
    await expect(
      validError.prepare({
        contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
        entry_id: entryId,
        expected_revision: '7',
      }),
    ).rejects.toMatchObject({ code: 'stale_revision', operation: 'register' });

    for (const raw of [{ status: 'prepared', path: '/Users/private/plugin.lxp' }, new Error('/private/raw')]) {
      const adapter = createPluginReplacementDesktopAdapter(async () => {
        if (raw instanceof Error) throw raw;
        return raw;
      });
      await expect(
        adapter.prepare({
          contract_version: PLUGIN_REPLACEMENT_CONTRACT_VERSION,
          entry_id: entryId,
          expected_revision: '7',
        }),
      ).rejects.toMatchObject({ code: 'invalid_boundary_payload', operation: 'prepare' });
    }
  });
});
