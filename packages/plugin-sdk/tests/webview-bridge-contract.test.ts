import { describe, expect, test } from '@rstest/core';

import {
  createPluginWebviewBridgeRequestId,
  PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION,
  PrivatePluginWebviewBridgeError,
  parsePluginWebviewBridgeFrame,
} from '../src/internal/webview-bridge-contract.js';
import { webviewBridgeCorpus } from './fixtures/webview-bridge-frames.js';

describe('private Plugin SDK WebView bridge contract', () => {
  test('freezes the carrier version and accepts only the closed valid corpus', () => {
    expect(webviewBridgeCorpus.corpus_version).toBe('0.1.0');
    expect(webviewBridgeCorpus.carrier_version).toBe(PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION);
    expect(webviewBridgeCorpus.valid).toHaveLength(7);
    for (const frame of webviewBridgeCorpus.valid) {
      const parsed = parsePluginWebviewBridgeFrame(structuredClone(frame));
      expect(parsed).toEqual(frame);
      expect(Object.isFrozen(parsed)).toBe(true);
    }
  });

  test('rejects legacy, forged, malformed, extra-key and semantic frames non-oracularly', () => {
    for (const frame of webviewBridgeCorpus.invalid) {
      expect(() => parsePluginWebviewBridgeFrame(frame)).toThrow(
        expect.objectContaining({ code: 'invalid_frame', message: 'Plugin WebView bridge frame is invalid.' }),
      );
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.value = cyclic;
    expect(() => parsePluginWebviewBridgeFrame(cyclic)).toThrow(PrivatePluginWebviewBridgeError);
    const error = (() => {
      try {
        parsePluginWebviewBridgeFrame({ payload: 'secret', webview_label: 'private' });
      } catch (caught) {
        return caught;
      }
    })();
    expect(JSON.stringify(error)).not.toMatch(/secret|private|label|payload|stack/u);
  });

  test('creates only bounded strictly formatted request IDs', () => {
    expect(createPluginWebviewBridgeRequestId(1)).toBe('request_0000000000000001');
    expect(createPluginWebviewBridgeRequestId(0xff)).toBe('request_00000000000000ff');
    expect(createPluginWebviewBridgeRequestId(Number.MAX_SAFE_INTEGER)).toBe('request_001fffffffffffff');
    for (const sequence of [0, -1, 1.5, Number.NaN]) {
      expect(() => createPluginWebviewBridgeRequestId(sequence)).toThrow(PrivatePluginWebviewBridgeError);
    }
  });
});
