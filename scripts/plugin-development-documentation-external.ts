import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

export type ExternalConsumerFailureKind = 'environment' | 'source';

export interface ExternalConsumerFailureClassification {
  readonly kind: ExternalConsumerFailureKind;
  readonly message: string;
}

const environmentFailurePattern =
  /(?:EACCES|EPERM|ENOSPC|ERR_PNPM_(?:NO_OFFLINE_META|UNEXPECTED_STORE|ABORTED_REMOVE_MODULES_DIR_NO_TTY)|permission denied|store (?:path|server|is unavailable)|sandbox)/iu;

export const classifyExternalConsumerFailure = (value: unknown): ExternalConsumerFailureClassification => {
  const raw = value instanceof Error ? value.message : String(value);
  return Object.freeze({
    kind: environmentFailurePattern.test(raw) ? 'environment' : 'source',
    message: raw.replaceAll(/(?:file:\/\/)?\/Users\/[^\s:)]+/gu, '<absolute-path>').slice(0, 512),
  });
};

export const withExternalConsumerTemporaryDirectory = async <Value>(
  prefix: string,
  operation: (directory: string) => Promise<Value>,
): Promise<Value> => {
  const directory = await mkdtemp(resolve(tmpdir(), prefix));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

export const runExternalConsumerCommand = (command: string, arguments_: readonly string[], cwd: string): void => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} exited with status ${result.status}.\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
};

export const DOCUMENTATION_GATE_STAGES = Object.freeze([
  'check:plugin-development-documentation:docs',
  'check:plugin-development-documentation:external',
  'check:plugin-project-template',
  'check:plugin-developer-cli',
  'check:plugin-development-mode',
  'check:plugin-runtime-security-lifecycle',
  'check:plugin-permission-prompts',
  'check:plugin-contract',
  'check:plugin-testkit',
  'check:local-plugin-installation',
] as const);

const documentationTasksActivePath = 'openspec/changes/publish-plugin-development-documentation/tasks.md';
const documentationTasksArchivePattern =
  /^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-publish-plugin-development-documentation\/tasks\.md$/u;

export const resolveDocumentationTasksPath = (paths: readonly string[]): string | undefined => {
  const candidates = [...new Set(paths)];
  if (candidates.includes(documentationTasksActivePath)) return documentationTasksActivePath;
  return candidates
    .filter((path) => documentationTasksArchivePattern.test(path))
    .sort()
    .at(-1);
};

export const validateDocumentationGateComposition = (
  script: string,
  stages: readonly string[] = DOCUMENTATION_GATE_STAGES,
): string[] =>
  stages.filter((stage) => !script.includes(`pnpm run ${stage}`)).map((stage) => `gate/stage-missing: ${stage}.`);

export const validateRoadmapDocumentationState = (roadmap: string, tasks: string): string[] => {
  const diagnostics: string[] = [];
  const complete = roadmap.includes('- [x] **Task 6.6：发布插件开发文档**');
  const incomplete = roadmap.includes('- [ ] **Task 6.6：发布插件开发文档**');
  if (complete === incomplete) diagnostics.push('roadmap/task-state: Task 6.6 must have exactly one checkbox state.');
  const linked =
    /\[publish-plugin-development-documentation\]\(openspec\/changes\/(?:publish-plugin-development-documentation|archive\/[^)]+publish-plugin-development-documentation)\/\)/u.test(
      roadmap,
    );
  const previewReached = /当前进度：[^\n]*(?:已达到|达到)\s*\*\*Plugin Developer Preview\*\*/u.test(roadmap);
  if (complete) {
    if (!linked) diagnostics.push('roadmap/change-link: completed Task 6.6 must link its OpenSpec change.');
    if (!previewReached)
      diagnostics.push('roadmap/preview-status: completed Task 6.6 must mark Plugin Developer Preview reached.');
    if (/^- \[ \]/gmu.test(tasks))
      diagnostics.push('roadmap/evidence: completed Task 6.6 requires every change task to be verified.');
  } else {
    if (linked) diagnostics.push('roadmap/premature-link: incomplete Task 6.6 must not publish the completion link.');
    if (previewReached)
      diagnostics.push('roadmap/premature-preview: incomplete Task 6.6 must not claim Plugin Developer Preview.');
  }
  return diagnostics;
};
