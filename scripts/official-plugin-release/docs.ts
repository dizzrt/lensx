import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const fail = (code: string, path: string): never => {
  throw new Error(`[official-release/${code}] ${path}`);
};

const markdownFiles = (directory: string, root = directory): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? markdownFiles(path, root)
        : extname(entry.name) === '.md'
          ? [relative(root, path).replaceAll('\\', '/')]
          : [];
    });

const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');

const checkRelativeLinks = (root: string, path: string): void => {
  const source = read(root, path);
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const target = match[1];
    if (target === undefined || /^(?:https?:|#|mailto:)/u.test(target)) continue;
    const file = target.split('#')[0];
    if (file === '' || !existsSync(resolve(root, dirname(path), file)))
      fail('docs-link-missing', `${path} -> ${target}`);
  }
};

export const checkOfficialPluginReleaseDocs = (rootDir: string): void => {
  const root = resolve(rootDir);
  const enFiles = markdownFiles(join(root, 'docs', 'en'));
  const zhFiles = markdownFiles(join(root, 'docs', 'zh'));
  if (JSON.stringify(enFiles) !== JSON.stringify(zhFiles)) fail('docs-mirror-drift', 'docs/en and docs/zh');

  const enPath = 'docs/en/development/official-plugin-release.md';
  const zhPath = 'docs/zh/development/official-plugin-release.md';
  const en = read(root, enPath);
  const zh = read(root, zhPath);
  if (!en.startsWith('# Official Plugin Release Pipeline\n')) fail('docs-title-drift', enPath);
  if (!zh.startsWith('# 官方插件发布流水线\n')) fail('docs-title-drift', zhPath);
  for (const marker of [
    'official/<plugin-id>/v<version>',
    '<plugin-id>-<version>.lxp',
    '<plugin-id>-<version>.lxp.sha256',
    '<plugin-id>-<version>.release.json',
    'pnpm run check:official-plugin-release-pipeline',
    'pnpm run version:official-plugins',
    'official-plugin-release',
    'plugins/official/*',
    'schema version `1`',
  ]) {
    if (!en.includes(marker) || !zh.includes(marker)) fail('docs-machine-interface-drift', marker);
  }
  for (const forbiddenClaim of [
    'signing is shipped',
    'Host official trust is shipped',
    '自动更新已交付',
    '签名已交付',
  ]) {
    if (en.includes(forbiddenClaim) || zh.includes(forbiddenClaim)) fail('docs-capability-overclaim', forbiddenClaim);
  }
  if (!read(root, 'docs/en/index.md').includes('(development/official-plugin-release.md)'))
    fail('docs-index-missing', 'docs/en/index.md');
  if (!read(root, 'docs/zh/index.md').includes('(development/official-plugin-release.md)'))
    fail('docs-index-missing', 'docs/zh/index.md');
  for (const path of [
    enPath,
    zhPath,
    'docs/en/index.md',
    'docs/zh/index.md',
    'docs/en/development/plugin-workspace.md',
    'docs/zh/development/plugin-workspace.md',
  ]) {
    checkRelativeLinks(root, path);
  }

  const metadata = JSON.parse(read(root, 'package.json')) as {
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const focusedGate = metadata.scripts?.['check:official-plugin-release-pipeline'];
  for (const stage of [
    'pnpm exec changeset status',
    'check:official-plugin-release-contract',
    'check:official-plugin-release-boundaries',
    'tests/official-plugin-release-pipeline.test.ts',
    'tests/official-plugin-runtime-e2e.test.tsx',
    'official_plugin_candidate_inspector',
    'check:official-plugin-release-workflows',
    'check:official-plugin-release-docs',
    'check:official-plugin-release-dry-run',
    'check:workspace-boundaries',
    'check:plugin-developer-cli',
    'check:plugin-package-format',
    'check:local-plugin-installation',
    'check:open-isolated-plugin-runtime',
  ]) {
    if (!focusedGate?.includes(stage)) fail('focused-gate-composition-drift', stage);
  }
  if (metadata.devDependencies?.['@changesets/cli'] !== '2.31.1') fail('changesets-version-drift', 'package.json');
  const installedChangesets = JSON.parse(read(root, 'node_modules/@changesets/cli/package.json')) as {
    engines?: Record<string, string>;
    license?: unknown;
    version?: unknown;
  };
  if (
    installedChangesets.version !== '2.31.1' ||
    installedChangesets.license !== 'MIT' ||
    (installedChangesets.engines?.node !== undefined && installedChangesets.engines.node.length === 0)
  ) {
    fail('changesets-package-review-drift', 'node_modules/@changesets/cli/package.json');
  }
  if (!read(root, 'pnpm-lock.yaml').includes("'@changesets/cli@2.31.1':"))
    fail('changesets-lock-drift', 'pnpm-lock.yaml');
  const config = JSON.parse(read(root, '.changeset/config.json')) as {
    ignore?: unknown;
    privatePackages?: { version?: unknown; tag?: unknown };
  };
  if (
    config.privatePackages?.version !== true ||
    config.privatePackages.tag !== false ||
    JSON.stringify(config.ignore) !==
      JSON.stringify(['@lensx/example-plugin-framework-neutral', '@lensx/example-plugin-react-semi'])
  )
    fail('changesets-private-policy-drift', '.changeset/config.json');
  for (const command of [...en.matchAll(/pnpm run ([a-z0-9:-]+)/gu)].map((match) => match[1])) {
    if (command === undefined || typeof metadata.scripts?.[command] !== 'string')
      fail('docs-command-missing', command ?? 'unknown');
  }
  for (const workflow of ['official-plugin-pr.yml', 'official-plugin-version.yml', 'official-plugin-candidate.yml']) {
    if (!existsSync(join(root, '.github', 'workflows', workflow))) fail('docs-workflow-missing', workflow);
  }
  const candidate = read(root, 'scripts/official-plugin-release/candidate.ts');
  for (const field of [
    'schema_version',
    'plugin_id',
    'release_tag',
    'source_commit',
    'source_ref',
    'workflow_run_url',
  ]) {
    if (!candidate.includes(field)) fail('docs-schema-drift', field);
  }
  const status = read(root, 'docs/en/plugin-development/index.md');
  if (!status.includes('official-release-pipeline') || !status.includes('No product official plugin exists')) {
    fail('docs-capability-status-drift', 'docs/en/plugin-development/index.md');
  }
};
