import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toPosix = (path: string): string => path.split(sep).join('/');

const collectFiles = (directory: string, include: (path: string) => boolean): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return entry.name === 'dist' || entry.name === 'node_modules' ? [] : collectFiles(path, include);
      }
      return entry.isFile() && include(path) ? [path] : [];
    });

const markdownPaths = (locale: 'en' | 'zh'): string[] => {
  const root = resolve(repositoryRoot, 'docs', locale);
  return collectFiles(root, (path) => extname(path) === '.md').map((path) => toPosix(relative(root, path)));
};

const englishPaths = markdownPaths('en');
const chinesePaths = markdownPaths('zh');
if (JSON.stringify(englishPaths) !== JSON.stringify(chinesePaths)) {
  throw new Error('docs/en and docs/zh Markdown paths do not match.');
}

const markdownLinks = (source: string): string[] =>
  [...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)].map((match) => match[1]);
const headingLevels = (source: string): number[] =>
  source.split(/\r?\n/u).flatMap((line) => {
    const match = /^(#{1,6})\s/u.exec(line);
    return match?.[1] === undefined ? [] : [match[1].length];
  });

for (const path of englishPaths) {
  const englishFile = resolve(repositoryRoot, 'docs/en', path);
  const chineseFile = resolve(repositoryRoot, 'docs/zh', path);
  const english = readFileSync(englishFile, 'utf8');
  const chinese = readFileSync(chineseFile, 'utf8');
  if (JSON.stringify(headingLevels(english)) !== JSON.stringify(headingLevels(chinese))) {
    throw new Error(`Heading structure differs between English and Chinese: ${path}.`);
  }
  for (const [file, source] of [
    [englishFile, english],
    [chineseFile, chinese],
  ] as const) {
    for (const link of markdownLinks(source)) {
      if (/^(?:[a-z]+:|#)/iu.test(link)) {
        continue;
      }
      const target = decodeURIComponent(link.split('#')[0]);
      if (target.length > 0 && !existsSync(resolve(dirname(file), target))) {
        throw new Error(`Broken Markdown link in ${toPosix(relative(repositoryRoot, file))}: ${link}.`);
      }
    }
  }
}

for (const locale of ['en', 'zh'] as const) {
  const index = readFileSync(resolve(repositoryRoot, `docs/${locale}/index.md`), 'utf8');
  const linked = new Set(markdownLinks(index).map((link) => link.split('#')[0]));
  for (const path of markdownPaths(locale).filter((path) => path !== 'index.md')) {
    if (!linked.has(path)) {
      throw new Error(`docs/${locale}/index.md does not link ${path}.`);
    }
  }
}

const currentRoots = [
  'docs',
  'examples/plugin-contract-consumer',
  'openspec/specs',
  'packages/plugin-contract',
  'src',
  'src-tauri/src/plugin_manifest.rs',
  'tests',
];
const currentFiles = currentRoots.flatMap((path) => {
  const absolute = resolve(repositoryRoot, path);
  return existsSync(absolute) && extname(absolute) === ''
    ? collectFiles(absolute, () => true)
    : existsSync(absolute)
      ? [absolute]
      : [];
});
currentFiles.push(resolve(repositoryRoot, 'package.json'), resolve(repositoryRoot, 'plugin-roadmap.md'));

for (const file of currentFiles) {
  const source = readFileSync(file, 'utf8');
  for (const obsolete of ['1.0.0-dev', 'PluginManifestV0', 'validatePluginManifestV0', 'plugin-manifest-v0']) {
    if (source.includes(obsolete)) {
      throw new Error(`Obsolete Contract marker ${obsolete} remains in ${toPosix(relative(repositoryRoot, file))}.`);
    }
  }
}

const rootManifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
  version: string;
};
const contractManifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'packages/plugin-contract/package.json'), 'utf8'),
) as { version: string };
if (rootManifest.version !== '0.1.0' || contractManifest.version !== '0.1.0') {
  throw new Error('Root and Contract package versions must begin at 0.1.0.');
}

console.log(`Plugin Contract docs and version policy passed for ${englishPaths.length} bilingual documents.`);
