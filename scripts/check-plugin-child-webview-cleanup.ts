import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Child WebView cleanup drift: ${message}`);
};
const section = (source: string, start: string, end: string): string => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) fail(`missing maintained section ${start}`);
  return source.slice(from, to);
};

const service = read('src-tauri/src/plugin_child_webview_service.rs');
const teardown = section(service, 'pub(crate) fn compare_current_teardown', 'pub(crate) fn snapshot');
for (const required of [
  'current.session.dispose()',
  'current.rpc.terminate(true)',
  'self.apply_rpc_effects(context, effects)',
  'self.revoke_current_resource_authority(attempt)',
  'handle.destroy()',
]) {
  if (!teardown.includes(required)) fail(`compare-current teardown omits ${required}`);
}
if (
  teardown.indexOf('current.rpc.terminate(true)') > teardown.indexOf('handle.destroy()') ||
  teardown.indexOf('self.revoke_current_resource_authority(attempt)') > teardown.indexOf('handle.destroy()')
) {
  fail('RPC or resource authority survives until after native destroy');
}
const deadline = section(service, 'pub(crate) fn expire_session_deadline', 'fn lock_state');
if (
  !deadline.includes('current.rpc.terminate(true)') ||
  !deadline.includes('self.apply_rpc_effects(context, effects)')
) {
  fail('Session deadline does not terminate the RPC endpoint');
}
if (!service.includes('delivery_failed') || !service.includes('self.disconnect_current(')) {
  fail('Host bridge delivery failure does not converge on terminal cleanup');
}

const sdk = read('packages/plugin-sdk/src/webview.ts');
for (const required of [
  'this.#bridgeUnsubscribe?.()',
  'pending.signal.removeEventListener',
  'this.#pending.clear()',
  'this.#eventListeners.clear()',
  "this.#terminate('disconnected', true)",
]) {
  if (!sdk.includes(required)) fail(`SDK endpoint cleanup omits ${required}`);
}

const host = read('src/app/plugins/runtime/child-webview-host-dispatcher.ts');
const disposeSession = section(host, 'const disposeSession', 'const createSession');
for (const required of ['operation.controller.abort()', 'session.detachEmitter()', 'session.binding.dispose()']) {
  if (!disposeSession.includes(required)) fail(`Host Session cleanup omits ${required}`);
}
const desktop = section(host, 'export const startPluginChildWebviewHostDispatcherDesktopAdapter', '};');
if (!desktop.includes('try {') || !desktop.includes('for (const detach of unlisten) detach()')) {
  fail('partial desktop listener startup cannot clean up already-installed listeners');
}

const rustTests = read('src-tauri/src/plugin_child_webview_service.rs');
const sdkTests = read('packages/plugin-sdk/tests/webview-transport.test.ts');
const hostTests = read('tests/plugin-child-webview-host-dispatcher.test.ts');
for (const evidence of [
  'teardown_terminates_both_rpc_endpoints_once_and_makes_late_callbacks_inert',
  'failed_bridge_delivery_disconnects_handlers_and_revokes_resource_authority_once',
]) {
  if (!rustTests.includes(evidence)) fail(`missing Rust cleanup evidence ${evidence}`);
}
if (!sdkTests.includes('disposes subscriptions and pending work once and makes every late callback inert')) {
  fail('missing SDK cleanup and late-callback evidence');
}
if (!hostTests.includes('fixture.controller.dispose();\n    fixture.controller.dispose();')) {
  fail('missing idempotent React Host adapter disposal evidence');
}

console.log('Checked idempotent Child WebView bridge, Session, SDK, listener, and timer cleanup boundaries.');
