import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const rpc = read('src-tauri/src/plugin_child_webview_rpc.rs');
const service = read('src-tauri/src/plugin_child_webview_service.rs');
const validation = read('src-tauri/src/plugin_host_api_validation.rs');
const bridge = read('src-tauri/src/plugin_child_webview_adapter.rs');
const legacyPolicy = read('src/app/plugins/runtime/rpc-validation.ts');

for (const marker of [
  'PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_BYTES: usize = 5_242_880',
  'PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_DEPTH: usize = 36',
  'PLUGIN_CHILD_WEBVIEW_RPC_MAX_SEMANTIC_DEPTH: usize = 32',
  'PLUGIN_CHILD_WEBVIEW_RPC_MAX_VISITED_NODES: usize = 16_384',
  'PLUGIN_CHILD_WEBVIEW_RPC_MAX_IN_FLIGHT: usize = 32',
  'PLUGIN_CHILD_WEBVIEW_RPC_HOST_DEADLINE_MS: u64 = 10_000',
  'request_high_water',
  'PluginChildWebviewRpcEffect::Cancel',
  'validate_host_api_result(&output, &pending.method)',
  'MAX_DIAGNOSTICS: usize = 64',
  'concurrent_requests_settle_out_of_order_and_exactly_once',
]) {
  if (!rpc.includes(marker)) failures.push(`native bridge RPC core is missing ${marker}.`);
}
for (const marker of [
  'accept_rpc_ingress',
  'settle_rpc_dispatch',
  'expire_rpc_deadlines',
  'current.attempt == attempt && current.source_label == actual_source_label',
  'PluginChildWebviewRpcDispatchFacts',
  'current_bridge_routes_rpc_with_trusted_facts_and_correlated_settlement',
]) {
  if (!service.includes(marker)) failures.push(`current source RPC wiring is missing ${marker}.`);
}
if (!validation.includes('include_str!("../../packages/plugin-contract/schema/host-api.schema.json")')) {
  failures.push('native RPC egress does not consume the canonical public Host API schema.');
}
if (!bridge.includes('new TextEncoder().encode(encoded).byteLength <= 5242880')) {
  failures.push('document bridge carrier does not preserve the maintained byte budget for Unicode frames.');
}
for (const marker of [
  'maxFrameBytes: 5_242_880',
  'maxSemanticDepth: 32',
  'maxFrameDepth: 36',
  'maxVisitedNodes: 16_384',
  'maxInFlightRequests: 32',
  'hostExecutionDeadlineMs: 10_000',
]) {
  if (!legacyPolicy.includes(marker)) failures.push(`existing RPC semantic policy drifted at ${marker}.`);
}
for (const forbidden of ['MessagePort', 'contentWindow', 'postMessage(', 'window.parent']) {
  if (rpc.includes(forbidden) || service.includes(forbidden) || validation.includes(forbidden)) {
    failures.push(`native bridge RPC path retained legacy carrier authority ${forbidden}.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Current-source Child WebView RPC policy, settlement, semantic validation and diagnostics passed.');
