import { describe, expect, test } from '@rstest/core';

import { parsePluginTransportFrame } from '../packages/plugin-sdk/src/internal/transport-contract';
import { parsePluginWebviewBridgeFrame as parseSdkWebviewBridgeFrame } from '../packages/plugin-sdk/src/internal/webview-bridge-contract';
import { invalidTransportFrames, validTransportFrames } from '../packages/plugin-sdk/tests/fixtures/transport-frames';
import { webviewBridgeCorpus } from '../packages/plugin-sdk/tests/fixtures/webview-bridge-frames';
import { parsePluginRuntimeTransportFrame } from '../src/app/plugins/runtime/transport-contract';
import { parsePluginWebviewBridgeFrame as parseHostWebviewBridgeFrame } from '../src/app/plugins/runtime/webview-bridge-contract';

describe('Plugin transport canonical codec drift gate', () => {
  test('keeps plugin and Host projections aligned for shared valid fixtures', () => {
    for (const fixture of validTransportFrames) {
      expect(parsePluginRuntimeTransportFrame(structuredClone(fixture))).toEqual(
        parsePluginTransportFrame(structuredClone(fixture)),
      );
    }
  });

  test('keeps plugin and Host projections fail-closed for shared invalid fixtures', () => {
    for (const fixture of invalidTransportFrames) {
      expect(() => parsePluginTransportFrame(fixture)).toThrow();
      expect(() => parsePluginRuntimeTransportFrame(fixture)).toThrow();
    }
  });
});

describe('WebView bridge canonical codec drift gate', () => {
  test('keeps SDK and Host projections aligned for the frozen valid corpus', () => {
    for (const fixture of webviewBridgeCorpus.valid) {
      expect(parseHostWebviewBridgeFrame(structuredClone(fixture))).toEqual(
        parseSdkWebviewBridgeFrame(structuredClone(fixture)),
      );
    }
  });

  test('keeps SDK and Host projections fail closed for the frozen malicious corpus', () => {
    for (const fixture of webviewBridgeCorpus.invalid) {
      expect(() => parseSdkWebviewBridgeFrame(fixture)).toThrow();
      expect(() => parseHostWebviewBridgeFrame(fixture)).toThrow();
    }
  });
});
