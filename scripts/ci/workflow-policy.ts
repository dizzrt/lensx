import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const CI_WORKFLOWS = ['lensx-ci.yml', 'plugins-ci.yml'] as const;

const fail = (code: string, message: string): never => {
  throw new Error(`[ci/${code}] ${message}`);
};

const readWorkflow = (root: string, name: (typeof CI_WORKFLOWS)[number]): string =>
  readFileSync(join(root, '.github', 'workflows', name), 'utf8');

const assertCommonPolicy = (name: string, source: string): void => {
  if (!/^permissions:\n {2}contents: read$/mu.test(source)) {
    fail('workflow-permissions', `${name} must declare only workflow-level contents: read.`);
  }
  if (/\b(?:contents|pull-requests|actions|packages|issues|checks):\s*write\b/u.test(source)) {
    fail('workflow-write-permission', `${name} must not declare write permissions.`);
  }
  if (/\benvironment:|\bsecrets\.|\bGITHUB_TOKEN\b/u.test(source)) {
    fail('workflow-release-authority', `${name} must not declare an environment or publishing secret.`);
  }
  if (
    /actions\/(?:upload|download)-artifact|changesets\/action|\bgh\s+(?:release|pr create)|\bgit\s+tag\b|\bpublish\b/u.test(
      source,
    )
  ) {
    fail('workflow-release-mutation', `${name} must not contain version, artifact handoff, or release mutation steps.`);
  }
  const actions = [...source.matchAll(/^\s*-\s*uses:\s*([^\s#]+)\s*$/gmu)].map((match) => match[1] ?? '');
  if (actions.length === 0 || actions.some((action) => !/@[0-9a-f]{40}$/u.test(action))) {
    fail('workflow-action-unpinned', `${name} must pin every third-party action to a full commit SHA.`);
  }
  const runners = [...source.matchAll(/^\s*runs-on:\s*([^\s#]+)\s*$/gmu)].map((match) => match[1] ?? '');
  if (runners.length === 0 || runners.some((runner) => !runner.startsWith('macos-'))) {
    fail('workflow-runner', `${name} must use only macOS runners.`);
  }
  if (!source.includes('concurrency:') || !source.includes('cancel-in-progress: true')) {
    fail('workflow-concurrency', `${name} must cancel superseded runs for its workflow/ref group.`);
  }
};

export const checkCiWorkflowPolicy = (rootDir: string): void => {
  const root = resolve(rootDir);
  const workflowDir = join(root, '.github', 'workflows');
  const inventory = readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort();
  if (JSON.stringify(inventory) !== JSON.stringify([...CI_WORKFLOWS].sort())) {
    fail('workflow-inventory', `Expected only ${CI_WORKFLOWS.join(', ')}; found ${inventory.join(', ') || 'none'}.`);
  }

  const lensx = readWorkflow(root, 'lensx-ci.yml');
  const plugins = readWorkflow(root, 'plugins-ci.yml');
  assertCommonPolicy('lensx-ci.yml', lensx);
  assertCommonPolicy('plugins-ci.yml', plugins);

  if (
    !lensx.includes('pull_request:') ||
    !lensx.includes('push:') ||
    !lensx.includes('branches: [main]') ||
    (lensx.match(/paths-ignore:/gu)?.length ?? 0) !== 2 ||
    (lensx.match(/- 'plugins\/\*\*'/gu)?.length ?? 0) !== 2 ||
    !lensx.includes('pnpm run gate -- ci-lensx-frontend') ||
    !lensx.includes('pnpm run gate -- ci-lensx-rust')
  ) {
    fail('workflow-lensx-scope', 'LensX CI trigger matrix or required local entry points drifted.');
  }

  if (
    !plugins.includes('pull_request:') ||
    !plugins.includes('push:') ||
    !plugins.includes('branches: [main]') ||
    plugins.includes('paths-ignore:') ||
    (plugins.match(/- 'plugins\/\*\*'/gu)?.length ?? 0) !== 2 ||
    (plugins.match(/- '\.github\/workflows\/plugins-ci\.yml'/gu)?.length ?? 0) !== 2 ||
    !plugins.includes('pnpm run gate -- ci-plugins') ||
    !plugins.includes("CI: 'true'") ||
    !plugins.includes("LENSX_CI_WINDOWLESS: '1'")
  ) {
    fail('workflow-plugins-scope', 'Plugins CI trigger matrix, windowless policy, or local entry point drifted.');
  }
};
