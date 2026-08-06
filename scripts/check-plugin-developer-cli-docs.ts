import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const mirroredPairs = [
  ['docs/en/development/plugin-developer-cli.md', 'docs/zh/development/plugin-developer-cli.md'],
  ['docs/en/development/plugin-workspace.md', 'docs/zh/development/plugin-workspace.md'],
  ['docs/en/development/plugin-project-template.md', 'docs/zh/development/plugin-project-template.md'],
  ['docs/en/development/validation.md', 'docs/zh/development/validation.md'],
  ['docs/en/architecture/plugin-package-format.md', 'docs/zh/architecture/plugin-package-format.md'],
  ['docs/en/index.md', 'docs/zh/index.md'],
] as const;
const diagnostics: string[] = [];

const read = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8');

for (const [englishPath, chinesePath] of mirroredPairs) {
  const english = read(englishPath);
  const chinese = read(chinesePath);
  const englishHeadings = [...english.matchAll(/^## (.+)$/gmu)].length;
  const chineseHeadings = [...chinese.matchAll(/^## (.+)$/gmu)].length;
  if (englishHeadings !== chineseHeadings) {
    diagnostics.push(`cli/docs-heading-mirror-drift: ${englishPath}: ${chinesePath}.`);
  }
}

const requiredByPath = new Map<string, readonly string[]>([
  [
    'docs/en/development/plugin-developer-cli.md',
    [
      '@lensx/plugin-cli',
      'lensx-plugin create',
      'pnpm@11',
      '`validate` and `inspect` are read-only',
      'Host independently re-reads and revalidates',
      'Development Mode',
      'signing',
      'pnpm run check:plugin-developer-cli',
    ],
  ],
  [
    'docs/zh/development/plugin-developer-cli.md',
    [
      '@lensx/plugin-cli',
      'lensx-plugin create',
      'pnpm@11',
      '`validate` 与 `inspect` 保持只读',
      'Host 会独立重新读取并复验',
      'Development Mode',
      '签名',
      'pnpm run check:plugin-developer-cli',
    ],
  ],
  ['docs/en/development/plugin-workspace.md', ['@lensx/plugin-cli', 'pnpm run check:plugin-developer-cli']],
  ['docs/zh/development/plugin-workspace.md', ['@lensx/plugin-cli', 'pnpm run check:plugin-developer-cli']],
  ['docs/en/development/plugin-project-template.md', ['lensx-plugin create', '@lensx/plugin-cli']],
  ['docs/zh/development/plugin-project-template.md', ['lensx-plugin create', '@lensx/plugin-cli']],
  ['docs/en/development/validation.md', ['## Plugin Developer CLI Validation', '6.5', '8.1']],
  ['docs/zh/development/validation.md', ['## Plugin Developer CLI 验证', '6.5', '8.1']],
  ['docs/en/architecture/plugin-package-format.md', ['TypeScript CLI', '@structured-world/structured-zstd@0.0.49']],
  ['docs/zh/architecture/plugin-package-format.md', ['TypeScript CLI', '@structured-world/structured-zstd@0.0.49']],
  ['docs/en/index.md', ['development/plugin-developer-cli.md']],
  ['docs/zh/index.md', ['development/plugin-developer-cli.md']],
]);

for (const [path, identifiers] of requiredByPath) {
  const source = read(path);
  for (const identifier of identifiers) {
    if (!source.includes(identifier)) diagnostics.push(`cli/docs-identifier-missing: ${path}: ${identifier}.`);
  }
}

for (const [englishPath, chinesePath] of mirroredPairs) {
  for (const path of [englishPath, chinesePath]) {
    const source = read(path);
    if (/tools\/plugin-package-format|no public plugin CLI|没有公共插件 CLI/u.test(source)) {
      diagnostics.push(`cli/docs-stale-claim: ${path}.`);
    }
  }
}

if (diagnostics.length > 0) throw new Error(diagnostics.sort().join('\n'));
console.log('Plugin developer CLI documentation scope and bilingual mirrors passed.');
