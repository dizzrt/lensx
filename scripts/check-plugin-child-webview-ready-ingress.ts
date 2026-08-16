import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const service = read('src-tauri/src/plugin_child_webview_service.rs');
const vendoredBuilder = read('vendor/frame-aware-navigation/tauri/src/webview/mod.rs');
const drift = read('scripts/frame-aware-navigation-dependency-drift.ts');

for (const marker of ['Fn(String, http::Request<String>)', 'handler(webview.label, request)']) {
  if (!vendoredBuilder.includes(marker)) failures.push(`vendored isolated IPC source binding is missing ${marker}.`);
}
for (const marker of [
  'PluginChildWebviewBridgeIngress',
  'actual_source_label',
  'plugin_child_webview_bridge_bootstrap(freshness)',
  'ingress.receive(&attempt_id, &actual_source_label, request.body())',
]) {
  if (!adapter.includes(marker)) failures.push(`native bridge ingress adapter is missing ${marker}.`);
}
for (const marker of [
  'page_id: String',
  'freshness: String',
  'derive_bridge_freshness',
  'accept_ready_ingress',
  'current.attempt == attempt && current.source_label == actual_source_label',
  'current.bridge_ready',
  'ready_ingress_is_current_identity_bound_single_use_and_rejection_has_zero_side_effects',
]) {
  if (!service.includes(marker)) failures.push(`current ready ingress binding is missing ${marker}.`);
}
if (!drift.includes("'tauri/src/webview/mod.rs'")) {
  failures.push('reviewed vendored isolated IPC edit is absent from the dependency drift manifest.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Actual-source, current-identity and single-use ready ingress boundary passed.');
