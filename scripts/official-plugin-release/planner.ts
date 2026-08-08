import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { validateChangesetPolicy } from './changesets.ts';
import type { OfficialPluginMember, OfficialPluginReleasePlan } from './types.ts';
import { OFFICIAL_RELEASE_SCHEMA_VERSION } from './types.ts';

const SHARED_PREFIXES = [
  '.changeset/config.json',
  '.github/CODEOWNERS',
  '.github/workflows/official-plugin-',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'packages/plugin-contract/',
  'packages/plugin-sdk/',
  'packages/plugin-ui/',
  'packages/plugin-testkit/',
  'packages/plugin-cli/',
  'scripts/official-plugin-release/',
  'scripts/check-plugin-package-format.ts',
  'scripts/check-plugin-permission-prompts.ts',
  'scripts/check-plugin-runtime-security-lifecycle.ts',
  'scripts/check-workspace-boundaries.ts',
  'src/app/plugins/installation/',
  'src/app/plugins/permissions/',
  'src/app/plugins/runtime/',
  'src-tauri/src/plugin_install',
  'src-tauri/src/plugin_manifest.rs',
  'src-tauri/src/plugin_package_format.rs',
  'src-tauri/src/plugin_permission.rs',
  'src-tauri/src/plugin_runtime',
  'tests/official-plugin-release',
] as const;

const INFRASTRUCTURE_PREFIXES = [
  '.changeset/config.json',
  '.github/CODEOWNERS',
  '.github/workflows/official-plugin-',
  'scripts/official-plugin-release/',
  'tests/fixtures/official-plugin-release/',
  'tests/official-plugin-release-pipeline.test.ts',
] as const;

const VERSION_METADATA = new Set(['package.json', 'manifest.json', 'CHANGELOG.md']);

const matchesPrefix = (path: string, prefix: string): boolean => path === prefix || path.startsWith(prefix);

export const changedPathsBetween = (rootDir: string, baseCommit: string, headCommit: string): string[] => {
  const result = spawnSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${baseCommit}...${headCommit}`, '--'],
    {
      cwd: resolve(rootDir),
      encoding: 'utf8',
    },
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error('[official-release/git-diff-failed] Could not read changed paths.');
  return [
    ...new Set(
      result.stdout
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((path) => path.replaceAll('\\', '/')),
    ),
  ].sort();
};

export const createOfficialPluginReleasePlan = ({
  baseCommit,
  changedPaths,
  headCommit,
  members,
  rootDir,
}: {
  readonly baseCommit: string;
  readonly changedPaths: readonly string[];
  readonly headCommit: string;
  readonly members: readonly OfficialPluginMember[];
  readonly rootDir: string;
}): OfficialPluginReleasePlan => {
  const paths = [...new Set(changedPaths.map((path) => path.replaceAll('\\', '/').replace(/^\.\//u, '')))].sort();
  const infrastructureChanged = paths.some((path) =>
    INFRASTRUCTURE_PREFIXES.some((prefix) => matchesPrefix(path, prefix)),
  );
  const sharedChanged = paths.some((path) => SHARED_PREFIXES.some((prefix) => matchesPrefix(path, prefix)));
  const selectedSlugs = new Set<string>();
  const releaseRelevantPackages = new Set<string>();

  for (const member of members) {
    const memberPaths = paths.filter((path) => path.startsWith(`${member.relativePath}/`));
    if (sharedChanged || memberPaths.length > 0) selectedSlugs.add(member.slug);
    if (
      memberPaths.some((path) => {
        const local = path.slice(member.relativePath.length + 1);
        return !VERSION_METADATA.has(local);
      })
    ) {
      releaseRelevantPackages.add(member.packageName);
    }
  }

  const policy = validateChangesetPolicy(rootDir, members, releaseRelevantPackages);
  if (policy.diagnostics.length > 0) {
    throw new Error(policy.diagnostics.map((item) => `[${item.code}] ${item.path}: ${item.message}`).join('\n'));
  }
  const entryFor = (member: OfficialPluginMember) => ({
    package_name: member.packageName,
    plugin_id: member.pluginId,
    slug: member.slug,
    version: member.version,
  });
  const validate = members.filter((member) => selectedSlugs.has(member.slug)).map(entryFor);
  const release = members.flatMap((member) => {
    const bump = policy.releaseBumps.get(member.packageName);
    return bump === undefined ? [] : [{ ...entryFor(member), bump: bump.bump, changesets: bump.changesets }];
  });
  return {
    base_commit: baseCommit,
    changed_paths: paths,
    head_commit: headCommit,
    infrastructure_changed: infrastructureChanged,
    noop: validate.length === 0 && release.length === 0 && !infrastructureChanged,
    release,
    schema_version: OFFICIAL_RELEASE_SCHEMA_VERSION,
    validate,
  };
};
