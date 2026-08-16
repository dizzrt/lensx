import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

import { checkWorkspaceBoundaries } from '../check-workspace-boundaries.ts';
import { compareDiagnostics, diagnostic, type OfficialPluginMember, type OfficialReleaseDiagnostic } from './types.ts';

const REQUIRED_SCRIPTS = ['build', 'typecheck', 'test', 'check', 'test:e2e'] as const;
const SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const PLUGIN_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const TEST_FILE = /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/u;

interface PackageMetadata extends Record<string, unknown> {
  readonly engines?: Record<string, unknown>;
  readonly name?: unknown;
  readonly packageManager?: unknown;
  readonly private?: unknown;
  readonly scripts?: Record<string, unknown>;
  readonly version?: unknown;
}

const safeJson = (rootDir: string, path: string, code: string, diagnostics: OfficialReleaseDiagnostic[]): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    diagnostics.push(diagnostic(code, relative(rootDir, path), 'The JSON document is missing or invalid.'));
    return undefined;
  }
};

const sourceFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    });
};

const codeownersFor = (rootDir: string): Map<string, string[]> => {
  const path = join(rootDir, '.github', 'CODEOWNERS');
  if (!existsSync(path)) return new Map();
  const result = new Map<string, string[]>();
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [pattern, ...owners] = line.split(/\s+/u);
    if (pattern === undefined) continue;
    result.set(pattern, [...(result.get(pattern) ?? []), owners.join(' ')]);
  }
  return result;
};

export interface ValidateOfficialPluginContractOptions {
  readonly requireDistManifest?: boolean;
}

export interface OfficialPluginContractResult {
  readonly diagnostics: readonly OfficialReleaseDiagnostic[];
  readonly members: readonly OfficialPluginMember[];
}

export const validateOfficialPluginContract = (
  rootDir: string,
  options: ValidateOfficialPluginContractOptions = {},
): OfficialPluginContractResult => {
  const root = resolve(rootDir);
  const officialRoot = join(root, 'plugins');
  const diagnostics: OfficialReleaseDiagnostic[] = [];
  const members: OfficialPluginMember[] = [];
  const packageNames = new Map<string, string>();
  const pluginIds = new Map<string, string>();
  const owners = codeownersFor(root);

  if (!existsSync(join(root, '.github', 'CODEOWNERS'))) {
    diagnostics.push(
      diagnostic('official-release/codeowners-missing', '.github/CODEOWNERS', 'CODEOWNERS is required.'),
    );
  }

  const directories = existsSync(officialRoot)
    ? readdirSync(officialRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .sort((left, right) => left.name.localeCompare(right.name))
    : [];

  for (const entry of directories) {
    const slug = entry.name;
    const memberRoot = join(officialRoot, slug);
    const relativePath = `plugins/${slug}`;
    const packagePath = join(memberRoot, 'package.json');
    const manifestPath = join(memberRoot, 'manifest.json');
    const packageValue = safeJson(root, packagePath, 'official-release/package-invalid', diagnostics);
    const manifestValue = safeJson(root, manifestPath, 'official-release/manifest-invalid', diagnostics);
    if (
      packageValue === undefined ||
      typeof packageValue !== 'object' ||
      packageValue === null ||
      Array.isArray(packageValue) ||
      manifestValue === undefined ||
      typeof manifestValue !== 'object' ||
      manifestValue === null ||
      Array.isArray(manifestValue)
    ) {
      continue;
    }
    const metadata = packageValue as PackageMetadata;
    const manifest = manifestValue as Record<string, unknown>;
    const packageName = typeof metadata.name === 'string' ? metadata.name : '';
    const version = typeof metadata.version === 'string' ? metadata.version : '';
    const pluginId = typeof manifest.plugin_id === 'string' ? manifest.plugin_id : '';

    if (!PACKAGE_NAME.test(packageName)) {
      diagnostics.push(
        diagnostic(
          'official-release/package-name-invalid',
          `${relativePath}/package.json`,
          'Package name must be a valid non-empty package name.',
        ),
      );
    } else if (packageNames.has(packageName)) {
      diagnostics.push(
        diagnostic(
          'official-release/package-name-duplicate',
          `${relativePath}/package.json`,
          'Package name must be unique among official plugins.',
        ),
      );
    } else {
      packageNames.set(packageName, relativePath);
    }
    if (metadata.private !== true) {
      diagnostics.push(
        diagnostic(
          'official-release/package-public',
          `${relativePath}/package.json`,
          'Official plugin packages must set private to true.',
        ),
      );
    }
    if (!SEMVER.test(version)) {
      diagnostics.push(
        diagnostic(
          'official-release/version-invalid',
          `${relativePath}/package.json`,
          'Package version must be valid SemVer.',
        ),
      );
    }
    if (metadata.engines?.node !== '>=24 <25' || metadata.engines?.pnpm !== '>=11 <12') {
      diagnostics.push(
        diagnostic(
          'official-release/engines-invalid',
          `${relativePath}/package.json`,
          'Official plugins must pin the supported Node 24 and pnpm 11 ranges.',
        ),
      );
    }
    if (metadata.packageManager !== 'pnpm@11.17.0') {
      diagnostics.push(
        diagnostic(
          'official-release/package-manager-invalid',
          `${relativePath}/package.json`,
          'Official plugins must pin pnpm@11.17.0.',
        ),
      );
    }
    for (const script of REQUIRED_SCRIPTS) {
      if (typeof metadata.scripts?.[script] !== 'string' || metadata.scripts[script].trim() === '') {
        diagnostics.push(
          diagnostic(
            'official-release/script-missing',
            `${relativePath}/package.json`,
            `Required script ${script} is missing.`,
          ),
        );
      }
    }
    const realTests = sourceFiles(memberRoot).filter((path) =>
      TEST_FILE.test(relative(memberRoot, path).replaceAll('\\', '/')),
    );
    if (realTests.length === 0 || !realTests.some((path) => /\b(?:test|it)\s*\(/u.test(readFileSync(path, 'utf8')))) {
      diagnostics.push(
        diagnostic('official-release/test-missing', relativePath, 'At least one executable test is required.'),
      );
    }
    if (!existsSync(join(memberRoot, 'CHANGELOG.md'))) {
      diagnostics.push(
        diagnostic(
          'official-release/changelog-missing',
          `${relativePath}/CHANGELOG.md`,
          'An independent CHANGELOG.md is required.',
        ),
      );
    }
    if (!PLUGIN_ID.test(pluginId)) {
      diagnostics.push(
        diagnostic(
          'official-release/plugin-id-invalid',
          `${relativePath}/manifest.json`,
          'Manifest plugin_id must be valid and non-empty.',
        ),
      );
    } else if (pluginIds.has(pluginId)) {
      diagnostics.push(
        diagnostic(
          'official-release/plugin-id-duplicate',
          `${relativePath}/manifest.json`,
          'Manifest plugin_id must be unique among official plugins.',
        ),
      );
    } else {
      pluginIds.set(pluginId, relativePath);
    }
    if (manifest.version !== version) {
      diagnostics.push(
        diagnostic(
          'official-release/source-version-drift',
          `${relativePath}/manifest.json`,
          'Source Manifest version must match package version.',
        ),
      );
    }

    const distManifestPath = join(memberRoot, 'dist', 'manifest.json');
    if (options.requireDistManifest === true || existsSync(distManifestPath)) {
      const distValue = safeJson(root, distManifestPath, 'official-release/dist-manifest-invalid', diagnostics);
      if (
        typeof distValue !== 'object' ||
        distValue === null ||
        Array.isArray(distValue) ||
        (distValue as Record<string, unknown>).plugin_id !== pluginId ||
        (distValue as Record<string, unknown>).version !== version
      ) {
        diagnostics.push(
          diagnostic(
            'official-release/dist-identity-drift',
            `${relativePath}/dist/manifest.json`,
            'Built Manifest identity and version must match source metadata.',
          ),
        );
      }
    }

    const expectedOwnerPattern = `/${relativePath}/`;
    const ownerEntries = owners.get(expectedOwnerPattern) ?? [];
    if (ownerEntries.length === 0 || ownerEntries.some((value) => value.trim() === '')) {
      diagnostics.push(
        diagnostic(
          'official-release/codeowner-missing',
          '.github/CODEOWNERS',
          `An explicit owner is required for ${relativePath}.`,
        ),
      );
    } else if (ownerEntries.length !== 1) {
      diagnostics.push(
        diagnostic(
          'official-release/codeowner-conflict',
          '.github/CODEOWNERS',
          `Exactly one owner entry is allowed for ${relativePath}.`,
        ),
      );
    }

    if (packageName !== '' && pluginId !== '' && SEMVER.test(version)) {
      members.push({ manifest, packageName, pluginId, relativePath, rootDir: memberRoot, slug, version });
    }
  }

  for (const pattern of [...owners.keys()].sort()) {
    if (!pattern.startsWith('/plugins/')) continue;
    const match = /^\/plugins\/([^/*?[\]]+)\/$/u.exec(pattern);
    if (match?.[1] === undefined) {
      diagnostics.push(
        diagnostic(
          'official-release/codeowner-pattern-invalid',
          '.github/CODEOWNERS',
          'Official plugin ownership must use an explicit full-directory pattern.',
        ),
      );
    } else if (!directories.some((entry) => entry.name === match[1])) {
      diagnostics.push(
        diagnostic(
          'official-release/codeowner-unknown-plugin',
          '.github/CODEOWNERS',
          'CODEOWNERS references an unknown official plugin.',
        ),
      );
    }
  }

  for (const boundary of checkWorkspaceBoundaries(root)) {
    if (boundary.file.startsWith('plugins/') || boundary.ruleId === 'workspace/host-official-plugin-source-import') {
      diagnostics.push(
        diagnostic(`official-release/${boundary.ruleId.slice('workspace/'.length)}`, boundary.file, boundary.message),
      );
    }
  }

  return {
    diagnostics: diagnostics.sort(compareDiagnostics),
    members: members.sort((left, right) => left.slug.localeCompare(right.slug)),
  };
};

export const officialPluginBySlug = (
  result: OfficialPluginContractResult,
  slug: string,
): OfficialPluginMember | undefined => result.members.find((member) => member.slug === basename(slug));
