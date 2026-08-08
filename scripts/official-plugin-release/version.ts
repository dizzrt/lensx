import { spawnSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { validateChangesetPolicy } from './changesets.ts';
import { validateOfficialPluginContract } from './contract.ts';

export const versionOfficialPlugins = (rootDir: string): void => {
  const root = resolve(rootDir);
  const before = validateOfficialPluginContract(root);
  if (before.diagnostics.length > 0) {
    throw new Error(before.diagnostics.map((item) => `[${item.code}] ${item.path}: ${item.message}`).join('\n'));
  }
  const policy = validateChangesetPolicy(root, before.members, new Set());
  if (policy.diagnostics.length > 0) {
    throw new Error(policy.diagnostics.map((item) => `[${item.code}] ${item.path}: ${item.message}`).join('\n'));
  }
  if (policy.changesets.length === 0) return;
  const result = spawnSync('pnpm', ['exec', 'changeset', 'version'], { cwd: root, encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error('[official-release/changesets-version-failed] Changesets version failed.');

  const updates: Array<{ path: string; source: string }> = [];
  for (const member of before.members) {
    const packageValue = JSON.parse(readFileSync(join(member.rootDir, 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    if (typeof packageValue.version !== 'string') {
      throw new Error('[official-release/version-output-invalid] Changesets produced invalid package metadata.');
    }
    if (packageValue.version === member.version) continue;
    const changelog = readFileSync(join(member.rootDir, 'CHANGELOG.md'), 'utf8');
    if (!changelog.includes(`## ${packageValue.version}`)) {
      throw new Error(
        '[official-release/changelog-version-missing] Changesets did not produce the expected CHANGELOG entry.',
      );
    }
    const manifestPath = join(member.rootDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.version = packageValue.version;
    updates.push({ path: manifestPath, source: `${JSON.stringify(manifest, null, 2)}\n` });
  }
  for (const [index, update] of updates.entries()) {
    const temporary = `${update.path}.${process.pid}.${index}.tmp`;
    writeFileSync(temporary, update.source, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, update.path);
  }
  const after = validateOfficialPluginContract(root);
  if (after.diagnostics.length > 0) {
    throw new Error(after.diagnostics.map((item) => `[${item.code}] ${item.path}: ${item.message}`).join('\n'));
  }
};
