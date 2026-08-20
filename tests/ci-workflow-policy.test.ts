import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from '@rstest/core';

import { checkCiWorkflowPolicy } from '../scripts/ci/workflow-policy.ts';

const repositoryRoot = join(import.meta.dirname, '..');
const roots: string[] = [];

const createFixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'lensx-workflow-policy-'));
  roots.push(root);
  const workflows = join(root, '.github/workflows');
  mkdirSync(workflows, { recursive: true });
  cpSync(join(repositoryRoot, '.github/workflows/lensx-ci.yml'), join(workflows, 'lensx-ci.yml'));
  cpSync(join(repositoryRoot, '.github/workflows/plugins-ci.yml'), join(workflows, 'plugins-ci.yml'));
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('CI workflow policy', () => {
  test('accepts the exact two-workflow read-only model', () => {
    expect(() => checkCiWorkflowPolicy(createFixture())).not.toThrow();
  });

  test('rejects an unexpected third workflow', () => {
    const root = createFixture();
    writeFileSync(join(root, '.github/workflows/release.yml'), 'name: Release\n');
    expect(() => checkCiWorkflowPolicy(root)).toThrow('[ci/workflow-inventory]');
  });

  test('rejects write permissions', () => {
    const root = createFixture();
    const path = join(root, '.github/workflows/lensx-ci.yml');
    writeFileSync(path, readFileSync(path, 'utf8').replace('contents: read', 'contents: write'));
    expect(() => checkCiWorkflowPolicy(root)).toThrow('[ci/workflow-permissions]');
  });

  test('rejects release mutation steps', () => {
    const root = createFixture();
    const path = join(root, '.github/workflows/plugins-ci.yml');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n# gh release create forbidden\n`);
    expect(() => checkCiWorkflowPolicy(root)).toThrow('[ci/workflow-release-mutation]');
  });

  test('rejects trigger path drift', () => {
    const root = createFixture();
    const path = join(root, '.github/workflows/plugins-ci.yml');
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll("- 'plugins/**'", "- 'plugins/config-lens/**'"));
    expect(() => checkCiWorkflowPolicy(root)).toThrow('[ci/workflow-plugins-scope]');
  });

  test('rejects environment validation commands', () => {
    const root = createFixture();
    const path = join(root, '.github/workflows/plugins-ci.yml');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n# pnpm run visual\n`);
    expect(() => checkCiWorkflowPolicy(root)).toThrow('[ci/workflow-environment-validation]');
  });
});
