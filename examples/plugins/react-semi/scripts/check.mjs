import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const forbiddenSpecs = /^(?:workspace:|file:|link:)|(?:^|\/)\.\.(?:\/|$)|^\//u;
for (const [name, version] of Object.entries({ ...metadata.dependencies, ...metadata.devDependencies })) {
  if (forbiddenSpecs.test(version)) throw new Error(`Non-portable dependency ${name}@${version}.`);
}
if ('pack' in metadata.scripts) throw new Error('The template must not expose the Host-private packer.');
console.log('React and Semi template metadata passed.');
