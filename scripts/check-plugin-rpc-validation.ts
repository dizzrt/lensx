import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PLUGIN_RPC_V1_POLICY } from '../src/app/plugins/runtime/rpc-validation.ts';

const root = join(import.meta.dirname, '..');
const fail = (message: string): never => {
  throw new Error(`Plugin RPC validation drift: ${message}`);
};

if (
  JSON.stringify(PLUGIN_RPC_V1_POLICY) !==
  JSON.stringify({
    maxFrameBytes: 5_242_880,
    maxSemanticDepth: 32,
    maxFrameDepth: 36,
    maxVisitedNodes: 16_384,
    maxBatchRequestsPerFrame: 1,
    maxInFlightRequests: 32,
    hostExecutionDeadlineMs: 10_000,
  })
) {
  fail('the immutable v1 policy changed');
}

const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};
const focusedGate = metadata.scripts?.['check:plugin-rpc-validation'] ?? '';
for (const fragment of [
  'plugin-rpc-validation.test.ts',
  'plugin-sdk-transport-contract.test.ts',
  'plugin-child-webview-host-dispatcher.test.ts',
  'plugin-host-api-dispatcher.test.ts',
  'plugin-scoped-storage-contract.test.ts',
  'workspace-boundaries.test.ts',
  'packages/plugin-contract run test:pack',
  'packages/plugin-sdk run test:pack',
]) {
  if (!focusedGate.includes(fragment)) fail(`the focused gate omitted ${fragment}`);
}
if (Object.hasOwn(metadata.dependencies ?? {}, 'rpc-validation')) fail('a Runtime dependency was introduced');

for (const packageName of ['plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit']) {
  const packageRoot = join(root, 'packages', packageName);
  const packageMetadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    exports?: Record<string, unknown>;
  };
  const publicSurface = `${JSON.stringify(packageMetadata.exports)}\n${readFileSync(join(packageRoot, 'src/index.ts'), 'utf8')}`;
  if (/rpc-validation|PluginRpcDiagnostic|PLUGIN_RPC_V1_POLICY/u.test(publicSurface)) {
    fail(`${packageName} exposed the Host-private RPC policy or diagnostics`);
  }
}

const nativeRpc = readFileSync(join(root, 'src-tauri/src/plugin_child_webview_rpc.rs'), 'utf8');
if (!nativeRpc.includes('PluginChildWebviewRpcDiagnostic')) {
  fail('the production Child WebView RPC path omitted bounded diagnostics');
}

console.log('Checked immutable plugin RPC policy, focused gate composition, dependencies, and private exports.');
