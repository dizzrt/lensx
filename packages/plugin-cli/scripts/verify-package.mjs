import { spawnSync } from 'node:child_process';
import { lstat, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-cli-pack-'));
const run = (command, arguments_, cwd) => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};

const collect = async (root, directory = root) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(root, path)));
    else files.push({ path, relativePath: relative(root, path).replaceAll('\\', '/') });
  }
  return files;
};

try {
  run('pnpm', ['run', 'build'], packageRoot);
  const output = JSON.parse(run('pnpm', ['pack', '--json', '--pack-destination', temporaryRoot], packageRoot));
  const archive = isAbsolute(output.filename) ? output.filename : resolve(temporaryRoot, output.filename);
  const packedSize = (await lstat(archive)).size;
  if (packedSize > 3 * 1024 * 1024) throw new Error(`CLI tarball exceeds the 3 MiB baseline: ${packedSize}.`);

  const files = output.files.map(({ path }) => path).sort();
  const expectedPrefixes = ['DEPENDENCIES.md', 'LICENSE', 'README.md', 'dist/', 'package.json'];
  for (const path of files) {
    if (!expectedPrefixes.some((prefix) => path === prefix || path.startsWith(prefix))) {
      throw new Error(`Unexpected CLI tarball file: ${path}`);
    }
  }
  for (const required of [
    'dist/src/bin.js',
    'dist/templates/framework-neutral/manifest.json',
    'dist/templates/framework-neutral/package.json',
    'dist/templates/react-semi/manifest.json',
    'dist/templates/react-semi/package.json',
    'LICENSE',
  ]) {
    if (!files.includes(required)) throw new Error(`CLI tarball is missing ${required}.`);
  }

  const extraction = resolve(temporaryRoot, 'extracted');
  run('tar', ['-xzf', archive, '-C', temporaryRoot], temporaryRoot);
  const extractedRoot = resolve(temporaryRoot, 'package');
  const packedMetadata = JSON.parse(await readFile(resolve(extractedRoot, 'package.json'), 'utf8'));
  if (
    packedMetadata.name !== '@lensx/plugin-cli' ||
    packedMetadata.license !== 'MIT' ||
    packedMetadata.bin?.['lensx-plugin'] !== './dist/src/bin.js' ||
    JSON.stringify(Object.keys(packedMetadata.exports ?? {})) !== JSON.stringify(['.']) ||
    packedMetadata.dependencies?.['@lensx/plugin-contract'] !== '0.2.0' ||
    packedMetadata.dependencies?.['@structured-world/structured-zstd'] !== '0.0.49'
  ) {
    throw new Error('Packed CLI metadata, bin, exports, license, or runtime dependencies drifted.');
  }
  const binMode = (await lstat(resolve(extractedRoot, 'dist/src/bin.js'))).mode;
  if ((binMode & 0o111) === 0) throw new Error('Packed CLI bin is not executable.');

  await rm(extraction, { force: true, recursive: true });
  const textual = new Set(['.css', '.d.ts', '.html', '.js', '.json', '.less', '.md', '.mjs', '.ts', '.tsx']);
  const forbidden = [
    '/Users/',
    '\\Users\\',
    'src-tauri/',
    'tools/plugin-package-format',
    'packages/plugin-cli/src/',
    'node_modules/.pnpm',
  ];
  for (const file of await collect(extractedRoot)) {
    if (file.relativePath.startsWith('dist/tests/') || file.relativePath.startsWith('scripts/')) {
      throw new Error(`CLI package-owned test or generator leaked into the tarball: ${file.relativePath}`);
    }
    if (![...textual].some((extension) => file.relativePath.endsWith(extension))) continue;
    const source = await readFile(file.path, 'utf8');
    for (const marker of forbidden) {
      if (source.includes(marker)) throw new Error(`${file.relativePath} contains forbidden marker ${marker}.`);
    }
  }

  console.log(
    `Packed ${files.length} CLI files (${packedSize} bytes) with executable bin, templates, and bounded dependencies.`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
