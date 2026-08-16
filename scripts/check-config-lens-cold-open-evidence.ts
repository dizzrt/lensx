import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertConfigLensColdOpenEvidencePrivacy,
  validateConfigLensColdOpenEvidence,
} from './config-lens-cold-open-metrics.ts';

const root = join(import.meta.dirname, '..');
const path = join(root, 'fixtures/official-config-lens/evidence/macos/cold-open.json');
const source = readFileSync(path, 'utf8');
assertConfigLensColdOpenEvidencePrivacy(source);
if (!validateConfigLensColdOpenEvidence(JSON.parse(source))) {
  throw new Error('ConfigLens cold-open stage and Host heartbeat evidence is invalid or incomplete.');
}
const evidence = JSON.parse(source) as {
  profiles: {
    release_like: { stage_ms: { host_loading: { p95: number }; first_interactive: { p95: number } } };
    development_snapshot: { stage_ms: { first_interactive: { p95: number } } };
    same_attempt_restore: { stage_ms: { restore: { p95: number } } };
  };
  host_heartbeat: { p95_gap_ms: number };
};
for (const [label, value, maximum] of [
  ['release Host loading', evidence.profiles.release_like.stage_ms.host_loading.p95, 250],
  ['release first interactive', evidence.profiles.release_like.stage_ms.first_interactive.p95, 500],
  ['Development first interactive', evidence.profiles.development_snapshot.stage_ms.first_interactive.p95, 1000],
  ['same-attempt restore', evidence.profiles.same_attempt_restore.stage_ms.restore.p95, 100],
  ['Host heartbeat', evidence.host_heartbeat.p95_gap_ms, 50],
] as const) {
  if (!Number.isFinite(value) || value > maximum) throw new Error(`${label} p95 exceeds ${maximum} ms.`);
}
const producer = readFileSync(join(root, 'scripts/plugin-child-webview-macos-evidence.ts'), 'utf8');
const harness = readFileSync(join(root, 'src-tauri/src/config_lens_cold_open_harness.rs'), 'utf8');
for (const marker of ["'20'", "'config_lens_cold_open_harness'", "'--update-cold-open'"]) {
  if (!producer.includes(marker)) throw new Error(`Real cold-open producer is missing ${marker}.`);
}
if (
  !readFileSync(join(root, 'scripts/config-lens-cold-open-metrics.ts'), 'utf8').includes(
    "kind: 'target_macos_product_runtime'",
  )
) {
  throw new Error('Cold-open summary no longer identifies the target macOS product Runtime.');
}
for (const marker of [
  'create_config_lens_evidence_presentation',
  'handle_plugin_resource_protocol',
  'send_native_text_input',
  'compare_current_teardown',
]) {
  if (!harness.includes(marker)) throw new Error(`Product-path harness is missing ${marker}.`);
}
console.log('Checked content-free ConfigLens cold-open stages and Host heartbeat evidence.');
