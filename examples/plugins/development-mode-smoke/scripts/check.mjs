import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const source = await readFile(resolve(root, 'src/main.ts'), 'utf8');
const forbiddenSpecs = /^(?:workspace:|file:|link:)|(?:^|\/)\.\.(?:\/|$)|^\//u;

for (const [name, version] of Object.entries({ ...metadata.dependencies, ...metadata.devDependencies })) {
  if (forbiddenSpecs.test(version)) throw new Error(`Non-portable dependency ${name}@${version}.`);
}
if (source.includes('@tauri-apps/') || source.includes('src/app/plugins/development')) {
  throw new Error('The smoke plugin must use only public plugin packages and browser APIs.');
}
console.log('Development-mode smoke plugin boundaries passed.');
