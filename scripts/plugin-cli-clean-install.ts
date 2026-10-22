import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, chmod, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { discoverWorkspaceMembers } from './workspace-lifecycle.ts';

const sourceRoots = [
  'packages/plugin-contract',
  'packages/plugin-cli',
  'examples/plugins/framework-neutral',
  'examples/plugins/react-semi',
] as const;
const excludedNames = new Set([
  'node_modules',
  'dist',
  '.build',
  'target',
  '.git',
  '.cache',
  '.pnpm-store',
  '.turbo',
  'coverage',
  'artifacts',
]);
const entry = 'packages/plugin-cli/bin/lensx-plugin.mjs';
const consumer = 'plugins/translation';
const shim = `${consumer}/node_modules/.bin/lensx-plugin`;
const buildOutputs = ['packages/plugin-contract/dist', 'packages/plugin-cli/dist'] as const;

export const isWithinDirectory = (root: string, path: string): boolean => {
  const suffix = relative(root, path);
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`));
};

export const shouldCopyCleanSource = (path: string): boolean => {
  const parts = path.split(/[\\/]/u);
  return (
    !isAbsolute(path) &&
    parts.every((part) => part !== '..' && !excludedNames.has(part)) &&
    !path.endsWith('.tsbuildinfo')
  );
};

export const cleanWorkspaceInputs = (memberPaths: readonly string[]): string[] => {
  for (const path of memberPaths) {
    if (!shouldCopyCleanSource(path) || !/^(?:packages|plugins|examples\/plugins)\/[^/]+$/u.test(path)) {
      throw new Error(`Source install: unsupported workspace member ${path}.`);
    }
  }
  for (const required of [...sourceRoots, consumer]) {
    if (!memberPaths.includes(required)) throw new Error(`Source install: missing workspace member ${required}.`);
  }
  return [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    ...sourceRoots,
    ...memberPaths
      .filter((path) => !sourceRoots.includes(path as (typeof sourceRoots)[number]))
      .map((path) => `${path}/package.json`),
  ].sort();
};

export const cleanInstallEnvironment = (environment: NodeJS.ProcessEnv, checkout: string): NodeJS.ProcessEnv => {
  const result = { ...environment };
  delete result.NODE_PATH;
  result.PATH = (result.PATH ?? '')
    .split(delimiter)
    .filter(
      (path) => isAbsolute(path) && !isWithinDirectory(checkout, path) && !path.split(sep).includes('node_modules'),
    )
    .join(delimiter);
  return result;
};

export const resolveCleanInstallEnvironment = async (
  environment: NodeJS.ProcessEnv,
  checkout: string,
): Promise<NodeJS.ProcessEnv> => {
  const cleaned = cleanInstallEnvironment(environment, checkout);
  const directories = await Promise.all(
    (cleaned.PATH ?? '')
      .split(delimiter)
      .filter(Boolean)
      .map((path) => realpath(path).catch(() => '')),
  );
  return cleanInstallEnvironment({ ...cleaned, PATH: [...new Set(directories)].join(delimiter) }, checkout);
};

interface CommandResult {
  readonly error?: Error;
  readonly signal?: string | null;
  readonly status: number | null;
  readonly stdout?: string | null;
  readonly stderr?: string | null;
}

export const requireCleanCommandSuccess = (stage: string, result: CommandResult): string => {
  if (result.error !== undefined || result.signal || result.status !== 0) {
    const reason = result.error?.message ?? result.signal ?? `status ${result.status}`;
    throw new Error(
      `Source install ${stage} failed: ${reason}.\nstdout: ${result.stdout?.slice(-8192) || '<empty>'}\nstderr: ${result.stderr?.slice(-8192) || '<empty>'}`,
    );
  }
  return result.stdout ?? '';
};

export const requireCleanCliEnvelope = (stdout: string, command: 'create' | 'validate'): Record<string, unknown> => {
  let value: unknown;
  try {
    assert.equal(stdout.trim().split('\n').length, 1);
    value = JSON.parse(stdout);
  } catch {
    throw new Error(`Source install ${command}: expected one JSON document.`);
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    !('schema_version' in value) ||
    value.schema_version !== '1' ||
    !('command' in value) ||
    value.command !== command ||
    !('status' in value) ||
    value.status !== (command === 'create' ? 'success' : 'compatible') ||
    !('result' in value) ||
    value.result === null ||
    typeof value.result !== 'object' ||
    !('runtime_kind' in value.result) ||
    value.result.runtime_kind !== 'webview'
  ) {
    throw new Error(`Source install ${command}: unexpected CLI result.`);
  }
  return value as Record<string, unknown>;
};

export const requireCleanInstallLog = (output: string): void => {
  if (
    output
      .split('\n')
      .some(
        (line) => /lensx-plugin|plugin-cli/u.test(line) && /ENOENT|no such file|failed to create|missing/iu.test(line),
      )
  ) {
    throw new Error('Source install: public CLI entry warning in installation output.');
  }
};

export const withCleanInstallDirectory = async <Value>(
  parent: string,
  run: (directory: string) => Promise<Value>,
): Promise<Value> => {
  const directory = await realpath(await mkdtemp(resolve(parent, 'source-install-')));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

interface SourceFile {
  readonly path: string;
  readonly bytes: Buffer;
  readonly mode: number;
}

const readSourceFiles = async (root: string, inputs: readonly string[]): Promise<SourceFile[]> => {
  const files: SourceFile[] = [];
  const visit = async (path: string): Promise<void> => {
    if (!shouldCopyCleanSource(path)) return;
    const absolute = resolve(root, path);
    assert.ok(isWithinDirectory(root, absolute), `Source install: input escapes checkout: ${path}`);
    const metadata = await lstat(absolute);
    if (metadata.isDirectory()) {
      for (const child of (await readdir(absolute)).sort()) await visit(`${path}/${child}`);
    } else {
      assert.ok(metadata.isFile(), `Source install: unsupported source entry ${path}`);
      files.push({ path, bytes: await readFile(absolute), mode: metadata.mode });
    }
  };
  for (const path of inputs) await visit(path);
  return files;
};

const writeSourceFiles = async (root: string, files: readonly SourceFile[]): Promise<void> => {
  for (const file of files) {
    const target = resolve(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
    await chmod(target, file.mode & 0o777);
  }
};

const requireAbsent = async (root: string, paths: readonly string[]): Promise<void> => {
  for (const path of paths) {
    await assert.rejects(lstat(resolve(root, path)), { code: 'ENOENT' }, `Source install: unexpected output ${path}`);
  }
};

export const inspectCleanInstallEntry = async (
  workspace: string,
  installLog: string,
): Promise<{ bytes: Buffer; ino: number; dev: number; target: string }> => {
  requireCleanInstallLog(installLog);
  await requireAbsent(workspace, buildOutputs);
  const command = resolve(workspace, shim);
  const metadata = await lstat(command).catch(() => {
    throw new Error('Source install: first installation did not create the consumer CLI entry.');
  });
  assert.ok(
    metadata.isFile() || metadata.isSymbolicLink(),
    'Source install: consumer CLI entry is not a file or link.',
  );
  await access(command, 0o1);
  const bytes = await readFile(command);
  const declaredTarget = metadata.isSymbolicLink()
    ? await realpath(command)
    : /^# cmd-shim-target=(.+)$/mu.exec(bytes.toString())?.[1];
  assert.ok(declaredTarget, 'Source install: pnpm shim has no auditable target.');
  const target = await realpath(declaredTarget).catch(() => {
    throw new Error('Source install: consumer CLI entry points to a missing install target.');
  });
  assert.equal(
    target,
    await realpath(resolve(workspace, entry)),
    'Source install: consumer entry must target the source launcher.',
  );
  return { bytes, ino: metadata.ino, dev: metadata.dev, target };
};

export const verifyPluginCliCleanInstall = async (
  repositoryRoot: string,
  temporaryRoot: string,
  storePath: string,
): Promise<void> => {
  const checkout = await realpath(repositoryRoot);
  const store = await realpath(storePath);
  assert.ok(!isWithinDirectory(checkout, store), 'Source install: pnpm must use the machine global store.');
  const environment = await resolveCleanInstallEnvironment(process.env, checkout);
  const inputs = cleanWorkspaceInputs(
    discoverWorkspaceMembers(checkout).map(({ relativePath }) => relativePath.split(sep).join('/')),
  );
  const files = await readSourceFiles(checkout, inputs);
  const rootModules = await lstat(resolve(checkout, 'node_modules'));
  const moduleMetadata = await readFile(resolve(checkout, 'node_modules/.modules.yaml'));
  const lockfile = files.find(({ path }) => path === 'pnpm-lock.yaml');
  assert.ok(lockfile);

  const execute = (stage: string, command: string, args: readonly string[], cwd: string): string =>
    requireCleanCommandSuccess(
      stage,
      spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
    );
  const installWorkspace = (workspace: string): string => {
    const result = spawnSync(
      'pnpm',
      ['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--store-dir', store],
      {
        cwd: workspace,
        env: environment,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    requireCleanCommandSuccess('offline frozen-lockfile installation', result);
    return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  };

  try {
    await withCleanInstallDirectory(temporaryRoot, async (directory) => {
      const workspace = resolve(directory, 'workspace');
      await writeSourceFiles(workspace, files);
      const packageManager = JSON.parse(await readFile(resolve(workspace, 'package.json'), 'utf8')).packageManager;
      assert.equal(packageManager, 'pnpm@11.17.0');
      assert.equal(
        execute('pnpm version', 'pnpm', ['--version'], workspace).trim(),
        packageManager.slice('pnpm@'.length),
      );
      assert.equal(
        await realpath(execute('store audit', 'pnpm', ['store', 'path', '--store-dir', store], workspace).trim()),
        store,
      );
      console.log(
        `Source install isolation: NODE_PATH absent; ${environment.PATH?.split(delimiter).length} canonical PATH directories exclude checkout dependencies; global store=${store}.`,
      );
      await requireAbsent(workspace, [...buildOutputs, shim]);
      const install = installWorkspace(workspace);
      const initialEntry = await inspectCleanInstallEntry(workspace, install);
      assert.deepEqual(await readFile(resolve(workspace, 'pnpm-lock.yaml')), lockfile.bytes);
      const shimSource = initialEntry.bytes.toString();
      assert.ok(!shimSource.includes(checkout), 'Source install: shim borrows the original checkout.');
      assert.ok(!shimSource.includes('dist/src/bin.js'), 'Source install: shim depends on build output.');
      const shimModulePaths = [...shimSource.matchAll(/export NODE_PATH="([^"]*)"/gu)];
      assert.ok(shimModulePaths.length > 0, 'Source install: pnpm shim module paths could not be audited.');
      for (const [, paths] of shimModulePaths) {
        for (const path of paths.split(delimiter).filter((value) => value !== '$NODE_PATH')) {
          assert.ok(
            isAbsolute(path) && isWithinDirectory(workspace, path),
            `Source install: shim module path escapes the workspace: ${path}`,
          );
        }
      }
      const cliBin = resolve(workspace, shim);
      const unbuilt = spawnSync(cliBin, ['--help'], { cwd: workspace, env: environment, encoding: 'utf8' });
      assert.equal(unbuilt.error, undefined);
      assert.ok(
        unbuilt.status !== null && unbuilt.status !== 0,
        'Source install: an unbuilt CLI must fail without building.',
      );
      await requireAbsent(workspace, buildOutputs);

      for (const name of ['plugin-contract', 'plugin-cli']) {
        execute(`build ${name}`, 'pnpm', ['run', 'build'], resolve(workspace, 'packages', name));
      }
      const afterBuild = await lstat(cliBin);
      assert.equal(afterBuild.ino, initialEntry.ino, 'Source install: build replaced the first shim.');
      assert.equal(afterBuild.dev, initialEntry.dev);
      assert.deepEqual(await readFile(cliBin), initialEntry.bytes, 'Source install: build rewrote the first shim.');
      const resolutions = [
        [`${consumer}/node_modules/@lensx/plugin-cli`, 'packages/plugin-cli'],
        ['packages/plugin-cli/node_modules/@lensx/plugin-contract', 'packages/plugin-contract'],
        ['packages/plugin-cli/node_modules/@structured-world/structured-zstd', undefined],
        ['packages/plugin-contract/node_modules/ajv', undefined],
        ['packages/plugin-cli/node_modules/typescript', undefined],
      ] as const;
      for (const [path, expected] of resolutions) {
        const resolved = await realpath(resolve(workspace, path));
        assert.ok(isWithinDirectory(workspace, resolved), `Source install: ${path} resolves outside the workspace.`);
        if (expected !== undefined) assert.equal(resolved, await realpath(resolve(workspace, expected)));
        console.log(`Source install resolution: ${path} -> ${relative(workspace, resolved)}.`);
      }
      assert.match(execute('--help', cliBin, ['--help'], workspace), /lensx-plugin/u);
      const version = JSON.parse(
        await readFile(resolve(workspace, 'packages/plugin-cli/package.json'), 'utf8'),
      ).version;
      assert.equal(execute('--version', cliBin, ['--version'], workspace).trim(), `lensx-plugin ${version}`);
      const project = resolve(directory, 'created-plugin');
      const created = execute(
        'create',
        cliBin,
        [
          'create',
          project,
          '--template',
          'framework-neutral',
          '--plugin-id',
          'com.example.clean-install',
          '--name',
          'Clean Install',
          '--json',
        ],
        workspace,
      );
      requireCleanCliEnvelope(created, 'create');
      await mkdir(resolve(project, 'dist'));
      await writeFile(resolve(project, 'dist/manifest.json'), await readFile(resolve(project, 'manifest.json')));
      await writeFile(
        resolve(project, 'dist/index.html'),
        '<!doctype html><html><body>CLI clean installation fixture</body></html>\n',
      );
      const validated = execute('validate', cliBin, ['validate', '--project', project, '--json'], workspace);
      requireCleanCliEnvelope(validated, 'validate');
      assert.deepEqual(await readFile(resolve(workspace, 'pnpm-lock.yaml')), lockfile.bytes);
      assert.deepEqual(await readFile(cliBin), initialEntry.bytes);
      console.log(
        `Source install first shim: target=${initialEntry.target}; dev=${initialEntry.dev}; ino=${initialEntry.ino}; sha256=${createHash('sha256').update(initialEntry.bytes).digest('hex')}.`,
      );
      console.log(
        `Source install public commands: --help, --version, create, validate exited 0.\n${created.trim()}\n${validated.trim()}`,
      );

      // A separate first installation proves the old manifest target is rejected before any build.
      const broken = resolve(directory, 'missing-entry-workspace');
      await writeSourceFiles(broken, files);
      const manifestPath = resolve(broken, 'packages/plugin-cli/package.json');
      const metadata = JSON.parse(await readFile(manifestPath, 'utf8'));
      metadata.bin['lensx-plugin'] = './dist/src/bin.js';
      await writeFile(manifestPath, `${JSON.stringify(metadata, null, 2)}\n`);
      await requireAbsent(broken, [...buildOutputs, shim]);
      const brokenInstall = installWorkspace(broken);
      await assert.rejects(
        inspectCleanInstallEntry(broken, brokenInstall),
        /Source install: (?:public CLI entry warning|first installation did not create|consumer CLI entry points to a missing)/u,
      );
      await requireAbsent(broken, buildOutputs);
      assert.deepEqual(await readFile(resolve(broken, 'pnpm-lock.yaml')), lockfile.bytes);
      console.log('Source install negative regression: the old dist bin target failed the first-install entry check.');
    });
  } finally {
    for (const file of files)
      assert.deepEqual(
        await readFile(resolve(checkout, file.path)),
        file.bytes,
        `Source install changed checkout input ${file.path}.`,
      );
    const afterModules = await lstat(resolve(checkout, 'node_modules'));
    assert.equal(afterModules.ino, rootModules.ino, 'Source install replaced checkout node_modules.');
    assert.equal(afterModules.dev, rootModules.dev);
    assert.deepEqual(
      await readFile(resolve(checkout, 'node_modules/.modules.yaml')),
      moduleMetadata,
      'Source install changed checkout dependency metadata.',
    );
  }
  console.log(
    'Verified clean source installation, unchanged first shim, public CLI commands, negative regression, cleanup, and checkout preservation.',
  );
};
