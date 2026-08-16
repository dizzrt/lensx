import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Child WebView continuity drift: ${message}`);
};

const service = read('src-tauri/src/plugin_child_webview_service.rs');
for (const invariant of [
  'current: Option<CurrentEntry<H>>',
  'concurrent_reservations_publish_at_most_one_current_attempt',
  'each_attempt_and_resource_generation_gets_a_distinct_private_data_store',
  'stale_callbacks_cannot_operate_a_replacement_webview',
]) {
  if (!service.includes(invariant)) fail(`single-current/generation invariant omits ${invariant}`);
}

const navigationTests = read('tests/plugin-page-navigation-ui.test.tsx');
for (const evidence of [
  'keeps one current Runtime across shortcut activation refresh and replaces it only after a real close',
  'expect(reopenedSlot).not.toBe(slot)',
  'pluginChildWebviewPresentationController.create).toHaveBeenCalledTimes(2)',
]) {
  if (!navigationTests.includes(evidence)) fail(`close/reopen continuity evidence omits ${evidence}`);
}

const resolverTests = read('tests/plugin-runtime-resolver.test.ts');
if (!resolverTests.includes('invalidates retry, cross-Page, old generation, and same-version replacement')) {
  fail('generation and identity invalidation evidence is missing');
}

const slotTests = read('tests/plugin-runtime-slot.test.tsx');
for (const evidence of [
  'explicit retry terminates the failed attempt and creates one fresh presentation',
  'recomputes physical bounds and scale on the same current presentation',
]) {
  if (!slotTests.includes(evidence)) fail(`attempt continuity evidence omits ${evidence}`);
}

const shellTests = read('tests/app-shell-navigation.test.tsx');
if (!shellTests.includes('routes Host reload and root teardown through the Runtime terminal coordinator')) {
  fail('Host reload attempt termination evidence is missing');
}

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
if (slot.includes('preload') || slot.includes('runtimePool') || slot.includes('backgroundRuntime')) {
  fail('production slot introduces a preload, pool, or background Runtime path');
}

console.log(
  'Checked semantic continuity, fresh close/retry/generation attempts, and the single-current no-pool invariant.',
);
