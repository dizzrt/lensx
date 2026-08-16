import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const developmentMarkers = [
  'read_plugin_development_capability',
  'set_plugin_development_mode',
  'register_plugin_development_directory',
  'reload_plugin_development_entry',
  'remove_plugin_development_entry',
] as const;
const nativeDevelopmentMarkers = [...developmentMarkers, 'LENSX_PLUGIN_DEVELOPMENT_STARTUP_ROOT'] as const;
const sourceExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);

const filesUnder = (directory: string, sourceOnly = false): string[] => {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path, sourceOnly));
    else if (entry.isFile() && (!sourceOnly || sourceExtensions.has(extname(entry.name)))) files.push(path);
  }
  return files;
};

const publicRoots = [join(root, 'packages'), join(root, 'plugins'), join(root, 'examples', 'plugins')];
for (const file of publicRoots.flatMap((directory) => filesUnder(directory, true))) {
  const source = readFileSync(file, 'utf8');
  const leaked = developmentMarkers.find((marker) => source.includes(marker));
  if (leaked !== undefined) {
    throw new Error(
      `Host-private Plugin Development Mode marker ${JSON.stringify(leaked)} leaked into ${relative(root, file)}.`,
    );
  }
}

const frontendArtifacts = filesUnder(join(root, 'dist')).filter((file) => statSync(file).isFile());
if (frontendArtifacts.length === 0) throw new Error('Production frontend artifacts are missing; run app:build first.');
for (const file of frontendArtifacts) {
  const bytes = readFileSync(file);
  const leaked = developmentMarkers.find((marker) => bytes.includes(Buffer.from(marker)));
  if (leaked !== undefined) {
    throw new Error(`Production frontend artifact ${relative(root, file)} contains ${JSON.stringify(leaked)}.`);
  }
}

const nativeArtifact = join(
  root,
  'src-tauri',
  'target',
  'release',
  process.platform === 'win32' ? 'lensx.exe' : 'lensx',
);
if (!existsSync(nativeArtifact))
  throw new Error('Production native artifact is missing; run cargo build --release first.');
const nativeBytes = readFileSync(nativeArtifact);
for (const marker of nativeDevelopmentMarkers) {
  if (nativeBytes.includes(Buffer.from(marker))) {
    throw new Error(`Production native artifact contains development command ${JSON.stringify(marker)}.`);
  }
}

console.log('Plugin Development Mode workspace and production artifact boundaries passed.');
