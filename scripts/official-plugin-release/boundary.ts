import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const fail = (code: string, path: string): never => {
  throw new Error(`[official-release/${code}] ${path}`);
};

const collectSource = (directory: string): string =>
  readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? collectSource(path)
        : /\.(?:ts|tsx|json)$/u.test(entry.name)
          ? readFileSync(path, 'utf8')
          : '';
    })
    .join('\n');

export const checkOfficialPluginReleaseBoundaries = (rootDir: string): void => {
  const root = resolve(rootDir);
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  for (const path of ['README.md', 'AGENTS.md', 'openspec/config.yaml']) {
    const source = read(path);
    if (source.includes('official-plugin-release') || source.includes('.release.json'))
      fail('onboarding-boundary-drift', path);
  }
  const metadata = JSON.parse(read('package.json')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (
    metadata.dependencies?.['@changesets/cli'] !== undefined ||
    metadata.devDependencies?.['@changesets/cli'] !== '2.31.1'
  ) {
    fail('changesets-runtime-boundary-drift', 'package.json');
  }
  const publicSource = ['plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit']
    .map((name) => collectSource(join(root, 'packages', name, 'src')))
    .join('\n');
  for (const marker of ['.release.json', 'release_tag', 'OfficialPluginRelease', 'official-release-pipeline']) {
    if (publicSource.includes(marker)) fail('public-api-authority-drift', marker);
  }
  const appSource = collectSource(join(root, 'src'));
  if (appSource.includes('official-plugin-release') || appSource.includes('.release.json')) {
    fail('production-bundle-release-tooling-drift', 'src');
  }
  if (
    !read('packages/plugin-cli/src/package-format/constants.ts').includes("PLUGIN_PACKAGE_FORMAT_VERSION = '0.1.0'")
  ) {
    fail('package-protocol-drift', 'packages/plugin-cli/src/package-format/constants.ts');
  }
  if (!read('src-tauri/src/plugin_package_format.rs').includes('PACKAGE_FORMAT_VERSION: &str = "0.1.0"')) {
    fail('package-protocol-drift', 'src-tauri/src/plugin_package_format.rs');
  }
  const installer = read('src-tauri/src/plugin_installer.rs');
  for (const marker of [
    'PluginSource::External',
    'first_install_preparation_is_pathless_single_use_and_commits_empty_grants',
  ]) {
    if (!installer.includes(marker)) fail('installer-authority-drift', marker);
  }
  const registration = read('src-tauri/src/plugin_registration.rs');
  if (registration.includes('PluginSource::Official') || registration.includes('PluginSource::Verified')) {
    fail('host-official-authority-drift', 'src-tauri/src/plugin_registration.rs');
  }
  for (const path of [
    'src-tauri/src/plugin_installer.rs',
    'src-tauri/src/plugin_permission.rs',
    'src/app/plugins/runtime/session-contract.ts',
  ]) {
    const source = read(path);
    if (source.includes('.release.json') || source.includes('release_tag'))
      fail('host-release-sidecar-consumption', path);
  }
};
