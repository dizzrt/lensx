import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const artifactRoot = join(root, 'dist');
const developmentMarkers = [
  'read_plugin_development_capability',
  'set_plugin_development_mode',
  'register_plugin_development_directory',
  'reload_plugin_development_entry',
  'remove_plugin_development_entry',
] as const;

const filesUnder = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : [];
  });
};

const artifacts = filesUnder(artifactRoot).map((file) => readFileSync(file));
if (artifacts.length === 0) throw new Error('Feature-enabled frontend artifacts are missing.');
for (const marker of developmentMarkers) {
  if (!artifacts.some((bytes) => bytes.includes(Buffer.from(marker)))) {
    throw new Error(`Feature-enabled frontend artifacts do not contain ${JSON.stringify(marker)}.`);
  }
}

console.log('Plugin Development Mode feature-enabled frontend artifact boundary passed.');
