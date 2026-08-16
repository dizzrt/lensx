import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const metadata = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
const aggregateName = 'check:replace-plugin-iframe-runtime-with-child-webview';
const aggregate = metadata.scripts?.[aggregateName] ?? '';
const archivePath = 'openspec/changes/archive/2026-08-16-replace-plugin-iframe-runtime-with-child-webview';
const requiredStages = [
  'check:plugin-contract',
  'check:plugin-sdk',
  'check:plugin-ui',
  'check:plugin-testkit',
  'check:official-config-lens-plugin',
  'check:official-plugin-release-pipeline',
  'evidence:plugin-child-webview-macos',
  'check:plugin-contract-docs',
  'check:no-dual-plugin-runtime',
  'openspec validate --all --strict --no-interactive',
] as const;
for (const stage of requiredStages) {
  if (!aggregate.includes(stage)) {
    throw new Error(`Child WebView change aggregate omitted ${stage}.`);
  }
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
  '`pnpm run check:replace-plugin-iframe-runtime-with-child-webview`',
  'public package consumer',
  'ConfigLens official candidate',
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
