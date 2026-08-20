export interface NoDualRuntimeRule {
  readonly id: string;
  readonly marker: string;
}

export interface NoDualRuntimeDiagnostic {
  readonly line?: number;
  readonly marker: string;
  readonly path: string;
  readonly ruleId: string;
  readonly surface: string;
}

export interface NoDualRuntimeTextInput {
  readonly path: string;
  readonly surface: string;
  readonly text: string;
}

export const auditCurrentManifestProtocol = (
  path: string,
  surface: string,
  text: string,
): NoDualRuntimeDiagnostic[] => {
  const normalized = path.replaceAll('\\', '/');
  if (!normalized.endsWith('/manifest.json') && normalized !== 'manifest.json') return [];
  if (normalized.includes('/invalid/') || normalized.includes('/incompatible/')) return [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).manifest_version === undefined ||
    (value as Record<string, unknown>).manifest_version === '0.4.0'
  ) {
    return [];
  }
  return [
    {
      marker: `manifest_version ${JSON.stringify((value as Record<string, unknown>).manifest_version)}`,
      path: normalized,
      ruleId: 'legacy-manifest-protocol',
      surface,
    },
  ];
};

const joined = (...parts: readonly string[]): string => parts.join('');

export const NO_DUAL_RUNTIME_RULES: readonly NoDualRuntimeRule[] = Object.freeze([
  { id: 'legacy-frame-component', marker: joined('Plugin', 'Runtime', 'Frame') },
  { id: 'legacy-sdk-factory', marker: joined('createPlugin', 'Iframe', 'Transport') },
  { id: 'legacy-sdk-entry', marker: joined('@lensx/plugin-sdk', '/iframe') },
  { id: 'legacy-sdk-capability', marker: joined('plugin-sdk-', 'iframe-transport') },
  { id: 'legacy-runtime-capability', marker: joined('plugin-', 'iframe-runtime') },
  { id: 'legacy-runtime-gate', marker: joined('check:plugin-', 'iframe-runtime') },
  { id: 'legacy-session-gate', marker: joined('check:plugin-runtime-', 'session') },
  { id: 'legacy-security-gate', marker: joined('check:plugin-runtime-security-', 'lifecycle') },
  { id: 'legacy-runtime-harness', marker: joined('plugin_', 'iframe_runtime_harness') },
  { id: 'legacy-session-harness', marker: joined('plugin_runtime_', 'session_harness') },
  { id: 'legacy-session-service', marker: joined('PluginRuntime', 'SessionService') },
  { id: 'legacy-session-factory', marker: joined('createPluginRuntime', 'SessionService') },
  { id: 'legacy-port-adapter', marker: joined('attachPluginRuntime', 'Transport') },
  { id: 'legacy-descriptor-field', marker: joined('iframe', '_src') },
  { id: 'legacy-runtime-copy', marker: joined('iframe', ' Runtime') },
  { id: 'legacy-transport-copy', marker: joined('iframe', ' transport') },
  { id: 'legacy-transport-title', marker: joined('iframe', ' Transport') },
  { id: 'legacy-entry-copy', marker: joined('iframe', ' entry') },
]);

const CHILD_WEBVIEW_MIGRATION_CHANGE = 'replace-plugin-iframe-runtime-with-child-webview';
const NORMALIZED_CHANGE_ROOT = `openspec/changes/${CHILD_WEBVIEW_MIGRATION_CHANGE}`;

const exactChangeIdentifierAllowed = (rule: NoDualRuntimeRule, line: string): boolean =>
  rule.id === 'legacy-runtime-capability' && !line.replaceAll(CHILD_WEBVIEW_MIGRATION_CHANGE, '').includes(rule.marker);

const migrationArtifact = (path: string): boolean =>
  path === `${NORMALIZED_CHANGE_ROOT}/proposal.md` ||
  path === `${NORMALIZED_CHANGE_ROOT}/design.md` ||
  path === `${NORMALIZED_CHANGE_ROOT}/tasks.md` ||
  path === `${NORMALIZED_CHANGE_ROOT}/specs/plugin-iframe-runtime/spec.md` ||
  path === `${NORMALIZED_CHANGE_ROOT}/specs/plugin-sdk-iframe-transport/spec.md`;

const exactAllowlist: Readonly<Record<string, readonly string[] | 'all'>> = Object.freeze({
  'scripts/no-dual-plugin-runtime.ts': 'all',
  'docs/en/development/plugin-developer-cli.md': ['legacy-runtime-copy'],
  'docs/zh/development/plugin-developer-cli.md': ['legacy-runtime-copy'],
  'packages/plugin-cli/src/project.ts': ['legacy-sdk-entry'],
  'packages/plugin-cli/src/messages.ts': ['legacy-runtime-copy'],
  'packages/plugin-cli/dist/src/messages.d.ts': ['legacy-runtime-copy'],
  'packages/plugin-cli/dist/src/messages.js': ['legacy-runtime-copy'],
  'packages/plugin-cli/dist/src/project.js': ['legacy-sdk-entry'],
  'packages/plugin-cli/tests/create.test.ts': ['legacy-sdk-factory'],
  'packages/plugin-cli/tests/project.test.ts': ['legacy-sdk-entry', 'legacy-sdk-factory', 'legacy-runtime-copy'],
  'packages/plugin-contract/tests/fixtures/incompatible/cases.json': ['legacy-runtime-copy'],
  'public-tarballs/plugin-cli/package/dist/src/messages.d.ts': ['legacy-runtime-copy'],
  'public-tarballs/plugin-cli/package/dist/src/messages.js': ['legacy-runtime-copy'],
  'public-tarballs/plugin-cli/package/dist/src/project.js': ['legacy-sdk-entry'],
  'plugins/config-lens/scripts/check.mjs': ['legacy-sdk-entry', 'legacy-sdk-factory'],
  'plugins/config-lens/scripts/test-e2e.mjs': ['legacy-sdk-entry', 'legacy-sdk-factory'],
  'scripts/check-plugin-development-mode.ts': ['legacy-sdk-entry', 'legacy-sdk-factory'],
  'scripts/check-plugin-project-template-package.ts': ['legacy-sdk-entry', 'legacy-sdk-factory'],
  'scripts/check-plugin-developer-cli.ts': ['legacy-sdk-factory'],
  'scripts/check-plugin-project-template-runtime.ts': [
    'legacy-sdk-factory',
    'legacy-frame-component',
    'legacy-session-factory',
    'legacy-session-service',
    'legacy-port-adapter',
  ],
  'scripts/check-plugin-runtime-slot.ts': ['legacy-frame-component', 'legacy-runtime-copy'],
  'scripts/plugin-project-template-boundaries.ts': ['legacy-sdk-entry', 'legacy-sdk-factory'],
  'tests/fixtures/plugin-project-template-boundaries/legacy-iframe-runtime.json': [
    'legacy-sdk-entry',
    'legacy-sdk-factory',
    'legacy-runtime-copy',
  ],
});

const migrationContext =
  /\b(?:legacy|incompatible|unsupported|removed|removal|migration|old)\b|旧|不兼容|移除|迁移|不得|禁止|MUST NOT|REMOVED/u;

const normalizePath = (path: string): string => path.replaceAll('\\', '/').replace(/^\.\//u, '');

const markerAllowed = (path: string, rule: NoDualRuntimeRule, line: string): boolean => {
  const normalized = normalizePath(path);
  if (migrationArtifact(normalized)) return true;
  const allowed = exactAllowlist[normalized];
  if (allowed === 'all' || allowed?.includes(rule.id) === true) return true;
  return (
    (normalized.startsWith('docs/en/') ||
      normalized.startsWith('docs/zh/') ||
      normalized.startsWith(`${NORMALIZED_CHANGE_ROOT}/specs/`) ||
      normalized.startsWith('openspec/specs/')) &&
    migrationContext.test(line)
  );
};

export const auditNoDualRuntimePath = (path: string, surface: string): NoDualRuntimeDiagnostic[] => {
  const normalized = normalizePath(path);
  const segments = normalized.split('/');
  return NO_DUAL_RUNTIME_RULES.flatMap((rule) =>
    segments.includes(rule.marker) && !markerAllowed(normalized, rule, normalized)
      ? [{ marker: rule.marker, path: normalized, ruleId: rule.id, surface }]
      : [],
  );
};

export const auditNoDualRuntimeText = (input: NoDualRuntimeTextInput): NoDualRuntimeDiagnostic[] => {
  const normalized = normalizePath(input.path);
  const diagnostics: NoDualRuntimeDiagnostic[] = [];
  const lines = input.text.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const context = lines.slice(Math.max(0, index - 1), index + 2).join(' ');
    for (const rule of NO_DUAL_RUNTIME_RULES) {
      if (
        line.includes(rule.marker) &&
        !exactChangeIdentifierAllowed(rule, line) &&
        !markerAllowed(normalized, rule, context)
      ) {
        diagnostics.push({
          line: index + 1,
          marker: rule.marker,
          path: normalized,
          ruleId: rule.id,
          surface: input.surface,
        });
      }
    }
  }
  return diagnostics;
};

export const formatNoDualRuntimeDiagnostic = (diagnostic: NoDualRuntimeDiagnostic): string =>
  `[no-dual-runtime/${diagnostic.ruleId}] ${diagnostic.surface}:${diagnostic.path}${
    diagnostic.line === undefined ? '' : `:${diagnostic.line}`
  } contains ${JSON.stringify(diagnostic.marker)}.`;
