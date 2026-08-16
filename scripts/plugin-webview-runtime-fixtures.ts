import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { inspectPluginPackage, packPluginPackage } from '../packages/plugin-cli/dist/src/package-format/index.js';

const root = join(import.meta.dirname, '..');
const fixtureRoot = join(root, 'fixtures/plugin-webview-runtime');
const writeMode = process.argv.includes('--write');
const bytes = (value: string): Uint8Array => Buffer.from(value, 'utf8');
const manifestBytes = (value: unknown): Uint8Array => bytes(`${JSON.stringify(value)}\n`);

type FixtureKind = 'normal' | 'malicious';

const manifest = (kind: FixtureKind) => ({
  manifest_version: '0.3.0',
  plugin_id: `com.lensx.fixture.runtime.${kind}`,
  version: '1.0.0',
  display: {
    name: { 'en-US': `${kind} WebView fixture`, 'zh-CN': `${kind} WebView 夹具` },
    description: {
      'en-US': 'A maintained top-level Child WebView Runtime fixture.',
      'zh-CN': '项目维护的顶层 Child WebView Runtime 夹具。',
    },
  },
  publisher: {
    author: 'lensX',
    homepage: 'https://example.com/lensx-runtime-fixture',
    repository: 'https://example.com/lensx-runtime-fixture.git',
  },
  compatibility: {
    lensx: { min_version: '0.1.0', max_version_exclusive: '0.2.0' },
    host_api: { min_version: '0.2.0', max_version_exclusive: '0.3.0' },
  },
  runtime: { kind: 'webview', entry: 'dist/index.html' },
  contributes: {
    pages: [
      { id: 'home', title: { 'en-US': 'Runtime fixture', 'zh-CN': 'Runtime 夹具' }, route: '/' },
      {
        id: 'route_probe',
        title: { 'en-US': 'Route probe', 'zh-CN': '路由探测' },
        route: '/route-probe',
        parent_page_id: 'home',
      },
    ],
    actions: [
      {
        id: 'open',
        title: { 'en-US': 'Open Runtime fixture', 'zh-CN': '打开 Runtime 夹具' },
        default_keywords: { 'en-US': ['runtime fixture'], 'zh-CN': ['运行时夹具'] },
        target: { kind: 'page', page_id: 'route_probe' },
      },
    ],
    launcher: { default_action_id: 'open' },
  },
});

const normalScript = `
const bridge = globalThis.__LENSX_PLUGIN_WEBVIEW_BRIDGE__;
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
worker.onmessage = ({ data }) => {
  document.documentElement.dataset.worker = data;
  worker.terminate();
};
worker.postMessage('probe');
document.documentElement.dataset.bridge = bridge?.bootstrap?.type === 'lensx.plugin_bridge.ready' ? 'ready' : 'absent';
localStorage.setItem('lensx-webview-fixture', 'normal');
`;

const maliciousScript = `
const attempts = [
  ['plugin:app|version', {}],
  ['plugin:event|emit', { event: 'forged', payload: {} }],
  ['plugin:window|hide', { label: 'main' }],
  ['plugin:webview|set_webview_position', { label: 'main', value: { type: 'Physical', x: 0, y: 0 } }],
];
for (const [cmd, payload] of attempts) {
  globalThis.ipc?.postMessage(JSON.stringify({ cmd, callback: 1, error: 2, payload, options: {}, __TAURI_INVOKE_KEY__: 'forged' }));
}
globalThis.__LENSX_PLUGIN_WEBVIEW_BRIDGE__?.send({ contract_version: '0.2.0', type: 'malformed' });
`;

const fixtures = [
  {
    kind: 'normal' as const,
    file: 'normal/runtime-compatible.lxp',
    coverage: [
      'top_level_document',
      'public_webview_bridge',
      'host_route_fragment',
      'dedicated_worker',
      'origin_storage',
    ],
    files: [
      { path: 'manifest.json', bytes: manifestBytes(manifest('normal')) },
      {
        path: 'dist/index.html',
        bytes: bytes(
          '<!doctype html><meta charset="utf-8"><title>WebView fixture</title><script type="module" src="./main.js"></script>\n',
        ),
      },
      { path: 'dist/main.js', bytes: bytes(normalScript) },
      { path: 'dist/worker.js', bytes: bytes("self.onmessage = () => self.postMessage('ready');\n") },
    ],
  },
  {
    kind: 'malicious' as const,
    file: 'malicious/runtime-adversarial.lxp',
    coverage: [
      'generic_tauri_envelopes',
      'native_command_escape',
      'global_event_escape',
      'window_authority_escape',
      'webview_authority_escape',
      'malformed_bridge_carrier',
    ],
    files: [
      { path: 'manifest.json', bytes: manifestBytes(manifest('malicious')) },
      {
        path: 'dist/index.html',
        bytes: bytes(
          '<!doctype html><meta charset="utf-8"><title>Adversarial WebView fixture</title><script type="module" src="./main.js"></script>\n',
        ),
      },
      { path: 'dist/main.js', bytes: bytes(maliciousScript) },
    ],
  },
] as const;

const outputs = new Map<string, Buffer>();
const expectations = [];
for (const fixture of fixtures) {
  const packed = await packPluginPackage(fixture.files);
  const inspection = await inspectPluginPackage(packed.bytes);
  if (inspection.status !== 'compatible') throw new Error(`${fixture.kind} WebView fixture is incompatible.`);
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
  Buffer.from(`${JSON.stringify({ fixture_version: '0.3.0', packages: expectations }, null, 2)}\n`, 'utf8'),
);

const listFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
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
for (const relativePath of listFiles(fixtureRoot)) if (!outputs.has(relativePath)) drift.push(relativePath);
if (drift.length > 0) {
  throw new Error(
    `Plugin WebView Runtime fixtures drifted: ${drift.sort().join(', ')}. Run pnpm run generate:plugin-webview-runtime-fixtures.`,
  );
}

console.log(`${writeMode ? 'Generated' : 'Checked'} ${fixtures.length} Plugin WebView Runtime packages.`);
