import { readdir, readFile, stat } from 'node:fs/promises';
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
    /@tauri-apps\/|src\/app\/|src-tauri\/|tools\/plugin-package-format|plugins\/official\/(?!config-lens)/u.test(source)
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
const appSource = await readFile(resolve(root, 'src/App.tsx'), 'utf8');
if (
  !appSource.includes("import { createPluginWebviewTransport } from '@lensx/plugin-sdk/webview';") ||
  !appSource.includes('createTransport = createPluginWebviewTransport')
) {
  throw new Error('runtime/public-webview-entry: ConfigLens must use the public SDK WebView transport by default.');
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

const dist = resolve(root, 'dist');
try {
  const files = [];
  const collect = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await collect(path);
      else files.push(path);
    }
  };
  await collect(dist);
  const facts = await Promise.all(files.map(async (file) => ({ file, size: (await stat(file)).size })));
  if (facts.some(({ file }) => file.endsWith('.map')))
    throw new Error('bundle/sourcemap: production sourcemaps are forbidden.');
  const total = facts.reduce((sum, { size }) => sum + size, 0);
  if (total > 24 * 1024 * 1024) throw new Error(`bundle/total-budget: ${total}`);
  const css = facts.filter(({ file }) => file.endsWith('.css')).reduce((sum, { size }) => sum + size, 0);
  if (css > 1024 * 1024) throw new Error(`bundle/css-budget: ${css}`);
  const workers = facts.filter(({ file }) => /config-lens-(?:editor|language)|editorWebWorkerMain/u.test(file));
  if (
    !workers.some(({ file }) => file.includes('config-lens-editor')) ||
    !workers.some(({ file }) => file.includes('config-lens-language'))
  ) {
    throw new Error('bundle/worker-closure: editor and language Worker chunks are required.');
  }
  if (workers.some(({ size }) => size > 2 * 1024 * 1024))
    throw new Error('bundle/worker-budget: a Worker entry exceeds 2 MiB.');
  const javascript = facts.filter(({ file }) => file.endsWith('.js'));
  if (javascript.reduce((sum, { size }) => sum + size, 0) > 8 * 1024 * 1024) {
    throw new Error('bundle/javascript-budget: complete JavaScript exceeds 8 MiB.');
  }
  if (javascript.some(({ size }) => size > 4 * 1024 * 1024)) {
    throw new Error('bundle/chunk-budget: an individual Monaco or language chunk exceeds 4 MiB.');
  }
  const initialHtml = await readFile(resolve(dist, 'index.html'), 'utf8');
  const initialScripts = [...initialHtml.matchAll(/<script[^>]+src=["']\.\/([^"']+)["']/gu)].map((match) =>
    resolve(dist, match[1]),
  );
  const initialBytes = facts
    .filter(({ file }) => initialScripts.includes(file))
    .reduce((sum, { size }) => sum + size, 0);
  if (initialScripts.length === 0 || initialBytes > 1024 * 1024) {
    throw new Error(`bundle/initial-script-budget: ${initialBytes}`);
  }
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}

console.log('ConfigLens dependency, boundary, privacy, and bundle checks passed.');
