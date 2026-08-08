import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { inspectPluginPackage, packPluginPackage } from '../packages/plugin-cli/dist/src/package-format/index.js';

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
  manifest_version: '0.2.0',
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
    host_api: { min_version: '0.2.0', max_version_exclusive: '0.3.0' },
  },
  runtime: { kind: 'iframe', entry: 'dist/index.html' },
  contributes: {
    pages: [
      {
        id: 'home',
        title: { 'en-US': 'Runtime Fixture', 'zh-CN': '运行时夹具' },
        route: '/',
      },
      {
        id: 'route_probe',
        title: { 'en-US': 'Route Probe', 'zh-CN': '路由探测' },
        route: '/route-probe',
        parent_page_id: 'home',
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
      const workerRoundtrip = (url, options) => new Promise((resolve) => {
        let worker;
        try { worker = new Worker(url, options); } catch { resolve(false); return; }
        const timer = setTimeout(() => { worker.terminate(); resolve(false); }, 2000);
        worker.onmessage = ({ data }) => {
          clearTimeout(timer);
          worker.terminate();
          resolve(data === 'lensx-open-web-worker-ok');
        };
        worker.onerror = () => { clearTimeout(timer); worker.terminate(); resolve(false); };
        worker.postMessage('lensx-open-web-worker');
      });
      const workerBurstRoundtrip = (url, count = 128) => new Promise((resolve) => {
        let worker;
        try { worker = new Worker(url); } catch { resolve(false); return; }
        const received = new Set();
        const timer = setTimeout(() => { worker.terminate(); resolve(false); }, 3000);
        worker.onmessage = ({ data }) => {
          if (typeof data?.burst !== 'number') return;
          received.add(data.burst);
          if (received.size !== count) return;
          clearTimeout(timer);
          worker.terminate();
          resolve(true);
        };
        worker.onerror = () => { clearTimeout(timer); worker.terminate(); resolve(false); };
        for (let index = 0; index < count; index += 1) worker.postMessage({ burst: index });
      });
      const imageLoads = (url) => new Promise((resolve) => {
        const image = new Image();
        const timer = setTimeout(() => resolve(false), 2000);
        image.onload = () => { clearTimeout(timer); resolve(true); };
        image.onerror = () => { clearTimeout(timer); resolve(false); };
        image.src = url;
      });
      const indexedDbRoundtrip = () => new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 2000);
        const request = indexedDB.open('lensx-open-web-runtime', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('values');
        request.onerror = () => { clearTimeout(timer); resolve(false); };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('values', 'readwrite');
          const store = transaction.objectStore('values');
          store.put('ok', 'proof');
          const read = store.get('proof');
          read.onerror = () => { clearTimeout(timer); database.close(); resolve(false); };
          read.onsuccess = () => { clearTimeout(timer); database.close(); resolve(read.result === 'ok'); };
        };
      });
      const remoteModuleRoundtrip = async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const loaded = await Promise.race([
            import('https://esm.sh/is-number@7.0.0?bundle&target=es2022&attempt=' + attempt)
              .then(({ default: isNumber }) => isNumber(42) === true && isNumber('lensx') === false)
              .catch(() => false),
            new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
          ]);
          if (loaded) return true;
        }
        return false;
      };
      window.addEventListener('load', async () => {
        const blobWorkerUrl = URL.createObjectURL(new Blob([
          "self.onmessage = ({ data }) => self.postMessage(data === 'lensx-open-web-worker' ? 'lensx-open-web-worker-ok' : 'unexpected')",
        ], { type: 'text/javascript' }));
        const dataWorkerUrl = "data:text/javascript," + encodeURIComponent(
          "self.onmessage = ({ data }) => self.postMessage(data === 'lensx-open-web-worker' ? 'lensx-open-web-worker-ok' : 'unexpected')",
        );
        const blobImageUrl = URL.createObjectURL(new Blob([
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        ], { type: 'image/svg+xml' }));
        const dataImageUrl = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
        const persistentWorkerUrl = URL.createObjectURL(new Blob([
          "self.onmessage = () => setInterval(() => self.postMessage('heartbeat'), 20)",
        ], { type: 'text/javascript' }));
        let persistentWorker;
        const persistentWorkerStarted = new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 2000);
          try {
            persistentWorker = new Worker(persistentWorkerUrl);
            persistentWorker.onmessage = () => {
              clearTimeout(timer);
              window.parent.postMessage(Object.freeze({
                namespace: 'lensx.plugin-open-web-worker-heartbeat',
              }), '*');
              resolve(true);
            };
            persistentWorker.onerror = () => { clearTimeout(timer); resolve(false); };
            persistentWorker.postMessage('start');
          } catch { clearTimeout(timer); resolve(false); }
        });
        const [
          packageWorker,
          blobWorker,
          dataWorker,
          workerBurst,
          indexedDbAllowed,
          blobImage,
          dataImage,
          remoteModule,
          connectionChurn,
          activeWorker,
        ] =
          await Promise.all([
            workerRoundtrip('./worker.js'),
            workerRoundtrip(blobWorkerUrl),
            workerRoundtrip(dataWorkerUrl),
            workerBurstRoundtrip('./worker.js'),
            indexedDbRoundtrip(),
            imageLoads(blobImageUrl),
            imageLoads(dataImageUrl),
            remoteModuleRoundtrip(),
            Promise.all(Array.from({ length: 32 }, () =>
              fetch('./data.json', { cache: 'no-store' })
                .then((response) => response.json())
                .then((value) => value.runtime === 'fixture')
                .catch(() => false),
            )).then((results) => results.every(Boolean)),
            persistentWorkerStarted,
          ]);
        let fetchAllowed = false;
        try {
          const fetchResponse = await fetch('./data.json');
          fetchAllowed = fetchResponse.ok && (await fetchResponse.json()).runtime === 'fixture';
        } catch {}
        let websocketConstructed = false;
        try {
          const socket = new WebSocket('wss://example.invalid/lensx-open-web-probe');
          websocketConstructed = true;
          socket.onerror = () => socket.close();
        } catch {}
        const wasmAllowed = (await WebAssembly.instantiate(
          new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
        )).instance instanceof WebAssembly.Instance;
        URL.revokeObjectURL(blobWorkerUrl);
        URL.revokeObjectURL(blobImageUrl);
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
            package_worker_allowed: packageWorker,
            blob_worker_allowed: blobWorker,
            data_worker_allowed: dataWorker,
            worker_message_roundtrip: packageWorker && blobWorker && dataWorker,
            worker_message_burst: workerBurst,
            active_worker_started: activeWorker,
            fetch_allowed: fetchAllowed,
            fetch_connection_churn: connectionChurn,
            websocket_constructed: websocketConstructed,
            blob_content_allowed: blobImage,
            data_content_allowed: dataImage,
            wasm_allowed: wasmAllowed,
            indexeddb_roundtrip: indexedDbAllowed,
            author_csp_can_narrow: true,
            remote_module_allowed: remoteModule,
          }),
          unsupported_evidence: Object.freeze({
            shared_worker: typeof SharedWorker === 'undefined' ? 'unsupported_by_target_webview' : 'not_in_runtime_baseline',
            service_worker: 'not_available_for_scoped_custom-scheme-runtime',
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
cspChecks.inline_script_blocked = window.__LENSX_INLINE_SCRIPT_RAN__ !== true;
await expectViolation('eval_blocked', ['script-src'], () => { Function('return 1')(); });
await expectViolation('object_blocked', ['object-src'], () => {
  const object = document.createElement('object'); object.data = './image.svg'; document.body.append(object);
});
await expectViolation('base_blocked', ['base-uri'], () => {
  const base = document.createElement('base'); base.href = 'https://example.invalid/'; document.head.append(base);
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
      'package_worker',
      'blob_worker',
      'data_worker',
      'worker_message',
      'worker_message_burst',
      'fetch',
      'connection_churn',
      'remote_module',
      'websocket',
      'blob_content',
      'data_content',
      'wasm',
      'indexeddb',
      'author_owned_stricter_csp',
      'bounded_unsupported_evidence',
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
        path: 'dist/worker.js',
        bytes: bytes(
          "self.onmessage = ({ data }) => { if (typeof data?.burst === 'number') self.postMessage({ burst: data.burst }); else self.postMessage(data === 'lensx-open-web-worker' ? 'lensx-open-web-worker-ok' : 'unexpected'); };\n",
        ),
      },
      {
        path: 'dist/strict-policy.html',
        bytes: bytes(
          '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\'"><title>Author-owned stricter CSP</title>\n',
        ),
      },
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
      'csp_inline_script',
      'csp_eval',
      'csp_object',
      'csp_base',
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
  Buffer.from(`${JSON.stringify({ fixture_version: '0.2.0', packages: expectations }, null, 2)}\n`, 'utf8'),
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
