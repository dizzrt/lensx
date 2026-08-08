import { posix } from 'node:path';

export type DocumentationLocale = 'en' | 'zh';
export type CapabilityStatus = 'shipped' | 'conditional' | 'not-delivered';
export type HostApiProvider = 'base' | 'clipboard' | 'storage';

export interface DocumentationDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface DocumentationFile {
  readonly path: string;
  readonly source: string;
}

export interface DeveloperDocumentDefinition {
  readonly path: string;
  readonly requiredHeadings: Readonly<Record<DocumentationLocale, readonly string[]>>;
}

export interface CapabilityStatusFact {
  readonly id: string;
  readonly status: CapabilityStatus;
}

export interface ParsedMarkdownBlock {
  readonly content: string;
  readonly endLine: number;
  readonly language: string;
  readonly line: number;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface RunnableBlockValidationInput {
  readonly files: readonly DocumentationFile[];
  readonly projectSources: Readonly<Record<string, string>>;
  readonly rootScripts: ReadonlySet<string>;
}

export interface PublicPackageFact {
  readonly name: string;
  readonly version: string;
  readonly exports: readonly string[];
}

export interface HostApiCatalogFact {
  readonly method: string;
  readonly permission: string | null;
}

export interface HostApiCoverageFacts {
  readonly methods: readonly HostApiCatalogFact[];
  readonly permissions: readonly string[];
  readonly errorCodes: readonly string[];
  readonly hostApiVersion: string;
  readonly providers: Readonly<Record<string, HostApiProvider>>;
}

const developerRoot = 'plugin-development/';
const diagnosticLimit = 64;
const runnableLanguages = new Set([
  'bash',
  'javascript',
  'js',
  'json',
  'sh',
  'shell',
  'ts',
  'tsx',
  'typescript',
  'zsh',
]);
const blockClassifications = ['source', 'verify', 'non-runnable'] as const;
const allowedMetadata = new Set(['id', 'non-runnable', 'region', 'source', 'verify']);
const allowedVerifyGroups = new Set(['command', 'framework-neutral', 'json', 'react-semi']);
const privateReferencePattern =
  /(?:@tauri-apps\/|(?:^|[\s'"`])src\/app\/|src-tauri\/|tools\/plugin-package-format|file:\/\/|\/Users\/)/u;

export const DEVELOPER_DOCUMENTS: readonly DeveloperDocumentDefinition[] = Object.freeze([
  {
    path: 'index.md',
    requiredHeadings: {
      en: ['Capability status', 'Choose a tutorial', 'Reference path', 'Boundaries'],
      zh: ['能力状态', '选择教程', '参考路径', '边界'],
    },
  },
  {
    path: 'public-packages.md',
    requiredHeadings: {
      en: ['Package matrix', 'Dependency roles', 'Lifecycle boundaries', 'Non-goals'],
      zh: ['Package 矩阵', '依赖角色', '生命周期边界', '非目标'],
    },
  },
  {
    path: 'tooling-and-installation.md',
    requiredHeadings: {
      en: ['Prerequisites', 'CLI workflow', 'Development Mode', 'Local installation', 'Boundary comparison'],
      zh: ['前置条件', 'CLI 工作流', 'Development Mode', '本地安装', '边界对比'],
    },
  },
  {
    path: 'host-api.md',
    requiredHeadings: {
      en: ['Authority model', 'Method reference', 'Stable errors', 'Recovery'],
      zh: ['Authority 模型', 'Method 参考', '稳定错误', '恢复'],
    },
  },
  {
    path: 'runtime-permissions-security.md',
    requiredHeadings: {
      en: ['Runtime lifecycle', 'Context replacement', 'Permissions', 'Failure and recovery', 'Security boundary'],
      zh: ['Runtime 生命周期', 'Context replacement', '权限', '失败与恢复', '安全边界'],
    },
  },
  {
    path: 'compatibility-and-errors.md',
    requiredHeadings: {
      en: ['Version dimensions', 'Validation outcomes', 'Error taxonomy', 'Troubleshooting order', 'Not delivered'],
      zh: ['版本维度', '校验结论', '错误分类', '排障顺序', '尚未交付'],
    },
  },
  {
    path: 'tutorial-framework-neutral.md',
    requiredHeadings: {
      en: [
        'Prerequisites',
        'Create and install',
        'Manifest and resources',
        'Runtime lifecycle',
        'Test and build',
        'Development Mode',
        'Pack and install',
        'Negative paths',
      ],
      zh: [
        '前置条件',
        '创建与安装',
        'Manifest 与资源',
        'Runtime 生命周期',
        '测试与构建',
        'Development Mode',
        '打包与安装',
        '负向路径',
      ],
    },
  },
  {
    path: 'tutorial-react-semi.md',
    requiredHeadings: {
      en: [
        'Prerequisites',
        'Create and install',
        'Manifest and resources',
        'Runtime and UI lifecycle',
        'Locale theme and accessibility',
        'Test and build',
        'Development Mode',
        'Pack and install',
        'Negative paths',
      ],
      zh: [
        '前置条件',
        '创建与安装',
        'Manifest 与资源',
        'Runtime 与 UI 生命周期',
        '语言主题与可访问性',
        '测试与构建',
        'Development Mode',
        '打包与安装',
        '负向路径',
      ],
    },
  },
]);

export const CAPABILITY_STATUS_CATALOG: readonly CapabilityStatusFact[] = Object.freeze([
  { id: 'contract-package', status: 'shipped' },
  { id: 'sdk-package', status: 'shipped' },
  { id: 'ui-package', status: 'shipped' },
  { id: 'testkit-package', status: 'shipped' },
  { id: 'cli-package', status: 'shipped' },
  { id: 'local-installation', status: 'shipped' },
  { id: 'official-release-pipeline', status: 'shipped' },
  { id: 'development-mode', status: 'conditional' },
  { id: 'host-api-session', status: 'conditional' },
  { id: 'npm-publication', status: 'not-delivered' },
  { id: 'watch-hmr', status: 'not-delivered' },
  { id: 'signing', status: 'not-delivered' },
  { id: 'marketplace', status: 'not-delivered' },
  { id: 'remote-updates', status: 'not-delivered' },
]);

const bounded = (diagnostics: readonly DocumentationDiagnostic[]): DocumentationDiagnostic[] =>
  diagnostics
    .map((diagnostic) => ({
      ...diagnostic,
      message: diagnostic.message.replaceAll(/(?:file:\/\/)?\/Users\/[^\s:)]+/gu, '<absolute-path>').slice(0, 240),
      path: diagnostic.path.startsWith('/') ? '<absolute-path>' : diagnostic.path,
    }))
    .sort((left, right) => `${left.path}:${left.code}`.localeCompare(`${right.path}:${right.code}`))
    .slice(0, diagnosticLimit);

const diagnostic = (code: string, path: string, message: string): DocumentationDiagnostic => ({ code, path, message });

const markdownHeadings = (source: string): readonly { readonly level: number; readonly text: string }[] =>
  source.split(/\r?\n/u).flatMap((line) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*$/u.exec(line);
    return match?.[1] === undefined || match[2] === undefined
      ? []
      : [{ level: match[1].length, text: match[2].trim() }];
  });

const headingAnchor = (heading: string): string =>
  heading
    .toLocaleLowerCase('en-US')
    .replaceAll(/[`*_~]/gu, '')
    .replaceAll(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replaceAll(/\s+/gu, '-');

const markdownLinks = (source: string): readonly string[] =>
  [...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));

const parseJsonComments = <Value>(source: string, marker: string): readonly Value[] => {
  const pattern = new RegExp(`<!--\\s*${marker}\\s+(\\{[^\\n]*\\})\\s*-->`, 'gu');
  return [...source.matchAll(pattern)].flatMap((match) => {
    try {
      return [JSON.parse(match[1] ?? '') as Value];
    } catch {
      return [];
    }
  });
};

export const validateDeveloperDocumentation = (files: readonly DocumentationFile[]): DocumentationDiagnostic[] => {
  const diagnostics: DocumentationDiagnostic[] = [];
  const byPath = new Map(files.map((file) => [posix.normalize(file.path), file.source]));
  const localePaths = (locale: DocumentationLocale) =>
    [...byPath.keys()]
      .filter((path) => path.startsWith(`docs/${locale}/${developerRoot}`) && path.endsWith('.md'))
      .map((path) => path.slice(`docs/${locale}/${developerRoot}`.length))
      .sort();
  const englishPaths = localePaths('en');
  const chinesePaths = localePaths('zh');
  const requiredPaths = DEVELOPER_DOCUMENTS.map(({ path }) => path).sort();

  for (const path of requiredPaths) {
    for (const locale of ['en', 'zh'] as const) {
      const fullPath = `docs/${locale}/${developerRoot}${path}`;
      if (!byPath.has(fullPath))
        diagnostics.push(diagnostic('tree/path-missing', fullPath, 'Required developer document is missing.'));
    }
  }
  for (const path of new Set([...englishPaths, ...chinesePaths])) {
    if (!englishPaths.includes(path))
      diagnostics.push(diagnostic('mirror/english-missing', path, 'Chinese document has no English canonical mirror.'));
    if (!chinesePaths.includes(path))
      diagnostics.push(diagnostic('mirror/chinese-missing', path, 'English document has no Chinese mirror.'));
    if (!requiredPaths.includes(path))
      diagnostics.push(
        diagnostic('tree/unexpected-page', path, 'Developer documentation contains an undeclared page.'),
      );
  }

  for (const definition of DEVELOPER_DOCUMENTS) {
    for (const locale of ['en', 'zh'] as const) {
      const path = `docs/${locale}/${developerRoot}${definition.path}`;
      const source = byPath.get(path);
      if (source === undefined) continue;
      const headings = markdownHeadings(source);
      for (const required of definition.requiredHeadings[locale]) {
        if (!headings.some(({ text }) => text === required)) {
          diagnostics.push(diagnostic('heading/missing', path, `Required heading is missing: ${required}.`));
        }
      }
      if (privateReferencePattern.test(source)) {
        diagnostics.push(
          diagnostic(
            'boundary/private-reference',
            path,
            'Developer documentation contains an absolute or Host-private reference.',
          ),
        );
      }
      for (const link of markdownLinks(source)) {
        if (/^[a-z][a-z0-9+.-]*:/iu.test(link) || link.startsWith('/')) {
          diagnostics.push(
            diagnostic('link/not-relative', path, `Developer documentation link must be relative: ${link}.`),
          );
          continue;
        }
        const [targetPart = '', anchor] = link.split('#', 2);
        const targetPath =
          targetPart.length === 0 ? path : posix.normalize(posix.join(posix.dirname(path), targetPart));
        const target = byPath.get(targetPath);
        if (target === undefined) {
          diagnostics.push(diagnostic('link/broken-target', path, `Markdown target does not exist: ${link}.`));
          continue;
        }
        if (anchor !== undefined && anchor.length > 0) {
          const anchors = new Set(markdownHeadings(target).map(({ text }) => headingAnchor(text)));
          if (!anchors.has(decodeURIComponent(anchor))) {
            diagnostics.push(diagnostic('link/broken-anchor', path, `Markdown anchor does not exist: ${link}.`));
          }
        }
      }
    }
    const english = byPath.get(`docs/en/${developerRoot}${definition.path}`);
    const chinese = byPath.get(`docs/zh/${developerRoot}${definition.path}`);
    if (english !== undefined && chinese !== undefined) {
      const englishLevels = markdownHeadings(english).map(({ level }) => level);
      const chineseLevels = markdownHeadings(chinese).map(({ level }) => level);
      if (JSON.stringify(englishLevels) !== JSON.stringify(chineseLevels)) {
        diagnostics.push(
          diagnostic('mirror/heading-levels', definition.path, 'English and Chinese heading levels differ.'),
        );
      }
      const englishBlocks = parseMarkdownBlocks(english).map(({ content, language, metadata }) => ({
        content,
        language,
        metadata,
      }));
      const chineseBlocks = parseMarkdownBlocks(chinese).map(({ content, language, metadata }) => ({
        content,
        language,
        metadata,
      }));
      if (JSON.stringify(englishBlocks) !== JSON.stringify(chineseBlocks)) {
        diagnostics.push(
          diagnostic('mirror/code-blocks', definition.path, 'English and Chinese code blocks or metadata differ.'),
        );
      }
    }
  }

  const hubPath = 'docs/en/plugin-development/index.md';
  const hub = byPath.get(hubPath);
  if (hub !== undefined) {
    const facts = parseJsonComments<CapabilityStatusFact>(hub, 'lensx-capability-status');
    const byId = new Map(facts.map((fact) => [fact.id, fact.status]));
    for (const expected of CAPABILITY_STATUS_CATALOG) {
      const actual = byId.get(expected.id);
      if (actual === undefined)
        diagnostics.push(diagnostic('status/missing', hubPath, `Capability status is missing: ${expected.id}.`));
      else if (actual !== expected.status)
        diagnostics.push(
          diagnostic(
            'status/mismatch',
            hubPath,
            `Capability ${expected.id} must be ${expected.status}, not ${actual}.`,
          ),
        );
    }
    for (const fact of facts) {
      if (!CAPABILITY_STATUS_CATALOG.some(({ id }) => id === fact.id)) {
        diagnostics.push(diagnostic('status/unknown', hubPath, `Unknown capability status: ${fact.id}.`));
      }
    }
  }
  return bounded(diagnostics);
};

const parseMetadata = (
  information: string,
): { readonly language: string; readonly metadata: Record<string, string> } => {
  const tokens = information.trim().split(/\s+/u).filter(Boolean);
  const language = tokens[0]?.includes('=') ? '' : (tokens.shift() ?? '');
  const metadata: Record<string, string> = {};
  for (const token of tokens) {
    const separator = token.indexOf('=');
    if (separator <= 0 || separator === token.length - 1) metadata[`!invalid:${token}`] = '';
    else metadata[token.slice(0, separator)] = token.slice(separator + 1);
  }
  return { language, metadata };
};

export const parseMarkdownBlocks = (source: string): ParsedMarkdownBlock[] => {
  const blocks: ParsedMarkdownBlock[] = [];
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const opening = /^```([^`]*)$/u.exec(lines[index] ?? '');
    if (opening === null) continue;
    const start = index;
    const body: string[] = [];
    index += 1;
    while (index < lines.length && lines[index] !== '```') {
      body.push(lines[index] ?? '');
      index += 1;
    }
    const parsed = parseMetadata(opening[1] ?? '');
    blocks.push({
      content: body.join('\n'),
      endLine: Math.min(index + 1, lines.length),
      language: parsed.language,
      line: start + 1,
      metadata: Object.freeze(parsed.metadata),
    });
  }
  return blocks;
};

const regionSource = (source: string, region: string): string | undefined => {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === `// lensx-doc-region ${region}`);
  const end = lines.findIndex((line, index) => index > start && line.trim() === `// lensx-doc-endregion ${region}`);
  return start >= 0 && end > start ? lines.slice(start + 1, end).join('\n') : undefined;
};

const validateCommand = (line: string, rootScripts: ReadonlySet<string>): string | undefined => {
  const command = line.trim();
  if (command.length === 0 || command.startsWith('#')) return undefined;
  const tokens = command.split(/\s+/u);
  if (tokens[0] === 'pnpm' && tokens[1] === 'install') return undefined;
  if (tokens[0] === 'pnpm' && tokens[1] === 'run') {
    const script = tokens[2];
    const tutorialScripts = new Set(['build', 'check', 'test', 'typecheck']);
    return script !== undefined && (rootScripts.has(script) || tutorialScripts.has(script))
      ? undefined
      : `Unknown pnpm script: ${script ?? '<missing>'}.`;
  }
  if (tokens[0] === 'lensx-plugin') {
    const cliCommands = new Set(['--help', '--version', 'build', 'create', 'inspect', 'pack', 'validate']);
    return tokens[1] !== undefined && cliCommands.has(tokens[1])
      ? undefined
      : `Unknown lensx-plugin command: ${tokens[1] ?? '<missing>'}.`;
  }
  return `Unknown documentation command: ${tokens[0] ?? '<missing>'}.`;
};

export const validateRunnableBlocks = (input: RunnableBlockValidationInput): DocumentationDiagnostic[] => {
  const diagnostics: DocumentationDiagnostic[] = [];
  for (const file of input.files) {
    for (const block of parseMarkdownBlocks(file.source)) {
      const path = `${file.path}:${block.line}`;
      for (const key of Object.keys(block.metadata)) {
        if (!allowedMetadata.has(key))
          diagnostics.push(diagnostic('block/metadata-invalid', path, `Unknown fenced-block metadata: ${key}.`));
      }
      const classifications = blockClassifications.filter((key) => block.metadata[key] !== undefined);
      if (runnableLanguages.has(block.language) && classifications.length !== 1) {
        diagnostics.push(
          diagnostic(
            'block/classification',
            path,
            'Runnable fenced block must have exactly one source, verify, or non-runnable classification.',
          ),
        );
        continue;
      }
      if (classifications.length > 1) {
        diagnostics.push(
          diagnostic('block/classification', path, 'Fenced block has multiple validation classifications.'),
        );
        continue;
      }
      if (privateReferencePattern.test(block.content)) {
        diagnostics.push(
          diagnostic('block/private-reference', path, 'Fenced block contains an absolute or Host-private reference.'),
        );
      }
      const sourcePath = block.metadata.source;
      if (sourcePath !== undefined) {
        if (posix.isAbsolute(sourcePath) || sourcePath.split('/').includes('..')) {
          diagnostics.push(diagnostic('block/source-path', path, 'Source target must be project-relative.'));
          continue;
        }
        const rawSource = input.projectSources[sourcePath];
        if (rawSource === undefined) {
          diagnostics.push(diagnostic('block/source-missing', path, `Source target does not exist: ${sourcePath}.`));
          continue;
        }
        const expected =
          block.metadata.region === undefined ? rawSource.trimEnd() : regionSource(rawSource, block.metadata.region);
        if (expected === undefined)
          diagnostics.push(
            diagnostic('block/region-missing', path, `Source region does not exist: ${block.metadata.region}.`),
          );
        else if (block.content.trimEnd() !== expected)
          diagnostics.push(diagnostic('block/source-drift', path, 'Fenced block differs from its maintained source.'));
      }
      const verify = block.metadata.verify;
      if (verify !== undefined) {
        if (!allowedVerifyGroups.has(verify))
          diagnostics.push(diagnostic('block/verify-unknown', path, `Unknown verify group: ${verify}.`));
        else if (verify === 'json') {
          try {
            JSON.parse(block.content);
          } catch {
            diagnostics.push(diagnostic('block/json-invalid', path, 'JSON fenced block is invalid.'));
          }
        } else if (verify === 'command') {
          for (const line of block.content.split(/\r?\n/u)) {
            const message = validateCommand(line, input.rootScripts);
            if (message !== undefined) diagnostics.push(diagnostic('block/command-invalid', path, message));
          }
        }
      }
      if (
        block.metadata['non-runnable'] !== undefined &&
        !['illustrative', 'output'].includes(block.metadata['non-runnable'])
      ) {
        diagnostics.push(diagnostic('block/non-runnable-invalid', path, 'Unknown non-runnable classification.'));
      }
    }
  }
  return bounded(diagnostics);
};

export const validatePublicPackageCoverage = (
  source: string,
  packages: readonly PublicPackageFact[],
): DocumentationDiagnostic[] => {
  const path = 'docs/en/plugin-development/public-packages.md';
  const diagnostics: DocumentationDiagnostic[] = [];
  const entries = parseJsonComments<PublicPackageFact>(source, 'lensx-public-package');
  const documented = new Map(entries.map((entry) => [entry.name, entry]));
  for (const packageFact of packages) {
    const entry = documented.get(packageFact.name);
    if (entry === undefined)
      diagnostics.push(diagnostic('package/missing', path, `Public package is undocumented: ${packageFact.name}.`));
    else {
      if (entry.version !== packageFact.version)
        diagnostics.push(diagnostic('package/version', path, `Package version drifted: ${packageFact.name}.`));
      if (JSON.stringify([...entry.exports].sort()) !== JSON.stringify([...packageFact.exports].sort())) {
        diagnostics.push(diagnostic('package/exports', path, `Package exports drifted: ${packageFact.name}.`));
      }
    }
  }
  for (const entry of entries) {
    if (!packages.some(({ name }) => name === entry.name))
      diagnostics.push(diagnostic('package/extra', path, `Unknown public package is documented: ${entry.name}.`));
  }
  return bounded(diagnostics);
};

interface HostApiDocumentationEntry {
  readonly method: string;
  readonly permission: string | null;
  readonly provider: HostApiProvider;
  readonly version: string;
  readonly capability: 'session';
}

interface HostApiErrorDocumentationEntry {
  readonly version: string;
  readonly codes: readonly string[];
}

export const validateHostApiDocumentationCoverage = (
  source: string,
  facts: HostApiCoverageFacts,
): DocumentationDiagnostic[] => {
  const path = 'docs/en/plugin-development/host-api.md';
  const diagnostics: DocumentationDiagnostic[] = [];
  if (/(?:postMessage|MessagePort|nonce|targetOrigin|Tauri payload|entry_id)/u.test(source)) {
    diagnostics.push(
      diagnostic('host-api/private-wire', path, 'Host API documentation exposes a private wire or Host identity fact.'),
    );
  }
  const entries = parseJsonComments<HostApiDocumentationEntry>(source, 'lensx-host-api-method');
  const byMethod = new Map(entries.map((entry) => [entry.method, entry]));
  for (const method of facts.methods) {
    const entry = byMethod.get(method.method);
    if (entry === undefined) {
      diagnostics.push(diagnostic('host-api/missing', path, `Host API method is undocumented: ${method.method}.`));
      continue;
    }
    if (entry.permission !== method.permission)
      diagnostics.push(diagnostic('host-api/permission', path, `Permission drifted for ${method.method}.`));
    if (entry.provider !== facts.providers[method.method])
      diagnostics.push(diagnostic('host-api/provider', path, `Provider drifted for ${method.method}.`));
    if (entry.version !== facts.hostApiVersion)
      diagnostics.push(diagnostic('host-api/version', path, `Version drifted for ${method.method}.`));
    if (entry.capability !== 'session')
      diagnostics.push(
        diagnostic('host-api/capability', path, `Session capability classification drifted for ${method.method}.`),
      );
  }
  for (const entry of entries) {
    if (!facts.methods.some(({ method }) => method === entry.method))
      diagnostics.push(diagnostic('host-api/extra', path, `Unknown Host API method is documented: ${entry.method}.`));
  }
  const errors = parseJsonComments<HostApiErrorDocumentationEntry>(source, 'lensx-host-api-errors');
  const errorEntry = errors[0];
  if (errorEntry === undefined)
    diagnostics.push(diagnostic('host-api/errors-missing', path, 'Stable Host API error catalog is missing.'));
  else {
    if (errorEntry.version !== facts.hostApiVersion)
      diagnostics.push(diagnostic('host-api/error-version', path, 'Host API error catalog version drifted.'));
    if (JSON.stringify([...errorEntry.codes].sort()) !== JSON.stringify([...facts.errorCodes].sort())) {
      diagnostics.push(diagnostic('host-api/errors', path, 'Host API error catalog coverage drifted.'));
    }
  }
  const documentedPermissions = [
    ...new Set(entries.flatMap(({ permission }) => (permission === null ? [] : [permission]))),
  ].sort();
  if (JSON.stringify(documentedPermissions) !== JSON.stringify([...facts.permissions].sort())) {
    diagnostics.push(diagnostic('host-api/permission-catalog', path, 'Host API permission catalog coverage drifted.'));
  }
  return bounded(diagnostics);
};
