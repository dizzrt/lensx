import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { inspectPluginPackage, packPluginPackage } from '../tools/plugin-package-format/index.ts';

const rootDir = join(import.meta.dirname, '..');
const fixtureRoot = join(rootDir, 'fixtures/plugin-iframe-runtime');
const writeMode = process.argv.includes('--write');

const bytes = (value: string): Uint8Array => Buffer.from(value, 'utf8');
const manifestBytes = (value: unknown): Uint8Array => bytes(`${JSON.stringify(value)}\n`);

type FixtureKind =
  | 'normal'
  | 'malicious'
  | 'slow-load'
  | 'never-acknowledge'
  | 'unexpected-disconnect'
  | 'repeated-failure'
  | 'host-reload'
  | 'replacement';

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

const manifest = (kind: FixtureKind) => ({
  manifest_version: '0.1.0',
  plugin_id: `com.lensx.fixture.runtime.${kind}`,
  version: '1.0.0',
  display: {
    name: {
      'en-US': kind === 'normal' ? 'Runtime Fixture' : `${kind} Runtime Fixture`,
      'zh-CN': kind === 'normal' ? '运行时夹具' : `${kind} 运行时夹具`,
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
          const responses = new Set();
          let contextEvent = false;
          let contextResult = false;
          let actionResult = false;
          let closeResult = false;
          let limitResult = false;
          let proofSent = false;
          port.onmessage = ({ data }) => {
            if (!exactKeys(data, ['contract_version', 'type', ...(data?.type === 'lensx.plugin_transport.event' ? ['event'] : data?.type === 'lensx.plugin_transport.disconnect' ? [] : data?.error ? ['request_id', 'error'] : ['request_id', 'result'])]) ||
                data.contract_version !== '0.1.0') return;
            if (data.type === 'lensx.plugin_transport.event' &&
                data.event?.event === 'runtime.context_changed' &&
                data.event.payload?.locale === 'zh-CN' && data.event.payload?.theme === 'dark') contextEvent = true;
            if (data.type === 'lensx.plugin_transport.response') {
              responses.add(data.request_id);
              if (data.request_id === 'request_0000000000000001' &&
                  data.result?.method === 'runtime.get_context' &&
                  JSON.stringify(data.result.result?.capabilities) ===
                    JSON.stringify(['actions.open', 'runtime.get_context', 'ui.close'])) contextResult = true;
              if (data.request_id === 'request_0000000000000002' &&
                  data.result?.method === 'actions.open' && data.result.result?.opened === true) actionResult = true;
              if (data.request_id === 'request_0000000000000003' &&
                  data.result?.method === 'ui.close' && data.result.result?.accepted === true) closeResult = true;
              if (data.request_id === 'request_0000000000000005' &&
                  data.error?.code === 'limit_exceeded') {
                limitResult = true;
                port.postMessage(Object.freeze({
                  contract_version: '0.1.0', type: 'lensx.plugin_transport.request',
                  request_id: 'request_0000000000000006',
                  request: Object.freeze({ method: 'storage.get', params: Object.freeze({ key: 'proof' }) }),
                }));
              }
            }
            if (!proofSent && contextEvent && contextResult && actionResult && closeResult &&
                ['request_0000000000000001', 'request_0000000000000002', 'request_0000000000000003']
                  .every((id) => responses.has(id))) {
              proofSent = true;
              let deep = null;
              for (let depth = 0; depth <= 32; depth += 1) deep = [deep];
              port.postMessage(Object.freeze({
                contract_version: '0.1.0', type: 'lensx.plugin_transport.request',
                request_id: 'request_0000000000000005',
                request: Object.freeze({
                  method: 'storage.set', params: Object.freeze({ key: 'limit', value: deep }),
                }),
              }));
            }
          };
          port.start();
          port.postMessage(Object.freeze({
            contract_version: '0.1.0',
            type: 'lensx.plugin_runtime.ready',
            nonce: value.nonce,
          }));
          for (const [request_id, request] of [
            ['request_0000000000000001', { method: 'runtime.get_context', params: {} }],
            ['request_0000000000000002', { method: 'actions.open', params: { actionId: 'open' } }],
            ['request_0000000000000003', { method: 'ui.close', params: {} }],
            ['request_0000000000000004', { method: 'storage.get', params: { key: 'cancel' } }],
          ]) port.postMessage(Object.freeze({
            contract_version: '0.1.0', type: 'lensx.plugin_transport.request', request_id,
            request: Object.freeze(request),
          }));
          port.postMessage(Object.freeze({
            contract_version: '0.1.0', type: 'lensx.plugin_transport.cancel',
            request_id: 'request_0000000000000004',
          }));
        });
      })();
`;

const normalReporter = `
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
          csp_checks: Object.freeze({
            classic_script_allowed: document.documentElement.dataset.classic === 'loaded',
            es_module_allowed: document.documentElement.dataset.module === 'loaded',
            style_allowed: getComputedStyle(document.documentElement).getPropertyValue('--lensx-runtime-fixture').trim() === 'loaded',
            image_allowed: document.querySelector('img').complete && document.querySelector('img').naturalWidth > 0,
          }),
        }), '*');
      });
`;

const normalHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>lensX Runtime Fixture</title>
    <script src="./early-runtime-probe.js"></script>
    <script src="./private-session.js"></script>
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
    <script src="./report.js"></script>
  </body>
</html>
`;

const maliciousHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>lensX Adversarial Runtime Fixture</title>
    <script src="./early-runtime-probe.js"></script>
    <script src="./private-session.js"></script>
    <script>window.__LENSX_INLINE_SCRIPT_RAN__ = true;</script>
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
const cspChecks = Object.create(null);
const attempt = async (name, operation) => {
  try { await operation(); result[name] = 'resolved'; }
  catch { result[name] = 'rejected'; }
};
const expectViolation = (name, directives, operation) => new Promise((resolve) => {
  let settled = false;
  const finish = (passed) => {
    if (settled) return;
    settled = true;
    window.removeEventListener('securitypolicyviolation', onViolation);
    cspChecks[name] = passed;
    resolve();
  };
  const onViolation = (event) => {
    if (directives.includes(event.effectiveDirective)) finish(true);
  };
  window.addEventListener('securitypolicyviolation', onViolation);
  try { operation(); } catch { finish(true); }
  setTimeout(() => finish(false), 250);
});
await attempt('tauri-internals', () => window.__TAURI_INTERNALS__.invoke('plugin_iframe_runtime_harness_probe'));
await attempt('tauri-api-import', () => import('@tauri-apps/api/core'));
await attempt('parent-dom', () => window.parent.document.documentElement.outerHTML);
await attempt('filesystem', () => window.showOpenFilePicker());
await attempt('clipboard', () => navigator.clipboard.readText());
await attempt('camera', () => navigator.mediaDevices.getUserMedia({ video: true }));
await attempt('microphone', () => navigator.mediaDevices.getUserMedia({ audio: true }));
await attempt('geolocation', () => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject)));
await attempt('fullscreen', () => document.documentElement.requestFullscreen());
await expectViolation('remote_script_blocked', ['script-src', 'script-src-elem'], () => {
  const script = document.createElement('script'); script.src = 'https://example.invalid/runtime.js'; document.head.append(script);
});
cspChecks.inline_script_blocked = window.__LENSX_INLINE_SCRIPT_RAN__ !== true;
await expectViolation('eval_blocked', ['script-src'], () => { Function('return 1')(); });
await expectViolation('connect_blocked', ['connect-src'], () => { void fetch('https://example.invalid/runtime'); });
await expectViolation('worker_blocked', ['worker-src'], () => { void new Worker('./worker.js'); });
await expectViolation('frame_blocked', ['frame-src', 'child-src'], () => {
  const frame = document.createElement('iframe'); frame.src = './frame.html'; document.body.append(frame);
});
await expectViolation('object_blocked', ['object-src'], () => {
  const object = document.createElement('object'); object.data = './image.svg'; document.body.append(object);
});
await expectViolation('base_blocked', ['base-uri'], () => {
  const base = document.createElement('base'); base.href = 'https://example.invalid/'; document.head.append(base);
});
await expectViolation('data_blocked', ['img-src'], () => {
  const image = document.createElement('img'); image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'; document.body.append(image);
});
await expectViolation('blob_blocked', ['img-src'], () => {
  const image = document.createElement('img'); image.src = URL.createObjectURL(new Blob(['x'], { type: 'image/svg+xml' })); document.body.append(image);
});
const formLocation = location.href;
document.querySelector('form').requestSubmit();
await new Promise((resolve) => setTimeout(resolve, 100));
cspChecks.form_blocked = location.href === formLocation;
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
  csp_checks: Object.freeze({ ...cspChecks }),
}), '*');
`;

const lifecycleScenarioHtml = (kind: FixtureKind) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>lensX ${kind} Runtime Fixture</title>
    <script src="./early-runtime-probe.js"></script>
    <script src="./scenario.js"></script>
  </head>
  <body><main data-runtime-scenario="${kind}">${kind}</main></body>
</html>
`;

const lifecycleScenarioScript = (kind: FixtureKind) => `
(() => {
  const scenario = '${kind}';
  let sessionPort;
  window.addEventListener('message', (event) => {
    const value = event.data;
    if (event.source !== window.parent || event.ports.length !== 1 ||
        value?.contract_version !== '0.1.0' || value?.type !== 'lensx.plugin_runtime.bootstrap' ||
        typeof value?.nonce !== 'string') return;
    sessionPort = event.ports[0];
    if (scenario !== 'never-acknowledge' && scenario !== 'repeated-failure') {
      sessionPort.postMessage(Object.freeze({
        contract_version: '0.1.0', type: 'lensx.plugin_runtime.ready', nonce: value.nonce,
      }));
    }
    if (scenario === 'unexpected-disconnect') setTimeout(() => sessionPort.close(), 50);
  });
  window.addEventListener('pagehide', () => {
    if (scenario === 'host-reload') sessionPort?.close();
  });
  window.addEventListener('load', () => window.parent.postMessage(Object.freeze({
    namespace: 'lensx.plugin-runtime-security-lifecycle-fixture', scenario,
  }), '*'));
})();
`;

const lifecycleScenarioFixture = (kind: FixtureKind) => ({
  kind,
  file: `${kind}/runtime-${kind}.lxp`,
  coverage: [kind.replaceAll('-', '_'), 'host_owned_deadline', 'unified_terminal_cleanup'],
  files: [
    { path: 'manifest.json', bytes: manifestBytes(manifest(kind)) },
    { path: 'dist/early-runtime-probe.js', bytes: bytes(originProbe('normal')) },
    { path: 'dist/index.html', bytes: bytes(lifecycleScenarioHtml(kind)) },
    { path: 'dist/scenario.js', bytes: bytes(lifecycleScenarioScript(kind)) },
  ],
});

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
      'rpc_limit_rejection',
      'rpc_recovery_after_limit',
    ],
    files: [
      { path: 'manifest.json', bytes: manifestBytes(manifest('normal')) },
      { path: 'dist/classic.js', bytes: bytes("document.documentElement.dataset.classic = 'loaded';\n") },
      { path: 'dist/data.json', bytes: bytes('{"runtime":"fixture"}\n') },
      { path: 'dist/early-runtime-probe.js', bytes: bytes(originProbe('normal')) },
      {
        path: 'dist/image.svg',
        bytes: bytes(
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#5b8ff9"/></svg>\n',
        ),
      },
      { path: 'dist/index.html', bytes: bytes(normalHtml) },
      { path: 'dist/private-session.js', bytes: bytes(privateSessionConsumer) },
      { path: 'dist/report.js', bytes: bytes(normalReporter) },
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
      'csp_remote_script',
      'csp_inline_script',
      'csp_eval',
      'csp_connect',
      'csp_worker',
      'csp_frame',
      'csp_object',
      'csp_base',
      'csp_data',
      'csp_blob',
      'csp_form',
      'rpc_limit_rejection',
      'rpc_recovery_after_limit',
    ],
    files: [
      { path: 'manifest.json', bytes: manifestBytes(manifest('malicious')) },
      { path: 'dist/early-runtime-probe.js', bytes: bytes(originProbe('malicious')) },
      { path: 'dist/index.html', bytes: bytes(maliciousHtml) },
      { path: 'dist/malicious.js', bytes: bytes(maliciousModule) },
      { path: 'dist/private-session.js', bytes: bytes(privateSessionConsumer) },
      { path: 'dist/worker.js', bytes: bytes("self.postMessage('unexpected');\n") },
    ],
  },
  lifecycleScenarioFixture('slow-load'),
  lifecycleScenarioFixture('never-acknowledge'),
  lifecycleScenarioFixture('unexpected-disconnect'),
  lifecycleScenarioFixture('repeated-failure'),
  lifecycleScenarioFixture('host-reload'),
  lifecycleScenarioFixture('replacement'),
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
