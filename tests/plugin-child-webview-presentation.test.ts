import { describe, expect, test } from '@rstest/core';

import {
  CREATE_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND,
  createPluginChildWebviewPresentationController,
  DESTROY_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND,
  READ_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND,
  SET_PLUGIN_CHILD_WEBVIEW_PRESENTATION_VISIBILITY_COMMAND,
  UPDATE_PLUGIN_CHILD_WEBVIEW_SLOT_COMMAND,
  WAIT_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND,
} from '../src/app/plugins/runtime';

describe('Plugin Child WebView presentation contract', () => {
  test('creates from safe Host identity and never sends URL, label, handle, origin, or WebView configuration', async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const controller = createPluginChildWebviewPresentationController(async (command, args) => {
      calls.push({ command, args });
      if (command === CREATE_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND) {
        return { contract_version: '0.2.0', attempt_id: 'attempt_0123456789abcdef' };
      }
      if (command === UPDATE_PLUGIN_CHILD_WEBVIEW_SLOT_COMMAND) {
        return { contract_version: '0.1.0', accepted_revision: '2' };
      }
      if (command === READ_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND) {
        return {
          contract_version: '0.2.0',
          attempt_id: 'attempt_0123456789abcdef',
          readiness: 'ready',
          failure_code: null,
        };
      }
      if (command === WAIT_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND) {
        return { contract_version: '0.2.0', readiness: 'ready', failure_code: null };
      }
      if (command === SET_PLUGIN_CHILD_WEBVIEW_PRESENTATION_VISIBILITY_COMMAND) {
        return {
          contract_version: '0.2.0',
          attempt_id: 'attempt_0123456789abcdef',
          visible: true,
        };
      }
      return { contract_version: '0.2.0', destroyed: true };
    });
    const binding = await controller.create({
      identity: {
        entryId: 'entry_0123456789abcdef',
        pluginId: 'com.acme.workspace',
        version: '1.2.3',
        pageId: 'home',
        expectedRevision: '7',
      },
      scaleFactor: 2,
      physicalBounds: { x: 40, y: 80, width: 600, height: 400 },
      presentationRevision: 1n,
    });
    await controller.updateSlot(binding, 2, { x: 44, y: 84, width: 620, height: 420 }, 2n);
    await expect(controller.readReadiness(binding)).resolves.toEqual({ status: 'ready' });
    await expect(controller.waitReadiness(binding)).resolves.toEqual({ status: 'ready' });
    await controller.setVisible(binding, true);
    await expect(controller.destroy(binding)).resolves.toBe(true);

    expect(calls.map(({ command }) => command)).toEqual([
      CREATE_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND,
      UPDATE_PLUGIN_CHILD_WEBVIEW_SLOT_COMMAND,
      READ_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND,
      WAIT_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND,
      SET_PLUGIN_CHILD_WEBVIEW_PRESENTATION_VISIBILITY_COMMAND,
      DESTROY_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND,
    ]);
    expect(calls[0]?.args).toEqual({
      request: {
        contract_version: '0.2.0',
        window_label: 'main',
        surface_mode: 'page',
        scale_factor: 2,
        physical_bounds: { x: 40, y: 80, width: 600, height: 400 },
        presentation_revision: '1',
        identity: {
          entry_id: 'entry_0123456789abcdef',
          plugin_id: 'com.acme.workspace',
          version: '1.2.3',
          page_id: 'home',
          expected_revision: '7',
        },
      },
    });
    expect(JSON.stringify(calls[0])).not.toMatch(
      /"(?:entry_url|origin|webview_label|handle|data_store|webview_config)"/u,
    );
  });

  test('rejects malformed create responses and makes destroy failure bounded', async () => {
    const malformed = createPluginChildWebviewPresentationController(async () => ({
      contract_version: '0.2.0',
      attempt_id: 'forged',
    }));
    await expect(
      malformed.create({
        identity: {
          entryId: 'entry_0123456789abcdef',
          pluginId: 'com.acme.workspace',
          version: '1.2.3',
          pageId: 'home',
          expectedRevision: '7',
        },
        scaleFactor: 1,
        physicalBounds: { x: 0, y: 0, width: 100, height: 100 },
        presentationRevision: 1n,
      }),
    ).rejects.toThrow('presentation response is invalid');
    const unavailable = createPluginChildWebviewPresentationController(async () => {
      throw new Error('private');
    });
    await expect(unavailable.destroy({ attemptId: 'attempt_0123456789abcdef' })).resolves.toBe(false);
  });
});
