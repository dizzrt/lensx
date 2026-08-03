import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PLUGIN_PACKAGE_CHECKSUMS_PATH,
  PLUGIN_PACKAGE_FORMAT_VERSION,
  PLUGIN_PACKAGE_LIMITS,
  PLUGIN_PACKAGE_MANIFEST_PATH,
  PLUGIN_PACKAGE_ZSTD_LEVEL,
} from '../tools/plugin-package-format/index.ts';

const rootDir = join(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
  devDependencies?: Record<string, string>;
};
const cargoToml = readFileSync(join(rootDir, 'src-tauri/Cargo.toml'), 'utf8');
const rustSource = readFileSync(join(rootDir, 'src-tauri/src/plugin_package_format.rs'), 'utf8');

const failures: string[] = [];
const requireEqual = (name: string, actual: unknown, expected: unknown): void => {
  if (actual !== expected)
    failures.push(`${name}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
};

requireEqual('TypeScript package protocol', PLUGIN_PACKAGE_FORMAT_VERSION, '0.1.0');
requireEqual('Manifest record', PLUGIN_PACKAGE_MANIFEST_PATH, 'manifest.json');
requireEqual('Checksums record', PLUGIN_PACKAGE_CHECKSUMS_PATH, 'checksums.json');
requireEqual('Reference Zstandard level', PLUGIN_PACKAGE_ZSTD_LEVEL, 19);
requireEqual('Compressed size limit', PLUGIN_PACKAGE_LIMITS.compressedBytes, 64 * 1024 * 1024);
requireEqual('TAR size limit', PLUGIN_PACKAGE_LIMITS.tarBytes, 256 * 1024 * 1024);
requireEqual('Pinned TypeScript codec', packageJson.devDependencies?.['@structured-world/structured-zstd'], '0.0.49');

for (const dependency of ['sha2 = "=0.10.9"', 'tar = "=0.4.45"', 'zstd = "=0.13.3"']) {
  if (!cargoToml.includes(dependency)) failures.push(`Missing pinned Rust dependency: ${dependency}`);
}
for (const constant of [
  'const PACKAGE_FORMAT_VERSION: &str = "0.1.0";',
  'const MAX_COMPRESSED_BYTES: usize = 64 * 1024 * 1024;',
  'const MAX_WINDOW_BYTES: u64 = 64 * 1024 * 1024;',
  'const MAX_TAR_BYTES: u64 = 256 * 1024 * 1024;',
  'const MAX_FILE_COUNT: usize = 4096;',
]) {
  if (!rustSource.includes(constant)) failures.push(`Rust package-format constant drift: ${constant}`);
}

for (const member of ['plugin-contract', 'plugin-sdk', 'plugin-testkit', 'plugin-ui']) {
  const manifest = readFileSync(join(rootDir, 'packages', member, 'package.json'), 'utf8');
  if (manifest.includes('structured-zstd') || manifest.includes('plugin-package-format')) {
    failures.push(`Public package ${member} must not include Host-private package-format dependencies.`);
  }
}

if (failures.length > 0) {
  throw new Error(
    `Plugin package-format dependency/constant check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`,
  );
}

console.log('Plugin package-format dependency, constant, and public-boundary checks passed.');
