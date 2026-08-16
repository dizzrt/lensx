import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const expectations = JSON.parse(readFileSync(join(root, 'fixtures/plugin-package-format/expectations.json'), 'utf8'));
const legacy = expectations.find((item: { name?: string }) => item.name === 'legacy-iframe-runtime');
if (
  legacy?.category !== 'incompatible' ||
  legacy.expected?.status !== 'incompatible' ||
  !legacy.expected.diagnostics?.every((item: { code?: string }) => item.code === 'manifest_incompatible')
) {
  throw new Error('Legacy iframe package is not classified as stable incompatible.');
}
const installer = readFileSync(join(root, 'src-tauri/src/plugin_installer.rs'), 'utf8');
for (const evidence of [
  'legacy iframe package should fail before staging',
  'replacement_commit_rejects_a_legacy_iframe_payload_swap_before_registration',
  'legacy iframe swap must fail at commit revalidation',
]) {
  if (!installer.includes(evidence)) throw new Error(`Installer evidence omits ${evidence}`);
}
console.log('Checked WebView-only install/replacement preparation and commit boundaries.');
