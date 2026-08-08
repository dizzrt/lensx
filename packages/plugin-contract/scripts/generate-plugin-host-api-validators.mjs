import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : resolve(process.cwd(), process.argv[index + 1]);
};
const schemaPath = argumentValue('--schema', resolve(packageRoot, 'schema/host-api.schema.json'));
const outputPath = argumentValue('--output', resolve(packageRoot, 'src/generated/plugin-host-api-validators.ts'));
const checkOnly = process.argv.includes('--check');

const definitions = [
  'ActionsOpenRequest',
  'ActionsOpenResult',
  'RuntimeGetContextRequest',
  'RuntimeGetContextResult',
  'StorageDeleteRequest',
  'StorageDeleteResult',
  'StorageGetRequest',
  'StorageGetResult',
  'StorageGetQuotaRequest',
  'StorageGetQuotaResult',
  'StorageListRequest',
  'StorageListResult',
  'StorageSetRequest',
  'StorageSetResult',
  'UiCloseRequest',
  'UiCloseResult',
  'PluginRuntimeContextInput',
  'HostApiEventInput',
  'HostApiErrorInput',
];

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, lines: true, source: true },
  strict: true,
});
ajv.addSchema(schema);
const validatorIds = Object.fromEntries(
  definitions.map((definition) => {
    const id = `urn:lensx:plugin-host-api-validator:${definition}`;
    ajv.addSchema({ $id: id, $ref: `${schema.$id}#/$defs/${definition}` });
    return [definition, id];
  }),
);

const runtimeImports = [];
const moduleSource = standaloneCode(ajv, validatorIds).replace(
  /const (func[0-9]+) = require\("([^"]+)"\)\.default;\n?/gu,
  (_match, binding, specifier) => {
    runtimeImports.push(
      `import ${binding}Module from '${specifier}.js';`,
      `const ${binding} = typeof ${binding}Module === 'function' ? ${binding}Module : ${binding}Module.default;`,
    );
    return '';
  },
);
const generated = `${[
  '/* eslint-disable */',
  '// @ts-nocheck -- generated AJV standalone validators intentionally retain emitted JavaScript shapes.',
  '/**',
  ' * Generated from schema/host-api.schema.json.',
  ' * Do not edit directly; run `pnpm run generate`.',
  ' * These standalone validators do not compile Schemas or use eval at Runtime.',
  ' */',
  ...runtimeImports,
  '',
].join('\n')}${moduleSource}\nexport const validators = { ${definitions.join(', ')} } as const;\n`;

if (checkOnly) {
  let current = '';
  try {
    current = await readFile(outputPath, 'utf8');
  } catch {
    // A missing generated file is reported as drift below.
  }
  if (current !== generated) {
    console.error('Generated plugin Host API standalone validators are out of date.');
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, generated, 'utf8');
}
