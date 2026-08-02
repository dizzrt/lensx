import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : resolve(process.cwd(), process.argv[index + 1]);
};
const schemaPath = argumentValue('--schema', resolve(packageRoot, 'schema/manifest.schema.json'));
const outputPath = argumentValue('--output', resolve(packageRoot, 'src/generated/plugin-manifest-input.ts'));
const checkOnly = process.argv.includes('--check');

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
schema.title = 'PluginManifestInput';
const generated = await compile(schema, 'PluginManifestInput', {
  bannerComment:
    '/* eslint-disable */\n/**\n * Generated from schema/manifest.schema.json.\n * Do not edit directly; run `pnpm run generate`.\n */',
  additionalProperties: false,
  enableConstEnums: false,
  format: true,
  style: {
    singleQuote: true,
  },
  unknownAny: false,
});

if (checkOnly) {
  let current = '';
  try {
    current = await readFile(outputPath, 'utf8');
  } catch {
    // A missing generated file is reported as drift below.
  }

  if (current !== generated) {
    console.error('Generated plugin Manifest types are out of date.');
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, generated, 'utf8');
}
