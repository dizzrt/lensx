import { describe, expect, test } from '@rstest/core';
import {
  createCryptographicPluginRuntimeNonce,
  createPluginRuntimeSessionBootstrap,
  freezePluginRuntimeSessionIdentity,
  parsePluginRuntimeSessionReadyAcknowledgement,
} from '../src/app/plugins/runtime';

const nonce = '0123456789abcdef0123456789abcdef';

describe('Host-private Plugin Runtime Session contract', () => {
  test('creates an exact frozen bootstrap without trusted identity fields', () => {
    const bootstrap = createPluginRuntimeSessionBootstrap(nonce);
    expect(bootstrap).toEqual({
      contract_version: '0.1.0',
      type: 'lensx.plugin_runtime.bootstrap',
      nonce,
    });
    expect(Object.isFrozen(bootstrap)).toBe(true);
    expect(bootstrap).not.toHaveProperty('plugin_id');
    expect(bootstrap).not.toHaveProperty('entry_id');
    expect(bootstrap).not.toHaveProperty('page_id');
    expect(bootstrap).not.toHaveProperty('granted_permission_ids');
  });

  test('parses only the exact ready acknowledgement from unknown', () => {
    expect(
      parsePluginRuntimeSessionReadyAcknowledgement({
        contract_version: '0.1.0',
        type: 'lensx.plugin_runtime.ready',
        nonce,
      }),
    ).toEqual({ contract_version: '0.1.0', type: 'lensx.plugin_runtime.ready', nonce });

    class Acknowledgement {
      contract_version = '0.1.0';
      type = 'lensx.plugin_runtime.ready';
      nonce = nonce;
    }
    for (const value of [
      null,
      [],
      new Acknowledgement(),
      { contract_version: '0.2.0', type: 'lensx.plugin_runtime.ready', nonce },
      { contract_version: '0.1.0', type: 'lensx.plugin_runtime.bootstrap', nonce },
      { contract_version: '0.1.0', type: 'lensx.plugin_runtime.ready' },
      { contract_version: '0.1.0', type: 'lensx.plugin_runtime.ready', nonce, plugin_id: 'com.forged' },
      { contract_version: '0.1.0', type: 'lensx.plugin_runtime.ready', nonce: nonce.toUpperCase() },
      { contract_version: '0.1.0', type: 'lensx.plugin_runtime.ready', nonce: '0'.repeat(31) },
      { contract_version: '0.1.0', type: 'lensx.plugin_runtime.ready', nonce: '0'.repeat(33) },
      { contract_version: '0.1.0', type: 'lensx.plugin_runtime.ready', nonce: 42 },
    ]) {
      expect(() => parsePluginRuntimeSessionReadyAcknowledgement(value)).toThrow(
        expect.objectContaining({ code: 'invalid_acknowledgement' }),
      );
    }
  });

  test('uses exactly 128 bits of injected randomness and lowercase hex encoding', () => {
    const seen: Uint8Array[] = [];
    const value = createCryptographicPluginRuntimeNonce((bytes) => {
      seen.push(bytes);
      bytes.set(Array.from({ length: 16 }, (_, index) => index * 17));
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(16);
    expect(value).toBe('00112233445566778899aabbccddeeff');
    expect(value).toMatch(/^[0-9a-f]{32}$/u);
  });

  test('freezes a bounded Host identity and rejects unsafe facts', () => {
    const identity = freezePluginRuntimeSessionIdentity({
      entry_id: 'entry_0123456789abcdef',
      plugin_id: 'com.acme.workspace',
      version: '1.2.3',
      page_id: 'home',
      expected_origin: 'https://lensx-plugin.0123456789abcdef0123456789abcdef.runtime.localhost',
      resource_generation: '0123456789abcdef0123456789abcdef',
      runtime_attempt_key: 'attempt-1',
      registration_revision: '7',
    });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(identity).not.toHaveProperty('granted_permission_ids');
    expect(() => freezePluginRuntimeSessionIdentity({ ...identity, expected_origin: 'not an origin' })).toThrow(
      expect.objectContaining({ code: 'invalid_identity' }),
    );
  });
});
