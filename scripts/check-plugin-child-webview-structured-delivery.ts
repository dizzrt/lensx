import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const service = read('src-tauri/src/plugin_child_webview_service.rs');
const rpc = read('src-tauri/src/plugin_child_webview_rpc.rs');
const manifest = read('src-tauri/Cargo.toml');
const start = adapter.indexOf('fn deliver_structured_plugin_child_webview_frame<R: Runtime>(');
const end = adapter.indexOf('#[cfg(not(target_os = "macos"))]', start);
if (start === -1 || end === -1) throw new Error('structured Child WebView delivery implementation is unavailable.');
const delivery = adapter.slice(start, end);

for (const marker of [
  'NSJSONSerialization::JSONObjectWithData_options_error',
  'NSDictionary::<NSString, AnyObject>::from_slices',
  'callAsyncJavaScript_arguments_inFrame_inContentWorld_completionHandler',
  'WKContentWorld::pageWorld',
  'globalThis.__LENSX_PLUGIN_WEBVIEW_DELIVER__(frame)',
]) {
  if (!delivery.includes(marker)) failures.push(`structured native delivery is missing ${marker}.`);
}
for (const forbidden of ['format!(', 'push_str(', '.eval(', 'evaluateJavaScript_completionHandler']) {
  if (delivery.includes(forbidden)) failures.push(`structured delivery reintroduced source assembly via ${forbidden}.`);
}
if (!manifest.includes('objc2-web-kit = { version = "=0.3.2"')) {
  failures.push('the reviewed WKWebView structured-call binding is not pinned.');
}
for (const marker of [
  'handle.deliver_bridge_frame(&frame)',
  'late_old_response_and_event_never_cross_into_replacement_handle',
]) {
  if (!service.includes(marker)) failures.push(`current-handle delivery binding is missing ${marker}.`);
}
for (const marker of [
  'unicode_html_and_script_shaped_results_remain_structured_data',
  'PLUGIN_CHILD_WEBVIEW_RPC_MAX_FRAME_BYTES',
  'PluginChildWebviewRpcIngressResult::Ignored',
]) {
  if (!rpc.includes(marker)) failures.push(`structured delivery corpus is missing ${marker}.`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Structured WKWebView response/event delivery and hostile-data corpus passed.');
