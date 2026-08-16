import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const service = read('src-tauri/src/plugin_child_webview_service.rs');

for (const marker of [
  'fn update_bounds(&self',
  'fn show(&self)',
  'fn hide(&self)',
  'fn focus(&self)',
  'fn destroy(&self)',
]) {
  if (!adapter.includes(marker)) failures.push(`native Child WebView handle is missing ${marker}.`);
}
for (const marker of [
  'show_current',
  'hide_current',
  'focus_current',
  'compare_current_teardown',
  'stale_callbacks_cannot_operate_a_replacement_webview',
  'concurrent_reservations_publish_at_most_one_current_attempt',
]) {
  if (!service.includes(marker)) failures.push(`Child WebView lifecycle service is missing ${marker}.`);
}

for (const fact of ['created', 'bounds', 'hidden', 'shown', 'focused', 'destroyed']) {
  if (!adapter.includes(`${fact}: true`)) {
    failures.push(`native lifecycle spike does not assert ${fact}.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Single-current Child WebView lifecycle and replacement-race boundary passed.');
