import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { findGate } from './validation/catalog.ts';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const requireMarkers = (path: string, markers: readonly string[]) => {
  const source = read(path);
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${path}: missing ${marker}`);
};
const rejectMarkers = (path: string, markers: readonly string[]) => {
  const source = read(path);
  for (const marker of markers) if (source.includes(marker)) failures.push(`${path}: forbidden ${marker}`);
};
const files = (directory: string): string[] =>
  readdirSync(join(root, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(
      (path) =>
        /\.(?:json|md|mjs|ts|tsx|ya?ml)$/u.test(path) && !path.includes('/dist/') && !path.includes('/node_modules/'),
    );

requireMarkers('package.json', [
  '"dev": "rsbuild"',
  '"app:dev": "node scripts/development-launcher.mjs"',
  '"dev:plugin-development-mode": "node scripts/dev-plugin-development-mode.mjs"',
]);
requireMarkers('scripts/development-launcher.mjs', [
  'createRsbuild',
  'createDevServer',
  'await server.listen()',
  'beforeDevCommand: null',
  `http://\${DEVELOPMENT_APP_HOST}:\${port}/`,
  "Object.freeze(['SIGINT', 'SIGTERM'])",
]);
rejectMarkers('scripts/development-launcher.mjs', ['listen(0)', 'mkdtemp', 'writeFile', 'LENSX_DEVELOPMENT_PORT']);
requireMarkers('src-tauri/src/trusted_app_target.rs', [
  'http://localhost:{port}/',
  'raw != canonical',
  'tauri://localhost/',
]);
requireMarkers('src-tauri/src/plugin_runtime_security_policy.rs', [
  'current_plugin_runtime_document_csp',
  'PRODUCTION_FRAME_ANCESTOR',
  'app_target.csp_ancestor()',
]);
rejectMarkers('src-tauri/src/plugin_runtime_security_policy.rs', [
  'PLUGIN_RUNTIME_TAURI_DEV_DOCUMENT_CSP',
  'frame-ancestors http://localhost:40755',
]);

for (const path of [
  'README.md',
  'README-zh.md',
  'docs/en/development/getting-started.md',
  'docs/zh/development/getting-started.md',
]) {
  requireMarkers(path, ['pnpm run app:dev', 'pnpm run dev']);
  rejectMarkers(path, ['pnpm exec tauri dev']);
}
for (const path of [
  'docs/en/development/validation.md',
  'docs/zh/development/validation.md',
  'docs/en/development/plugin-development-mode.md',
  'docs/zh/development/plugin-development-mode.md',
  'docs/en/architecture/extension-platform.md',
  'docs/zh/architecture/extension-platform.md',
]) {
  requireMarkers(path, ['development-launcher']);
}

const gate = findGate('development-launcher');
if (gate === undefined) failures.push('validation registry: development-launcher Gate is missing');
else {
  for (const dependency of [
    'frame-aware-webview-navigation-policy',
    'plugin-development-mode',
    'plugin-child-webview-runtime',
  ]) {
    if (!gate.dependsOn.includes(dependency)) failures.push(`development-launcher Gate: missing ${dependency}`);
  }
}

const privateMarkers = [
  'development-launcher.mjs',
  'DEVELOPMENT_APP_PREFERRED_PORT',
  'LENSX_PLUGIN_DEVELOPMENT_STARTUP_ROOT',
  'beforeDevCommand',
];
for (const directory of ['packages', 'plugins', 'src/app/plugins/runtime', '.github']) {
  for (const path of files(directory)) {
    const source = readFileSync(path, 'utf8');
    for (const marker of privateMarkers) {
      if (source.includes(marker)) failures.push(`${path}: leaked Host-private marker ${marker}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[development-launcher-check] ${failure}`);
  process.exit(1);
}
console.log('Unified development launcher source, policy, Gate, and bilingual documentation markers passed.');
