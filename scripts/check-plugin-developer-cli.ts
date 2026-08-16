import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-cli-consumer-'));
const publicPackages = ['plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit', 'plugin-cli'] as const;
const templates = ['framework-neutral', 'react-semi'] as const;

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const runResult = (
  command: string,
  arguments_: readonly string[],
  cwd: string,
  options: { readonly env?: NodeJS.ProcessEnv; readonly stdio?: 'inherit' } = {},
): RunResult => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', ...options });
  if (result.error !== undefined) throw result.error;
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};

const run = (
  command: string,
  arguments_: readonly string[],
  cwd: string,
  options: { readonly env?: NodeJS.ProcessEnv; readonly stdio?: 'inherit' } = {},
): string => {
  const result = runResult(command, arguments_, cwd, options);
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
};

const pack = (root: string): string => {
  const metadata = JSON.parse(run('pnpm', ['pack', '--json', '--pack-destination', temporaryRoot], root)) as {
    filename: string;
  };
  return isAbsolute(metadata.filename) ? metadata.filename : resolve(temporaryRoot, metadata.filename);
};

const parseEnvelope = (output: string, command: string) => {
  const lines = output.trim().split('\n');
  if (lines.length !== 1) throw new Error(`${command} JSON output was not one document.`);
  const value = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
  if (value.schema_version !== '1' || value.command !== command) {
    throw new Error(`${command} returned an unexpected JSON envelope.`);
  }
  return value;
};

const requireWebviewResult = (envelope: Record<string, unknown>, command: string): void => {
  const result = envelope.result;
  if (result === null || typeof result !== 'object' || (result as Record<string, unknown>).runtime_kind !== 'webview') {
    throw new Error(`${command} did not report the WebView Runtime.`);
  }
};

const overridesFor = (packed: ReadonlyMap<string, string>) =>
  [
    'overrides:',
    ...[...packed].map(([name, path]) => `  '${name}': file:${path}`),
    "  '@douyinfe/semi-ui': 2.101.1",
    "  '@rsbuild/core': 2.1.9",
    "  '@rsbuild/plugin-less': 2.0.1",
    "  '@rsbuild/plugin-react': 2.1.0",
    "  '@rstest/adapter-rsbuild': 0.11.4",
    "  '@rstest/core': 0.11.4",
    "  '@testing-library/dom': 10.4.1",
    "  '@testing-library/jest-dom': 6.9.1",
    "  '@testing-library/react': 16.3.2",
    "  '@types/node': 24.13.3",
    "  '@types/react': 19.2.17",
    "  '@types/react-dom': 19.2.3",
    "  '@structured-world/structured-zstd': 0.0.49",
    "  'ajv': 8.20.0",
    "  'fast-deep-equal': 3.1.3",
    "  'fast-uri': 3.1.4",
    "  'happy-dom': 20.11.0",
    "  'json-schema-traverse': 1.0.0",
    "  'less': 4.8.1",
    "  'react': 19.2.8",
    "  'react-dom': 19.2.8",
    "  'require-from-string': 2.0.2",
    "  'typescript': 6.0.3",
    "  'ws': 8.21.1",
    '',
  ].join('\n');

try {
  const pnpmStorePath = run('pnpm', ['store', 'path'], repositoryRoot).trim();
  const packed = new Map<string, string>();
  for (const packageDirectory of publicPackages) {
    const packageRoot = resolve(repositoryRoot, 'packages', packageDirectory);
    run('pnpm', ['run', 'build'], packageRoot, { stdio: 'inherit' });
    packed.set(`@lensx/${packageDirectory}`, pack(packageRoot));
  }

  const toolingRoot = resolve(temporaryRoot, 'tooling');
  await cp(resolve(repositoryRoot, 'examples/plugin-contract-consumer'), toolingRoot, {
    recursive: true,
  });
  await writeFile(
    resolve(toolingRoot, 'package.json'),
    `${JSON.stringify({
      name: 'lensx-plugin-cli-isolated-tooling',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.17.0',
      dependencies: Object.fromEntries([...packed].map(([name, path]) => [name, `file:${path}`])),
    })}\n`,
  );
  await writeFile(resolve(toolingRoot, 'pnpm-workspace.yaml'), overridesFor(packed));
  run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', pnpmStorePath], toolingRoot, {
    stdio: 'inherit',
  });
  const cliBin = resolve(toolingRoot, 'node_modules/.bin/lensx-plugin');
  run(cliBin, ['--help'], toolingRoot);
  run(cliBin, ['--version'], toolingRoot);
  const deepImport = runResult(
    'node',
    ['--input-type=module', '--eval', "await import('@lensx/plugin-cli/dist/src/package-format/index.js')"],
    toolingRoot,
  );
  if (deepImport.status === 0 || !deepImport.stderr.includes('ERR_PACKAGE_PATH_NOT_EXPORTED')) {
    throw new Error('CLI internal package-format deep import was not rejected by exports.');
  }

  const packageOutputs: string[] = [];
  for (const template of templates) {
    const consumerRoot = resolve(temporaryRoot, `consumer-${template}`);
    const projectRoot = resolve(consumerRoot, 'plugin');
    await mkdir(consumerRoot);
    await writeFile(resolve(temporaryRoot, `consumer-${template}.json`), `${JSON.stringify({ template })}\n`);
    await writeFile(resolve(temporaryRoot, `consumer-${template}-workspace.yaml`), overridesFor(packed));
    await writeFile(
      resolve(temporaryRoot, `consumer-${template}-package.json`),
      `${JSON.stringify({
        name: `lensx-plugin-cli-${template}-consumer`,
        private: true,
        type: 'module',
        packageManager: 'pnpm@11.17.0',
        devDependencies:
          process.platform === 'darwin' && process.arch === 'arm64' ? { '@rspack/binding-darwin-arm64': '2.1.8' } : {},
      })}\n`,
    );
    await cp(resolve(temporaryRoot, `consumer-${template}-package.json`), resolve(consumerRoot, 'package.json'));
    await cp(
      resolve(temporaryRoot, `consumer-${template}-workspace.yaml`),
      resolve(consumerRoot, 'pnpm-workspace.yaml'),
    );
    const workspaceSource = await readFile(resolve(consumerRoot, 'pnpm-workspace.yaml'), 'utf8');
    await writeFile(resolve(consumerRoot, 'pnpm-workspace.yaml'), `packages:\n  - 'plugin'\n${workspaceSource}`);

    const create = runResult(
      cliBin,
      [
        'create',
        projectRoot,
        '--template',
        template,
        '--plugin-id',
        `com.example.cli-${template}`,
        '--name',
        `${template} plugin`,
        '--json',
      ],
      toolingRoot,
    );
    const createEnvelope = parseEnvelope(create.stdout, 'create');
    if (create.status !== 0 || createEnvelope.status !== 'success') {
      throw new Error(`CLI create failed for ${template}.\n${create.stdout}\n${create.stderr}`);
    }
    requireWebviewResult(createEnvelope, 'create');
    const negativeCreate = runResult(
      cliBin,
      ['create', projectRoot, '--template', template, '--plugin-id', 'invalid', '--name', 'Invalid', '--json'],
      toolingRoot,
    );
    if (negativeCreate.status !== 2 || parseEnvelope(negativeCreate.stdout, 'create').status !== 'usage_error') {
      throw new Error(`CLI create negative case drifted for ${template}.`);
    }

    run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', pnpmStorePath], consumerRoot, {
      stdio: 'inherit',
    });
    for (const script of ['test', 'typecheck', 'build']) {
      run('pnpm', ['run', script], projectRoot, {
        env: script === 'build' ? { ...process.env, LENSX_TEMPLATE_MODULE_GRAPH: '1' } : process.env,
        stdio: 'inherit',
      });
    }

    const build = runResult(cliBin, ['build', '--project', projectRoot, '--json'], toolingRoot);
    const buildEnvelope = parseEnvelope(build.stdout, 'build');
    if (build.status !== 0 || buildEnvelope.status !== 'success') {
      throw new Error(`CLI build failed for ${template}.\n${build.stdout}\n${build.stderr}`);
    }
    requireWebviewResult(buildEnvelope, 'build');

    const validate = runResult(cliBin, ['validate', '--project', projectRoot, '--json'], toolingRoot);
    const validateEnvelope = parseEnvelope(validate.stdout, 'validate');
    if (validate.status !== 0 || validateEnvelope.status !== 'compatible') {
      throw new Error(`CLI validate failed for ${template}.\n${validate.stdout}\n${validate.stderr}`);
    }
    requireWebviewResult(validateEnvelope, 'validate');
    const firstPack = runResult(cliBin, ['pack', '--project', projectRoot, '--no-build', '--json'], toolingRoot);
    const firstSummary = parseEnvelope(firstPack.stdout, 'pack') as {
      result: { output: string; package_digest: unknown };
    };
    if (firstPack.status !== 0) throw new Error(`First CLI pack failed for ${template}.`);
    requireWebviewResult(firstSummary, 'pack');
    const packagePath = resolve(projectRoot, firstSummary.result.output);
    const firstBytes = await readFile(packagePath);
    const secondPack = runResult(cliBin, ['pack', '--project', projectRoot, '--no-build', '--json'], toolingRoot);
    const secondSummary = parseEnvelope(secondPack.stdout, 'pack') as { result: { package_digest: unknown } };
    if (
      secondPack.status !== 0 ||
      JSON.stringify(firstSummary.result.package_digest) !== JSON.stringify(secondSummary.result.package_digest)
    ) {
      throw new Error(`Repeat CLI pack drifted for ${template}.`);
    }
    if (!firstBytes.equals(await readFile(packagePath)))
      throw new Error(`Repeat package bytes drifted for ${template}.`);
    const inspect = runResult(cliBin, ['inspect', packagePath, '--json'], toolingRoot);
    const inspectEnvelope = parseEnvelope(inspect.stdout, 'inspect');
    if (inspect.status !== 0 || inspectEnvelope.status !== 'compatible') {
      throw new Error(`CLI inspect failed for ${template}.`);
    }
    requireWebviewResult(inspectEnvelope, 'inspect');

    const packInsideDist = runResult(
      cliBin,
      ['pack', '--project', projectRoot, '--output', resolve(projectRoot, 'dist/fail.lxp'), '--no-build', '--json'],
      toolingRoot,
    );
    if (packInsideDist.status !== 2 || parseEnvelope(packInsideDist.stdout, 'pack').status !== 'usage_error') {
      throw new Error(`CLI pack negative case drifted for ${template}.`);
    }
    const corrupt = resolve(consumerRoot, 'corrupt.lxp');
    await writeFile(corrupt, 'not zstandard');
    const invalidInspect = runResult(cliBin, ['inspect', corrupt, '--json'], toolingRoot);
    if (invalidInspect.status !== 1 || parseEnvelope(invalidInspect.stdout, 'inspect').status !== 'invalid') {
      throw new Error(`CLI inspect negative case drifted for ${template}.`);
    }

    const lockfile = await readFile(resolve(consumerRoot, 'pnpm-lock.yaml'), 'utf8');
    for (const forbidden of [repositoryRoot, `${repositoryRoot}/node_modules`, `${repositoryRoot}/.pnpm-store`]) {
      if (lockfile.includes(forbidden)) throw new Error(`${template} lockfile links back to ${forbidden}.`);
    }
    const generatedMetadata = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const generatedManifest = JSON.parse(await readFile(resolve(projectRoot, 'manifest.json'), 'utf8')) as {
      manifest_version?: unknown;
      runtime?: { kind?: unknown };
    };
    if (generatedManifest.manifest_version !== '0.4.0' || generatedManifest.runtime?.kind !== 'webview') {
      throw new Error(`${template} generated a legacy Manifest.`);
    }
    const generatedSources = [
      await readFile(resolve(projectRoot, template === 'react-semi' ? 'src/App.tsx' : 'src/main.ts'), 'utf8'),
    ].join('\n');
    if (
      !generatedSources.includes('@lensx/plugin-sdk/webview') ||
      !generatedSources.includes('createPluginWebviewTransport') ||
      /plugin-sdk\/iframe|createPluginIframeTransport/u.test(generatedSources)
    ) {
      throw new Error(`${template} generated a legacy SDK lifecycle.`);
    }
    for (const dependency of Object.keys({
      ...generatedMetadata.dependencies,
      ...generatedMetadata.devDependencies,
    }).filter((name) => name.startsWith('@lensx/'))) {
      const resolvedDependency = await realpath(resolve(projectRoot, 'node_modules', dependency));
      if (resolvedDependency.startsWith(repositoryRoot)) {
        throw new Error(`${template} dependency ${dependency} links back to the checkout.`);
      }
    }

    const legacyManifest = {
      ...generatedManifest,
      manifest_version: '0.2.0',
      runtime: { ...(generatedManifest.runtime ?? {}), kind: 'iframe' },
    };
    const legacyManifestBytes = `${JSON.stringify(legacyManifest, null, 2)}\n`;
    await writeFile(resolve(projectRoot, 'manifest.json'), legacyManifestBytes);
    const beforeLegacyDist = await readFile(resolve(projectRoot, 'dist/manifest.json'));
    const beforeLegacyArtifact = await readFile(packagePath);
    for (const command of [
      ['build', '--project', projectRoot, '--json'],
      ['validate', '--project', projectRoot, '--json'],
      ['pack', '--project', projectRoot, '--json'],
    ]) {
      const legacyResult = runResult(cliBin, command, toolingRoot);
      const legacyEnvelope = parseEnvelope(legacyResult.stdout, command[0] ?? 'unknown') as {
        status?: unknown;
        diagnostics?: Array<{ code?: unknown; message_key?: unknown }>;
      };
      if (
        legacyResult.status !== 1 ||
        legacyEnvelope.status !== 'incompatible' ||
        !legacyEnvelope.diagnostics?.some(
          ({ code, message_key }) =>
            code === 'CLI_LEGACY_IFRAME_RUNTIME' && message_key === 'legacy_runtime_incompatible',
        )
      ) {
        throw new Error(`${template} legacy ${command[0]} classification drifted.`);
      }
      if ((await readFile(resolve(projectRoot, 'manifest.json'), 'utf8')) !== legacyManifestBytes) {
        throw new Error(`${template} legacy ${command[0]} rewrote the author Manifest.`);
      }
      if (!(await readFile(resolve(projectRoot, 'dist/manifest.json'))).equals(beforeLegacyDist)) {
        throw new Error(`${template} legacy ${command[0]} executed or rewrote build output.`);
      }
      if (!(await readFile(packagePath)).equals(beforeLegacyArtifact)) {
        throw new Error(`${template} legacy ${command[0]} replaced the existing artifact.`);
      }
    }
    packageOutputs.push(packagePath);
  }

  const legacyPackage = resolve(toolingRoot, 'legacy-iframe-runtime.lxp');
  await cp(
    resolve(repositoryRoot, 'fixtures/plugin-package-format/incompatible/legacy-iframe-runtime.lxp'),
    legacyPackage,
  );
  const legacyInspect = runResult(cliBin, ['inspect', legacyPackage, '--json'], toolingRoot);
  const legacyInspectEnvelope = parseEnvelope(legacyInspect.stdout, 'inspect') as {
    status?: unknown;
    result?: unknown;
    diagnostics?: Array<{ code?: unknown; message_key?: unknown }>;
  };
  if (
    legacyInspect.status !== 1 ||
    legacyInspectEnvelope.status !== 'incompatible' ||
    JSON.stringify(legacyInspectEnvelope.result) !== '{}' ||
    !legacyInspectEnvelope.diagnostics?.some(
      ({ code, message_key }) => code === 'CLI_LEGACY_IFRAME_RUNTIME' && message_key === 'legacy_runtime_incompatible',
    )
  ) {
    throw new Error('CLI legacy iframe package inspection classification drifted.');
  }

  run(
    'cargo',
    [
      'run',
      '--manifest-path',
      resolve(repositoryRoot, 'src-tauri/Cargo.toml'),
      '--example',
      'plugin_project_template_package_smoke',
      '--',
      ...packageOutputs,
    ],
    repositoryRoot,
    { stdio: 'inherit' },
  );

  const toolingLockfile = await readFile(resolve(toolingRoot, 'pnpm-lock.yaml'), 'utf8');
  if (toolingLockfile.includes(repositoryRoot) || toolingLockfile.includes('.pnpm-store')) {
    throw new Error('CLI tooling consumer lockfile links back to repository state.');
  }
  const cliRealpath = await realpath(resolve(toolingRoot, 'node_modules/@lensx/plugin-cli'));
  if (cliRealpath.startsWith(repositoryRoot)) throw new Error('CLI consumer resolves the workspace checkout.');
  if ((await lstat(await realpath(cliBin))).isFile() === false) throw new Error('CLI consumer bin is unavailable.');

  console.log('Verified isolated CLI tarballs, both generated templates, reproducible packages, and Rust preparation.');
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
