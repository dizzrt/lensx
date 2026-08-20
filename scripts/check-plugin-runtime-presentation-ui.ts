import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Runtime presentation UI drift: ${message}`);
};

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
for (const required of [
  'aria-live="polite"',
  'role="status"',
  'role="alert"',
  'autoFocus',
  "t('launcher.page.pluginRuntimeRetry')",
]) {
  if (!slot.includes(required)) fail(`accessible Host feedback omits ${required}`);
}
if (slot.includes('console.error') || slot.includes('error.message') || slot.includes('error.stack')) {
  fail('Runtime feedback can expose raw native diagnostics');
}

const english = JSON.parse(read('src/app/i18n/messages/en-US.json'));
const chinese = JSON.parse(read('src/app/i18n/messages/zh-CN.json'));
for (const locale of [english, chinese]) {
  const page = locale.launcher.page;
  for (const key of [
    'pluginRuntimeResolving',
    'pluginRuntimeLoading',
    'pluginRuntimeFailureTitle',
    'pluginRuntimeFailure',
    'pluginRuntimeRetry',
  ]) {
    if (!(key in page)) fail(`locale omits launcher.page.${key}`);
  }
}

const visual = read('scripts/verify-plugin-runtime-slot-visual.mjs');
for (const evidence of [
  "['en-US', 'zh-CN']",
  "['light', 'dark']",
  "['loading', 'failure']",
  'Page.captureScreenshot',
]) {
  if (!visual.includes(evidence)) fail(`visual evidence omits ${evidence}`);
}
const visualFixture = read('visual/plugin-runtime-slot/src/main.tsx');
for (const readinessMethod of ['readReadiness', 'waitReadiness']) {
  if (!visualFixture.includes(`${readinessMethod}:`)) {
    fail(`visual presentation controller omits ${readinessMethod}`);
  }
}

console.log('Checked bilingual accessible themed Runtime feedback and automated screenshot coverage.');
