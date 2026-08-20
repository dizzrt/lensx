import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

import { validatePluginManifest } from '@lensx/plugin-contract';

import { auditPluginTemplateBoundary } from './plugin-project-template-boundaries.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'lensx-plugin-template-external-'));
const packageNames = ['plugin-contract', 'plugin-sdk', 'plugin-testkit', 'plugin-ui'] as const;
const templates = [
  { directory: 'framework-neutral', kind: 'framework-neutral' as const },
  { directory: 'react-semi', kind: 'react-semi' as const },
];

const run = (
  command: string,
  arguments_: readonly string[],
  cwd: string,
  options: { readonly env?: NodeJS.ProcessEnv; readonly stdio?: 'inherit' } = {},
): string => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', ...options });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(' ')} failed.\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
};

const collectSources = async (root: string): Promise<Record<string, string>> => {
  const result: Record<string, string> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:[cm]?[jt]sx?)$/u.test(entry.name))
        result[path.slice(root.length + 1)] = await readFile(path, 'utf8');
    }
  };
  await visit(resolve(root, 'src'));
  return result;
};

const pack = (root: string): string => {
  const metadata = JSON.parse(run('pnpm', ['pack', '--json', '--pack-destination', temporaryRoot], root)) as {
    filename: string;
  };
  return isAbsolute(metadata.filename) ? metadata.filename : resolve(temporaryRoot, metadata.filename);
};

try {
  const pnpmStorePath = run('pnpm', ['store', 'path'], repositoryRoot).trim();
  const packed = new Map<string, string>();
  for (const name of packageNames) {
    const root = resolve(repositoryRoot, 'packages', name);
    run('pnpm', ['run', 'build'], root, { stdio: 'inherit' });
    packed.set(`@lensx/${name}`, pack(root));
  }

  for (const template of templates) {
    const sourceRoot = resolve(repositoryRoot, 'examples/plugins', template.directory);
    const consumerRoot = resolve(temporaryRoot, template.directory);
    const templateRoot = resolve(consumerRoot, 'template');
    await cp(sourceRoot, templateRoot, {
      recursive: true,
      filter: (source) => !/(?:^|\/)(?:node_modules|dist)(?:\/|$)/u.test(source),
    });
    await writeFile(
      resolve(consumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: `lensx-${template.directory}-external-consumer`,
          private: true,
          type: 'module',
          devDependencies:
            process.platform === 'darwin' && process.arch === 'arm64'
              ? { '@rspack/binding-darwin-arm64': '2.1.8' }
              : {},
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    const overrides = [
      'packages:',
      "  - 'template'",
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
    await writeFile(resolve(consumerRoot, 'pnpm-workspace.yaml'), overrides, 'utf8');

    run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', pnpmStorePath], consumerRoot, {
      stdio: 'inherit',
    });
    for (const script of ['test', 'typecheck', 'build', 'check']) {
      run('pnpm', ['run', script], templateRoot, {
        env: script === 'build' ? { ...process.env, LENSX_TEMPLATE_MODULE_GRAPH: '1' } : process.env,
        stdio: 'inherit',
      });
    }

    const metadata = JSON.parse(await readFile(resolve(templateRoot, 'package.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(resolve(templateRoot, 'manifest.json'), 'utf8'));
    const validation = validatePluginManifest(manifest);
    if (validation.status !== 'valid') throw new Error(JSON.stringify(validation.diagnostics));
    const moduleIdentifiers = JSON.parse(
      await readFile(resolve(templateRoot, 'dist/modules.json'), 'utf8'),
    ) as string[];
    const lensxDependencies = Object.keys({ ...metadata.dependencies, ...metadata.devDependencies }).filter((name) =>
      name.startsWith('@lensx/'),
    );
    const resolvedDependencies = await Promise.all(
      lensxDependencies.map((name) => realpath(resolve(templateRoot, 'node_modules', name))),
    );
    const diagnostics = auditPluginTemplateBoundary({
      kind: template.kind,
      metadata,
      moduleIdentifiers,
      repositoryRoot,
      resolvedDependencies,
      sources: await collectSources(templateRoot),
    });
    if (diagnostics.length > 0) throw new Error(diagnostics.join('\n'));

    const bundle = (
      await Promise.all(
        (
          await readdir(resolve(templateRoot, 'dist/static/js'))
        )
          .filter((file) => file.endsWith('.js'))
          .map((file) => readFile(resolve(templateRoot, 'dist/static/js', file), 'utf8')),
      )
    ).join('\n');
    for (const forbidden of [
      '@tauri-apps/',
      'src/app/',
      'tools/plugin-package-format',
      'window.React',
      'window.Semi',
      '__TAURI__',
      'getCurrentWindow',
      'setResizable',
    ]) {
      if (bundle.includes(forbidden)) throw new Error(`template/bundle-private-reference: ${forbidden}`);
    }
    if (template.kind === 'react-semi') {
      for (const expected of ['react', '@douyinfe/semi-ui', '@lensx/plugin-ui']) {
        if (
          !moduleIdentifiers.some(
            (identifier) => identifier.includes(expected.replace('/', '+')) || identifier.includes(expected),
          )
        ) {
          throw new Error(`template/bundle-module-missing: ${expected}`);
        }
      }
    }
    console.log(
      `Verified isolated ${template.directory}: ${lensxDependencies.length} packed public dependencies, ${moduleIdentifiers.length} bundle modules.`,
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
