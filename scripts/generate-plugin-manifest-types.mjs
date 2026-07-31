import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(repositoryRoot, 'schemas/plugin/manifest.schema.json');
const outputPath = resolve(repositoryRoot, 'src/app/plugins/manifest/generated/plugin-manifest-v0-input.ts');
const checkOnly = process.argv.includes('--check');

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
schema.title = 'PluginManifestV0Input';
const generated = await compile(schema, 'PluginManifestV0Input', {
  bannerComment:
    '/* eslint-disable */\n/**\n * Generated from schemas/plugin/manifest.schema.json.\n * Do not edit directly; run `pnpm run generate:plugin-manifest-types`.\n */',
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
