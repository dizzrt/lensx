import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const rust = read('src-tauri/src/plugin_child_webview_slot.rs');
const service = read('src-tauri/src/plugin_child_webview_service.rs');
const frontend = read('src/app/plugins/runtime/pluginChildWebviewSlot.ts');
const library = read('src-tauri/src/lib.rs');

for (const marker of [
  'window_label: String',
  'surface_mode: LauncherSurfaceMode',
  'scale_factor: f64',
  'physical_bounds: PluginChildWebviewPhysicalBounds',
  'presentation_revision: String',
  'value.is_finite()',
  'bounds.x + bounds.width',
  'PluginChildWebviewSlotUpdateResult::StaleAttempt',
  'PluginChildWebviewSlotUpdateResult::StaleRevision',
]) {
  if (!rust.includes(marker)) failures.push(`Rust slot boundary is missing ${marker}.`);
}
for (const marker of [
  'presentation_revision: u64',
  'presentation_revision <= current.presentation_revision',
  '.update_bounds(bounds.x, bounds.y, bounds.width, bounds.height)',
]) {
  if (!service.includes(marker)) failures.push(`Child WebView registry is missing ${marker}.`);
}
for (const marker of [
  'physicalBoundsFromDomRect',
  'Math.floor(rect.left * scaleFactor)',
  'Math.ceil(rect.right * scaleFactor)',
  "window_label: 'main'",
  "surface_mode: 'page'",
]) {
  if (!frontend.includes(marker)) failures.push(`React-to-Rust slot adapter is missing ${marker}.`);
}
if (!library.includes('plugin_child_webview_slot::update_plugin_child_webview_slot')) {
  failures.push('slot update command is not composed at the application boundary.');
}
if (frontend.includes('@lensx/plugin-sdk') || frontend.includes('plugin message')) {
  failures.push('slot geometry became plugin-controlled.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Revisioned Host-owned React-to-Rust Child WebView slot contract passed.');
