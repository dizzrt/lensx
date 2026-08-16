import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import {
  discoverWorkspaceMembers,
  type PackageManifest,
  REQUIRED_LIFECYCLE_SCRIPTS,
  readPackageManifest,
  SUPPORTED_WORKSPACE_PATTERNS,
  type WorkspaceMember,
} from './workspace-lifecycle.ts';

export const WORKSPACE_BOUNDARY_RULES = {
  crossMemberRelativeImport: 'workspace/cross-member-relative-import',
  disallowedMemberDependency: 'workspace/disallowed-member-dependency',
  hostInternalStyle: 'workspace/host-internal-style',
  hostPrivateDependency: 'workspace/host-private-dependency',
  hostPrivateImport: 'workspace/host-private-import',
  hostOfficialPluginSourceImport: 'workspace/host-official-plugin-source-import',
  hostTauriAdapter: 'workspace/host-tauri-adapter',
  authoringToolNodeBuiltin: 'workspace/authoring-tool-node-builtin',
  pluginAuthoringToolRuntimeImport: 'workspace/plugin-authoring-tool-runtime-import',
  pluginTauriDependency: 'workspace/plugin-tauri-dependency',
  pluginTauriImport: 'workspace/plugin-tauri-import',
  privateRoot: 'workspace/private-root',
  pluginPortableDependency: 'workspace/plugin-portable-dependency',
  requiredLifecycleScript: 'workspace/required-lifecycle-script',
  sdkUiReverseDependency: 'workspace/sdk-ui-reverse-dependency',
  testkitReverseDependency: 'workspace/testkit-reverse-dependency',
  undeclaredWorkspaceDependency: 'workspace/undeclared-workspace-dependency',
  undeclaredPackageExport: 'workspace/undeclared-package-export',
  workspacePatterns: 'workspace/supported-patterns',
  workspaceSemverLinking: 'workspace/semver-linking',
} as const;

export interface WorkspaceBoundaryDiagnostic {
  file: string;
  message: string;
  ruleId: (typeof WORKSPACE_BOUNDARY_RULES)[keyof typeof WORKSPACE_BOUNDARY_RULES];
  specifier: string;
}

interface AliasMapping {
  pattern: string;
  target: string;
}

const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const MODULE_CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.css', '.less'];
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
const TEMPLATE_PACKAGE_NAMES = new Set(['@lensx/example-plugin-framework-neutral', '@lensx/example-plugin-react-semi']);
const PUBLIC_AUTHORING_TOOL_NAMES = new Set(['@lensx/plugin-cli']);
const AUTHORING_TOOL_NODE_BUILTINS = new Set([
  'node:buffer',
  'node:child_process',
  'node:crypto',
  'node:fs',
  'node:fs/promises',
  'node:os',
  'node:path',
  'node:process',
  'node:url',
]);
const toPosixPath = (value: string): string => value.split(sep).join('/');

const isWithin = (parent: string, child: string): boolean => {
  const relativePath = relative(parent, child);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !relativePath.startsWith(sep))
  );
};

const diagnostic = (
  rootDir: string,
  ruleId: WorkspaceBoundaryDiagnostic['ruleId'],
  file: string,
  specifier: string,
  message: string,
): WorkspaceBoundaryDiagnostic => ({
  file: toPosixPath(relative(rootDir, file)),
  message,
  ruleId,
  specifier,
});

const readWorkspacePatterns = (rootDir: string): string[] => {
  const workspaceFile = join(rootDir, 'pnpm-workspace.yaml');
  if (!existsSync(workspaceFile)) {
    return [];
  }
  return readFileSync(workspaceFile, 'utf8')
    .split(/\r?\n/u)
    .flatMap((line) => {
      const match = /^\s*-\s+['"]?([^'"]+)['"]?\s*$/u.exec(line);
      return match?.[1] === undefined ? [] : [match[1]];
    });
};

const loadAliases = (rootDir: string): AliasMapping[] => {
  const configPath = join(rootDir, 'tsconfig.json');
  if (!existsSync(configPath)) {
    return [];
  }
  const result = ts.readConfigFile(configPath, ts.sys.readFile);
  if (result.error !== undefined) {
    return [];
  }
  const paths = (result.config.compilerOptions?.paths ?? {}) as Record<string, string[]>;
  const baseUrl = resolve(rootDir, result.config.compilerOptions?.baseUrl ?? '.');
  return Object.entries(paths)
    .flatMap(([pattern, targets]) =>
      targets.slice(0, 1).map((target) => ({
        pattern,
        target: resolve(baseUrl, target),
      })),
    )
    .sort((left, right) => left.pattern.localeCompare(right.pattern));
};

const resolveAlias = (specifier: string, aliases: readonly AliasMapping[]): string | undefined => {
  for (const alias of aliases) {
    const wildcardIndex = alias.pattern.indexOf('*');
    if (wildcardIndex === -1) {
      if (specifier === alias.pattern) {
        return alias.target;
      }
      continue;
    }
    const prefix = alias.pattern.slice(0, wildcardIndex);
    const suffix = alias.pattern.slice(wildcardIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
      continue;
    }
    const wildcard = specifier.slice(prefix.length, specifier.length - suffix.length);
    return alias.target.replace('*', wildcard);
  }
  return undefined;
};

const collectSourceFiles = (directory: string): string[] => {
  if (!existsSync(directory)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
};

const collectMemberSourceFiles = (member: WorkspaceMember): string[] => {
  const files = collectSourceFiles(member.rootDir);
  if (!PUBLIC_AUTHORING_TOOL_NAMES.has(member.name)) return files;

  const packagedTemplateRoot = join(member.rootDir, 'templates');
  return files.filter((file) => !isWithin(packagedTemplateRoot, file));
};

const collectModuleSpecifiers = (file: string): string[] => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const specifiers = new Set<string>();
  const addStringLiteral = (node: ts.Node | undefined): void => {
    if (node !== undefined && ts.isStringLiteralLike(node)) {
      specifiers.add(node.text);
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addStringLiteral(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        addStringLiteral(node.arguments[0]);
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addStringLiteral(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...specifiers].sort();
};

const declaredDependencies = (manifest: PackageManifest): Map<string, string> =>
  new Map(
    DEPENDENCY_SECTIONS.flatMap((section) => Object.entries(manifest[section] ?? {})).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

const packageNameFromSpecifier = (specifier: string): string => {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
};

const memberDependencyAllowed = (consumer: WorkspaceMember, target: WorkspaceMember): boolean =>
  target.kind === 'public-package' &&
  (consumer.kind === 'public-package' || consumer.kind === 'official-plugin' || consumer.kind === 'example-plugin');

const packageSubpathIsExported = (manifest: PackageManifest, packageName: string, specifier: string): boolean => {
  const subpath = specifier === packageName ? '.' : `.${specifier.slice(packageName.length)}`;
  return typeof manifest.exports === 'string' ? subpath === '.' : Object.hasOwn(manifest.exports ?? {}, subpath);
};

const memberContainingPath = (members: readonly WorkspaceMember[], targetPath: string): WorkspaceMember | undefined =>
  members.find((member) => isWithin(member.rootDir, targetPath));

const validateHostSourceSpecifier = (
  rootDir: string,
  members: readonly WorkspaceMember[],
  sourceFile: string,
  specifier: string,
  aliases: readonly AliasMapping[],
): WorkspaceBoundaryDiagnostic[] => {
  const packageName =
    !specifier.startsWith('.') && !specifier.startsWith('/') ? packageNameFromSpecifier(specifier) : undefined;
  const packageTarget = members.find((member) => member.kind === 'official-plugin' && member.name === packageName);
  const resolvedTarget =
    resolveAlias(specifier, aliases) ??
    (specifier.startsWith('.') ? resolve(dirname(sourceFile), specifier) : undefined);
  const sourceTarget =
    resolvedTarget === undefined
      ? undefined
      : members.find((member) => member.kind === 'official-plugin' && isWithin(member.rootDir, resolvedTarget));
  if (packageTarget === undefined && sourceTarget === undefined) return [];
  return [
    diagnostic(
      rootDir,
      WORKSPACE_BOUNDARY_RULES.hostOfficialPluginSourceImport,
      sourceFile,
      specifier,
      'Host source must consume installed plugin registrations rather than import official plugin code.',
    ),
  ];
};

const resolveModuleCandidate = (candidate: string): string => {
  if (existsSync(candidate)) {
    return candidate;
  }
  for (const extension of MODULE_CANDIDATE_EXTENSIONS) {
    if (existsSync(`${candidate}${extension}`)) {
      return `${candidate}${extension}`;
    }
    const indexCandidate = join(candidate, `index${extension}`);
    if (existsSync(indexCandidate)) {
      return indexCandidate;
    }
  }
  return candidate;
};

const isHostStylePath = (rootDir: string, targetPath: string): boolean =>
  isWithin(join(rootDir, 'src', 'styles'), targetPath) ||
  ['.css', '.less', '.scss', '.sass'].includes(extname(targetPath));

const isHostTauriAdapter = (targetPath: string): boolean => {
  const candidate = resolveModuleCandidate(targetPath);
  return existsSync(candidate) && readFileSync(candidate, 'utf8').includes('@tauri-apps/');
};

const validatePackageDependencies = (
  rootDir: string,
  rootManifest: PackageManifest,
  members: readonly WorkspaceMember[],
): WorkspaceBoundaryDiagnostic[] => {
  const diagnostics: WorkspaceBoundaryDiagnostic[] = [];
  const membersByName = new Map(members.map((member) => [member.name, member]));

  for (const member of members) {
    for (const [dependencyName, dependencyVersion] of declaredDependencies(member.manifest)) {
      if (dependencyName === rootManifest.name) {
        diagnostics.push(
          diagnostic(
            rootDir,
            WORKSPACE_BOUNDARY_RULES.hostPrivateDependency,
            member.manifestPath,
            dependencyName,
            'Workspace members must not depend on the private root Host package.',
          ),
        );
      }
      if (
        (member.kind === 'official-plugin' || member.kind === 'example-plugin') &&
        dependencyName.startsWith('@tauri-apps/')
      ) {
        diagnostics.push(
          diagnostic(
            rootDir,
            WORKSPACE_BOUNDARY_RULES.pluginTauriDependency,
            member.manifestPath,
            dependencyName,
            'Plugin packages must not declare Tauri dependencies.',
          ),
        );
      }

      const targetMember = membersByName.get(dependencyName);
      const expectedPortableVersion =
        targetMember?.kind === 'public-package' && typeof targetMember.manifest.version === 'string'
          ? `^${targetMember.manifest.version}`
          : undefined;
      if (
        TEMPLATE_PACKAGE_NAMES.has(member.name) &&
        dependencyName.startsWith('@lensx/plugin-') &&
        dependencyVersion !== expectedPortableVersion
      ) {
        diagnostics.push(
          diagnostic(
            rootDir,
            WORKSPACE_BOUNDARY_RULES.pluginPortableDependency,
            member.manifestPath,
            `${dependencyName}@${dependencyVersion}`,
            'Plugin project templates must use the current public lensX package version with an ordinary caret range.',
          ),
        );
      }
      if (member.name === '@lensx/plugin-sdk' && dependencyName === '@lensx/plugin-ui') {
        diagnostics.push(
          diagnostic(
            rootDir,
            WORKSPACE_BOUNDARY_RULES.sdkUiReverseDependency,
            member.manifestPath,
            dependencyName,
            'The framework-neutral Plugin SDK must not depend on the optional Plugin UI package.',
          ),
        );
      }
      if (
        (member.name === '@lensx/plugin-contract' || member.name === '@lensx/plugin-sdk') &&
        dependencyName === '@lensx/plugin-testkit'
      ) {
        diagnostics.push(
          diagnostic(
            rootDir,
            WORKSPACE_BOUNDARY_RULES.testkitReverseDependency,
            member.manifestPath,
            dependencyName,
            'Plugin Contract and Plugin SDK must not depend on the higher-level Plugin Testkit.',
          ),
        );
      }
      if (targetMember !== undefined && !memberDependencyAllowed(member, targetMember)) {
        diagnostics.push(
          diagnostic(
            rootDir,
            WORKSPACE_BOUNDARY_RULES.disallowedMemberDependency,
            member.manifestPath,
            dependencyName,
            'Workspace members may depend only on public packages.',
          ),
        );
      }

      const localMatch = /^(?:file|link):(.+)$/u.exec(dependencyVersion);
      if (localMatch?.[1] !== undefined) {
        const localTarget = resolve(member.rootDir, localMatch[1]);
        if (localTarget === rootDir) {
          diagnostics.push(
            diagnostic(
              rootDir,
              WORKSPACE_BOUNDARY_RULES.hostPrivateDependency,
              member.manifestPath,
              `${dependencyName}@${dependencyVersion}`,
              'Workspace members must not depend on the private root Host path.',
            ),
          );
        }
      }
    }
  }

  return diagnostics;
};

const validateSourceSpecifier = (
  rootDir: string,
  rootManifest: PackageManifest,
  members: readonly WorkspaceMember[],
  member: WorkspaceMember,
  sourceFile: string,
  specifier: string,
  aliases: readonly AliasMapping[],
): WorkspaceBoundaryDiagnostic[] => {
  const diagnostics: WorkspaceBoundaryDiagnostic[] = [];
  const isPlugin = member.kind === 'official-plugin' || member.kind === 'example-plugin';
  const packageName =
    !specifier.startsWith('.') && !specifier.startsWith('/') ? packageNameFromSpecifier(specifier) : undefined;

  if (
    PUBLIC_AUTHORING_TOOL_NAMES.has(member.name) &&
    specifier.startsWith('node:') &&
    !AUTHORING_TOOL_NODE_BUILTINS.has(specifier)
  ) {
    diagnostics.push(
      diagnostic(
        rootDir,
        WORKSPACE_BOUNDARY_RULES.authoringToolNodeBuiltin,
        sourceFile,
        specifier,
        'Public authoring tools may import only their reviewed Node built-ins.',
      ),
    );
  }
  if (isPlugin && packageName !== undefined && PUBLIC_AUTHORING_TOOL_NAMES.has(packageName)) {
    diagnostics.push(
      diagnostic(
        rootDir,
        WORKSPACE_BOUNDARY_RULES.pluginAuthoringToolRuntimeImport,
        sourceFile,
        specifier,
        'Plugin Runtime source must invoke the authoring CLI through package scripts rather than import it.',
      ),
    );
  }

  if (isPlugin && specifier.startsWith('@tauri-apps/')) {
    diagnostics.push(
      diagnostic(
        rootDir,
        WORKSPACE_BOUNDARY_RULES.pluginTauriImport,
        sourceFile,
        specifier,
        'Plugin source must not import Tauri APIs.',
      ),
    );
  }
  if (packageName !== undefined && packageName === rootManifest.name) {
    diagnostics.push(
      diagnostic(
        rootDir,
        WORKSPACE_BOUNDARY_RULES.hostPrivateImport,
        sourceFile,
        specifier,
        'Workspace source must not import the private root Host package.',
      ),
    );
  }

  const targetByPackageName =
    packageName === undefined ? undefined : members.find((candidate) => candidate.name === packageName);
  if (targetByPackageName !== undefined && targetByPackageName !== member) {
    if (member.name === '@lensx/plugin-sdk' && targetByPackageName.name === '@lensx/plugin-ui') {
      diagnostics.push(
        diagnostic(
          rootDir,
          WORKSPACE_BOUNDARY_RULES.sdkUiReverseDependency,
          sourceFile,
          specifier,
          'The framework-neutral Plugin SDK must not import the optional Plugin UI package.',
        ),
      );
    }
    if (
      (member.name === '@lensx/plugin-contract' || member.name === '@lensx/plugin-sdk') &&
      targetByPackageName.name === '@lensx/plugin-testkit'
    ) {
      diagnostics.push(
        diagnostic(
          rootDir,
          WORKSPACE_BOUNDARY_RULES.testkitReverseDependency,
          sourceFile,
          specifier,
          'Plugin Contract and Plugin SDK must not import the higher-level Plugin Testkit.',
        ),
      );
    }
    if (!declaredDependencies(member.manifest).has(targetByPackageName.name)) {
      diagnostics.push(
        diagnostic(
          rootDir,
          WORKSPACE_BOUNDARY_RULES.undeclaredWorkspaceDependency,
          sourceFile,
          specifier,
          'Workspace package imports must be declared in the consuming package manifest.',
        ),
      );
    }
    if (!memberDependencyAllowed(member, targetByPackageName)) {
      diagnostics.push(
        diagnostic(
          rootDir,
          WORKSPACE_BOUNDARY_RULES.disallowedMemberDependency,
          sourceFile,
          specifier,
          'Workspace members may import only public workspace package exports.',
        ),
      );
    }
    if (!packageSubpathIsExported(targetByPackageName.manifest, targetByPackageName.name, specifier)) {
      diagnostics.push(
        diagnostic(
          rootDir,
          WORKSPACE_BOUNDARY_RULES.undeclaredPackageExport,
          sourceFile,
          specifier,
          'Workspace packages may import only declared package exports.',
        ),
      );
    }
  }
  if (targetByPackageName !== undefined) {
    return diagnostics;
  }

  const aliasTarget = resolveAlias(specifier, aliases);
  const resolvedTarget =
    aliasTarget ?? (specifier.startsWith('.') ? resolve(dirname(sourceFile), specifier) : undefined);
  if (resolvedTarget === undefined) {
    return diagnostics;
  }

  const targetMember = memberContainingPath(members, resolvedTarget);
  if (targetMember !== undefined && targetMember !== member) {
    diagnostics.push(
      diagnostic(
        rootDir,
        WORKSPACE_BOUNDARY_RULES.crossMemberRelativeImport,
        sourceFile,
        specifier,
        `Workspace members must use ${JSON.stringify(targetMember.name)} package exports instead of a source path.`,
      ),
    );
    return diagnostics;
  }

  if (
    (isWithin(join(rootDir, 'src'), resolvedTarget) ||
      isWithin(join(rootDir, 'src-tauri'), resolvedTarget) ||
      isWithin(join(rootDir, 'tools'), resolvedTarget) ||
      isWithin(join(rootDir, 'vendor', 'frame-aware-navigation'), resolvedTarget) ||
      isWithin(join(rootDir, 'fixtures', 'frame-aware-webview-navigation'), resolvedTarget) ||
      isWithin(join(rootDir, 'scripts'), resolvedTarget)) &&
    !isWithin(member.rootDir, resolvedTarget)
  ) {
    if (isHostStylePath(rootDir, resolvedTarget)) {
      diagnostics.push(
        diagnostic(
          rootDir,
          WORKSPACE_BOUNDARY_RULES.hostInternalStyle,
          sourceFile,
          specifier,
          'Workspace members must not import Host-internal styles.',
        ),
      );
    } else if (isHostTauriAdapter(resolvedTarget)) {
      diagnostics.push(
        diagnostic(
          rootDir,
          WORKSPACE_BOUNDARY_RULES.hostTauriAdapter,
          sourceFile,
          specifier,
          'Workspace members must not import Host Tauri adapters.',
        ),
      );
    } else {
      diagnostics.push(
        diagnostic(
          rootDir,
          WORKSPACE_BOUNDARY_RULES.hostPrivateImport,
          sourceFile,
          specifier,
          'Workspace members must not import Host-private source.',
        ),
      );
    }
  }

  return diagnostics;
};

export const checkWorkspaceBoundaries = (rootDir: string): WorkspaceBoundaryDiagnostic[] => {
  const resolvedRoot = resolve(rootDir);
  const diagnostics: WorkspaceBoundaryDiagnostic[] = [];
  const rootManifestPath = join(resolvedRoot, 'package.json');
  const rootManifest = readPackageManifest(rootManifestPath);
  if (rootManifest.private !== true) {
    diagnostics.push(
      diagnostic(
        resolvedRoot,
        WORKSPACE_BOUNDARY_RULES.privateRoot,
        rootManifestPath,
        String(rootManifest.private),
        'The root Host package must remain private.',
      ),
    );
  }

  const actualPatterns = readWorkspacePatterns(resolvedRoot);
  if (
    actualPatterns.length !== SUPPORTED_WORKSPACE_PATTERNS.length ||
    actualPatterns.some((pattern, index) => pattern !== SUPPORTED_WORKSPACE_PATTERNS[index])
  ) {
    diagnostics.push(
      diagnostic(
        resolvedRoot,
        WORKSPACE_BOUNDARY_RULES.workspacePatterns,
        join(resolvedRoot, 'pnpm-workspace.yaml'),
        actualPatterns.join(', '),
        `Workspace patterns must be exactly: ${SUPPORTED_WORKSPACE_PATTERNS.join(', ')}.`,
      ),
    );
  }
  const workspaceSource = existsSync(join(resolvedRoot, 'pnpm-workspace.yaml'))
    ? readFileSync(join(resolvedRoot, 'pnpm-workspace.yaml'), 'utf8')
    : '';
  if (!/^linkWorkspacePackages:\s*true\s*$/mu.test(workspaceSource)) {
    diagnostics.push(
      diagnostic(
        resolvedRoot,
        WORKSPACE_BOUNDARY_RULES.workspaceSemverLinking,
        join(resolvedRoot, 'pnpm-workspace.yaml'),
        'linkWorkspacePackages',
        'The workspace must link matching ordinary SemVer dependencies to current public packages.',
      ),
    );
  }

  const members = discoverWorkspaceMembers(resolvedRoot);
  for (const member of members) {
    for (const lifecycle of REQUIRED_LIFECYCLE_SCRIPTS) {
      if (typeof member.manifest.scripts?.[lifecycle] !== 'string') {
        diagnostics.push(
          diagnostic(
            resolvedRoot,
            WORKSPACE_BOUNDARY_RULES.requiredLifecycleScript,
            member.manifestPath,
            `scripts.${lifecycle}`,
            `Workspace members must declare scripts.${lifecycle}.`,
          ),
        );
      }
    }
  }

  diagnostics.push(...validatePackageDependencies(resolvedRoot, rootManifest, members));
  const aliases = loadAliases(resolvedRoot);
  for (const member of members) {
    for (const sourceFile of collectMemberSourceFiles(member)) {
      for (const specifier of collectModuleSpecifiers(sourceFile)) {
        diagnostics.push(
          ...validateSourceSpecifier(resolvedRoot, rootManifest, members, member, sourceFile, specifier, aliases),
        );
      }
    }
  }
  for (const sourceFile of collectSourceFiles(join(resolvedRoot, 'src'))) {
    for (const specifier of collectModuleSpecifiers(sourceFile)) {
      diagnostics.push(...validateHostSourceSpecifier(resolvedRoot, members, sourceFile, specifier, aliases));
    }
  }

  return diagnostics.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.ruleId.localeCompare(right.ruleId) ||
      left.specifier.localeCompare(right.specifier) ||
      left.message.localeCompare(right.message),
  );
};

export const formatWorkspaceBoundaryDiagnostic = (item: WorkspaceBoundaryDiagnostic): string =>
  `[${item.ruleId}] ${item.file}: ${JSON.stringify(item.specifier)} - ${item.message}`;

const isDirectExecution = (): boolean =>
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution()) {
  const rootArgumentIndex = process.argv.indexOf('--root');
  const rootDir = rootArgumentIndex === -1 ? process.cwd() : process.argv[rootArgumentIndex + 1];
  if (rootDir === undefined) {
    console.error('[workspace/invalid-root] --root requires a directory.');
    process.exitCode = 1;
  } else {
    try {
      const diagnostics = checkWorkspaceBoundaries(rootDir);
      if (diagnostics.length > 0) {
        for (const item of diagnostics) {
          console.error(formatWorkspaceBoundaryDiagnostic(item));
        }
        process.exitCode = 1;
      } else {
        console.log('Workspace boundaries passed.');
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
