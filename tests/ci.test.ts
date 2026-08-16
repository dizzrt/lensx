import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from '@rstest/core';

import { discoverDirectPlugins, runPluginsCi, selectPluginDependencyBuildOrder } from '../scripts/ci.ts';
import { discoverWorkspaceMembers } from '../scripts/workspace-lifecycle.ts';

const temporaryRoots: string[] = [];

const createRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'lensx-ci-test-'));
  temporaryRoots.push(root);
  writeFileSync(join(root, 'package.json'), '{"name":"fixture","private":true}\n');
  return root;
};

const addMember = (
  root: string,
  relativePath: string,
  name: string,
  options: { dependencies?: Record<string, string>; scripts?: Record<string, string> } = {},
): void => {
  const memberRoot = join(root, relativePath);
  mkdirSync(memberRoot, { recursive: true });
  writeFileSync(
    join(memberRoot, 'package.json'),
    `${JSON.stringify(
      {
        name,
        private: true,
        scripts: options.scripts ?? {
          build: 'fixture',
          check: 'fixture',
          test: 'fixture',
          'test:e2e': 'fixture',
          typecheck: 'fixture',
        },
        dependencies: options.dependencies,
      },
      null,
      2,
    )}\n`,
  );
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('Plugins CI workspace selection', () => {
  test('discovers every direct plugins/* member and ignores nested directories', () => {
    const root = createRoot();
    addMember(root, 'plugins/alpha', '@fixture/alpha');
    addMember(root, 'plugins/beta', '@fixture/beta');
    addMember(root, 'plugins/nested/legacy', '@fixture/legacy');

    expect(discoverDirectPlugins(root).map((member) => member.relativePath)).toEqual(['plugins/alpha', 'plugins/beta']);
  });

  test('reports an explicit successful no-op when no direct plugins exist', () => {
    const root = createRoot();
    const messages: string[] = [];

    expect(runPluginsCi({ rootDir: root, log: (message) => messages.push(message) })).toEqual({
      dependencies: [],
      plugins: [],
    });
    expect(messages).toEqual(['Plugins CI: no direct plugins under plugins/*; successful no-op.']);
  });

  test('selects transitive public dependencies in topological order', () => {
    const root = createRoot();
    addMember(root, 'packages/base', '@fixture/base');
    addMember(root, 'packages/middle', '@fixture/middle', { dependencies: { '@fixture/base': 'workspace:*' } });
    addMember(root, 'packages/unused', '@fixture/unused');
    addMember(root, 'plugins/alpha', '@fixture/alpha', { dependencies: { '@fixture/middle': 'workspace:*' } });
    const members = discoverWorkspaceMembers(root);

    expect(
      selectPluginDependencyBuildOrder(
        members,
        members.filter((member) => member.kind === 'official-plugin'),
      ).map((member) => member.name),
    ).toEqual(['@fixture/base', '@fixture/middle']);
  });
});

describe('Plugins CI execution', () => {
  test('builds clean public outputs before every blocking plugin stage and optional visual', () => {
    const root = createRoot();
    addMember(root, 'packages/base', '@fixture/base');
    addMember(root, 'plugins/alpha', '@fixture/alpha', {
      dependencies: { '@fixture/base': 'workspace:*' },
      scripts: {
        build: 'fixture',
        check: 'fixture',
        test: 'fixture',
        'test:e2e': 'fixture',
        typecheck: 'fixture',
        visual: 'fixture',
      },
    });
    const dist = join(root, 'packages/base/dist');
    const invocations: string[] = [];

    runPluginsCi({
      rootDir: root,
      runCommand: (_cwd, script, label) => {
        invocations.push(`${label}:${script}`);
        if (label.startsWith('@fixture/base')) mkdirSync(dist, { recursive: true });
        else expect(existsSync(dist)).toBe(true);
        return 0;
      },
    });

    expect(invocations).toEqual([
      '@fixture/base (packages/base):build',
      '@fixture/alpha (plugins/alpha):typecheck',
      '@fixture/alpha (plugins/alpha):test',
      '@fixture/alpha (plugins/alpha):check',
      '@fixture/alpha (plugins/alpha):build',
      '@fixture/alpha (plugins/alpha):test:e2e',
      '@fixture/alpha (plugins/alpha):visual',
    ]);
  });

  test('fails before execution when a required plugin script is missing', () => {
    const root = createRoot();
    addMember(root, 'plugins/alpha', '@fixture/alpha', {
      scripts: { build: 'fixture', check: 'fixture', test: 'fixture', typecheck: 'fixture' },
    });

    expect(() => runPluginsCi({ rootDir: root, runCommand: () => 0 })).toThrow(
      '[ci/required-plugin-script] plugins/alpha/package.json: missing scripts.test:e2e.',
    );
  });

  test.each(['build', 'test:e2e', 'visual'])('propagates a failing %s command', (failingScript) => {
    const root = createRoot();
    addMember(root, 'packages/base', '@fixture/base');
    addMember(root, 'plugins/alpha', '@fixture/alpha', {
      dependencies: { '@fixture/base': 'workspace:*' },
      scripts: {
        build: 'fixture',
        check: 'fixture',
        test: 'fixture',
        'test:e2e': 'fixture',
        typecheck: 'fixture',
        visual: 'fixture',
      },
    });
    let buildSeen = false;

    expect(() =>
      runPluginsCi({
        rootDir: root,
        runCommand: (_cwd, script, label) => {
          if (label.startsWith('@fixture/base')) buildSeen = true;
          return script === failingScript && (failingScript !== 'build' || label.startsWith('@fixture/base')) ? 7 : 0;
        },
      }),
    ).toThrow(`script "${failingScript}" exited with status 7`);
    expect(buildSeen).toBe(true);
  });
});
