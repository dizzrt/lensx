import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePackedPackage } from './package-validation.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const contractRoot = resolve(repositoryRoot, 'packages/plugin-contract');
const sdkRoot = resolve(repositoryRoot, 'packages/plugin-sdk');
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-testkit-pack-'));

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
  run('pnpm', ['run', 'build'], sdkRoot, { stdio: 'inherit' });
  run('pnpm', ['run', 'build'], packageRoot, { stdio: 'inherit' });

  const contractPack = pack(contractRoot);
  const sdkPack = pack(sdkRoot);
  const testkitPack = pack(packageRoot);
  const files = testkitPack.metadata.files.map(({ path }) => path).sort();
  const packedMetadata = JSON.parse(run('tar', ['-xOf', testkitPack.path, 'package/package.json'], temporaryRoot));
  const sdkMetadata = JSON.parse(run('tar', ['-xOf', sdkPack.path, 'package/package.json'], temporaryRoot));
  const declarationPaths = await collectFiles(resolve(packageRoot, 'dist'), '.d.ts');
  const declarationSources = await Promise.all(declarationPaths.map((path) => readFile(path, 'utf8')));
  const runtimeImports = [];
  for (const path of await collectFiles(resolve(packageRoot, 'dist'), '.js')) {
    const source = await readFile(path, 'utf8');
    runtimeImports.push(...[...source.matchAll(/from\s+['"]([^.'"][^'"]*)['"]/gu)].map((match) => match[1]));
  }
  const diagnostics = validatePackedPackage({
    declarationSources,
    files,
    metadata: packedMetadata,
    runtimeImports,
  });
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.join('\n'));
  }
  if (JSON.stringify(sdkMetadata).includes('@lensx/plugin-testkit')) {
    throw new Error('Plugin SDK package metadata gained a Testkit reverse dependency.');
  }
  const sdkDeclarations = (
    await Promise.all((await collectFiles(resolve(sdkRoot, 'dist'), '.d.ts')).map((path) => readFile(path, 'utf8')))
  ).join('\n');
  if (sdkDeclarations.includes('@lensx/plugin-testkit')) {
    throw new Error('Plugin SDK public declarations gained a Testkit reverse dependency.');
  }

  const consumerRoot = resolve(temporaryRoot, 'consumer');
  await cp(resolve(repositoryRoot, 'examples/plugin-testkit-consumer'), consumerRoot, { recursive: true });
  await writeFile(
    resolve(consumerRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'lensx-plugin-testkit-external-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@lensx/plugin-contract': `file:${contractPack.path}`,
          '@lensx/plugin-sdk': `file:${sdkPack.path}`,
          '@lensx/plugin-testkit': `file:${testkitPack.path}`,
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
      `  '@lensx/plugin-sdk': file:${sdkPack.path}`,
      `  '@lensx/plugin-testkit': file:${testkitPack.path}`,
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
  if (runtimeOutput !== 'compatible:en-US:disposed:1:5:true:initializing,ready,disposed') {
    throw new Error(`Unexpected external consumer output: ${runtimeOutput}`);
  }

  for (const specifier of [
    '@lensx/plugin-contract/plugin-scoped-storage',
    '@lensx/plugin-sdk/plugin-scoped-storage',
    '@lensx/plugin-testkit/plugin-scoped-storage',
    '@lensx/plugin-testkit/dist/src/manifest.js',
    '@lensx/plugin-testkit/src/fake-transport.js',
    '@lensx/plugin-testkit/tests/public-api.typecheck.js',
  ]) {
    const deepImport = spawnSync(
      'node',
      ['--input-type=module', '--eval', `await import(${JSON.stringify(specifier)})`],
      {
        cwd: consumerRoot,
        encoding: 'utf8',
      },
    );
    if (deepImport.status === 0 || !deepImport.stderr.includes('ERR_PACKAGE_PATH_NOT_EXPORTED')) {
      throw new Error(`Undeclared Testkit deep import was not rejected: ${specifier}.`);
    }
  }

  console.log(`Packed ${files.length} Testkit files and verified a no-DOM isolated external consumer.`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
