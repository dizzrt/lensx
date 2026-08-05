import { describe, expect, test } from '@rstest/core';

import { parsePluginTransportFrame } from '../packages/plugin-sdk/src/internal/transport-contract';
import { invalidTransportFrames, validTransportFrames } from '../packages/plugin-sdk/tests/fixtures/transport-frames';
import { parsePluginRuntimeTransportFrame } from '../src/app/plugins/runtime/transport-contract';

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
