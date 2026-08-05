import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

const evidenceRoot = join(import.meta.dirname, '../fixtures/plugin-runtime-session/evidence/macos');
const fixtures = ['normal', 'malicious', 'replacement'] as const;
const forbidden =
  /(?:"nonce"\s*:|"entry_id"\s*:|"plugin_id"\s*:|"page_id"\s*:|origin_token|raw_payload|private_error|\/Users\/|\/private\/)/u;

describe('bounded macOS Plugin Runtime Session evidence', () => {
  test.each(fixtures)('%s proves the private Session matrix without sensitive values', (fixture) => {
    const raw = readFileSync(join(evidenceRoot, `${fixture}.json`), 'utf8');
    expect(raw).not.toMatch(forbidden);
    const value = JSON.parse(raw) as Record<string, unknown>;
    expect(value).toMatchObject({
      evidence_version: '0.1.0',
      session_contract_version: '0.1.0',
      os: 'macos',
      engine: 'wkwebview',
      fixture,
      exact_target_window: true,
      exact_target_origin: true,
      message_port_transferred: true,
      nonce_single_use: true,
      ready_observed: true,
      disconnect_observed: true,
      dispose_observed: true,
      retry_old_port_invalid: true,
      replacement_old_port_invalid: true,
      unrelated_registration_stable: true,
      window_forgery_ignored: true,
      privileged_handler_hits: 0,
    });
  });
});
