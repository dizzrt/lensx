import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { inspectPluginPackage, packPluginPackage } from '../tools/plugin-package-format/index.ts';

const rootDir = join(import.meta.dirname, '..');
const fixtureRoot = join(rootDir, 'fixtures/plugin-iframe-runtime');
const writeMode = process.argv.includes('--write');

const bytes = (value: string): Uint8Array => Buffer.from(value, 'utf8');
const manifestBytes = (value: unknown): Uint8Array => bytes(`${JSON.stringify(value)}\n`);

const originProbe = (kind: 'normal' | 'malicious') => `
      (() => {
        const fragmentParts = location.hash.split('?', 2);
        const fragmentQuery = fragmentParts.length === 2 ? fragmentParts[1] : '';
        const params = new URLSearchParams(fragmentQuery);
        const storageKey = params.get('storage_key');
        const storageValue = params.get('storage_value');
        let parentDomDenied = false;
        let hostStorageDenied = false;
        try { void window.parent.document.documentElement; } catch { parentDomDenied = true; }
        try { void window.parent.localStorage.getItem(storageKey); } catch { hostStorageDenied = true; }
        let storageInitiallyAbsent = false;
        let storageRoundtrip = false;
        try {
          storageInitiallyAbsent = storageKey !== null && localStorage.getItem(storageKey) === null;
          if (storageKey !== null && storageValue !== null) {
            localStorage.setItem(storageKey, storageValue);
            storageRoundtrip = localStorage.getItem(storageKey) === storageValue;
          }
        } catch {}
        const internals = window.__TAURI_INTERNALS__;
        const engineMatch = navigator.userAgent.match(/AppleWebKit\\/([0-9.]+)/);
        const engineVersion = engineMatch === null ? 'unknown' : engineMatch[1];
        window.__LENSX_EARLY_RUNTIME_PROBE__ = Object.freeze({
          kind: '${kind}',
          document_origin: location.origin,
          engine_version: engineVersion,
          origin_non_opaque: location.origin !== 'null',
          storage_initially_absent: storageInitiallyAbsent,
          storage_roundtrip: storageRoundtrip,
          parent_dom_denied: parentDomDenied,
          frame_element_absent: window.frameElement === null,
          host_storage_denied: hostStorageDenied,
          tauri_absent:
            window.isTauri !== true &&
            (typeof internals !== 'object' || internals === null),
        });
      })();
`;

const manifest = (kind: 'normal' | 'malicious') => ({
  manifest_version: '0.1.0',
  plugin_id: `com.lensx.fixture.runtime.${kind}`,
  version: '1.0.0',
  display: {
    name: {
      'en-US': kind === 'normal' ? 'Runtime Fixture' : 'Adversarial Runtime Fixture',
      'zh-CN': kind === 'normal' ? '运行时夹具' : '恶意运行时夹具',
    },
    description: {
      'en-US': 'A maintained iframe Runtime security fixture.',
      'zh-CN': '项目维护的 iframe Runtime 安全夹具。',
    },
  },
  publisher: {
    author: 'lensX',
    homepage: 'https://example.com/lensx-runtime-fixture',
    repository: 'https://example.com/lensx-runtime-fixture.git',
  },
  compatibility: {
    lensx: { min_version: '0.1.0', max_version_exclusive: '0.2.0' },
    host_api: { min_version: '0.1.0', max_version_exclusive: '0.2.0' },
  },
  runtime: { kind: 'iframe', entry: 'dist/index.html' },
  requested_permissions: [],
  contributes: {
    pages: [
      {
        id: 'home',
        title: { 'en-US': 'Runtime Fixture', 'zh-CN': '运行时夹具' },
        route: '/',
        required_permissions: [],
      },
      {
        id: 'route_probe',
        title: { 'en-US': 'Route Probe', 'zh-CN': '路由探测' },
        route: '/route-probe',
        parent_page_id: 'home',
        required_permissions: [],
      },
    ],
    actions: [
      {
        id: 'open',
        title: { 'en-US': 'Open Runtime Fixture', 'zh-CN': '打开运行时夹具' },
        default_keywords: { 'en-US': ['runtime fixture'], 'zh-CN': ['运行时夹具'] },
        target: { kind: 'page', page_id: 'route_probe' },
      },
    ],
    launcher: { default_action_id: 'open' },
  },
});

const privateSessionConsumer = `
      (() => {
        const exactKeys = (value, keys) =>
          typeof value === 'object' && value !== null && !Array.isArray(value) &&
          Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
        window.addEventListener('message', (event) => {
          const value = event.data;
          if (
            event.source !== window.parent || event.ports.length !== 1 ||
            !exactKeys(value, ['contract_version', 'type', 'nonce']) ||
            value.contract_version !== '0.1.0' ||
            value.type !== 'lensx.plugin_runtime.bootstrap' ||
            typeof value.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(value.nonce)
          ) return;
          const port = event.ports[0];
          port.postMessage(Object.freeze({
            contract_version: '0.1.0',
            type: 'lensx.plugin_runtime.ready',
            nonce: value.nonce,
          }));
        });
      })();
`;

const normalHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>lensX Runtime Fixture</title>
    <script>${originProbe('normal')}</script>
    <script>${privateSessionConsumer}</script>
    <link rel="stylesheet" href="./styles.css">
    <script src="./classic.js" defer></script>
    <script type="module" src="./module.js"></script>
  </head>
  <body>
    <main>
      <h1>Runtime Fixture</h1>
      <img alt="Runtime fixture" src="./image.svg">
      <output id="route"></output>
    </main>
    <script>
      document.querySelector('#route').textContent = location.hash;
      window.addEventListener('load', () => {
        window.parent.postMessage(Object.freeze({
          ...window.__LENSX_EARLY_RUNTIME_PROBE__,
          namespace: 'lensx.plugin-iframe-runtime-harness',
          kind: 'normal',
          route: location.hash,
          classic: document.documentElement.dataset.classic === 'loaded',
          module: document.documentElement.dataset.module === 'loaded',
          css: getComputedStyle(document.documentElement).getPropertyValue('--lensx-runtime-fixture').trim() === 'loaded',
          image: document.querySelector('img').complete && document.querySelector('img').naturalWidth > 0,
        }), '*');
      });
    </script>
  </body>
</html>
`;

const maliciousHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>lensX Adversarial Runtime Fixture</title>
    <script>${originProbe('malicious')}</script>
    <script>${privateSessionConsumer}</script>
    <script type="module" src="./malicious.js"></script>
  </head>
  <body>
    <main>Adversarial Runtime Fixture</main>
    <form action="https://example.invalid/form" method="post"><button>submit</button></form>
    <a data-probe="download" download="fixture.txt" href="data:text/plain,denied">download</a>
    <button data-probe="popup">popup</button>
    <button data-probe="top-navigation">top navigation</button>
  </body>
</html>
`;

const maliciousModule = `const result = Object.create(null);
const attempt = async (name, operation) => {
  try { await operation(); result[name] = 'resolved'; }
  catch { result[name] = 'rejected'; }
};
await attempt('tauri-internals', () => window.__TAURI_INTERNALS__.invoke('plugin_iframe_runtime_harness_probe'));
await attempt('tauri-api-import', () => import('@tauri-apps/api/core'));
await attempt('parent-dom', () => window.parent.document.documentElement.outerHTML);
await attempt('filesystem', () => window.showOpenFilePicker());
await attempt('clipboard', () => navigator.clipboard.readText());
await attempt('camera', () => navigator.mediaDevices.getUserMedia({ video: true }));
await attempt('microphone', () => navigator.mediaDevices.getUserMedia({ audio: true }));
await attempt('geolocation', () => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject)));
await attempt('fullscreen', () => document.documentElement.requestFullscreen());
window.parent.postMessage(Object.freeze({
  contract_version: '0.1.0',
  type: 'lensx.plugin_runtime.ready',
  nonce: '00000000000000000000000000000000',
}), '*');
document.querySelector('[data-probe="popup"]').addEventListener('click', () => window.open('https://example.invalid/', '_blank'));
document.querySelector('[data-probe="top-navigation"]').addEventListener('click', () => window.top.location.assign('https://example.invalid/'));
window.__LENSX_RUNTIME_FIXTURE_RESULT__ = Object.freeze(result);
window.parent.postMessage(Object.freeze({
  ...window.__LENSX_EARLY_RUNTIME_PROBE__,
  namespace: 'lensx.plugin-iframe-runtime-harness',
  kind: 'malicious',
  attempts: Object.freeze({ ...result }),
}), '*');
`;

const fixtureInputs = [
  {
    kind: 'normal' as const,
    file: 'normal/runtime-compatible.lxp',
    coverage: [
      'html',
      'css',
      'image',
      'classic_script',
      'es_module',
      'module_graph',
      'host_route_fragment',
      'origin_serialization',
      'same_key_storage',
      'parent_frame_isolation',
      'private_session_bootstrap_consumer',
      'single_use_nonce',
      'message_port_transfer',
    ],
    files: [
      { path: 'manifest.json', bytes: manifestBytes(manifest('normal')) },
      { path: 'dist/classic.js', bytes: bytes("document.documentElement.dataset.classic = 'loaded';\n") },
      { path: 'dist/data.json', bytes: bytes('{"runtime":"fixture"}\n') },
      {
        path: 'dist/image.svg',
        bytes: bytes(
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#5b8ff9"/></svg>\n',
        ),
      },
      { path: 'dist/index.html', bytes: bytes(normalHtml) },
      {
        path: 'dist/module-dependency.js',
        bytes: bytes("export const moduleValue = 'loaded';\n"),
      },
      {
        path: 'dist/module.js',
        bytes: bytes(
          "import { moduleValue } from './module-dependency.js';\ndocument.documentElement.dataset.module = moduleValue;\n",
        ),
      },
      {
        path: 'dist/styles.css',
        bytes: bytes(
          'html { --lensx-runtime-fixture: loaded; color-scheme: light dark; } body { margin: 0; font-family: sans-serif; }\n',
        ),
      },
    ],
  },
  {
    kind: 'malicious' as const,
    file: 'malicious/runtime-adversarial.lxp',
    coverage: [
      'tauri_internals',
      'tauri_api_import',
      'parent_dom',
      'host_storage',
      'frame_element',
      'host_path_mismatch',
      'filesystem',
      'cross_scope_navigation',
      'cross_origin_navigation',
      'cross_generation_resource',
      'cross_generation_storage',
      'cross_generation_navigation',
      'top_navigation',
      'popup',
      'download',
      'form',
      'dangerous_scheme',
      'clipboard',
      'camera',
      'microphone',
      'geolocation',
      'fullscreen',
      'cross_plugin_session_forgery',
      'old_generation_session_replay',
      'wrong_origin_bootstrap',
    ],
    files: [
      { path: 'manifest.json', bytes: manifestBytes(manifest('malicious')) },
      { path: 'dist/index.html', bytes: bytes(maliciousHtml) },
      { path: 'dist/malicious.js', bytes: bytes(maliciousModule) },
    ],
  },
] as const;

const outputs = new Map<string, Buffer>();
const expectations = [];
for (const fixture of fixtureInputs) {
  const packed = await packPluginPackage(fixture.files);
  const inspection = await inspectPluginPackage(packed.bytes);
  if (inspection.status !== 'compatible') throw new Error(`${fixture.kind} Runtime fixture is not compatible.`);
  outputs.set(fixture.file, Buffer.from(packed.bytes));
  expectations.push({
    kind: fixture.kind,
    file: fixture.file,
    digest: packed.digest,
    coverage: fixture.coverage,
    expected: inspection,
  });
}
outputs.set(
  'expectations.json',
  Buffer.from(`${JSON.stringify({ fixture_version: '0.1.0', packages: expectations }, null, 2)}\n`, 'utf8'),
);

const listFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory() && relative(fixtureRoot, absolute) === 'evidence') return [];
    return entry.isDirectory() ? listFiles(absolute) : [relative(fixtureRoot, absolute)];
  });
};

const drift: string[] = [];
for (const [relativePath, content] of outputs) {
  const absolute = join(fixtureRoot, relativePath);
  if (writeMode) {
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, content);
  } else if (!existsSync(absolute) || !readFileSync(absolute).equals(content)) {
    drift.push(relativePath);
  }
}
for (const relativePath of listFiles(fixtureRoot)) {
  if (!outputs.has(relativePath)) drift.push(relativePath);
}
if (drift.length > 0) {
  throw new Error(
    `Plugin iframe Runtime fixtures drifted: ${drift.sort().join(', ')}. Review the change, then run pnpm run generate:plugin-iframe-runtime-fixtures.`,
  );
}

console.log(`${writeMode ? 'Generated' : 'Checked'} ${fixtureInputs.length} plugin iframe Runtime packages.`);
