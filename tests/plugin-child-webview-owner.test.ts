import { describe, expect, test } from '@rstest/core';
import cases from '../fixtures/plugin-resource-service/valid/cases.json';

const entryUrl = String(cases.find((item) => item.name === 'resolved_entry')?.value.entry_url);

import {
  parsePluginChildWebviewOwner,
  serializePluginChildWebviewOwner,
} from '../src/app/plugins/runtime/pluginChildWebviewOwner';
import { createPluginChildWebviewPresentationController } from '../src/app/plugins/runtime/pluginChildWebviewPresentation';

describe('private Child presentation ownership', () => {
  test('keeps the complete unsigned revision without number rounding', () => {
    const owner = parsePluginChildWebviewOwner('plugin-window-0000000000000001', '18446744073709551615');
    expect(serializePluginChildWebviewOwner(owner)).toEqual({
      window_label: 'plugin-window-0000000000000001',
      ownership_revision: '18446744073709551615',
    });
    expect(Object.isFrozen(owner)).toBe(true);
  });

  test('rejects noncanonical windows and revisions before IPC', () => {
    for (const label of ['plugin-child-0000000000000001', 'plugin-window-0000000000000000', 'MAIN', 'main/../other']) {
      expect(() => parsePluginChildWebviewOwner(label, '1')).toThrow('ownership is invalid');
    }
    for (const revision of ['0', '01', '-1', '1.0', '18446744073709551616', '1'.repeat(100), 1]) {
      expect(() => parsePluginChildWebviewOwner('main', revision)).toThrow('ownership is invalid');
    }
  });

  test('late operations keep their captured owner and never retarget to the new window', async () => {
    const oldBinding = {
      attemptId: 'attempt_0000000000000001' as const,
      owner: parsePluginChildWebviewOwner('main', '1'),
      entryUrl,
      resourceGeneration: '1',
    };
    const transferred = { ...oldBinding, owner: parsePluginChildWebviewOwner('plugin-window-0000000000000001', '2') };
    const received: Array<Record<string, unknown>> = [];
    const controller = createPluginChildWebviewPresentationController(async (_command, args) => {
      const request = args?.request as Record<string, unknown>;
      received.push(request);
      if (request.window_label !== transferred.owner.windowLabel || request.ownership_revision !== '2') {
        throw new Error('stale_attempt');
      }
      return { contract_version: '0.3.0', destroyed: true };
    });
    await expect(controller.destroy(oldBinding)).resolves.toBe(false);
    await expect(controller.setVisible(oldBinding, false)).rejects.toThrow('stale_attempt');
    await expect(controller.destroy(transferred)).resolves.toBe(true);
    expect(
      received.map(({ attempt_id, window_label, ownership_revision }) => ({
        attempt_id,
        window_label,
        ownership_revision,
      })),
    ).toEqual([
      { attempt_id: oldBinding.attemptId, window_label: 'main', ownership_revision: '1' },
      { attempt_id: oldBinding.attemptId, window_label: 'main', ownership_revision: '1' },
      { attempt_id: oldBinding.attemptId, window_label: transferred.owner.windowLabel, ownership_revision: '2' },
    ]);
  });
});
