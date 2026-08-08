import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const hostCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' ipc: http://ipc.localhost; frame-src lensx-plugin:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const pluginCsp =
  "default-src 'self' https: data: blob:; script-src 'self' https: data: blob: 'wasm-unsafe-eval'; style-src 'self' https: data: blob: 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self' https: wss:; media-src 'self' https: data: blob:; worker-src 'self' https: data: blob:; child-src 'self' https: data: blob:; frame-src 'self' https: data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors tauri://localhost";
const pluginTauriDevCsp = pluginCsp.replace(
  'frame-ancestors tauri://localhost',
  'frame-ancestors http://localhost:40755',
);

const fail = (message: string): never => {
  throw new Error(`Plugin Runtime security lifecycle gate failed: ${message}`);
};

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
};

for (const configName of ['tauri.conf.json', 'plugin-runtime-host-csp-harness.conf.json']) {
  const config = asRecord(readJson(join(root, 'src-tauri', configName)), configName);
  const app = asRecord(config.app, `${configName}.app`);
  const security = asRecord(app.security, `${configName}.app.security`);
  if (security.csp !== hostCsp) fail(`${configName} Host CSP drifted`);
}
if (/script-src[^;]*(?:unsafe-inline|unsafe-eval|\*)/.test(hostCsp)) fail('Host script policy was widened');
if (/script-src[^;]*(?:'unsafe-inline'|'unsafe-eval'|\*)/.test(pluginCsp)) fail('Plugin script policy was widened');
if (/script-src[^;]*(?:'unsafe-inline'|'unsafe-eval'|\*)/.test(pluginTauriDevCsp)) {
  fail('Plugin tauri-dev script policy was widened');
}

const tauriConfig = asRecord(readJson(join(root, 'src-tauri', 'tauri.conf.json')), 'tauri.conf.json');
const tauriBuild = asRecord(tauriConfig.build, 'tauri.conf.json.build');
if (tauriBuild.devUrl !== 'http://localhost:40755') fail('Tauri development Host origin drifted');
const runtimePolicySource = readFileSync(join(root, 'src-tauri', 'src', 'plugin_runtime_security_policy.rs'), 'utf8');
if (!runtimePolicySource.includes(pluginTauriDevCsp)) fail('Plugin tauri-dev CSP drifted');
const iframeTransportSource = readFileSync(join(root, 'packages', 'plugin-sdk', 'src', 'iframe.ts'), 'utf8');
if (!iframeTransportSource.includes("'http://localhost:40755'")) fail('Plugin SDK development Host origin drifted');

const fixtureExpectations = asRecord(
  readJson(join(root, 'fixtures/plugin-iframe-runtime/expectations.json')),
  'fixture expectations',
);
const fixtureKinds = (fixtureExpectations.packages as Array<Record<string, unknown>>).map(({ kind }) => kind);
const requiredKinds = [
  'normal',
  'malicious',
  'slow-load',
  'never-acknowledge',
  'unexpected-disconnect',
  'repeated-failure',
  'host-reload',
  'replacement',
];
if (JSON.stringify(fixtureKinds) !== JSON.stringify(requiredKinds)) fail('canonical lifecycle fixture matrix drifted');

const lifecycleEvidence = asRecord(
  readJson(join(root, 'fixtures/plugin-runtime-security-lifecycle/evidence/macos/runtime-security-lifecycle.json')),
  'Runtime security lifecycle evidence',
);
if (lifecycleEvidence.evidence_version !== '0.1.0' || lifecycleEvidence.platform !== 'macos-wkwebview') {
  fail('Runtime security lifecycle evidence identity drifted');
}
const lifecycleChecks = asRecord(lifecycleEvidence.checks, 'Runtime security lifecycle evidence checks');
if (Object.keys(lifecycleChecks).length !== 12 || Object.values(lifecycleChecks).some((value) => value !== true)) {
  fail('Runtime security lifecycle real-WebView evidence contains a failed or unknown check');
}

const evidenceRoots = [
  'fixtures/plugin-iframe-runtime/evidence/macos',
  'fixtures/plugin-runtime-session/evidence/macos',
];
const forbiddenEvidenceKey =
  /^(?:url|uri|blocked_uri|origin|scope|nonce|port|path|payload|storage_value|token|exception|stack)$/i;
for (const evidenceRoot of evidenceRoots) {
  for (const name of readdirSync(join(root, evidenceRoot))) {
    if (!name.endsWith('.json')) continue;
    const visit = (value: unknown, keyPath: string): void => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          visit(item, `${keyPath}/${index}`);
        });
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, item] of Object.entries(value)) {
          if (forbiddenEvidenceKey.test(key)) fail(`${evidenceRoot}/${name} contains forbidden key ${keyPath}/${key}`);
          visit(item, `${keyPath}/${key}`);
        }
      }
    };
    visit(readJson(join(root, evidenceRoot, name)), '');
  }
}

const publicSourceRoot = join(root, 'packages');
const publicFiles: string[] = [];
const collect = (directory: string): void => {
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    if (statSync(absolute).isDirectory()) {
      if (name !== 'node_modules' && name !== 'dist') collect(absolute);
    } else if (/\.(?:ts|tsx|json)$/.test(name)) {
      publicFiles.push(absolute);
    }
  }
};
collect(publicSourceRoot);
const privateIdentifiers = [
  'PluginRuntimeLifecycle',
  'runtime_load_timeout',
  'runtime_handshake_timeout',
  'runtime_crash_loop',
];
for (const file of publicFiles) {
  const contents = readFileSync(file, 'utf8');
  for (const identifier of privateIdentifiers) {
    if (contents.includes(identifier)) fail(`${identifier} leaked into ${relative(root, file)}`);
  }
}

console.log('Checked Plugin Runtime security lifecycle CSP, fixtures, evidence bounds, and public boundaries.');
