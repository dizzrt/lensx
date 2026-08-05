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
      transport_contract_version: '0.1.0',
      os: 'macos',
      engine: 'wkwebview',
      fixture,
      plugin_csp_native_get_head_verified: true,
      plugin_csp_translated_get_head_verified: true,
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
      transport_roundtrip: true,
      transport_result_error_event: true,
      transport_out_of_order: true,
      transport_cancel_observed: true,
      transport_pending_terminated: true,
      transport_cleanup_zero_handler_hits: true,
      host_api_dispatcher_version: '0.1.0',
      host_api_context: true,
      host_api_actions_open: true,
      host_api_ui_close_response_before_effect: true,
      host_api_context_replacement: true,
      host_api_unimplemented_unavailable: true,
      privileged_handler_hits: 0,
    });
    expect(Object.values(value.csp_checks as Record<string, unknown>)).not.toContain(false);
  });
});
