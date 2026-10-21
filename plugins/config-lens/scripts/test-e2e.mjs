import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const styles = await Promise.all(
  files.filter((file) => file.endsWith('.css')).map(async (file) => ({ file, content: await readFile(file, 'utf8') })),
);
const emittedFiles = new Set(files);
const codiconFont = await readFile(
  resolve(root, 'node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.ttf'),
);
let codiconReferences = 0;
for (const { file, content } of styles) {
  for (const match of content.matchAll(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^"'()]*?))\s*\)/gu)) {
    const reference = (match[1] ?? match[2] ?? match[3]).trim();
    if (reference.startsWith('data:') || reference.startsWith('#')) continue;
    if (/^(?:\/|[a-z][a-z\d+.-]*:)/iu.test(reference)) {
      throw new Error(`e2e/css-resource-url: ${reference} must be package-relative.`);
    }
    const target = fileURLToPath(new URL(reference, pathToFileURL(file)));
    if (!emittedFiles.has(target)) {
      throw new Error(`e2e/css-resource-missing: ${file.slice(dist.length + 1)} cannot resolve ${reference}.`);
    }
  }
  for (const [, declarations] of content.matchAll(/@font-face\s*\{([^}]+)\}/gu)) {
    if (!/font-family:\s*["']?codicon["']?\s*;/u.test(declarations)) continue;
    const reference = declarations.match(/url\(["']?([^"')]+)["']?\)/u)?.[1];
    if (reference === undefined || reference.startsWith('data:')) {
      throw new Error('e2e/codicon-font: CSS must reference the package-owned icon font.');
    }
    const target = fileURLToPath(new URL(reference, pathToFileURL(file)));
    if (!(await readFile(target)).equals(codiconFont)) {
      throw new Error('e2e/codicon-font: emitted font differs from the locked Monaco font.');
    }
    codiconReferences += 1;
  }
}
if (codiconReferences === 0) {
  throw new Error('e2e/codicon-font: CSS must contain the package-owned icon font face.');
}
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
const delayedModules = Object.entries(chunkModules)
  .filter(([file]) => !initialScriptNames.includes(file) && !initialStyleNames.includes(file))
  .flatMap(([, modules]) => modules);
for (const required of [
  '/editor/contrib/find/browser/findController.js',
  '/editor/contrib/contextmenu/browser/contextmenu.js',
  '/editor/contrib/gotoError/browser/gotoError.js',
  '/editor/contrib/wordOperations/browser/wordOperations.js',
  '/nls/lang/zh-cn.js',
  '/languages/features/json/tokenization.js',
  '/languages/definitions/yaml/yaml.js',
  '/languages/definitions/xml/xml.js',
  '/src/editor/toml.ts',
]) {
  if (!delayedModules.some((identifier) => identifier.includes(required))) {
    throw new Error(`e2e/editor-module-closure: missing delayed ${required}`);
  }
}
const allModules = Object.values(chunkModules).flat();
if (allModules.some((identifier) => /\/(?:jsonMode|jsonWorker|workerManager|editor\.main)\.js/u.test(identifier))) {
  throw new Error('e2e/extra-language-service: full language services or editor.main must not ship.');
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
const compiledCss = styles
  .map(({ content }) => content)
  .join('\n')
  .replaceAll(/\s+/gu, ' ')
  .replaceAll(/\s*([{}:;,])\s*/gu, '$1');
const cssBlocks = (selector) => {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return [...compiledCss.matchAll(new RegExp(`${escaped}\\{([^{}]*)\\}`, 'gu'))].map((match) => match[1]);
};
const hasCssContract = (selector, declarations) =>
  cssBlocks(selector).some((block) => declarations.every((declaration) => block.includes(declaration)));
for (const [name, selector, declarations] of [
  ['workbench', '.config-lens', ['padding:0', 'gap:0']],
  ['editor', '.config-lens-editor', ['border:0', 'border-radius:0']],
  ['editor find spacing', '.config-lens-editor .monaco-editor .find-widget', ['margin-top:0']],
  [
    'editor find button sizing',
    '.config-lens-editor .monaco-editor .find-widget .button:not(.toggle)',
    ['box-sizing:content-box'],
  ],
  [
    'footer',
    '.config-lens__footer',
    ['height:40px', 'min-height:40px', 'max-height:40px', 'flex:0 0 40px', 'margin-top:auto'],
  ],
  ['footer main', '.config-lens__footer-main', ['height:100%', 'min-height:0', 'align-items:center']],
  ['language selector', '.config-lens__language .semi-select', ['min-width:72px', 'max-width:120px']],
  [
    'constrained footer',
    '.config-lens__footer',
    ['height:72px', 'min-height:72px', 'max-height:72px', 'flex-basis:72px'],
  ],
]) {
  if (!hasCssContract(selector, declarations)) {
    throw new Error(`e2e/layout-css-contract: ${name} is missing from compiled CSS.`);
  }
}
if (!cssBlocks('.config-lens__language .semi-select').some((block) => /flex:0(?: 1)? 120px(?:;|$)/u.test(block))) {
  throw new Error('e2e/layout-css-contract: language selector must shrink from 120px without growing.');
}
if (
  ['config-lens__diagnostics', 'config-lens__status'].some(
    (selector) => compiledCss.includes(selector) || source.includes(selector),
  )
) {
  throw new Error('e2e/layout-css-contract: Footer diagnostics or status UI remains in source or compiled output.');
}
if (cssBlocks('.config-lens').filter((block) => block.includes('padding:0') && block.includes('gap:0')).length < 2) {
  throw new Error('e2e/layout-css-contract: constrained CSS restores workbench outer spacing.');
}
if (
  !hasCssContract('.config-lens__footer-main', ['grid-template-columns:minmax(0,1fr)', 'grid-template-rows:1fr 1fr']) ||
  !(
    hasCssContract('.config-lens__toolbar', ['grid-row:2']) ||
    hasCssContract('.config-lens__toolbar', ['grid-area:2/1'])
  )
) {
  throw new Error('e2e/layout-css-contract: constrained language/actions must occupy two bounded rows.');
}
console.log(`ConfigLens built-output E2E passed with ${files.length} self-contained files.`);
