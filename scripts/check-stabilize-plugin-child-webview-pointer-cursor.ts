import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`stabilize-plugin-child-webview-pointer-cursor drift: ${message}`);
};

for (const path of [
  'fixtures/plugin-pointer-cursor/cases.json',
  'fixtures/plugin-pointer-cursor/editor.json',
  'fixtures/plugin-pointer-cursor/surface.txt',
  'tools/plugin-pointer-cursor-harness/evidence.schema.json',
  'scripts/plugin-pointer-cursor-evidence.ts',
  'tests/plugin-pointer-cursor-evidence.test.ts',
]) {
  if (!existsSync(join(root, path))) fail(`missing ${path}`);
}

const schema = JSON.parse(read('tools/plugin-pointer-cursor-harness/evidence.schema.json')) as object;
new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const monaco = read('plugins/config-lens/src/editor/MonacoSurface.tsx');
if (/\b(?:mouse|pointer)(?:move|over|enter)\b/iu.test(monaco)) {
  fail('production Monaco surface gained pointer-move-driven lifecycle behavior');
}
for (const marker of ['useEffect(() => {', 'monaco.editor.createModel(', 'monaco.editor.create(', 'model.dispose()']) {
  if (!monaco.includes(marker)) fail(`ConfigLens single-editor baseline is missing ${marker}`);
}
const worker = read('plugins/config-lens/src/language/controller.ts');
if (/\b(?:mouse|pointer)(?:move|over|enter)\b/iu.test(worker)) {
  fail('language Worker controller became pointer-driven');
}
const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
if (/\b(?:mouse|pointer)(?:move|over|enter)\b/iu.test(slot)) {
  fail('Host slot revision became pointer-driven');
}

for (const path of [
  'packages/plugin-sdk/src/index.ts',
  'packages/plugin-sdk/src/types.ts',
  'packages/plugin-sdk/src/webview.ts',
  'plugins/config-lens/src/main.tsx',
  'plugins/config-lens/src/runtime.ts',
]) {
  const source = read(path);
  if (
    /PLUGIN_EVIDENCE_POINTER|plugin_evidence\.pointer|MOVE_DELIVERY|move_delivery_count|host_pointer_move|native_cursor|NSCursor/iu.test(
      source,
    )
  ) {
    fail(`${path} exposes the harness-only pointer diagnostic`);
  }
}

const harnessModuleRegistration = read('src-tauri/src/lib.rs');
if (
  !/#\[cfg\(feature = "config-lens-cold-open-harness"\)\]\s*#\[doc\(hidden\)\]\s*pub mod config_lens_cold_open_harness;/u.test(
    harnessModuleRegistration,
  )
) {
  fail('native pointer and Host participation harness is not feature-gated');
}
const adapterSource = read('src-tauri/src/plugin_child_webview_adapter.rs');
if (
  !/#\[cfg\(feature = "config-lens-cold-open-harness"\)\]\s*const PLUGIN_CHILD_WEBVIEW_EVIDENCE_BOOTSTRAP/u.test(
    adapterSource,
  ) ||
  !adapterSource.includes('__LENSX_PLUGIN_EVIDENCE_RESET_MOVE_DELIVERY__')
) {
  fail('Child move-delivery diagnostic is missing or escaped its harness-only bootstrap');
}
const nativeHarness = read('src-tauri/src/config_lens_cold_open_harness.rs');
const genericChildStart = nativeHarness.indexOf('fn run_generic_child_pointer_case(');
const genericChildEnd = nativeHarness.indexOf('fn run_preproduction_pointer_cases(', genericChildStart);
const genericChildSource = nativeHarness.slice(genericChildStart, genericChildEnd);
if (
  genericChildStart < 0 ||
  genericChildEnd < 0 ||
  !genericChildSource.includes('WindowBuilder::new(app, POINTER_CASE_B_HOST_LABEL)') ||
  genericChildSource.includes('WebviewWindowBuilder::new') ||
  !genericChildSource.includes('.add_child(')
) {
  fail('Case B is not a pure native window with exactly one Child WKWebView');
}

for (const path of ['src', 'src-tauri/src', 'plugins/config-lens/src', 'packages/plugin-sdk/src']) {
  if (!existsSync(join(root, path))) fail(`missing boundary root ${path}`);
}
const changeTasksPath = [
  'openspec/changes/stabilize-plugin-child-webview-pointer-cursor/tasks.md',
  'openspec/changes/archive/2026-08-18-stabilize-plugin-child-webview-pointer-cursor/tasks.md',
].find((path) => existsSync(join(root, path)));
if (!changeTasksPath) fail('active or archived diagnostic task record is missing');
const taskSource = read(changeTasksPath);
for (const marker of [
  'shared_wkwebview_webkit',
  '没有安全 repo-local 产品修复',
  'GitHub Issue [#1]',
  '`--skip-specs`',
]) {
  if (!taskSource.includes(marker)) fail(`diagnostic closure drifted: missing ${marker}`);
}

const currentEvidence = JSON.parse(read('fixtures/plugin-pointer-cursor/evidence/macos.json')) as {
  readonly evidence_version?: unknown;
  readonly attribution?: unknown;
};
if (currentEvidence.evidence_version !== '0.7.0' || currentEvidence.attribution !== 'shared_wkwebview_webkit') {
  fail('the current shared WKWebView/WebKit attribution is missing or stale');
}

for (const path of [
  'plugins/config-lens/src/editor/MonacoSurface.tsx',
  'plugins/config-lens/src/styles.less',
  'src/app/plugins/runtime/PluginRuntimeSlot.tsx',
  'src-tauri/src/plugin_child_webview_presentation.rs',
  'src-tauri/src/plugin_child_webview_service.rs',
  'src-tauri/src/plugin_child_webview_slot.rs',
]) {
  const source = read(path);
  if (/\bNSCursor\b|\bset_cursor(?:_icon)?\b|\bcursorRect\b|\bstyle\.cursor\b|\bcursor\s*:/u.test(source)) {
    fail(`${path} gained a compensating cursor patch without an approved public fix`);
  }
}

for (const path of [
  'src-tauri/src/plugin_child_webview_adapter.rs',
  'src-tauri/src/plugin_child_webview_presentation.rs',
  'src-tauri/src/plugin_child_webview_service.rs',
  'src-tauri/src/plugin_child_webview_slot.rs',
  'src/app/plugins/runtime/PluginRuntimeSlot.tsx',
]) {
  const source = read(path);
  if (/dev\.lensx\.config-lens|publisher.*cursor|cursor.*publisher/iu.test(source)) {
    fail(`${path} contains a ConfigLens identity or Publisher cursor special case`);
  }
  if (/\bWKPrivate\b|\bWebKitPrivate\b|\biframe\b|["']_[a-z0-9_]*cursor|sel!\(_[^)]*cursor/iu.test(source)) {
    fail(`${path} contains a private WebKit cursor API or retained iframe cursor path`);
  }
}

console.log('Checked cursor evidence contract, production baselines, and harness-only diagnostic boundary.');
