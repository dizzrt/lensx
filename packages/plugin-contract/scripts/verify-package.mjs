import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePackedPackage } from './package-validation.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-contract-pack-'));

const run = (command, arguments_, cwd, options = {}) => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', ...options });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with status ${result.status}.\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
};

try {
  const pnpmStorePath = run('pnpm', ['store', 'path'], repositoryRoot).trim();
  run('pnpm', ['run', 'build'], packageRoot, { stdio: 'inherit' });
  const packOutput = run('pnpm', ['pack', '--json', '--pack-destination', temporaryRoot], packageRoot);
  const packMetadata = JSON.parse(packOutput);
  const tarballPath = packMetadata.filename;
  const files = packMetadata.files.map(({ path }) => path).sort();
  const metadata = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));

  const runtimeImports = [];
  const collectRuntimeImports = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await collectRuntimeImports(path);
      } else if (entry.name.endsWith('.js')) {
        const source = await readFile(path, 'utf8');
        runtimeImports.push(...[...source.matchAll(/from\s+['"]([^.'"][^'"]*)['"]/gu)].map((match) => match[1]));
      }
    }
  };
  await collectRuntimeImports(resolve(packageRoot, 'dist'));
  const diagnostics = validatePackedPackage({ metadata, files, runtimeImports });
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.join('\n'));
  }

  const consumerRoot = resolve(temporaryRoot, 'consumer');
  await cp(resolve(repositoryRoot, 'examples/plugin-contract-consumer'), consumerRoot, { recursive: true });
  await writeFile(
    resolve(consumerRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'lensx-plugin-contract-external-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@lensx/plugin-contract': `file:${tarballPath}`,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await writeFile(
    resolve(consumerRoot, 'pnpm-workspace.yaml'),
    [
      'overrides:',
      `  '@lensx/plugin-contract': file:${tarballPath}`,
      "  'ajv': 8.20.0",
      "  'fast-deep-equal': 3.1.3",
      "  'fast-uri': 3.1.4",
      "  'json-schema-traverse': 1.0.0",
      "  'require-from-string': 2.0.2",
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    resolve(consumerRoot, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ['ES2022'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'dist',
          resolveJsonModule: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['consumer.ts'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', pnpmStorePath], consumerRoot, {
    stdio: 'inherit',
  });
  run(resolve(repositoryRoot, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], consumerRoot, { stdio: 'inherit' });
  const runtimeOutput = run(
    'node',
    [
      '--input-type=module',
      '--eval',
      "const consumer = await import('./dist/consumer.js'); process.stdout.write(consumer.exampleResult)",
    ],
    consumerRoot,
  ).trim();
  if (runtimeOutput !== 'com.acme.workspace:compatible') {
    throw new Error(`Unexpected external consumer output: ${runtimeOutput}`);
  }
  for (const specifier of ['@lensx/plugin-contract/dist/src/validate.js', '@lensx/plugin-contract/registration']) {
    const deepImport = spawnSync(
      'node',
      ['--input-type=module', '--eval', `await import(${JSON.stringify(specifier)})`],
      { cwd: consumerRoot, encoding: 'utf8' },
    );
    if (deepImport.status === 0 || !deepImport.stderr.includes('ERR_PACKAGE_PATH_NOT_EXPORTED')) {
      throw new Error(`Undeclared Contract import was not rejected: ${specifier}.`);
    }
  }

  console.log(`Packed ${files.length} public files and verified an isolated external consumer.`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
