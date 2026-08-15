import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const evidencePath = join(root, 'fixtures/official-config-lens/evidence/macos/config-lens.json');
const source = readFileSync(evidencePath, 'utf8');
const evidence = JSON.parse(source) as Record<string, unknown>;
const checks = evidence.checks as Record<string, unknown> | undefined;
const expected = [
  'exact_limits_observed',
  'diagnostic_limit_observed',
  'five_second_deadline_observed',
  'worker_timeout_terminated',
  'worker_recreated_after_failure',
  'editor_and_package_worker_loaded',
  'single_editor_direct_replace_and_undo',
  'four_language_minimum_operations',
  'malicious_inputs_fail_closed',
  'launcher_responsive_during_worker_work',
  'teardown_completed',
  'bounded_content_free_record',
];
if (
  JSON.stringify(Object.keys(evidence).sort()) !==
    JSON.stringify(
      ['checks', 'evidence_version', 'malicious_fail_closed_count', 'platform', 'valid_language_count'].sort(),
    ) ||
  evidence.evidence_version !== '0.1.0' ||
  evidence.platform !== 'macos-wkwebview' ||
  evidence.valid_language_count !== 4 ||
  evidence.malicious_fail_closed_count !== 4 ||
  checks === undefined ||
  JSON.stringify(Object.keys(checks).sort()) !== JSON.stringify([...expected].sort()) ||
  expected.some((key) => checks[key] !== true)
) {
  throw new Error('ConfigLens bounded WKWebView evidence is invalid or incomplete.');
}
for (const value of Object.values(evidence)) {
  if (
    typeof value === 'string' &&
    /(?:https?:|file:|\/Users\/|nonce|origin|payload|raw error|private path)/iu.test(value)
  ) {
    throw new Error('ConfigLens WKWebView evidence contains forbidden content.');
  }
}
console.log('Checked bounded content-free ConfigLens macOS WKWebView evidence.');
