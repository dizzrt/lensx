import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePackedPackage } from './package-validation.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const contractRoot = resolve(repositoryRoot, 'packages/plugin-contract');
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-sdk-pack-'));

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

const pack = (root) => {
  const output = run('pnpm', ['pack', '--json', '--pack-destination', temporaryRoot], root);
  const metadata = JSON.parse(output);
  const path = isAbsolute(metadata.filename) ? metadata.filename : resolve(temporaryRoot, metadata.filename);
  return { metadata, path };
};

const collectFiles = async (directory, extension) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, extension)));
    } else if (entry.name.endsWith(extension)) {
      files.push(path);
    }
  }
  return files;
};

try {
  const pnpmStorePath = run('pnpm', ['store', 'path'], repositoryRoot).trim();
  run('pnpm', ['run', 'build'], contractRoot, { stdio: 'inherit' });
  run('pnpm', ['run', 'build'], packageRoot, { stdio: 'inherit' });
  const contractPack = pack(contractRoot);
  const sdkPack = pack(packageRoot);
  const files = sdkPack.metadata.files.map(({ path }) => path).sort();
  const packedMetadata = JSON.parse(run('tar', ['-xOf', sdkPack.path, 'package/package.json'], temporaryRoot));

  const runtimeImports = [];
  for (const path of await collectFiles(resolve(packageRoot, 'dist'), '.js')) {
    const source = await readFile(path, 'utf8');
    runtimeImports.push(...[...source.matchAll(/from\s+['"]([^.'"][^'"]*)['"]/gu)].map((match) => match[1]));
  }
  const declarationSources = await Promise.all(
    (await collectFiles(resolve(packageRoot, 'dist'), '.d.ts')).map((path) => readFile(path, 'utf8')),
  );
  const diagnostics = validatePackedPackage({
    declarationSources,
    files,
    metadata: packedMetadata,
    runtimeImports,
  });
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.join('\n'));
  }

  const consumerRoot = resolve(temporaryRoot, 'consumer');
  await cp(resolve(repositoryRoot, 'examples/plugin-sdk-consumer'), consumerRoot, { recursive: true });
  await writeFile(
    resolve(consumerRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'lensx-plugin-sdk-external-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@lensx/plugin-contract': `file:${contractPack.path}`,
          '@lensx/plugin-sdk': `file:${sdkPack.path}`,
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
      `  '@lensx/plugin-contract': file:${contractPack.path}`,
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
          strict: true,
          target: 'ES2022',
          types: [],
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
  run(resolve(repositoryRoot, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], consumerRoot, {
    stdio: 'inherit',
  });
  const runtimeOutput = run(
    'node',
    [
      '--input-type=module',
      '--eval',
      "const consumer = await import('./dist/consumer.js'); process.stdout.write(consumer.exampleResult)",
    ],
    consumerRoot,
  ).trim();
  if (runtimeOutput !== '0.1.0:0.1.0:ready:en-US') {
    throw new Error(`Unexpected external consumer output: ${runtimeOutput}`);
  }
  const deepImport = spawnSync(
    'node',
    ['--input-type=module', '--eval', "await import('@lensx/plugin-sdk/dist/src/client.js')"],
    { cwd: consumerRoot, encoding: 'utf8' },
  );
  if (deepImport.status === 0 || !deepImport.stderr.includes('ERR_PACKAGE_PATH_NOT_EXPORTED')) {
    throw new Error('Undeclared SDK deep import was not rejected by the packed package exports.');
  }

  console.log(`Packed ${files.length} SDK files and verified a no-DOM isolated external consumer.`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
