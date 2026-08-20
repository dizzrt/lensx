import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const paths = [
  'docs/en/development/plugin-project-template.md',
  'docs/zh/development/plugin-project-template.md',
] as const;
const sources = paths.map((path) => readFileSync(resolve(repositoryRoot, path), 'utf8'));
const diagnostics: string[] = [];
const commandIdentifiers = [
  'pnpm run gate -- plugin-project-template',
  'examples/plugins/framework-neutral',
  'examples/plugins/react-semi',
  '@lensx/plugin-sdk/webview',
  'lensx-plugin create',
  '@lensx/plugin-cli',
];

for (const [index, source] of sources.entries()) {
  const path = paths[index] ?? 'unknown';
  for (const identifier of commandIdentifiers) {
    if (!source.includes(identifier)) diagnostics.push(`template/docs-identifier-missing: ${path}: ${identifier}.`);
  }
  if (/no public plugin CLI|没有公共插件 CLI/u.test(source)) {
    diagnostics.push(`template/docs-cli-stale-claim: ${path}.`);
  }
  if (!/not a\s+complete desktop GUI E2E|不是完整桌面 GUI E2E/u.test(source)) {
    diagnostics.push(`template/docs-e2e-overclaim: ${path}.`);
  }
  if (!/not\s+permission tutorials|不是权限教程/u.test(source)) {
    diagnostics.push(`template/docs-permission-scope-missing: ${path}.`);
  }
}

const englishHeadings = [...sources[0].matchAll(/^## (.+)$/gmu)].length;
const chineseHeadings = [...sources[1].matchAll(/^## (.+)$/gmu)].length;
if (englishHeadings !== chineseHeadings) diagnostics.push('template/docs-heading-mirror-drift.');

if (diagnostics.length > 0) throw new Error(diagnostics.sort().join('\n'));
console.log('Plugin project template documentation scope and bilingual identifiers passed.');
