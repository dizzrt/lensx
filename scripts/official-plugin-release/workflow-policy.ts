import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKFLOWS = ['official-plugin-pr.yml', 'official-plugin-version.yml', 'official-plugin-candidate.yml'] as const;

const fail = (code: string, message: string): never => {
  throw new Error(`[official-release/${code}] ${message}`);
};

const section = (source: string, job: string, nextJob?: string): string => {
  const start = source.indexOf(`  ${job}:\n`);
  const end = nextJob === undefined ? source.length : source.indexOf(`  ${nextJob}:\n`, start + 1);
  if (start === -1 || end === -1) fail('workflow-job-missing', `Workflow job ${job} is missing.`);
  return source.slice(start, end);
};

export const checkOfficialPluginWorkflowPolicy = (rootDir: string): void => {
  const root = resolve(rootDir);
  const sources = new Map(
    WORKFLOWS.map((name) => [name, readFileSync(join(root, '.github', 'workflows', name), 'utf8')]),
  );
  for (const [name, source] of sources) {
    const actionUses = [...source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)\s*$/gmu)].map((match) => match[1]);
    if (actionUses.length === 0 || actionUses.some((value) => !/@[0-9a-f]{40}$/u.test(value ?? ''))) {
      fail('workflow-action-unpinned', `${name} must pin every third-party action to a full revision.`);
    }
    if (/pull_request_target/u.test(source)) fail('workflow-event-unsafe', `${name} must not use pull_request_target.`);
    if (!source.includes("- 'plugins/**'") || source.includes('plugins/official')) {
      fail('workflow-path-filter', `${name} must use the direct plugins/** product-member trigger.`);
    }
  }

  const pr = sources.get('official-plugin-pr.yml') ?? '';
  if (
    !/pull_request:/u.test(pr) ||
    !/contents:\s*read/u.test(pr) ||
    /contents:\s*write|pull-requests:\s*write|environment:|GITHUB_TOKEN|secrets\./u.test(pr) ||
    !/persist-credentials:\s*false/u.test(pr) ||
    !/plan-matrix/u.test(pr) ||
    !/matrix\.slug/u.test(pr) ||
    !/official-plugin-release\.ts candidate/u.test(pr) ||
    !/check:official-plugin-release-pipeline/u.test(pr)
  ) {
    fail('workflow-pr-policy', 'PR workflow event, path, credential, or read-only gate policy drifted.');
  }

  const version = sources.get('official-plugin-version.yml') ?? '';
  const versionJob = section(version, 'version');
  if (
    !/push:/u.test(version) ||
    !/branches:\s*\[main\]/u.test(version) ||
    !/contents:\s*write/u.test(versionJob) ||
    !/pull-requests:\s*write/u.test(versionJob) ||
    !/concurrency:/u.test(version) ||
    !/--ignore-scripts/u.test(versionJob) ||
    !/version:official-plugins/u.test(versionJob) ||
    /test:e2e|lensx-plugin\s+(?:build|pack)|cargo\s+(?:run|test)|publish\s+--/u.test(versionJob)
  ) {
    fail('workflow-version-policy', 'Version PR workflow permissions, concurrency, or metadata-only policy drifted.');
  }

  const candidate = sources.get('official-plugin-candidate.yml') ?? '';
  const plan = section(candidate, 'plan', 'platform-gate');
  const platform = section(candidate, 'platform-gate', 'build');
  const build = section(candidate, 'build', 'publish');
  const publish = section(candidate, 'publish');
  if (
    ![plan, platform, build].every((job) => /contents:\s*read/u.test(job) && !/contents:\s*write/u.test(job)) ||
    !/contents:\s*write/u.test(publish) ||
    !/environment:\s*official-plugin-release/u.test(publish) ||
    !/github\.ref == 'refs\/heads\/main'/u.test(publish) ||
    !/concurrency:/u.test(candidate) ||
    !/artifact-digest/u.test(build) ||
    !/verify-candidate/u.test(build) ||
    !/verify-candidate/u.test(publish) ||
    /pnpm\s+(?:install|add)|npm\s+(?:install|ci)|lensx-plugin\s+(?:build|pack)|cargo\s+(?:run|test)/u.test(publish)
  ) {
    fail('workflow-candidate-policy', 'Candidate build/publish permission isolation or digest handoff drifted.');
  }
};
