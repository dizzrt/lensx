import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import {
  compareDiagnostics,
  diagnostic,
  type OfficialPluginMember,
  type OfficialReleaseDiagnostic,
  type ParsedChangeset,
  type SemverBump,
} from './types.ts';

const BUMPS = new Set<SemverBump>(['major', 'minor', 'patch']);

export interface ChangesetPolicyResult {
  readonly changesets: readonly ParsedChangeset[];
  readonly diagnostics: readonly OfficialReleaseDiagnostic[];
  readonly releaseBumps: ReadonlyMap<string, { readonly bump: SemverBump; readonly changesets: readonly string[] }>;
}

const parseChangeset = (
  rootDir: string,
  path: string,
  membersByName: ReadonlyMap<string, OfficialPluginMember>,
  knownNonOfficialPackages: ReadonlySet<string>,
): { readonly changeset?: ParsedChangeset; readonly diagnostics: OfficialReleaseDiagnostic[] } => {
  const diagnostics: OfficialReleaseDiagnostic[] = [];
  const relativePath = relative(rootDir, path).replaceAll('\\', '/');
  const source = readFileSync(path, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(source);
  if (match?.[1] === undefined || match[2] === undefined) {
    return {
      diagnostics: [
        diagnostic('official-release/changeset-invalid', relativePath, 'Changeset frontmatter is invalid.'),
      ],
    };
  }
  const summary = match[2].trim();
  if (summary === '') {
    diagnostics.push(
      diagnostic('official-release/changeset-empty', relativePath, 'Changeset summary must not be empty.'),
    );
  }
  const bumps = new Map<string, SemverBump>();
  let containsKnownNonOfficialTarget = false;
  for (const line of match[1].split(/\r?\n/u).filter((value) => value.trim() !== '')) {
    const entry = /^\s*["']([^"']+)["']\s*:\s*(major|minor|patch)\s*$/u.exec(line);
    if (entry?.[1] === undefined || entry[2] === undefined) {
      diagnostics.push(
        diagnostic(
          'official-release/changeset-bump-invalid',
          relativePath,
          'Changeset bumps must use patch, minor, or major.',
        ),
      );
      continue;
    }
    const packageName = entry[1];
    const bump = entry[2] as SemverBump;
    if (knownNonOfficialPackages.has(packageName)) {
      containsKnownNonOfficialTarget = true;
    } else if (!membersByName.has(packageName)) {
      diagnostics.push(
        diagnostic(
          'official-release/changeset-target-unknown',
          relativePath,
          'Changeset targets an unknown official plugin package.',
        ),
      );
    } else if (bumps.has(packageName)) {
      diagnostics.push(
        diagnostic(
          'official-release/changeset-target-duplicate',
          relativePath,
          'Changeset repeats an official plugin package target.',
        ),
      );
    } else if (BUMPS.has(bump)) {
      bumps.set(packageName, bump);
    }
  }
  if (bumps.size === 0 && !containsKnownNonOfficialTarget) {
    diagnostics.push(
      diagnostic(
        'official-release/changeset-no-target',
        relativePath,
        'Changeset must target at least one official plugin package.',
      ),
    );
  }
  return {
    changeset: { bumps, id: relativePath.slice('.changeset/'.length, -'.md'.length), summary },
    diagnostics,
  };
};

const packageNamesIn = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const metadataPath = join(directory, entry.name, 'package.json');
    if (!existsSync(metadataPath)) return [];
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as { name?: unknown };
    return typeof metadata.name === 'string' ? [metadata.name] : [];
  });
};

const strongestBump = (bumps: readonly SemverBump[]): SemverBump =>
  bumps.includes('major') ? 'major' : bumps.includes('minor') ? 'minor' : 'patch';

export const validateChangesetPolicy = (
  rootDir: string,
  members: readonly OfficialPluginMember[],
  releaseRelevantPackages: ReadonlySet<string>,
): ChangesetPolicyResult => {
  const root = resolve(rootDir);
  const directory = join(root, '.changeset');
  const membersByName = new Map(members.map((member) => [member.packageName, member]));
  const rootMetadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: unknown };
  const knownNonOfficialPackages = new Set([
    ...(typeof rootMetadata.name === 'string' ? [rootMetadata.name] : []),
    ...packageNamesIn(join(root, 'packages')),
    ...packageNamesIn(join(root, 'examples', 'plugins')),
  ]);
  const diagnostics: OfficialReleaseDiagnostic[] = [];
  const changesets: ParsedChangeset[] = [];
  const markdown = existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .sort()
    : [];
  for (const name of markdown) {
    const parsed = parseChangeset(root, join(directory, name), membersByName, knownNonOfficialPackages);
    diagnostics.push(...parsed.diagnostics);
    if (parsed.changeset !== undefined) changesets.push(parsed.changeset);
  }

  const byPackage = new Map<string, Array<{ bump: SemverBump; id: string }>>();
  for (const changeset of changesets) {
    for (const [packageName, bump] of changeset.bumps) {
      byPackage.set(packageName, [...(byPackage.get(packageName) ?? []), { bump, id: changeset.id }]);
    }
  }
  for (const packageName of [...releaseRelevantPackages].sort()) {
    if ((byPackage.get(packageName) ?? []).length === 0) {
      const member = membersByName.get(packageName);
      diagnostics.push(
        diagnostic(
          'official-release/changeset-missing',
          member?.relativePath ?? 'plugins/official',
          'Release-relevant official plugin changes require a matching Changeset.',
        ),
      );
    }
  }

  const releaseBumps = new Map<string, { bump: SemverBump; changesets: readonly string[] }>();
  for (const [packageName, entries] of [...byPackage.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const distinct = new Set(entries.map((entry) => entry.bump));
    if (distinct.size > 1) {
      diagnostics.push(
        diagnostic(
          'official-release/changeset-bump-conflict',
          '.changeset',
          'Multiple Changesets disagree on the bump for an official plugin.',
        ),
      );
      continue;
    }
    releaseBumps.set(packageName, {
      bump: strongestBump(entries.map((entry) => entry.bump)),
      changesets: entries.map((entry) => entry.id).sort(),
    });
  }

  return { changesets, diagnostics: diagnostics.sort(compareDiagnostics), releaseBumps };
};
