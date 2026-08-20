import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const adapterPath = 'src-tauri/src/plugin_child_webview_adapter.rs';
const coldOpenHarnessPath = 'src-tauri/src/config_lens_cold_open_harness.rs';
const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
const lib = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
const adapter = readFileSync(join(root, adapterPath), 'utf8');
const failures: string[] = [];

if (!cargo.includes('tauri = { version = "2", features = ["macos-private-api", "unstable"] }')) {
  failures.push('src-tauri/Cargo.toml: Tauri unstable multiwebview feature is not enabled.');
}
if (
  !cargo.includes('config-lens-cold-open-harness = ["plugin-development-mode", "dep:core-graphics"]') ||
  !cargo.includes('required-features = ["config-lens-cold-open-harness"]') ||
  !/#\[cfg\(feature = "config-lens-cold-open-harness"\)\]\s*#\[doc\(hidden\)\]\s*pub mod config_lens_cold_open_harness;/u.test(
    lib,
  )
) {
  failures.push(`${coldOpenHarnessPath}: native evidence harness is not feature-gated and hidden.`);
}
for (const marker of [
  'WebviewBuilder',
  '.add_child(',
  '.set_bounds(',
  '.hide()',
  '.show()',
  '.set_focus()',
  '.close()',
]) {
  if (!adapter.includes(marker)) failures.push(`${adapterPath}: missing ${marker}.`);
}

const rustFiles: string[] = [];
const visit = (directory: string): void => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.name.endsWith('.rs')) rustFiles.push(path);
  }
};
visit(join(root, 'src-tauri/src'));
for (const file of rustFiles) {
  const path = relative(root, file).split('\\').join('/');
  if (path === adapterPath || path === coldOpenHarnessPath) continue;
  const source = readFileSync(file, 'utf8');
  for (const marker of ['WebviewBuilder', '.add_child(']) {
    if (source.includes(marker)) failures.push(`${path}: Child WebView Tauri API escaped the private adapter.`);
  }
}

const example = readFileSync(join(root, 'src-tauri/examples/plugin_child_webview_spike.rs'), 'utf8');
for (const marker of ['create_plugin_child_webview_spike', 'spike.validate(', 'app_handle.exit(0)']) {
  if (!example.includes(marker)) failures.push(`Child WebView spike example is missing ${marker}.`);
}
if (example.includes('WebviewBuilder') || example.includes('.add_child(')) {
  failures.push('Child WebView spike example bypasses the private adapter.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Child WebView unstable feature, private adapter boundary, and spike harness passed.');
