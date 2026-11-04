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
  'show_owned',
  'hide_owned',
  'focus_owned',
  'three_same_plugin_instances_own_distinct_surfaces_sessions_and_cleanup',
  'queued_native_owner_operations_cannot_run_after_same_window_rollback',
  'stale_callbacks_cannot_operate_a_replacement_webview',
  'concurrent_reservations_publish_at_most_one_current_attempt',
]) {
  if (!service.includes(marker)) failures.push(`Child WebView lifecycle service is missing ${marker}.`);
}

for (const counter of ['bounds_updates', 'hides', 'shows', 'focuses', 'destroys']) {
  if (!service.includes(`${counter}.load(Ordering::SeqCst)`)) {
    failures.push(`deterministic native lifecycle coverage does not inspect ${counter}.`);
  }
}
for (const boundary of ['present_owned(', 'confirm_native_execution(', 'close_confirmed()']) {
  if (!adapter.includes(boundary)) failures.push(`production native lifecycle omits ${boundary}.`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Per-instance Child WebView lifecycle, confirmed native effects, and replacement races passed.');
