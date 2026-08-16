import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const fail = (code: string, message: string): never => {
  throw new Error(`[ci/${code}] ${message}`);
};

const collectFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    return entry.isFile() ? [path] : [];
  });
};

export const checkRetiredReleasePolicy = (rootDir: string): void => {
  const root = resolve(rootDir);
  const removedPaths = [
    '.changeset/config.json',
    'scripts/official-plugin-release.ts',
    'scripts/check-official-config-lens-plugin.ts',
    'tests/official-plugin-release-pipeline.test.ts',
    'src-tauri/examples/official_plugin_candidate_inspector.rs',
    'docs/en/development/official-plugin-release.md',
    'docs/zh/development/official-plugin-release.md',
  ];
  for (const path of removedPaths) {
    if (existsSync(join(root, path))) fail('retired-release-path', `Retired automatic release path remains: ${path}.`);
  }
  for (const path of ['scripts/official-plugin-release', 'tests/fixtures/official-plugin-release']) {
    if (collectFiles(join(root, path)).length > 0) {
      fail('retired-release-path', `Retired automatic release directory is not empty: ${path}.`);
    }
  }

  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  if (manifest.devDependencies?.['@changesets/cli'] !== undefined) {
    fail('retired-release-dependency', 'The retired Changesets dependency remains.');
  }
  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    if (
      /official-plugin-release|^(?:version|publish):official/u.test(name) ||
      /official-plugin-release\.ts/u.test(command)
    ) {
      fail('retired-release-script', `Retired automatic release root script remains: ${name}.`);
    }
  }

  const oldWorkflowNames = [
    'desktop-rust-check.yml',
    'official-plugin-pr.yml',
    'official-plugin-version.yml',
    'official-plugin-candidate.yml',
  ];
  const activeFiles = [join(root, 'scripts'), join(root, 'tests'), join(root, 'docs')]
    .flatMap(collectFiles)
    .filter((path) => !path.endsWith('retired-release-policy.ts'));
  for (const file of activeFiles) {
    const source = readFileSync(file, 'utf8');
    const marker = oldWorkflowNames.find((name) => source.includes(name));
    if (marker !== undefined) {
      fail('retired-workflow-reference', `${relative(root, file)} still references ${marker}.`);
    }
  }
};
