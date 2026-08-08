import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const failures: string[] = [];
const requireMarkers = (path: string, markers: readonly string[]) => {
  const source = read(path);
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${path}: missing ${marker}`);
};

for (const path of ['docs/en/development/plugin-development-mode.md', 'docs/zh/development/plugin-development-mode.md'])
  requireMarkers(path, [
    'pnpm run dev:plugin-development-mode',
    'development-mode-smoke',
    'build:plugin-development-smoke:reload',
    'dist/',
    'cleanup_pending',
    'check:plugin-development-mode',
  ]);

requireMarkers('docs/en/development/plugin-development-mode.md', ['focus-loss hiding']);
requireMarkers('docs/zh/development/plugin-development-mode.md', ['失焦隐藏']);
for (const path of ['docs/en/development/validation.md', 'docs/zh/development/validation.md'])
  requireMarkers(path, [
    'refresh:plugin-development-runtime-evidence:normal',
    'refresh:plugin-development-runtime-evidence:malicious',
    'check:plugin-development-runtime-evidence',
  ]);

requireMarkers('examples/plugins/development-mode-smoke/package.json', [
  '@lensx/example-plugin-development-mode-smoke',
  'build:reload',
  '@lensx/plugin-sdk',
]);
requireMarkers('examples/plugins/development-mode-smoke/manifests/initial.json', [
  'dev.lensx.smoke.development-mode',
  '"version": "0.1.0"',
  '"manifest_version": "0.2.0"',
]);
requireMarkers('examples/plugins/development-mode-smoke/manifests/reload.json', [
  'dev.lensx.smoke.development-mode',
  '"version": "0.2.0"',
  '"manifest_version": "0.2.0"',
]);
requireMarkers('examples/plugins/development-mode-smoke/src/main.ts', [
  '@lensx/plugin-sdk/iframe',
  '__LENSX_PLUGIN_DEVELOPMENT_SMOKE_PHASE__',
  "context.capabilities.join(', ')",
]);

requireMarkers('docs/en/architecture/extension-platform.md', [
  'Shipped Host-Private Plugin Development Mode',
  'sha256-development-tree-v1',
  'source=development',
]);
requireMarkers('docs/zh/architecture/extension-platform.md', [
  '已交付的 Host 私有插件开发模式',
  'sha256-development-tree-v1',
  'source=development',
]);
requireMarkers('docs/en/development/plugin-developer-cli.md', ['not a CLI command', 'payload semantics', 'CLI-only']);
requireMarkers('docs/zh/development/plugin-developer-cli.md', ['不是 CLI command', 'payload 语义', 'CLI-only']);
requireMarkers('src/app/pages/PluginManagementSettings.tsx', [
  'settings.plugins.development.title',
  'plugin-development-reload',
  'plugin-development-remove',
]);
requireMarkers('scripts/verify-plugin-management-visual.mjs', [
  'development-healthy',
  'development-pending',
  'development-error',
  '650',
  '600',
]);
requireMarkers('package.json', [
  'build:plugin-development-smoke:initial',
  'build:plugin-development-smoke:reload',
  'validate:plugin-development-smoke',
  'check:plugin-development-mode',
  'check:plugin-development-mode-boundaries',
  'check:plugin-development-directory-corpus',
  'check:plugin-development-runtime-evidence',
  'run:plugin-development-runtime-harness',
]);

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('Plugin Development Mode docs, UI, visual, and focused-gate markers passed.');
