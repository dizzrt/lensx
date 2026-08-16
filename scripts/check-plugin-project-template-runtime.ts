import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(import.meta.dirname, '../tests/plugin-project-template-production.test.ts'),
  'utf8',
);
const diagnostics: string[] = [];

if (/from ['"][^'"]*plugin-testkit|FakePluginSdkTransport/u.test(source)) {
  diagnostics.push(
    'template/runtime-testkit-forbidden: production smoke must not import Testkit or fake SDK transport.',
  );
}
for (const symbol of [
  'packPluginPackage',
  'createPluginSurfaceProjectionService',
  'createPluginPageRuntimeResolver',
  'createPluginRuntimeLifecycleService',
  'createPluginChildWebviewHostDispatcherController',
  'createPluginWebviewTransport',
  'createPluginHostApiDispatcherFactory',
]) {
  if (!source.includes(symbol)) diagnostics.push(`template/runtime-production-component-missing: ${symbol}.`);
}
for (const forbidden of [
  'createPluginIframeTransport',
  'createPluginRuntimeSessionService',
  'attachPluginRuntimeTransport',
  'PluginRuntimeFrame',
  'MessageChannel',
  'MessagePort',
]) {
  if (source.includes(forbidden)) diagnostics.push(`template/runtime-legacy-component-present: ${forbidden}.`);
}
if (/complete (?:desktop|GUI) E2E|完整(?:桌面|GUI) E2E/iu.test(source)) {
  diagnostics.push('template/runtime-scope-overclaim: production-component smoke is not a complete desktop GUI E2E.');
}

if (diagnostics.length > 0) throw new Error(diagnostics.sort().join('\n'));
console.log(
  'Plugin template production Child WebView boundary passed without Testkit, fake transport, or GUI scope overclaim.',
);
