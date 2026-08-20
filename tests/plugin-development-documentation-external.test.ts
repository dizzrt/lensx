import { access } from 'node:fs/promises';

import { describe, expect, test } from '@rstest/core';

import {
  classifyExternalConsumerFailure,
  DOCUMENTATION_GATE_STAGES,
  resolveDocumentationTasksPath,
  validateDocumentationGateComposition,
  validateRoadmapDocumentationState,
  withExternalConsumerTemporaryDirectory,
} from '../scripts/plugin-development-documentation-external.ts';

describe('plugin development documentation external consumer helpers', () => {
  test('cleans a temporary directory after success', async () => {
    let directory = '';
    await withExternalConsumerTemporaryDirectory('lensx-doc-test-success-', async (value) => {
      directory = value;
      await expect(access(value)).resolves.toBeUndefined();
    });
    await expect(access(directory)).rejects.toThrow();
  });

  test('cleans a temporary directory after failure', async () => {
    let directory = '';
    await expect(
      withExternalConsumerTemporaryDirectory('lensx-doc-test-failure-', async (value) => {
        directory = value;
        throw new Error('controlled source failure');
      }),
    ).rejects.toThrow('controlled source failure');
    await expect(access(directory)).rejects.toThrow();
  });

  test.each([
    ['EACCES: sandbox denied the pnpm store path', 'environment'],
    ['ERR_PNPM_NO_OFFLINE_META: store is unavailable', 'environment'],
    ['TypeScript compilation failed', 'source'],
  ] as const)('classifies %s as %s', (message, kind) => {
    expect(classifyExternalConsumerFailure(new Error(message))).toMatchObject({ kind });
  });

  test('accepts the complete gate composition', () => {
    expect(validateDocumentationGateComposition(DOCUMENTATION_GATE_STAGES)).toEqual([]);
  });

  test.each(DOCUMENTATION_GATE_STAGES)('fails when the %s stage is omitted', (omitted) => {
    const dependencies = DOCUMENTATION_GATE_STAGES.filter((stage) => stage !== omitted);
    expect(validateDocumentationGateComposition(dependencies)).toContain(`gate/stage-missing: ${omitted}.`);
  });

  test('resolves active tasks first and the latest dated archive after archiving', () => {
    const active = 'openspec/changes/publish-plugin-development-documentation/tasks.md';
    const olderArchive = 'openspec/changes/archive/2026-08-06-publish-plugin-development-documentation/tasks.md';
    const currentArchive = 'openspec/changes/archive/2026-08-07-publish-plugin-development-documentation/tasks.md';

    expect(resolveDocumentationTasksPath([currentArchive, active])).toBe(active);
    expect(resolveDocumentationTasksPath([currentArchive, olderArchive])).toBe(currentArchive);
    expect(resolveDocumentationTasksPath(['openspec/changes/archive/not-this-change/tasks.md'])).toBeUndefined();
  });

  test('keeps an unverified Roadmap task and preview incomplete', () => {
    const roadmap =
      '- [ ] **Task 6.6：发布插件开发文档**\n\n**OpenSpec change**：`publish-plugin-development-documentation`\n\n当前进度：尚未达到本 checkpoint。';
    expect(validateRoadmapDocumentationState(roadmap, '- [ ] final validation')).toEqual([]);
  });

  test('accepts a verified Roadmap completion and rejects every premature completion form', () => {
    const complete = [
      '- [x] **Task 6.6：发布插件开发文档**',
      '**OpenSpec change**：[publish-plugin-development-documentation](openspec/changes/publish-plugin-development-documentation/)',
      '当前进度：已达到 **Plugin Developer Preview**。',
    ].join('\n');
    expect(validateRoadmapDocumentationState(complete, '- [x] final validation')).toEqual([]);
    expect(validateRoadmapDocumentationState(complete, '- [ ] final validation')).toContain(
      'roadmap/evidence: completed Task 6.6 requires every change task to be verified.',
    );
    expect(
      validateRoadmapDocumentationState(
        '- [ ] **Task 6.6：发布插件开发文档**\n[publish-plugin-development-documentation](openspec/changes/publish-plugin-development-documentation/)\n当前进度：已达到 **Plugin Developer Preview**。',
        '- [ ] final validation',
      ),
    ).toEqual(
      expect.arrayContaining([
        'roadmap/premature-link: incomplete Task 6.6 must not publish the completion link.',
        'roadmap/premature-preview: incomplete Task 6.6 must not claim Plugin Developer Preview.',
      ]),
    );
  });
});
