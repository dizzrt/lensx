import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePackedPackage } from './package-validation.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const contractRoot = resolve(repositoryRoot, 'packages/plugin-contract');
const sdkRoot = resolve(repositoryRoot, 'packages/plugin-sdk');
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-ui-pack-'));

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

const collectRuntimeImports = async (directory) => {
  const imports = [];
  for (const path of await collectFiles(directory, '.js')) {
    const source = await readFile(path, 'utf8');
    imports.push(...[...source.matchAll(/(?:from\s+|import\s*)['"]([^.'"][^'"]*)['"]/gu)].map((match) => match[1]));
  }
  return imports;
};

try {
  const pnpmStorePath = run('pnpm', ['store', 'path'], repositoryRoot).trim();
  run('pnpm', ['run', 'build'], contractRoot, { stdio: 'inherit' });
  run('pnpm', ['run', 'build'], sdkRoot, { stdio: 'inherit' });
  run('pnpm', ['run', 'build'], packageRoot, { stdio: 'inherit' });

  const contractPack = pack(contractRoot);
  const sdkPack = pack(sdkRoot);
  const uiPack = pack(packageRoot);
  const files = uiPack.metadata.files.map(({ path }) => path).sort();
  const packedMetadata = JSON.parse(run('tar', ['-xOf', uiPack.path, 'package/package.json'], temporaryRoot));
  const sdkMetadata = JSON.parse(run('tar', ['-xOf', sdkPack.path, 'package/package.json'], temporaryRoot));
  const declarationPaths = await collectFiles(resolve(packageRoot, 'dist'), '.d.ts');
  const declarationSources = await Promise.all(declarationPaths.map((path) => readFile(path, 'utf8')));
  const rootDeclaration = await readFile(resolve(packageRoot, 'dist/src/index.d.ts'), 'utf8');
  const styles = await readFile(resolve(packageRoot, 'dist/styles.css'), 'utf8');
  const runtimeImports = await collectRuntimeImports(resolve(packageRoot, 'dist'));
  const diagnostics = validatePackedPackage({
    declarationSources,
    files,
    metadata: packedMetadata,
    rootDeclaration,
    runtimeImports,
    styles,
  });
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.join('\n'));
  }
  if (JSON.stringify(sdkMetadata).includes('@lensx/plugin-ui') || JSON.stringify(sdkMetadata).includes('react')) {
    throw new Error('Plugin SDK package metadata gained a UI or React reverse dependency.');
  }

  const sdkDeclarations = (
    await Promise.all((await collectFiles(resolve(sdkRoot, 'dist'), '.d.ts')).map((path) => readFile(path, 'utf8')))
  ).join('\n');
  if (/@lensx\/plugin-ui|@douyinfe\/semi-ui|from ['"]react['"]/u.test(sdkDeclarations)) {
    throw new Error('Plugin SDK public declarations gained a UI, Semi, or React reverse dependency.');
  }

  const consumerRoot = resolve(temporaryRoot, 'consumer');
  await cp(resolve(repositoryRoot, 'examples/plugin-ui-consumer'), consumerRoot, { recursive: true });
  await writeFile(
    resolve(consumerRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'lensx-plugin-ui-external-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@lensx/plugin-contract': `file:${contractPack.path}`,
          '@lensx/plugin-sdk': `file:${sdkPack.path}`,
          '@lensx/plugin-ui': `file:${uiPack.path}`,
          react: '19.2.8',
          'react-dom': '19.2.8',
        },
        devDependencies: {
          '@rsbuild/core': '2.1.9',
          '@rsbuild/plugin-react': '2.1.0',
          ...(process.platform === 'darwin' && process.arch === 'arm64'
            ? { '@rspack/binding-darwin-arm64': '2.1.8' }
            : {}),
          '@types/node': '24.13.3',
          '@types/react': '19.2.17',
          '@types/react-dom': '19.2.3',
          typescript: '6.0.3',
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
      `  '@lensx/plugin-ui': file:${uiPack.path}`,
      "  '@douyinfe/semi-ui': 2.101.1",
      "  '@types/react': 19.2.17",
      "  '@types/react-dom': 19.2.3",
      "  'ajv': 8.20.0",
      "  'fast-deep-equal': 3.1.3",
      "  'fast-uri': 3.1.4",
      "  'json-schema-traverse': 1.0.0",
      "  'react': 19.2.8",
      "  'react-dom': 19.2.8",
      "  'require-from-string': 2.0.2",
      '',
    ].join('\n'),
    'utf8',
  );

  run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', pnpmStorePath], consumerRoot, {
    stdio: 'inherit',
  });
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], consumerRoot, { stdio: 'inherit' });
  run('pnpm', ['exec', 'rsbuild', 'build'], consumerRoot, { stdio: 'inherit' });

  const modules = JSON.parse(await readFile(resolve(consumerRoot, 'dist/modules.json'), 'utf8'));
  const reactRuntimeRoots = new Set(
    modules.flatMap((identifier) => {
      const match = /node_modules\/.pnpm\/(react@[^/]+)\/node_modules\/react\//u.exec(identifier.replaceAll('\\', '/'));
      return match?.[1] === undefined ? [] : [match[1]];
    }),
  );
  if (reactRuntimeRoots.size !== 1) {
    throw new Error(`Expected one plugin-owned React Runtime, found: ${[...reactRuntimeRoots].join(', ') || 'none'}.`);
  }
  if (!modules.some((identifier) => identifier.includes('@douyinfe/semi-ui'))) {
    throw new Error('The consumer module graph does not contain Semi Design.');
  }
  if (
    !modules.some((identifier) => identifier.includes('@lensx+plugin-ui') || identifier.includes('@lensx/plugin-ui'))
  ) {
    throw new Error('The consumer module graph does not contain the packed Plugin UI package.');
  }

  const javascript = (
    await Promise.all((await collectFiles(resolve(consumerRoot, 'dist'), '.js')).map((path) => readFile(path, 'utf8')))
  ).join('\n');
  const consumerStyles = (
    await Promise.all((await collectFiles(resolve(consumerRoot, 'dist'), '.css')).map((path) => readFile(path, 'utf8')))
  ).join('\n');
  if (/(?:from\s+|import\s*)['"](?:react|react-dom|@douyinfe\/semi-ui|@lensx\/plugin-ui)/u.test(javascript)) {
    throw new Error('The browser bundle contains an unresolved Runtime bare import.');
  }
  for (const forbidden of ['@tauri-apps/', 'src/app/', 'window.React', 'window.Semi', 'type="importmap"']) {
    if (javascript.includes(forbidden)) {
      throw new Error(`Forbidden Host Runtime reference in browser bundle: ${forbidden}.`);
    }
  }
  if (!consumerStyles.includes('--lensx-plugin-color-background') || !consumerStyles.includes('.semi-button')) {
    throw new Error('The browser bundle is missing Plugin UI or Semi styles.');
  }

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const previewPort = 46_000 + (process.pid % 1_000);
  const previewUrl = `http://127.0.0.1:${previewPort}`;
  const preview = spawn('pnpm', ['exec', 'rsbuild', 'preview', '--host', '127.0.0.1', '--port', String(previewPort)], {
    cwd: consumerRoot,
    stdio: 'ignore',
  });
  try {
    let previewReady = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const probe = spawnSync('curl', ['--fail', '--silent', previewUrl], { encoding: 'utf8' });
      if (probe.status === 0) {
        previewReady = true;
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
    if (!previewReady) {
      throw new Error('The isolated consumer preview server did not become ready.');
    }

    const chromeResult = spawnSync(
      chromePath,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-extensions',
        '--disable-gpu',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-sandbox',
        `--user-data-dir=${resolve(temporaryRoot, 'chrome-profile')}`,
        '--virtual-time-budget=3000',
        '--dump-dom',
        previewUrl,
      ],
      { cwd: consumerRoot, encoding: 'utf8', killSignal: 'SIGKILL', timeout: 10_000 },
    );
    const chromeOutput = chromeResult.stdout;
    if (!chromeOutput.includes('data-smoke="ready"') || !chromeOutput.includes('<main ')) {
      throw new Error(
        `The isolated browser Runtime smoke test did not render the public Plugin UI entry.\n${chromeOutput}\n${chromeResult.stderr}`,
      );
    }
  } finally {
    preview.kill('SIGKILL');
  }

  for (const specifier of ['@lensx/plugin-ui/dist/src/plugin-page.js', '@lensx/plugin-ui/src/styles.less']) {
    const deepImport = spawnSync(
      'node',
      ['--input-type=module', '--eval', `await import(${JSON.stringify(specifier)})`],
      {
        cwd: consumerRoot,
        encoding: 'utf8',
      },
    );
    if (deepImport.status === 0 || !deepImport.stderr.includes('ERR_PACKAGE_PATH_NOT_EXPORTED')) {
      throw new Error(`Undeclared UI deep import was not rejected: ${specifier}.`);
    }
  }

  console.log(
    `Packed ${files.length} UI files; verified metadata, one React Runtime, SDK isolation, browser bundle, and Runtime smoke.`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
