import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const expected = {
  'monaco-editor': ['0.56.0', 'MIT'],
  saxes: ['6.0.0', 'ISC'],
  'toml-eslint-parser': ['1.0.3', 'MIT'],
  yaml: ['2.9.0', 'ISC'],
};
for (const [name, [version, license]] of Object.entries(expected)) {
  if (metadata.dependencies[name] !== version) throw new Error(`dependency/version: ${name} must be ${version}.`);
  const installed = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8'));
  if (installed.version !== version || installed.license !== license) {
    throw new Error(`dependency/metadata: ${name} version or license drifted.`);
  }
}
for (const [name, version] of Object.entries({ ...metadata.dependencies, ...metadata.devDependencies })) {
  if (/^(?:workspace:|file:|link:)|(?:^|\/)\.\.(?:\/|$)|^\//u.test(version)) {
    throw new Error(`boundary/dependency-protocol: ${name} must use ordinary SemVer.`);
  }
}

const sourceFiles = [];
const visit = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) sourceFiles.push(path);
  }
};
await visit(resolve(root, 'src'));
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  if (
    /@tauri-apps\/|src\/app\/|src-tauri\/|tools\/plugin-package-format|plugins\/(?!config-lens(?:\/|$))/u.test(source)
  ) {
    throw new Error(`boundary/private-import: ${file.slice(root.length + 1)}`);
  }
  if (/\b(?:localStorage|sessionStorage|indexedDB)\b|navigator\.clipboard/u.test(source)) {
    throw new Error(`privacy/persistence-or-clipboard: ${file.slice(root.length + 1)}`);
  }
  if (/\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/u.test(source)) {
    throw new Error(`privacy/network: ${file.slice(root.length + 1)}`);
  }
  if (/@lensx\/plugin-sdk\/iframe|createPluginIframeTransport/u.test(source)) {
    throw new Error(`runtime/legacy-iframe-transport: ${file.slice(root.length + 1)}`);
  }
  if (/__LENSX_PLUGIN_WEBVIEW_BRIDGE__|PluginChildWebview|PluginWebviewBridge/u.test(source)) {
    throw new Error(`runtime/private-native-bridge: ${file.slice(root.length + 1)}`);
  }
}
const appSource = await readFile(resolve(root, 'src/main.tsx'), 'utf8');
if (
  !appSource.includes("import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';") ||
  !appSource.includes('createPluginSdk({ transport: createPluginWebviewTransport() })')
) {
  throw new Error('runtime/public-webview-entry: bootstrap must create the public SDK WebView transport before UI.');
}
const controllerSource = await readFile(resolve(root, 'src/language/controller.ts'), 'utf8');
const workerSource = await readFile(resolve(root, 'src/language/language.worker.ts'), 'utf8');
const engineSource = await readFile(resolve(root, 'src/language/engine.ts'), 'utf8');
if (
  controllerSource.includes('./engine') ||
  !workerSource.includes('./engine') ||
  !engineSource.includes("import('./adapters/")
) {
  throw new Error('boundary/main-thread-language-engine: adapters must stay behind the package language Worker.');
}

console.log('ConfigLens dependency, boundary, privacy, and bundle checks passed.');
