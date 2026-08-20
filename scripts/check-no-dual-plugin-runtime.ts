import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';

import { ContentChecksum, createDecompressStream } from '@structured-world/structured-zstd';

import {
  auditCurrentManifestProtocol,
  auditNoDualRuntimePath,
  auditNoDualRuntimeText,
  formatNoDualRuntimeDiagnostic,
  type NoDualRuntimeDiagnostic,
} from './no-dual-plugin-runtime.ts';

const rootDir = resolve(import.meta.dirname, '..');
const changeName = ['replace-plugin-', 'iframe-runtime', '-with-child-webview'].join('');
const changeRoot = join(rootDir, 'openspec', 'changes', changeName);
const publicPackages = ['plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit', 'plugin-cli'] as const;
const skippedDirectories = new Set(['.git', '.tmp', 'archive', 'coverage', 'node_modules', 'target']);
const textExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.cts',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.less',
  '.md',
  '.mjs',
  '.mts',
  '.rs',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

interface ArchiveEntry {
  readonly bytes: Uint8Array;
  readonly path: string;
}

const toPosix = (value: string): string => value.replaceAll('\\', '/');

const run = (command: string, arguments_: readonly string[], cwd = rootDir): string => {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
};

const isTextBytes = (path: string, bytes: Uint8Array): boolean =>
  bytes.byteLength <= 8 * 1024 * 1024 &&
  textExtensions.has(extname(path).toLowerCase()) &&
  !bytes.subarray(0, Math.min(bytes.byteLength, 8_192)).includes(0);

const scanBytes = (diagnostics: NoDualRuntimeDiagnostic[], surface: string, path: string, bytes: Uint8Array): void => {
  diagnostics.push(...auditNoDualRuntimePath(path, surface));
  if (!isTextBytes(path, bytes)) return;
  diagnostics.push(
    ...auditNoDualRuntimeText({
      path,
      surface,
      text: Buffer.from(bytes).toString('utf8'),
    }),
  );
  diagnostics.push(...auditCurrentManifestProtocol(path, surface, Buffer.from(bytes).toString('utf8')));
};

const collectFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isDirectory() && (skippedDirectories.has(entry.name) || entry.name.startsWith('.'))) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};

const scanWorkspaceFiles = (diagnostics: NoDualRuntimeDiagnostic[]): void => {
  const surfaces = [
    ['production', join(rootDir, 'src')],
    ['production-native', join(rootDir, 'src-tauri', 'src')],
    ['tests', join(rootDir, 'tests')],
    ['scripts-and-generated-policy', join(rootDir, 'scripts')],
    ['public-packages-source-and-build', join(rootDir, 'packages')],
    ['templates-and-examples', join(rootDir, 'examples')],
    ['official-plugin-source-and-build', join(rootDir, 'plugins')],
    ['current-docs', join(rootDir, 'docs', 'en')],
    ['current-docs', join(rootDir, 'docs', 'zh')],
    ['generated-fixtures', join(rootDir, 'fixtures')],
    ['active-change', changeRoot],
  ] as const;
  const rootFiles = ['package.json', 'pnpm-lock.yaml', 'biome.json', '.github/workflows/plugins-ci.yml'];
  const seen = new Set<string>();
  for (const [surface, directory] of surfaces) {
    for (const file of collectFiles(directory)) {
      if (file.endsWith('.lxp') || seen.has(file)) continue;
      seen.add(file);
      scanBytes(diagnostics, surface, toPosix(relative(rootDir, file)), readFileSync(file));
    }
  }
  for (const relativePath of rootFiles) {
    const file = join(rootDir, relativePath);
    if (existsSync(file)) scanBytes(diagnostics, 'root-policy', relativePath, readFileSync(file));
  }
};

const activeDeltaCapabilities = (): Set<string> => {
  const specsRoot = join(changeRoot, 'specs');
  return new Set(
    existsSync(specsRoot)
      ? readdirSync(specsRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && existsSync(join(specsRoot, entry.name, 'spec.md')))
          .map((entry) => entry.name)
      : [],
  );
};

const scanEffectiveStableSpecs = (diagnostics: NoDualRuntimeDiagnostic[]): void => {
  const stableRoot = join(rootDir, 'openspec', 'specs');
  const superseded = activeDeltaCapabilities();
  for (const capability of readdirSync(stableRoot, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (!capability.isDirectory() || superseded.has(capability.name)) continue;
    for (const file of collectFiles(join(stableRoot, capability.name))) {
      scanBytes(diagnostics, 'effective-stable-specs', toPosix(relative(rootDir, file)), readFileSync(file));
    }
  }
};

const tarString = (bytes: Uint8Array, start: number, length: number): string => {
  const field = Buffer.from(bytes.subarray(start, start + length));
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
};

const parseTar = (bytes: Uint8Array): ArchiveEntry[] => {
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const path = tarString(header, 0, 100);
    const sizeField = tarString(header, 124, 12).trim();
    const size = Number.parseInt(sizeField, 8);
    if (path === '' || !Number.isSafeInteger(size) || size < 0 || offset + 512 + size > bytes.byteLength) {
      throw new Error(`Invalid TAR entry while scanning ${JSON.stringify(path)}.`);
    }
    const start = offset + 512;
    entries.push({ path, bytes: bytes.slice(start, start + size) });
    offset = start + Math.ceil(size / 512) * 512;
  }
  return entries;
};

const decompressLxp = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = await createDecompressStream(ContentChecksum.Verify);
  try {
    const chunks: Uint8Array[] = [];
    const block = 64 * 1024;
    for (let offset = 0; offset < bytes.byteLength; offset += block) {
      chunks.push(stream.push(bytes.subarray(offset, offset + block)));
    }
    chunks.push(stream.finish());
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  } finally {
    stream.free();
  }
};

const scanLxp = async (
  diagnostics: NoDualRuntimeDiagnostic[],
  archivePath: string,
  displayRoot: string,
  surface: string,
): Promise<void> => {
  diagnostics.push(...auditNoDualRuntimePath(displayRoot, surface));
  const tar = await decompressLxp(readFileSync(archivePath));
  for (const entry of parseTar(tar)) {
    scanBytes(diagnostics, surface, `${displayRoot}/${entry.path}`, entry.bytes);
  }
};

const scanPublicTarballs = (diagnostics: NoDualRuntimeDiagnostic[], temporary: string): void => {
  const packRoot = join(temporary, 'public-tarballs');
  for (const packageName of publicPackages) {
    const packageRoot = join(rootDir, 'packages', packageName);
    run('pnpm', ['--dir', packageRoot, 'run', 'build']);
    const destination = join(packRoot, packageName);
    mkdirSync(destination, { recursive: true });
    const before = new Set(existsSync(destination) ? readdirSync(destination) : []);
    run('pnpm', ['--dir', packageRoot, 'pack', '--pack-destination', destination]);
    const archiveName = readdirSync(destination).find((name) => name.endsWith('.tgz') && !before.has(name));
    if (archiveName === undefined) throw new Error(`pnpm pack did not create a tarball for ${packageName}.`);
    const extracted = join(destination, 'extracted');
    mkdirSync(extracted, { recursive: true });
    run('tar', ['-xzf', join(destination, archiveName), '-C', extracted]);
    for (const file of collectFiles(extracted)) {
      const relativePath = toPosix(relative(extracted, file));
      scanBytes(diagnostics, 'public-tarball', `public-tarballs/${packageName}/${relativePath}`, readFileSync(file));
    }
  }
};

const scanCurrentPluginArchives = async (diagnostics: NoDualRuntimeDiagnostic[], temporary: string): Promise<void> => {
  for (const fixtureRoot of [
    join(rootDir, 'fixtures', 'plugin-webview-runtime'),
    join(rootDir, 'fixtures', 'plugin-development-runtime'),
    join(rootDir, 'fixtures', 'plugin-package-format', 'valid'),
    join(rootDir, 'fixtures', 'plugin-package-format', 'reproducible'),
  ]) {
    for (const file of collectFiles(fixtureRoot).filter((path) => path.endsWith('.lxp'))) {
      await scanLxp(
        diagnostics,
        file,
        `current-plugin-archives/${toPosix(relative(rootDir, file))}`,
        'generated-plugin-archive',
      );
    }
  }

  const officialRoot = join(rootDir, 'plugins', 'config-lens');
  run('pnpm', ['--dir', officialRoot, 'run', 'build']);
  const candidate = join(temporary, 'official-config-lens-candidate.lxp');
  run('node', [
    join(rootDir, 'packages', 'plugin-cli', 'dist', 'src', 'bin.js'),
    'pack',
    '--project',
    officialRoot,
    '--output',
    candidate,
    '--no-build',
    '--json',
  ]);
  if (!statSync(candidate).isFile()) throw new Error('ConfigLens candidate was not created.');
  await scanLxp(diagnostics, candidate, 'official-candidates/dev.lensx.config-lens-current.lxp', 'official-candidate');
};

const main = async (): Promise<void> => {
  const diagnostics: NoDualRuntimeDiagnostic[] = [];
  const temporary = mkdtempSync(join(tmpdir(), 'lensx-no-dual-runtime-'));
  try {
    scanWorkspaceFiles(diagnostics);
    scanEffectiveStableSpecs(diagnostics);
    scanPublicTarballs(diagnostics, temporary);
    await scanCurrentPluginArchives(diagnostics, temporary);
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
  diagnostics.sort(
    (left, right) =>
      left.surface.localeCompare(right.surface) ||
      left.path.localeCompare(right.path) ||
      (left.line ?? 0) - (right.line ?? 0) ||
      left.ruleId.localeCompare(right.ruleId),
  );
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map(formatNoDualRuntimeDiagnostic).join('\n'));
  }
  console.log(
    'No-dual-plugin-Runtime gate passed for production, tests, public tarballs, templates, direct plugins, current docs/specs, fixtures, and generated artifacts.',
  );
};

await main();
