import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');
const failures: string[] = [];
const requireMarkers = (relative: string, markers: readonly string[]): void => {
  const source = read(relative);
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${relative}: missing ${marker}`);
};

requireMarkers('src-tauri/src/plugin_installer.rs', [
  'replacement_commit_rejects_a_legacy_iframe_payload_swap_before_registration',
  'legacy iframe package should fail before staging',
  'uninstall_retain_data_is_idempotent_and_reinstall_commits_only_a_fresh_webview_registration',
  'RuntimeKind::Webview',
]);
requireMarkers('tests/plugin-replacement-service.test.ts', [
  'never reuses old Session authority across a rejected protocol replacement',
  'destroy:webview-attempt-old',
  'reject:incompatible-protocol',
  'webview-attempt-recovered',
]);
requireMarkers('tests/plugin-runtime-resolver.test.ts', [
  'legacy or protocol-incompatible entry before execution',
  'expect(resolveEntry).not.toHaveBeenCalled()',
]);
requireMarkers('tests/plugin-lifecycle-service.test.ts', [
  'uninstall quiesces, preserves explicit data policy, and converges after event loss',
  'quiesceProvider',
]);

if (failures.length > 0) {
  failures.forEach((failure) => {
    console.error(failure);
  });
  process.exit(1);
}
console.log('Checked WebView-only installation, replacement authority, uninstall, and safe reinstall coverage.');
