import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const service = read('src-tauri/src/plugin_child_webview_service.rs');
const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const library = read('src-tauri/src/lib.rs');

for (const marker of [
  'struct PluginChildWebviewAttempt',
  'struct PluginChildWebviewIdentity',
  'struct PluginChildWebviewBounds',
  'enum PluginChildWebviewState',
  'struct CurrentEntry<H>',
  'instances: BTreeMap<PluginChildWebviewAttempt, CurrentEntry<H>>',
  'surfaces: BTreeMap<String, PluginChildWebviewAttempt>',
  'reserved_surfaces: BTreeMap<String, PluginChildWebviewAttempt>',
  'used_sources: BTreeSet<String>',
  'reserve_current(',
  'attach_current(',
  'apply_slot_update(',
  'apply_owned_slot_update(',
  'snapshot_attempt(',
  'teardown_all(',
  'compare_current_teardown(',
  'setup_plugin_child_webview_service',
]) {
  if (!service.includes(marker)) failures.push(`Child WebView service is missing ${marker}.`);
}
for (const marker of ['PluginChildWebviewNativeHandle', 'PluginChildWebviewHandle', 'close_confirmed()']) {
  if (!adapter.includes(marker)) failures.push(`private native adapter is missing ${marker}.`);
}
if (!library.includes('plugin_child_webview_service::setup_plugin_child_webview_service')) {
  failures.push('application composition does not own the Child WebView service generation.');
}
if (service.includes('#[tauri::command]') || service.includes('Serialize')) {
  failures.push('Host-private Child WebView registry leaked a command or wire projection.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Host-private per-surface Child WebView registry and exact-instance cleanup boundaries passed.');
