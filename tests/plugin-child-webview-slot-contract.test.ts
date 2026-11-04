import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@rstest/core';
import { MAIN_PLUGIN_CHILD_WEBVIEW_OWNER } from '../src/app/plugins/runtime/pluginChildWebviewOwner';
import {
  createPluginChildWebviewSlotController,
  physicalBoundsFromDomRect,
  UPDATE_PLUGIN_CHILD_WEBVIEW_SLOT_COMMAND,
} from '../src/app/plugins/runtime/pluginChildWebviewSlot';

describe('Plugin Child WebView slot contract', () => {
  test('derives slot geometry and owner checks from the actual Host WebView parent', () => {
    const source = readFileSync(new URL('../src-tauri/src/plugin_child_webview_slot.rs', import.meta.url), 'utf8');
    const command = source.slice(
      source.indexOf('pub(crate) fn update_plugin_child_webview_slot'),
      source.indexOf('\n}\n\n#[cfg(test)]'),
    );
    expect(command).toContain('webview: Webview');
    expect(command).toContain('let window = webview.window()');
    expect(command).toContain('parse_presentation_owner(');
    expect(command).toContain('webview.label()');
    expect(command).toContain('window.label()');
    expect(command).toContain('&request.ownership_revision');
    expect(command.indexOf('parse_presentation_owner(')).toBeLessThan(command.indexOf('window.inner_size()'));
    expect(command).not.toContain('get_window(');
    expect(source).toContain('actual_host_source != actual_window_label');
    expect(source).toContain('matches_host_source(actual_host_source)');
    expect(source).toContain('service.apply_owned_slot_update(attempt, &owner, revision, bounds)');
    expect(command).not.toContain('get_webview_window');
  });

  test('derives covering physical pixels from Host DOM geometry and Retina scale', () => {
    expect(
      physicalBoundsFromDomRect(
        { left: 20.25, top: 40.5, right: 320.75, bottom: 240.25, width: 300.5, height: 199.75 },
        2,
      ),
    ).toEqual({ x: 40, y: 81, width: 602, height: 400 });
  });

  test('rejects non-finite, negative, and empty Host geometry before IPC', () => {
    for (const [rect, scale] of [
      [{ left: Number.NaN, top: 0, right: 10, bottom: 10, width: 10, height: 10 }, 2],
      [{ left: -1, top: 0, right: 10, bottom: 10, width: 11, height: 10 }, 2],
      [{ left: 0, top: 0, right: 0, bottom: 10, width: 0, height: 10 }, 2],
      [{ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(() => physicalBoundsFromDomRect(rect, scale)).toThrow('slot geometry is invalid');
    }
  });

  test('sends one closed Host-owned request and checks the accepted revision', async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const controller = createPluginChildWebviewSlotController(async (command, args) => {
      calls.push({ command, args });
      return { contract_version: '0.2.0', accepted_revision: '7' };
    });
    await controller.update({
      attemptId: 'attempt_0123456789abcdef',
      owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      scaleFactor: 2,
      physicalBounds: { x: 40, y: 80, width: 600, height: 400 },
      presentationRevision: 7n,
    });
    expect(calls).toEqual([
      {
        command: UPDATE_PLUGIN_CHILD_WEBVIEW_SLOT_COMMAND,
        args: {
          request: {
            contract_version: '0.2.0',
            attempt_id: 'attempt_0123456789abcdef',
            window_label: 'main',
            ownership_revision: '1',
            surface_mode: 'page',
            scale_factor: 2,
            physical_bounds: { x: 40, y: 80, width: 600, height: 400 },
            presentation_revision: '7',
          },
        },
      },
    ]);
  });

  test('rejects zero revisions and mismatched response revisions', async () => {
    const controller = createPluginChildWebviewSlotController(async () => ({
      contract_version: '0.2.0',
      accepted_revision: '2',
    }));
    await expect(
      controller.update({
        attemptId: 'attempt_0123456789abcdef',
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
        scaleFactor: 2,
        physicalBounds: { x: 0, y: 0, width: 100, height: 100 },
        presentationRevision: 0n,
      }),
    ).rejects.toThrow('slot revision is invalid');
    await expect(
      controller.update({
        attemptId: 'attempt_0123456789abcdef',
        owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
        scaleFactor: 2,
        physicalBounds: { x: 0, y: 0, width: 100, height: 100 },
        presentationRevision: 1n,
      }),
    ).rejects.toThrow('slot response is invalid');
  });
});
