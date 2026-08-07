import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const scriptsDirectory = resolve(root, 'dist/static/js');
const scripts = (await readdir(scriptsDirectory)).filter((path) => path.endsWith('.js')).sort();
if (scripts.length === 0) throw new Error('The smoke dist contains no JavaScript bundle.');

const forbidden = [
  ['AJV runtime compiler', /Ajv2020|CodeGen:/u],
  ['dynamic Function constructor', /(?:new\s+)?Function\s*\(/u],
  ['direct eval', /(?:^|[^A-Za-z0-9_$])eval\s*\(/u],
  ['unsafe-eval policy dependency', /unsafe-eval/u],
];

for (const script of scripts) {
  const source = await readFile(resolve(scriptsDirectory, script), 'utf8');
  for (const [name, pattern] of forbidden) {
    if (pattern.test(source)) throw new Error(`The smoke bundle contains a forbidden ${name}: ${script}.`);
  }
}

console.log('Development-mode smoke bundle is compatible with the isolated Runtime CSP.');
