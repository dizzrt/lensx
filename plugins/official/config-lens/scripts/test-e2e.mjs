import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));
if (manifest.plugin_id !== 'dev.lensx.config-lens' || manifest.version !== '0.1.0') {
  throw new Error('e2e/manifest-identity: built Manifest drifted.');
}
const files = [];
const visit = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else files.push(path);
  }
};
await visit(dist);
if (!files.some((file) => file.endsWith('index.html'))) throw new Error('e2e/entry: index.html is missing.');
if (files.some((file) => file.endsWith('.map'))) throw new Error('e2e/sourcemap: sourcemaps must not ship.');
const scripts = files.filter((file) => file.endsWith('.js'));
const source = (await Promise.all(scripts.map((file) => readFile(file, 'utf8')))).join('\n');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
if (/(?:src|href)=["']https?:\/\//u.test(html) || /(?:import\s*\(|new Worker\s*\()\s*["']https?:\/\//u.test(source)) {
  throw new Error('e2e/remote-load: build attempts to load a remote script or Worker.');
}
if (/src\/app\/|src-tauri\/|tools\/plugin-package-format|@tauri-apps\//u.test(source)) {
  throw new Error('e2e/private-boundary: bundle contains Host-private references.');
}
if (!/language\.worker|config-lens-language/u.test(source) || !/editor\.worker|config-lens-editor/u.test(source)) {
  throw new Error('e2e/worker-closure: package-owned Worker entry facts are missing.');
}
if (!source.includes('json') || !source.includes('yaml') || !source.includes('toml') || !source.includes('xml')) {
  throw new Error('e2e/language-closure: a language chunk is missing.');
}
if (
  source.includes('Apply result') ||
  source.includes('Read-only formatting preview') ||
  source.includes('config-lens__suggestion')
) {
  throw new Error('e2e/single-editor-boundary: preview, diff, apply, or language-suggestion code remains.');
}
if (!source.includes('data-editor') || !source.includes('single')) {
  throw new Error('e2e/single-editor-boundary: the single-editor product marker is missing.');
}
console.log(`ConfigLens built-output E2E passed with ${files.length} self-contained files.`);
