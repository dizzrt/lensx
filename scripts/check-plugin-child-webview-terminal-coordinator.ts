import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Child WebView terminal coordinator drift: ${message}`);
};

const lifecycle = read('src/app/plugins/runtime/lifecycle-controller.ts');
const terminalStart = lifecycle.indexOf('const terminate = (reason: PluginRuntimeTerminalReason)');
const terminalEnd = lifecycle.indexOf('\n      const attempt:', terminalStart);
const terminal = lifecycle.slice(terminalStart, terminalEnd);
for (const required of [
  'cancelHealthy?.()',
  'cancellables.splice(0)',
  'subscriptions.splice(0)',
  'await presentation()',
]) {
  if (!terminal.includes(required)) fail(`terminal operation omits ${required}`);
}
if (!lifecycle.includes("await terminate('failure')")) fail('failure does not converge on the terminal operation');

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
for (const trigger of [
  "terminate('navigation')",
  "fail('runtime_unavailable')",
  'attempt.fail(readiness.failureCode)',
  'subscribeInvalidation',
]) {
  if (!slot.includes(trigger)) fail(`React coordinator omits ${trigger}`);
}

const app = read('src/App.tsx');
for (const trigger of ["terminateCurrent('host_reload')", "terminateCurrent('app_teardown')"]) {
  if (!app.includes(trigger)) fail(`App coordinator omits ${trigger}`);
}

const rustService = read('src-tauri/src/plugin_child_webview_service.rs');
const teardownStart = rustService.indexOf('pub(crate) fn compare_current_teardown');
const teardownEnd = rustService.indexOf('pub(crate) fn snapshot', teardownStart);
const teardown = rustService.slice(teardownStart, teardownEnd);
for (const required of [
  'current.session.dispose()',
  'current.rpc.terminate(true)',
  'revoke_current_resource_authority(attempt)',
  'handle.destroy()',
  'state.current = None',
]) {
  if (!teardown.includes(required)) fail(`Rust compare-current teardown omits ${required}`);
}

const lib = read('src-tauri/src/lib.rs');
if (
  !lib.includes('matches!(event, tauri::RunEvent::Exit)') ||
  !lib.includes('compare_current_teardown(snapshot.attempt)')
) {
  fail('process exit does not synchronously terminate the current native Runtime');
}

const tests = read('tests/plugin-runtime-slot.test.tsx');
for (const evidence of [
  'converges disable, replacement, upgrade, and development invalidation on terminal teardown',
  'explicit retry terminates the failed attempt and creates one fresh presentation',
]) {
  if (!tests.includes(evidence)) fail(`terminal trigger evidence omits ${evidence}`);
}

console.log(
  'Checked one terminal coordinator across navigation, invalidation, failure, retry, reload, teardown, and process exit.',
);
