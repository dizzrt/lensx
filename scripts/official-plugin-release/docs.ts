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
  const configEnPath = 'docs/en/development/config-lens.md';
  const configZhPath = 'docs/zh/development/config-lens.md';
  const en = read(root, enPath);
  const zh = read(root, zhPath);
  for (const [path, source] of [
    [enPath, en],
    [zhPath, zh],
    [configEnPath, read(root, configEnPath)],
    [configZhPath, read(root, configZhPath)],
  ] as const) {
    if (source.includes('plugins/official')) fail('docs-legacy-plugin-path', path);
  }
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
    'plugins/*',
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
    configEnPath,
    configZhPath,
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
    'check:official-config-lens-plugin',
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
    'runtime_evidence',
  ]) {
    if (!candidate.includes(field)) fail('docs-schema-drift', field);
  }
  const status = read(root, 'docs/en/plugin-development/index.md');
  if (!status.includes('official-release-pipeline') || !status.includes('ConfigLens is the first ordinary consumer')) {
    fail('docs-capability-status-drift', 'docs/en/plugin-development/index.md');
  }
  const configEn = read(root, configEnPath);
  const configZh = read(root, configZhPath);
  const normalizeWhitespace = (source: string) => source.replaceAll(/\s+/gu, ' ');
  for (const marker of [
    'ConfigLens',
    '@lensx/official-config-lens',
    'dev.lensx.config-lens',
    'monaco-editor',
    'YAML 1.2',
    'TOML 1.0',
    'XML 1.0',
    'check:official-config-lens-plugin',
  ]) {
    if (!configEn.includes(marker) || !configZh.includes(marker)) fail('config-lens-docs-drift', marker);
  }
  for (const marker of [
    'one editable Monaco model',
    'Format replaces its content directly',
    'each successful operation is one undoable editor edit',
    'Language choice remains explicit',
    '28-case visual matrix',
  ]) {
    if (!normalizeWhitespace(configEn).includes(marker))
      fail('config-lens-single-editor-docs-drift', `${configEnPath}: ${marker}`);
  }
  for (const marker of [
    '一个可编辑 Monaco model',
    '四种语言的格式化会直接',
    '每次成功操作都是一次可撤销的编辑器 edit',
    '语言始终由用户显式选择',
    '28 场景视觉矩阵',
  ]) {
    if (!normalizeWhitespace(configZh).includes(marker))
      fail('config-lens-single-editor-docs-drift', `${configZhPath}: ${marker}`);
  }
  for (const legacyInteraction of [
    'Formatting is preview-first and requires explicit application',
    'valid preview',
    'language-suggestion states',
    '格式化先生成预览并且必须显式应用',
    '语言建议状态',
  ]) {
    for (const path of [configEnPath, configZhPath]) {
      if (read(root, path).includes(legacyInteraction))
        fail('config-lens-legacy-interaction-drift', `${path}: ${legacyInteraction}`);
    }
  }
  const runtimeEnPath = 'docs/en/plugin-development/runtime-permissions-security.md';
  const runtimeZhPath = 'docs/zh/plugin-development/runtime-permissions-security.md';
  const runtimeEn = read(root, runtimeEnPath);
  const runtimeZh = read(root, runtimeZhPath);
  if (
    !normalizeWhitespace(configEn).includes('Hiding and restoring the Launcher does not close that Page') ||
    !normalizeWhitespace(runtimeEn).includes(
      'Temporarily hiding and restoring the Launcher window is not Page close or Runtime teardown',
    )
  ) {
    fail('config-lens-lifecycle-docs-drift', configEnPath);
  }
  if (
    !normalizeWhitespace(configZh).includes('隐藏和恢复 Launcher 不会关闭该 Page') ||
    !normalizeWhitespace(runtimeZh).includes('暂时隐藏和恢复 Launcher 窗口不等于关闭 Page 或 teardown Runtime')
  ) {
    fail('config-lens-lifecycle-docs-drift', configZhPath);
  }
  for (const forbiddenPersistenceClaim of [
    'restore the draft from localStorage',
    'restore the draft from IndexedDB',
    'restore the draft from Host persistence',
    '从 localStorage 恢复草稿',
    '从 IndexedDB 恢复草稿',
    '从 Host 持久化恢复草稿',
  ]) {
    for (const path of [configEnPath, configZhPath, runtimeEnPath, runtimeZhPath]) {
      if (read(root, path).includes(forbiddenPersistenceClaim))
        fail('config-lens-lifecycle-persistence-drift', `${path}: ${forbiddenPersistenceClaim}`);
    }
  }
  for (const forbidden of [
    'No product official plugin exists',
    'no product official plugin',
    '尚无产品官方插件',
    'JSON Tools',
    'JSON 工具',
    'Host built-in',
    'Host 内置',
    'trusted official plugin',
    '受信任官方插件',
    'signing is shipped',
    '签名已交付',
    'Marketplace is shipped',
    'Marketplace 已交付',
    'automatic updates are shipped',
    '自动更新已交付',
  ]) {
    for (const path of [
      enPath,
      zhPath,
      configEnPath,
      configZhPath,
      'docs/en/plugin-development/index.md',
      'docs/zh/plugin-development/index.md',
    ]) {
      if (read(root, path).includes(forbidden)) fail('config-lens-capability-overclaim', `${path}: ${forbidden}`);
    }
  }
};
