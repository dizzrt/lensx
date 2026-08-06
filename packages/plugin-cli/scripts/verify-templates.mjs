import { cp, lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const write = process.argv.includes('--write');
const kinds = ['framework-neutral', 'react-semi'];
const excluded = new Set(['dist', 'node_modules', 'visual-dist']);

const collect = async (root, directory = root) => {
  const files = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
      throw new Error(`Template contains an unsupported file: ${relative(root, path)}`);
    }
    if (metadata.isDirectory()) {
      for (const [name, bytes] of await collect(root, path)) files.set(name, bytes);
    } else {
      files.set(relative(root, path).replaceAll('\\', '/'), await readFile(path));
    }
  }
  return files;
};

for (const kind of kinds) {
  const source = resolve(repositoryRoot, 'examples/plugins', kind);
  const target = resolve(packageRoot, 'templates', kind);
  if (write) {
    await rm(target, { force: true, recursive: true });
    await mkdir(target, { recursive: true });
    await cp(source, target, {
      recursive: true,
      filter: (path) => !excluded.has(path.split('/').at(-1)),
    });
  }
  const sourceFiles = await collect(source);
  const targetFiles = await collect(target);
  const names = [...new Set([...sourceFiles.keys(), ...targetFiles.keys()])].sort();
  const drift = names.filter((name) => !sourceFiles.get(name)?.equals(targetFiles.get(name)));
  if (drift.length > 0) throw new Error(`${kind} CLI template drifted: ${drift.join(', ')}`);
}

console.log(`${write ? 'Synchronized' : 'Verified'} framework-neutral and react-semi CLI template assets.`);
