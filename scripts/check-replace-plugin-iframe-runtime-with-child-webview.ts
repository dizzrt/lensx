import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validationRegistry } from './validation/catalog.ts';
import { planGates } from './validation/runner.ts';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const aggregate = planGates(validationRegistry, ['plugin-child-webview-delivery']);
const archivePath = 'openspec/changes/archive/2026-08-16-replace-plugin-iframe-runtime-with-child-webview';
const requiredStages = [
  'plugin-contract',
  'plugin-sdk',
  'plugin-ui',
  'plugin-testkit',
  'ci-plugins',
  'ci-workflows',
  'plugin-contract-docs',
  'no-dual-plugin-runtime',
] as const;
for (const stage of requiredStages) {
  if (!aggregate.gateIds.includes(stage)) {
    throw new Error(`Child WebView change aggregate omitted ${stage}.`);
  }
}
if (!aggregate.steps.some((step) => step.description.includes('openspec validate --all --strict --no-interactive'))) {
  throw new Error('Child WebView delivery Gate omitted strict OpenSpec validation.');
}

const roadmap = read('plugin-roadmap.md');
const completeMarker = '- [x] **Task 7.2.1：将插件 Runtime 迁移为 Child WebView**';
const incompleteMarker = '- [ ] **Task 7.2.1：将插件 Runtime 迁移为 Child WebView**';
const complete = roadmap.includes(completeMarker);
const incomplete = roadmap.includes(incompleteMarker);
if (complete === incomplete) {
  throw new Error('Roadmap Child WebView migration must have exactly one checkbox state.');
}
for (const marker of [
  `**OpenSpec change**：[replace-plugin-iframe-runtime-with-child-webview](${archivePath}/)`,
  '`pnpm run gate -- plugin-child-webview-delivery`',
  'public package consumer',
  'ConfigLens public-boundary plugin CI',
  '真实 WKWebView matrix',
]) {
  if (!roadmap.includes(marker)) throw new Error(`Roadmap Child WebView migration omitted ${marker}.`);
}
if (!/strict\s+OpenSpec validation/u.test(roadmap)) {
  throw new Error('Roadmap Child WebView migration omitted strict OpenSpec validation.');
}

const tasks = read(`${archivePath}/tasks.md`);
const unchecked = [...tasks.matchAll(/^- \[ \] (\d+\.\d+) /gmu)].map((match) => match[1]);
if (complete && unchecked.some((task) => task !== '9.8')) {
  throw new Error(`Roadmap completion is premature; unchecked change tasks: ${unchecked.join(', ')}.`);
}
if (!complete && unchecked.length === 0) {
  throw new Error('Roadmap remains incomplete after every change task was verified.');
}

console.log('Child WebView change aggregate composition and roadmap convergence policy passed.');
