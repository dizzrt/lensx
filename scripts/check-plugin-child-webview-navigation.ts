import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const service = read('src-tauri/src/plugin_child_webview_service.rs');

for (const marker of [
  'PluginChildWebviewNavigationPolicy',
  'parse_plugin_resource_url(exact_entry.as_str(), false)',
  'candidate == &self.exact_entry || candidate == &self.routed_entry',
  'current_source.is_current_source(&policy.attempt_id, &policy.source_label)',
  '.on_new_window(|_url, _features| NewWindowResponse::Deny)',
  '.on_download(|_webview, event|',
]) {
  if (!adapter.includes(marker)) failures.push(`Child WebView navigation boundary is missing ${marker}.`);
}
if (!adapter.includes('DownloadEvent::Requested { .. } | DownloadEvent::Finished { .. }')) {
  failures.push('Child WebView download boundary does not deny every download phase.');
}
for (const marker of [
  'source_label: String',
  'if !valid_source_label(&source_label)',
  'source_label != current.source_label',
  'current.attempt.opaque_id() == attempt_id && current.source_label == source_label',
]) {
  if (!service.includes(marker)) failures.push(`current source registry binding is missing ${marker}.`);
}
if (adapter.includes('eprintln!') || adapter.includes('println!("navigation')) {
  failures.push('navigation denial must not log a full target URL or Host-private binding.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Child WebView current top-level navigation, popup, new-window and download boundary passed.');
