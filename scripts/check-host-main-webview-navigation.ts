import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const policy = read('src-tauri/src/frame_aware_navigation_policy.rs');
const setup = read('src-tauri/src/frame_aware_navigation_setup.rs');
const development = read('src-tauri/src/plugin_development.rs');
const lib = read('src-tauri/src/lib.rs');
const tauriManager = read('vendor/frame-aware-navigation/tauri/src/manager/webview.rs');
const wkwebview = read('vendor/frame-aware-navigation/wry/src/wkwebview/mod.rs');

for (const marker of [
  'ActivePluginTargetLease',
  'ActivePluginDocument',
  'activate_plugin_target',
  'dispose_plugin_target',
  'revoke_plugin_target',
  'normalize_plugin_document',
  'MissingActiveTarget',
  'StateUnavailable',
]) {
  if (policy.includes(marker)) failures.push(`Host navigation policy still contains ${marker}.`);
}

if (!policy.includes('pub(crate) enum NavigationAllow {\n    MainApp,\n}')) {
  failures.push('Host navigation allowlist is not limited to MainApp.');
}
if (!policy.includes('NavigationFrame::Descendant => deny(')) {
  failures.push('Host descendant navigation does not fail closed.');
}
if (!policy.includes('Some(target) if target == self.app_target')) {
  failures.push('Host main navigation is not exact-match bound to the trusted App document.');
}

for (const source of [lib, development]) {
  for (const marker of [
    'plugin_runtime_navigation',
    'activate_plugin_runtime_navigation',
    'dispose_plugin_runtime_navigation',
    'revoke_runtime_navigation',
  ]) {
    if (source.includes(marker)) failures.push(`production Rust still contains ${marker}.`);
  }
}
if (existsSync(join(root, 'src-tauri/src/plugin_runtime_navigation.rs'))) {
  failures.push('legacy plugin Runtime navigation command module still exists.');
}

for (const marker of ['fn main_frame_script', 'for_main_frame_only: true']) {
  if (!tauriManager.includes(marker)) failures.push(`Tauri bootstrap is missing ${marker}.`);
}
if (!wkwebview.includes('WKUserScript::initWithSource_injectionTime_forMainFrameOnly')) {
  failures.push('Wry does not preserve the native main-frame-only user-script boundary.');
}
if (!setup.includes('setup_frame_aware_navigation_policy')) {
  failures.push('Host main WebView navigation policy is not installed.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Host main WebView navigation and main-frame-only Tauri bootstrap boundary passed.');
