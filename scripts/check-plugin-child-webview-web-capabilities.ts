import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const service = read('src-tauri/src/plugin_child_webview_service.rs');
const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const harness = read('src-tauri/examples/plugin_child_webview_web_capability_harness.rs');
const evidence = JSON.parse(read('fixtures/plugin-child-webview-web-capabilities/evidence/macos.json')) as Record<
  string,
  unknown
>;

for (const marker of [
  'derive_data_store_identifier(',
  'lensx-plugin-child-webview-data-store-v1',
  'identity.resource_generation.to_le_bytes()',
  'identifier[6] = (identifier[6] & 0x0f) | 0x40',
  'identifier[8] = (identifier[8] & 0x3f) | 0x80',
]) {
  if (!service.includes(marker)) failures.push(`private data-store derivation is missing ${marker}.`);
}
for (const marker of ['.data_store_identifier(data_store_identifier)', '.isolated_uri_scheme_protocols(']) {
  if (!adapter.includes(marker)) failures.push(`native WebView adapter is missing ${marker}.`);
}
for (const marker of [
  'script type="module"',
  'new Worker(',
  "fetch('./network.json')",
  'WebAssembly.instantiate(',
  'window.parent === window && window.opener === null',
  "localStorage.getItem('lensx-isolation-probe')",
  "indexedDB.open('lensx-isolation-probe', 1)",
  'generation-a.runtime.localhost',
  'generation-b.runtime.localhost',
]) {
  if (!harness.includes(marker)) failures.push(`real Web capability harness is missing ${marker}.`);
}
const expected = {
  created: true,
  distinct_origins: true,
  distinct_data_store_identifiers: true,
  first_generation: {
    phase: 'first',
    module_loaded: true,
    dedicated_worker_loaded: true,
    fetch_loaded: true,
    wasm_loaded: true,
    host_dom_unreachable: true,
    exact_origin: true,
    local_storage_isolated: true,
    indexed_db_isolated: true,
    destroyed: true,
    late_callback_inert: true,
  },
  second_generation: {
    phase: 'second',
    module_loaded: true,
    dedicated_worker_loaded: true,
    fetch_loaded: true,
    wasm_loaded: true,
    host_dom_unreachable: true,
    exact_origin: true,
    local_storage_isolated: true,
    indexed_db_isolated: true,
    destroyed: true,
    late_callback_inert: true,
  },
  cross_plugin_storage_denied: true,
  old_generation_storage_denied: true,
  replacement_fresh: true,
};
if (JSON.stringify(evidence) !== JSON.stringify(expected)) {
  failures.push('committed macOS module, Worker, origin, and storage evidence is incomplete.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Per-generation origin/data-store and real Web capability evidence passed.');
