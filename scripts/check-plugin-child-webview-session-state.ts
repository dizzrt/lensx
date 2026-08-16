import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const service = read('src-tauri/src/plugin_child_webview_service.rs');

for (const marker of [
  'PluginChildWebviewLifecycleIngress',
  'apply_plugin_child_webview_load_ingress',
  'payload.event() == PageLoadEvent::Finished',
  'ingress.native_loaded(&attempt_id, webview.label())',
]) {
  if (!adapter.includes(marker)) failures.push(`native load ingress is missing ${marker}.`);
}
for (const state of ['Creating', 'Loading', 'Loaded', 'BridgeReady', 'SdkReady', 'Disconnected', 'Disposed']) {
  if (!service.includes(state)) failures.push(`native Session state machine is missing ${state}.`);
}
for (const marker of [
  'PLUGIN_CHILD_WEBVIEW_LOAD_DEADLINE_MS: u64 = 10_000',
  'PLUGIN_CHILD_WEBVIEW_READY_DEADLINE_MS: u64 = 5_000',
  'method != "runtime.get_context"',
  'runtime_load_timeout',
  'runtime_handshake_timeout',
  'runtime_session_disconnected',
  'native_loaded_bridge_ready_context_ready_disconnect_and_dispose_are_distinct',
  'ten_second_load_and_five_second_ready_deadlines_map_to_stable_errors',
]) {
  if (!service.includes(marker)) failures.push(`native Session contract is missing ${marker}.`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Native loaded, bridge ready, SDK ready, disconnect and dispose Session states passed.');
