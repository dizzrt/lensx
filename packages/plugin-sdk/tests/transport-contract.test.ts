import { describe, expect, test } from '@rstest/core';

import {
  createPluginTransportRequestId,
  PrivatePluginTransportError,
  parsePluginRuntimeBootstrap,
  parsePluginTransportFrame,
} from '../src/internal/transport-contract.js';
import { invalidTransportFrames, validTransportFrames } from './fixtures/transport-frames.js';

describe('private Plugin SDK transport contract', () => {
  test('parses copied and frozen exact frames from unknown', () => {
    for (const frame of validTransportFrames) {
      const parsed = parsePluginTransportFrame(structuredClone(frame));
      expect(parsed).toEqual(frame);
      expect(Object.isFrozen(parsed)).toBe(true);
      if ('request' in parsed) expect(Object.isFrozen(parsed.request)).toBe(true);
      if ('result' in parsed) expect(Object.isFrozen(parsed.result)).toBe(true);
      if ('event' in parsed) expect(Object.isFrozen(parsed.event)).toBe(true);
    }
  });

  test('rejects version, type, extra keys, identity, sensitive fields, invalid JSON, and semantic mismatch safely', () => {
    for (const frame of invalidTransportFrames) {
      expect(() => parsePluginTransportFrame(frame)).toThrow(
        expect.objectContaining({ code: 'invalid_frame', message: 'Plugin transport frame is invalid.' }),
      );
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.value = cyclic;
    expect(() => parsePluginTransportFrame(cyclic)).toThrow(PrivatePluginTransportError);
    const diagnostic = JSON.stringify(
      (() => {
        try {
          parsePluginTransportFrame({ payload: 'secret', nonce: '0123456789abcdef0123456789abcdef' });
        } catch (error) {
          return error;
        }
      })(),
    );
    expect(diagnostic).not.toMatch(/secret|0123456789abcdef|\/private\/|stack/u);
  });

  test('keeps bootstrap and request identifiers exact and bounded', () => {
    const bootstrap = parsePluginRuntimeBootstrap({
      contract_version: '0.1.0',
      type: 'lensx.plugin_runtime.bootstrap',
      nonce: '0123456789abcdef0123456789abcdef',
    });
    expect(Object.isFrozen(bootstrap)).toBe(true);
    expect(createPluginTransportRequestId(1)).toBe('request_0000000000000001');
    expect(() => createPluginTransportRequestId(0)).toThrow(PrivatePluginTransportError);
  });
});
