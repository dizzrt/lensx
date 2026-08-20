import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));
if (manifest.plugin_id !== 'dev.lensx.config-lens' || manifest.version !== '0.1.0') {
  throw new Error('e2e/manifest-identity: built Manifest drifted.');
}
if (manifest.manifest_version !== '0.4.0' || manifest.runtime?.kind !== 'webview') {
  throw new Error('e2e/runtime-protocol: built Manifest must use the public WebView protocol.');
}
const files = [];
const visit = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else files.push(path);
  }
};
await visit(dist);
if (!files.some((file) => file.endsWith('index.html'))) throw new Error('e2e/entry: index.html is missing.');
if (files.some((file) => file.endsWith('.map'))) throw new Error('e2e/sourcemap: sourcemaps must not ship.');
const facts = await Promise.all(files.map(async (file) => ({ file, size: (await stat(file)).size })));
const totalBytes = facts.reduce((sum, { size }) => sum + size, 0);
if (totalBytes > 24 * 1024 * 1024) throw new Error(`e2e/total-budget: ${totalBytes}`);
const cssBytes = facts.filter(({ file }) => file.endsWith('.css')).reduce((sum, { size }) => sum + size, 0);
if (cssBytes > 1024 * 1024) throw new Error(`e2e/css-budget: ${cssBytes}`);
const workerFacts = facts.filter(({ file }) => /config-lens-(?:editor|language)|editorWebWorkerMain/u.test(file));
if (
  !workerFacts.some(({ file }) => file.includes('config-lens-editor')) ||
  !workerFacts.some(({ file }) => file.includes('config-lens-language')) ||
  workerFacts.some(({ size }) => size > 2 * 1024 * 1024)
) {
  throw new Error('e2e/worker-budget: required Worker entries must exist and remain below 2 MiB.');
}
const javascriptFacts = facts.filter(({ file }) => file.endsWith('.js'));
if (javascriptFacts.reduce((sum, { size }) => sum + size, 0) > 8 * 1024 * 1024) {
  throw new Error('e2e/javascript-budget: complete JavaScript exceeds 8 MiB.');
}
if (javascriptFacts.some(({ size }) => size > 4 * 1024 * 1024)) {
  throw new Error('e2e/chunk-budget: an individual chunk exceeds 4 MiB.');
}
const scripts = files.filter((file) => file.endsWith('.js'));
const source = (await Promise.all(scripts.map((file) => readFile(file, 'utf8')))).join('\n');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
const initialScriptNames = [...html.matchAll(/<script[^>]+src=["']\.\/([^"']+)["']/gu)].map((match) => match[1]);
const initialStyleNames = [...html.matchAll(/<link[^>]+href=["']\.\/([^"']+\.css)["']/gu)].map((match) => match[1]);
const sumBytes = async (names) =>
  (await Promise.all(names.map((name) => stat(resolve(dist, name))))).reduce((sum, facts) => sum + facts.size, 0);
const initialJavaScriptBytes = await sumBytes(initialScriptNames);
const initialCssBytes = await sumBytes(initialStyleNames);
if (initialScriptNames.length === 0 || initialJavaScriptBytes > 256 * 1024) {
  throw new Error(`e2e/initial-script-budget: ${initialJavaScriptBytes}`);
}
if (initialStyleNames.length === 0 || initialCssBytes > 64 * 1024) {
  throw new Error(`e2e/initial-css-budget: ${initialCssBytes}`);
}
const chunkModules = JSON.parse(await readFile(resolve(dist, 'chunk-modules.json'), 'utf8'));
const initialModules = [...initialScriptNames, ...initialStyleNames].flatMap((name) => chunkModules[name] ?? []);
const forbiddenInitialModule =
  /node_modules\/(?:react(?:-dom)?|@douyinfe\/semi|@lensx\/plugin-ui|monaco-editor)|src\/language\/adapters/u;
const forbiddenInitial = initialModules.find((identifier) => forbiddenInitialModule.test(identifier));
if (forbiddenInitial !== undefined) {
  throw new Error(`e2e/initial-heavy-module: ${forbiddenInitial}`);
}
const startupShell = html.match(/<section\b[^>]*\bid=["']config-lens-startup["'][^>]*>[\s\S]*?<\/section>/u)?.[0];
if (
  startupShell === undefined ||
  !startupShell.includes('aria-busy="true"') ||
  !startupShell.includes('config-lens-startup-retry') ||
  /<strong\b|role=["']progressbar["']|config-lens-startup__progress/u.test(startupShell)
) {
  throw new Error('e2e/startup-shell: normal startup must stay visually empty while retaining recovery.');
}
if (/(?:src|href)=["']https?:\/\//u.test(html) || /(?:import\s*\(|new Worker\s*\()\s*["']https?:\/\//u.test(source)) {
  throw new Error('e2e/remote-load: build attempts to load a remote script or Worker.');
}
if (/src\/app\/|src-tauri\/|tools\/plugin-package-format|@tauri-apps\//u.test(source)) {
  throw new Error('e2e/private-boundary: bundle contains Host-private references.');
}
if (/@lensx\/plugin-sdk\/iframe|createPluginIframeTransport/u.test(source)) {
  throw new Error('e2e/legacy-runtime: bundle contains the removed iframe authoring path.');
}
if (!/language\.worker|config-lens-language/u.test(source) || !/editor\.worker|config-lens-editor/u.test(source)) {
  throw new Error('e2e/worker-closure: package-owned Worker entry facts are missing.');
}
if (!source.includes('json') || !source.includes('yaml') || !source.includes('toml') || !source.includes('xml')) {
  throw new Error('e2e/language-closure: a language chunk is missing.');
}
if (
  source.includes('Apply result') ||
  source.includes('Read-only formatting preview') ||
  source.includes('config-lens__suggestion')
) {
  throw new Error('e2e/single-editor-boundary: preview, diff, apply, or language-suggestion code remains.');
}
if (!source.includes('data-editor') || !source.includes('single')) {
  throw new Error('e2e/single-editor-boundary: the single-editor product marker is missing.');
}
console.log(`ConfigLens built-output E2E passed with ${files.length} self-contained files.`);
