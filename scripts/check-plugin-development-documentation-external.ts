import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  classifyExternalConsumerFailure,
  runExternalConsumerCommand,
  withExternalConsumerTemporaryDirectory,
} from './plugin-development-documentation-external.ts';

const repositoryRoot = resolve(import.meta.dirname, '..');
const workflow = readFileSync(resolve(repositoryRoot, 'scripts/check-plugin-developer-cli.ts'), 'utf8');
const requiredEvidence = [
  "'plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit', 'plugin-cli'",
  "const templates = ['framework-neutral', 'react-semi']",
  "['test', 'typecheck', 'build']",
  "['validate', '--project'",
  "['pack', '--project'",
  "['inspect', packagePath",
  'Repeat package bytes drifted',
  'pnpm-lock.yaml',
  'realpath',
  'plugin_project_template_package_smoke',
  'await rm(temporaryRoot, { force: true, recursive: true })',
] as const;
for (const marker of requiredEvidence) {
  if (!workflow.includes(marker)) throw new Error(`External tutorial workflow evidence is missing: ${marker}.`);
}
if (!workflow.includes("pnpm', ['store', 'path']"))
  throw new Error('External tutorial workflow does not use the machine pnpm store.');
if (
  workflow.includes(
    "run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', pnpmStorePath], repositoryRoot",
  )
) {
  throw new Error('External tutorial workflow attempts a repository-root install with a store override.');
}

try {
  await withExternalConsumerTemporaryDirectory('lensx-plugin-documentation-external-', async () => {
    runExternalConsumerCommand(
      'node',
      ['--experimental-strip-types', 'scripts/check-plugin-developer-cli.ts'],
      repositoryRoot,
    );
  });
} catch (error) {
  const failure = classifyExternalConsumerFailure(error);
  throw new Error(`Plugin development documentation external ${failure.kind} failure: ${failure.message}`);
}

console.log(
  'Verified both documented tutorials through real public tarballs, CLI, repeat package bytes, and Rust preparation.',
);
