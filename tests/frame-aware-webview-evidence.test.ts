import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';
import Ajv2020 from 'ajv/dist/2020.js';
import evidenceSchema from '../tools/frame-aware-webview-harness/evidence.schema.json';

const rootDir = join(import.meta.dirname, '..');
const validateEvidence = new Ajv2020({ allErrors: true, strict: true }).compile(evidenceSchema);
const validEvidence = {
  evidence_version: '0.1.0',
  run: {
    os: 'macos',
    engine: 'wkwebview',
    engine_version: '619.2.8.1',
    tauri_revision: '2.11.5',
    wry_revision: '0.55.1',
    bundle_shape: 'native_custom_protocol',
    lease_lifecycle_verified: true,
  },
  observations: [
    {
      case_id: 'exact-plugin-entry',
      event: 'document_start',
      outcome: 'observed',
      fixture_frame_class: 'descendant',
      native_frame_class: 'unknown',
      decision: 'not_observed',
      precommit_outcome: 'not_observed',
      host_bootstrap_available: true,
      descendant_bootstrap_absent: true,
      handler_hit_count: 0,
      navigation_callback_hits: 1,
      popup_callback_hits: 0,
      download_callback_hits: 0,
    },
  ],
};

describe('frame-aware WebView evidence schema', () => {
  test('accepts only bounded platform, engine, frame, decision, and counter evidence', () => {
    expect(validateEvidence(structuredClone(validEvidence))).toBe(true);
  });

  test.each([
    ['raw_url', 'lensx-plugin://localhost/private'],
    ['scope', '0123456789abcdef'],
    ['identity', 'com.acme.private'],
    ['local_path', '/Users/private/plugin'],
    ['invoke_key', 'secret-key'],
    ['raw_payload', { command: 'private' }],
    ['bootstrap_script', 'window.__TAURI_INTERNALS__ = {}'],
    ['unknown_field', true],
  ])('rejects forbidden or unknown observation field %s', (field, value) => {
    const evidence = structuredClone(validEvidence) as Record<string, unknown> & {
      observations: Array<Record<string, unknown>>;
    };
    const observation = evidence.observations[0];
    if (observation === undefined) throw new Error('expected one evidence observation');
    observation[field] = value;
    expect(validateEvidence(evidence)).toBe(false);
  });

  test('rejects unknown run and top-level fields', () => {
    const unknownRun = structuredClone(validEvidence) as Record<string, unknown> & { run: Record<string, unknown> };
    unknownRun.run.user_agent = 'raw browser identity';
    expect(validateEvidence(unknownRun)).toBe(false);

    const unknownRoot = { ...structuredClone(validEvidence), output_path: '/private/evidence.json' };
    expect(validateEvidence(unknownRoot)).toBe(false);
  });

  test.each([
    '',
    'Version/619.2.8',
    '619.2.8.1.4',
    '619.2/private',
    '1234567',
  ])('rejects an unbounded or raw engine version: %s', (engineVersion) => {
    const evidence = structuredClone(validEvidence);
    evidence.run.engine_version = engineVersion;
    expect(validateEvidence(evidence)).toBe(false);
  });

  test('keeps the schema and harness outside production composition', () => {
    const appSource = readFileSync(join(rootDir, 'src/App.tsx'), 'utf8');
    const tauriSource = readFileSync(join(rootDir, 'src-tauri/src/lib.rs'), 'utf8');
    expect(appSource).not.toContain('frame-aware-webview-harness');
    expect(tauriSource).not.toContain('frame_aware_webview_harness');
  });
});
