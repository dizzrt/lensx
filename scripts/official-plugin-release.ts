import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { checkOfficialPluginReleaseBoundaries } from './official-plugin-release/boundary.ts';
import {
  buildOfficialPluginCandidate,
  validateReleaseRecord,
  verifyCandidateDirectory,
} from './official-plugin-release/candidate.ts';
import { validateOfficialPluginContract } from './official-plugin-release/contract.ts';
import { checkOfficialPluginReleaseDocs } from './official-plugin-release/docs.ts';
import { runOfficialPluginReleaseDryRun } from './official-plugin-release/dry-run.ts';
import { changedPathsBetween, createOfficialPluginReleasePlan } from './official-plugin-release/planner.ts';
import { GitHubRestReleaseApi, publishCandidateDirectory } from './official-plugin-release/release.ts';
import { formatOfficialReleaseDiagnostic } from './official-plugin-release/types.ts';
import { versionOfficialPlugins } from './official-plugin-release/version.ts';
import { checkOfficialPluginWorkflowPolicy } from './official-plugin-release/workflow-policy.ts';

const root = process.cwd();
const command = process.argv[2];
const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const required = (name: string): string => {
  const value = option(name);
  if (value === undefined || value.length === 0)
    throw new Error(`[official-release/argument-missing] ${name} is required.`);
  return value;
};
const output = (value: unknown): void => console.log(JSON.stringify(value));
const contract = () => {
  const result = validateOfficialPluginContract(root);
  if (result.diagnostics.length > 0)
    throw new Error(result.diagnostics.map(formatOfficialReleaseDiagnostic).join('\n'));
  return result;
};

try {
  if (command === 'contract') {
    output({
      members: contract().members.map(({ packageName, pluginId, slug, version }) => ({
        package_name: packageName,
        plugin_id: pluginId,
        slug,
        version,
      })),
      schema_version: 1,
    });
  } else if (command === 'boundary') {
    checkOfficialPluginReleaseBoundaries(root);
    output({ status: 'valid' });
  } else if (command === 'plan') {
    const base = required('--base');
    const head = required('--head');
    output(
      createOfficialPluginReleasePlan({
        baseCommit: base,
        changedPaths: changedPathsBetween(root, base, head),
        headCommit: head,
        members: contract().members,
        rootDir: root,
      }),
    );
  } else if (command === 'plan-matrix') {
    const base = required('--base');
    const head = required('--head');
    const plan = createOfficialPluginReleasePlan({
      baseCommit: base,
      changedPaths: changedPathsBetween(root, base, head),
      headCommit: head,
      members: contract().members,
      rootDir: root,
    });
    output({ include: plan.validate });
  } else if (command === 'unreleased') {
    const tags = spawnSync('git', ['tag', '--list', 'official/*'], { cwd: root, encoding: 'utf8' });
    if (tags.error !== undefined || tags.status !== 0)
      throw new Error('[official-release/git-tags-failed] Could not read release tags.');
    const existing = new Set(tags.stdout.split(/\r?\n/u).filter(Boolean));
    output({
      include: contract()
        .members.filter((member) => !existing.has(`official/${member.pluginId}/v${member.version}`))
        .map(({ packageName, pluginId, slug, version }) => ({
          package_name: packageName,
          plugin_id: pluginId,
          slug,
          version,
        })),
    });
  } else if (command === 'version') {
    versionOfficialPlugins(root);
    output({ status: 'versioned' });
  } else if (command === 'candidate') {
    const slug = required('--plugin');
    const member = contract().members.find((value) => value.slug === slug);
    if (member === undefined) throw new Error('[official-release/plugin-unknown] Official plugin slug is unknown.');
    output(
      buildOfficialPluginCandidate({
        member,
        outputDir: required('--output'),
        repository: option('--repository') ?? `https://github.com/${process.env.GITHUB_REPOSITORY ?? ''}`,
        rootDir: root,
        sourceCommit: option('--commit') ?? process.env.GITHUB_SHA ?? '',
        sourceRef: option('--ref') ?? process.env.GITHUB_REF ?? '',
        workflowRunUrl:
          option('--run-url') ??
          `https://github.com/${process.env.GITHUB_REPOSITORY ?? ''}/actions/runs/${process.env.GITHUB_RUN_ID ?? ''}`,
      }),
    );
  } else if (command === 'verify-candidate') {
    output(verifyCandidateDirectory(required('--directory')));
  } else if (command === 'publish') {
    const directory = resolve(required('--directory'));
    const candidate = verifyCandidateDirectory(directory);
    const recordValue = JSON.parse(readFileSync(join(directory, candidate.release_record.name), 'utf8')) as unknown;
    if (!validateReleaseRecord(recordValue))
      throw new Error('[official-release/release-record-invalid] Release record is invalid.');
    const api = new GitHubRestReleaseApi({
      repositoryUrl: recordValue.repository,
      token: process.env.GITHUB_TOKEN ?? '',
    });
    output(await publishCandidateDirectory(directory, process.env.GITHUB_SHA ?? '', api));
  } else if (command === 'dry-run') {
    output(runOfficialPluginReleaseDryRun(root));
  } else if (command === 'docs') {
    checkOfficialPluginReleaseDocs(root);
    output({ status: 'valid' });
  } else if (command === 'workflow-policy') {
    checkOfficialPluginWorkflowPolicy(root);
    output({ status: 'valid' });
  } else {
    throw new Error(
      '[official-release/command-invalid] Expected contract, boundary, plan, plan-matrix, unreleased, version, candidate, verify-candidate, publish, dry-run, docs, or workflow-policy.',
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
