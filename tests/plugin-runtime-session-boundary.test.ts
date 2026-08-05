import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

const root = join(import.meta.dirname, '..');
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;

describe('Host-private Plugin Runtime Session boundaries', () => {
  test('keeps Session wire and identity out of public package exports and the Manifest schema', () => {
    for (const packageName of ['plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit']) {
      const manifest = readJson(`packages/${packageName}/package.json`);
      const serializedExports = JSON.stringify(manifest.exports);
      expect(serializedExports).not.toMatch(/(?:runtime-session|session-contract|session-service|message-port)/iu);
    }

    const schema = readFileSync(join(root, 'packages/plugin-contract/schema/manifest.schema.json'), 'utf8');
    expect(schema).not.toMatch(/(?:runtime_session|session_identity|message_port|granted_permission_ids)/u);
  });

  test('keeps Registration Runtime inactive and does not persist browser Session objects in Rust', () => {
    const registrationTypes = readFileSync(join(root, 'src/app/plugins/registration/types.ts'), 'utf8');
    expect(registrationTypes).toContain("readonly kind: 'inactive'");
    expect(registrationTypes).not.toMatch(/(?:MessagePort|Window|PluginRuntimeSession)/u);

    const registrationRust = readFileSync(join(root, 'src-tauri/src/plugin_registration.rs'), 'utf8');
    expect(registrationRust).toContain('Inactive');
    expect(registrationRust).not.toMatch(/(?:MessagePort|PluginRuntimeSession|runtime_attempt_key)/u);
    const managerRust = readFileSync(join(root, 'src-tauri/src/plugin_manager.rs'), 'utf8');
    expect(managerRust).not.toMatch(/(?:MessagePort|PluginRuntimeSession|runtime_attempt_key)/u);
  });

  test('introduces no RPC, Host API method, permission decision, or public Session command', () => {
    const privateSources = [
      'src/app/plugins/runtime/session-contract.ts',
      'src/app/plugins/runtime/session-adapters.ts',
      'src/app/plugins/runtime/session-service.ts',
    ]
      .map((path) => readFileSync(join(root, path), 'utf8'))
      .join('\n');
    expect(privateSources).not.toMatch(/(?:jsonrpc|request_id|host_api_method|permission_decision|invoke\()/iu);
    expect(privateSources).not.toContain('@tauri-apps/');
  });
});
