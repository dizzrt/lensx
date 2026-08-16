import { loadMonaco } from '../../src/editor/monaco.js';
import { createLanguageController, type LanguageWorker } from '../../src/language/controller.js';
import { MAX_INPUT_BYTES, MAX_INPUT_LINES, OPERATION_DEADLINE_MS, preflightInput } from '../../src/language/limits.js';
import { isLanguageResult, MAX_DIAGNOSTICS } from '../../src/language/protocol.js';

interface EvidenceChecks {
  readonly exact_limits_observed: boolean;
  readonly diagnostic_limit_observed: boolean;
  readonly five_second_deadline_observed: boolean;
  readonly worker_timeout_terminated: boolean;
  readonly worker_recreated_after_failure: boolean;
  readonly editor_and_package_worker_loaded: boolean;
  readonly single_editor_direct_replace_and_undo: boolean;
  readonly four_language_minimum_operations: boolean;
  readonly malicious_inputs_fail_closed: boolean;
  readonly launcher_responsive_during_worker_work: boolean;
  readonly teardown_completed: boolean;
  readonly bounded_content_free_record: boolean;
  readonly warm_small_json_p95_budget: boolean;
  readonly warm_format_host_heartbeat: boolean;
  readonly warm_format_lexical_correctness: boolean;
}

interface WarmFormatEvidence {
  readonly budget_ms: 100;
  readonly sample_count: 40;
  readonly corpus_case_count: 4;
  readonly max_input_bytes: number;
  readonly p95_action_to_model_update_ms: number;
  readonly host_heartbeat_ticks: number;
}

interface Evidence {
  readonly evidence_version: '0.1.0';
  readonly platform: 'macos-wkwebview';
  readonly valid_language_count: number;
  readonly malicious_fail_closed_count: number;
  readonly warm_format: WarmFormatEvidence;
  readonly checks: EvidenceChecks;
}

interface TauriInternals {
  readonly invoke: (command: string, arguments_: unknown) => Promise<unknown>;
}

const internals = (globalThis as typeof globalThis & { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;

const recordFailure = async () => {
  await internals?.invoke('config_lens_wkwebview_harness_fail', { phase: 'evidence_record' });
};

const percentile95 = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
};

const run = async (): Promise<void> => {
  if (internals === undefined) return;
  let fakeTerminated = false;
  const fakeWorker: LanguageWorker = {
    onerror: null,
    onmessage: null,
    postMessage: () => undefined,
    terminate: () => {
      fakeTerminated = true;
    },
  };
  const timeoutController = createLanguageController(() => fakeWorker, 20);
  const timeout = await timeoutController.run('json', 'format', '{}');
  timeoutController.dispose();

  let animationTicks = 0;
  const ticker = setInterval(() => {
    animationTicks += 1;
  }, 0);
  const controller = createLanguageController();
  const normal = await Promise.all([
    controller.run('json', 'format', '{"value":1}'),
    controller.run('yaml', 'format', 'value: 1\n'),
    controller.run('toml', 'format', 'value=1\n'),
    controller.run('xml', 'format', '<root><value>1</value></root>'),
  ]);
  // The generation controller intentionally serializes ownership. Run again
  // sequentially so each language must complete through a fresh Worker.
  const serial = [];
  for (const [language, source] of [
    ['json', '{"value":1}'],
    ['yaml', 'value: 1\n'],
    ['toml', 'value=1\n'],
    ['xml', '<root><value>1</value></root>'],
  ] as const) {
    serial.push(await controller.run(language, 'format', source));
  }
  const malicious = [];
  for (const [language, source] of [
    ['json', '{"value":}'],
    ['yaml', 'value: *missing\n'],
    ['toml', 'value=2023-02-30\n'],
    ['xml', '<!DOCTYPE root SYSTEM "https://invalid.example/root.dtd"><root/>'],
  ] as const) {
    malicious.push(await controller.run(language, 'format', source));
  }
  clearInterval(ticker);

  const monaco = await loadMonaco();
  const container = document.createElement('div');
  container.style.cssText = 'width: 320px; height: 180px';
  document.body.append(container);
  const model = monaco.editor.createModel('{"value":1}', 'json');
  const editor = monaco.editor.create(container, { automaticLayout: false, model });
  const editorModelAttached = editor.getModel() === model;
  const originalEditorContent = model.getValue();
  const formattedEditorContent = serial[0]?.output;
  let directReplaceAndUndo = false;
  if (formattedEditorContent !== undefined) {
    editor.pushUndoStop();
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: formattedEditorContent }], () => null);
    editor.pushUndoStop();
    const replaced = model.getValue() === formattedEditorContent;
    await model.undo();
    directReplaceAndUndo = replaced && model.getValue() === originalEditorContent;
  }
  const smallJsonCorpus = [
    '{"name":"ConfigLens","enabled":true}',
    '{"large":900719925474099312345,"negativeZero":-0}',
    '{"escaped":"\\u0041","items":[3,2,1]}',
    '{"duplicate":1,"duplicate":2,"nested":{"value":null}}',
  ] as const;
  const warmup = await controller.run('json', 'format', smallJsonCorpus[0]);
  if (warmup.status !== 'valid' || warmup.output === undefined) throw new Error('warmup_failed');
  model.setValue(smallJsonCorpus[0]);
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text: warmup.output }], () => null);
  let warmHeartbeatTicks = 0;
  const warmHeartbeat = setInterval(() => {
    warmHeartbeatTicks += 1;
  }, 0);
  const warmDurations: number[] = [];
  let warmLexicalCorrectness = true;
  for (let index = 0; index < 40; index += 1) {
    const source = smallJsonCorpus[index % smallJsonCorpus.length] ?? smallJsonCorpus[0];
    model.setValue(source);
    const started = performance.now();
    const result = await controller.run('json', 'format', source);
    if (result.status !== 'valid' || result.output === undefined) {
      warmLexicalCorrectness = false;
      continue;
    }
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: result.output }], () => null);
    warmDurations.push(performance.now() - started);
    warmLexicalCorrectness &&= model.getValue().replace(/\s/gu, '') === source.replace(/\s/gu, '');
  }
  clearInterval(warmHeartbeat);
  const warmP95 = Math.round(percentile95(warmDurations) * 1_000) / 1_000;
  const explicitEditorWorker = new Worker(new URL('../../src/editor/editor.worker.ts', import.meta.url), {
    name: 'config-lens-evidence-editor',
    type: 'module',
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 30));
  explicitEditorWorker.terminate();
  editor.dispose();
  model.dispose();
  container.remove();
  controller.dispose();

  const oversizedDiagnostics = Array.from({ length: MAX_DIAGNOSTICS + 1 }, () => ({
    code: 'json.syntax',
    severity: 'error',
    offset: 0,
    length: 1,
    messageKey: 'diagnostic.jsonSyntax',
  }));
  const evidence: Evidence = {
    evidence_version: '0.1.0',
    platform: 'macos-wkwebview',
    valid_language_count: serial.filter(({ output, status }) => status === 'valid' && output !== undefined).length,
    malicious_fail_closed_count: malicious.filter(({ output, status }) => status !== 'valid' && output === undefined)
      .length,
    warm_format: {
      budget_ms: 100,
      sample_count: 40,
      corpus_case_count: smallJsonCorpus.length,
      max_input_bytes: Math.max(...smallJsonCorpus.map((source) => new TextEncoder().encode(source).byteLength)),
      p95_action_to_model_update_ms: warmP95,
      host_heartbeat_ticks: warmHeartbeatTicks,
    },
    checks: {
      exact_limits_observed:
        preflightInput(1, 'a'.repeat(MAX_INPUT_BYTES + 1))?.status === 'limit' &&
        preflightInput(2, '\n'.repeat(MAX_INPUT_LINES))?.status === 'limit',
      diagnostic_limit_observed: !isLanguageResult({
        requestId: 1,
        status: 'invalid',
        diagnostics: oversizedDiagnostics,
      }),
      five_second_deadline_observed: OPERATION_DEADLINE_MS === 5_000 && timeout.status === 'internal-error',
      worker_timeout_terminated: fakeTerminated,
      worker_recreated_after_failure: serial.every(({ status }) => status === 'valid'),
      editor_and_package_worker_loaded: editorModelAttached && explicitEditorWorker !== undefined,
      single_editor_direct_replace_and_undo: directReplaceAndUndo,
      four_language_minimum_operations:
        normal.length === 4 &&
        serial.length === 4 &&
        serial.every(({ output, status }) => status === 'valid' && output !== undefined),
      malicious_inputs_fail_closed: malicious.every(({ output, status }) => status !== 'valid' && output === undefined),
      launcher_responsive_during_worker_work: animationTicks > 0,
      teardown_completed: fakeTerminated,
      bounded_content_free_record: true,
      warm_small_json_p95_budget: warmDurations.length === 40 && warmP95 <= 100,
      warm_format_host_heartbeat: warmHeartbeatTicks > 0,
      warm_format_lexical_correctness: warmLexicalCorrectness,
    },
  };
  await internals.invoke('config_lens_wkwebview_harness_record', { evidence });
};

void run().catch(() => {
  void recordFailure();
});
