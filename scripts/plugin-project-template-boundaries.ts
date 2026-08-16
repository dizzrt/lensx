import { isAbsolute, relative } from 'node:path';

export interface PluginTemplateBoundaryInput {
  readonly kind: 'framework-neutral' | 'react-semi';
  readonly metadata: {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
    readonly scripts?: Readonly<Record<string, string>>;
  };
  readonly moduleIdentifiers?: readonly string[];
  readonly repositoryRoot?: string;
  readonly resolvedDependencies?: readonly string[];
  readonly sources: Readonly<Record<string, string>>;
}

const lifecycleScripts = ['build', 'typecheck', 'test', 'check'] as const;
const protocolPattern = /^(?:workspace|file|link):/u;
const importPattern = /(?:from\s+|import\s*\(|import\s+)['"]([^'"]+)['"]/gu;

export const auditPluginTemplateBoundary = (input: PluginTemplateBoundaryInput): string[] => {
  const diagnostics = new Set<string>();
  const dependencies = { ...input.metadata.dependencies, ...input.metadata.devDependencies };

  for (const [name, version] of Object.entries(dependencies)) {
    if (protocolPattern.test(version) || isAbsolute(version) || version.startsWith('../')) {
      diagnostics.add(`template/dependency-protocol: ${name} must use an ordinary SemVer range.`);
    }
  }
  for (const script of lifecycleScripts) {
    if (input.metadata.scripts?.[script] === undefined) {
      diagnostics.add(`template/lifecycle-missing: missing ${script} script.`);
    }
  }

  for (const [file, source] of Object.entries(input.sources)) {
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] ?? '';
      if (specifier.startsWith('@tauri-apps/')) diagnostics.add(`template/tauri-import: ${file} imports ${specifier}.`);
      if (specifier.startsWith('src/') || specifier.includes('/src/app/')) {
        diagnostics.add(`template/host-private-import: ${file} imports ${specifier}.`);
      }
      if (specifier.includes('tools/plugin-package-format')) {
        diagnostics.add(`template/private-packer-import: ${file} imports ${specifier}.`);
      }
      if (/^@lensx\/(?:plugin-contract|plugin-sdk|plugin-testkit|plugin-ui)\/.+/u.test(specifier)) {
        if (specifier !== '@lensx/plugin-sdk/webview' && specifier !== '@lensx/plugin-ui/styles.css') {
          diagnostics.add(`template/non-public-import: ${file} imports unexported ${specifier}.`);
        }
      }
    }
  }

  const sourceGraph = Object.values(input.sources).join('\n');
  if (
    !sourceGraph.includes("from '@lensx/plugin-sdk/webview'") ||
    !sourceGraph.includes('createPluginWebviewTransport')
  ) {
    diagnostics.add('template/webview-transport-missing: production source must use the public WebView transport.');
  }
  for (const forbidden of [
    '@lensx/plugin-sdk/iframe',
    'createPluginIframeTransport',
    'MessageChannel',
    'MessagePort',
    'window.parent',
    'parent.postMessage',
    '__TAURI__',
    'getCurrentWindow',
    'setSize(',
    'setResizable(',
    'setPosition(',
    'setFullscreen(',
  ]) {
    if (sourceGraph.includes(forbidden)) {
      const boundary =
        forbidden.startsWith('set') || forbidden === '__TAURI__' || forbidden === 'getCurrentWindow'
          ? 'native-window-authority'
          : 'legacy-runtime-reference';
      diagnostics.add(`template/${boundary}: production source contains ${forbidden}.`);
    }
  }

  if (input.repositoryRoot !== undefined) {
    const normalizedRoot = input.repositoryRoot.replaceAll('\\', '/');
    for (const resolved of [...(input.resolvedDependencies ?? []), ...(input.moduleIdentifiers ?? [])]) {
      const normalized = resolved.replaceAll('\\', '/');
      if (normalized.startsWith(`${normalizedRoot}/node_modules/`)) {
        diagnostics.add(
          `template/repository-backlink: ${relative(input.repositoryRoot, resolved)} resolves through root node_modules.`,
        );
      }
    }
  }

  if (input.kind === 'framework-neutral') {
    const graph = JSON.stringify({ dependencies, modules: input.moduleIdentifiers ?? [] });
    if (/(?:react(?:-dom)?|@douyinfe\/semi-ui|@lensx\/plugin-ui)/u.test(graph)) {
      diagnostics.add(
        'template/framework-runtime: framework-neutral template contains a React or UI Runtime dependency.',
      );
    }
  }

  return [...diagnostics].sort();
};
