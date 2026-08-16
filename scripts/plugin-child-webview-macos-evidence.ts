import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const readText = (path: string): string => readFileSync(join(root, path), 'utf8');
const readJson = (path: string): Record<string, unknown> => JSON.parse(readText(path)) as Record<string, unknown>;
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Child WebView macOS evidence failed: ${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};
const allTrue = (value: unknown, label: string): void => {
  const entries = Object.entries(record(value, label));
  if (entries.length === 0 || entries.some(([, result]) => result !== true)) {
    throw new Error(`Child WebView macOS evidence failed: ${label} contains a failed check.`);
  }
};
const boundedNumber = (value: unknown, maximum: number, label: string): void => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`Child WebView macOS evidence failed: ${label} exceeds its maintained budget.`);
  }
};

const validateLifecycleAttempt = (value: unknown, label: string): void => {
  const attempt = record(value, label);
  for (const key of [
    'created',
    'exact_top_level_navigation',
    'bounds',
    'hidden',
    'shown',
    'same_attempt_restore',
    'focused',
    'popup_denied',
    'download_denied',
    'destroyed',
    'zero_residual_webviews',
  ]) {
    if (attempt[key] !== true) throw new Error(`Child WebView macOS evidence failed: ${label}.${key}.`);
  }
  boundedNumber(attempt.hide_restore_ms, 250, `${label}.hide_restore_ms`);
  boundedNumber(attempt.destroy_ms, 1000, `${label}.destroy_ms`);
};

const validateSources = (sources: {
  acl: Record<string, unknown>;
  slot: Record<string, unknown>;
  web: Record<string, unknown>;
  lifecycle: Record<string, unknown>;
}): void => {
  const profiles = sources.acl.profiles;
  if (!Array.isArray(profiles) || profiles.length !== 3) {
    throw new Error('Child WebView macOS evidence failed: ACL source parity is incomplete.');
  }
  for (const profile of profiles) {
    const authority = record(record(profile, 'ACL profile').authority, 'ACL authority');
    for (const key of [
      'created',
      'tauri_globals_absent',
      'window_authority_unchanged',
      'webview_authority_unchanged',
      'destroyed',
    ]) {
      if (authority[key] !== true) throw new Error(`Child WebView macOS evidence failed: ACL ${key}.`);
    }
    for (const key of [
      'tauri_core_handler_hits',
      'tauri_plugin_handler_hits',
      'app_command_handler_hits',
      'global_event_handler_hits',
      'native_source_identity_mismatch_hits',
    ]) {
      if (authority[key] !== 0) throw new Error(`Child WebView macOS evidence failed: ACL ${key}.`);
    }
    if (authority.malformed_carriers_rejected !== 3 || authority.rejected_tauri_envelopes !== 6) {
      throw new Error('Child WebView macOS evidence failed: ACL rejection corpus is incomplete.');
    }
  }

  for (const key of [
    'created',
    'retina_bounds_scale_correct',
    'resize_converged',
    'host_overlay_visible_after_child_hidden',
    'keyboard_focus_reached_plugin_input',
    'keyboard_input_observed',
    'ime_composition_observed',
    'destroyed',
  ]) {
    if (sources.slot[key] !== true) throw new Error(`Child WebView macOS evidence failed: slot ${key}.`);
  }

  for (const generation of ['first_generation', 'second_generation']) {
    allTrue(
      Object.fromEntries(
        Object.entries(record(sources.web[generation], generation)).filter(([key]) => key !== 'phase'),
      ),
      generation,
    );
  }
  for (const key of [
    'created',
    'distinct_origins',
    'distinct_data_store_identifiers',
    'cross_plugin_storage_denied',
    'old_generation_storage_denied',
    'replacement_fresh',
  ]) {
    if (sources.web[key] !== true) throw new Error(`Child WebView macOS evidence failed: Web ${key}.`);
  }

  validateLifecycleAttempt(sources.lifecycle.first_open, 'first_open');
  validateLifecycleAttempt(sources.lifecycle.reopened, 'reopened');
  if (sources.lifecycle.close_reopen_fresh !== true) {
    throw new Error('Child WebView macOS evidence failed: close/reopen did not create a fresh view.');
  }
};

const committed = {
  acl: readJson('fixtures/plugin-child-webview-acl/evidence/macos.json'),
  slot: readJson('fixtures/plugin-child-webview-slot/evidence/macos.json'),
  web: readJson('fixtures/plugin-child-webview-web-capabilities/evidence/macos.json'),
  lifecycle: readJson('fixtures/plugin-child-webview-lifecycle/evidence/macos.json'),
};
validateSources(committed);

const matrix = readJson('fixtures/plugin-child-webview-evidence-matrix/macos.json');
if (matrix.evidence_version !== '0.1.0' || matrix.platform !== 'macos' || matrix.engine !== 'wkwebview') {
  throw new Error('Child WebView macOS evidence failed: matrix identity drifted.');
}
allTrue(matrix.positive, 'positive matrix');
const negative = record(matrix.negative, 'negative matrix');
if (negative.os_process_isolation_assumed !== false) {
  throw new Error('Child WebView macOS evidence failed: OS process isolation became an assumption.');
}
allTrue(
  Object.fromEntries(Object.entries(negative).filter(([key]) => key !== 'os_process_isolation_assumed')),
  'negative matrix',
);
const privacy = record(matrix.privacy, 'privacy');
if (Object.values(privacy).some((value) => value !== false)) {
  throw new Error('Child WebView macOS evidence failed: evidence privacy drifted.');
}

const runtimeDocs = [
  'docs/en/architecture/plugin-child-webview-runtime.md',
  'docs/zh/architecture/plugin-child-webview-runtime.md',
] as const;
const [englishRuntimeDocs, chineseRuntimeDocs] = runtimeDocs.map(readText);
const headingLevels = (source: string): string =>
  source
    .split('\n')
    .filter((line) => /^#{1,6}\s/u.test(line))
    .map((line) => line.match(/^#+/u)?.[0].length ?? 0)
    .join(',');
if (headingLevels(englishRuntimeDocs) !== headingLevels(chineseRuntimeDocs)) {
  throw new Error('Child WebView macOS evidence failed: Runtime documentation heading mirrors drifted.');
}
for (const [path, source] of runtimeDocs.map(
  (path, index) => [path, [englishRuntimeDocs, chineseRuntimeDocs][index]] as const,
)) {
  for (const marker of [
    '```mermaid',
    'runtime.kind: "webview"',
    '@lensx/plugin-sdk/webview',
    'pnpm run evidence:plugin-child-webview-macos',
    '1000 ms',
    '250 ms',
    '100 ms',
    '50 ms',
    'OS process',
  ]) {
    if (!source.includes(marker)) {
      throw new Error(`Child WebView macOS evidence failed: ${path} is missing ${marker}.`);
    }
  }
}
for (const index of ['docs/en/index.md', 'docs/zh/index.md']) {
  if (!readText(index).includes('(architecture/plugin-child-webview-runtime.md)')) {
    throw new Error(`Child WebView macOS evidence failed: ${index} does not link the Runtime architecture.`);
  }
}

const cold = readJson('fixtures/official-config-lens/evidence/macos/cold-open.json');
const stages = record(cold.stage_ms, 'cold stage timings');
for (const stage of ['resolve', 'create', 'navigation', 'load', 'bridge', 'sdk', 'bundle', 'editor', 'worker']) {
  boundedNumber(record(stages[stage], `${stage} stage`).p95, 2000, `${stage} stage p95`);
}
boundedNumber(record(stages.create, 'create stage').p95, 1000, 'cold create p95');
boundedNumber(record(cold.first_interactive_ms, 'first interactive').p95, 2000, 'first interactive p95');
boundedNumber(record(cold.host_heartbeat, 'Host heartbeat').p95_gap_ms, 50, 'Host heartbeat p95');
const configLens = readJson('fixtures/official-config-lens/evidence/macos/config-lens.json');
boundedNumber(record(configLens.warm_format, 'warm format').p95_action_to_model_update_ms, 100, 'warm format p95');
const configChecks = record(configLens.checks, 'ConfigLens checks');
for (const check of [
  'worker_timeout_terminated',
  'worker_recreated_after_failure',
  'editor_and_package_worker_loaded',
  'launcher_responsive_during_worker_work',
  'teardown_completed',
  'bounded_content_free_record',
]) {
  if (configChecks[check] !== true) {
    throw new Error(`Child WebView macOS evidence failed: ConfigLens ${check}.`);
  }
}

if (process.argv.includes('--run')) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'lensx-child-webview-macos-evidence-'));
  try {
    const harnesses = [
      ['acl', 'plugin_child_webview_acl_harness', 'plugin-child-webview-acl-harness'],
      ['slot', 'plugin_child_webview_slot_harness', 'plugin-child-webview-slot-harness'],
      ['web', 'plugin_child_webview_web_capability_harness', 'plugin-child-webview-web-capability-harness'],
      ['lifecycle', 'plugin_child_webview_spike', 'plugin-child-webview-spike'],
    ] as const;
    const actual = {} as typeof committed;
    for (const [key, example, feature] of harnesses) {
      const output = join(temporaryRoot, `${key}.json`);
      const result = spawnSync(
        'cargo',
        [
          'run',
          '--manifest-path',
          'src-tauri/Cargo.toml',
          '--example',
          example,
          '--features',
          feature,
          '--',
          '--output',
          output,
        ],
        { cwd: root, encoding: 'utf8' },
      );
      if (result.status !== 0) {
        throw new Error(`Child WebView macOS evidence failed: ${example} did not exit successfully.`);
      }
      actual[key] = JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>;
    }
    validateSources(actual);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

console.log(
  `Child WebView macOS positive, negative, lifecycle, performance, and privacy evidence ${
    process.argv.includes('--run') ? 'reran successfully' : 'is complete'
  }.`,
);
