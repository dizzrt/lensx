import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@rstest/core';

import {
  discoverWorkspaceMembers,
  runWorkspaceLifecycle,
  selectWorkspaceBuildOrder,
  sortWorkspaceMembers,
  type WorkspaceMember,
} from '../scripts/workspace-lifecycle.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

const fixtureRoot = (name: string): string =>
  fileURLToPath(new URL(`fixtures/workspace-lifecycle/${name}`, import.meta.url));

describe('workspace lifecycle aggregation', () => {
  test('covers every public package lifecycle from the real workspace in dependency order', () => {
    for (const lifecycle of ['build', 'typecheck', 'test', 'check'] as const) {
      const invocations: string[] = [];
      runWorkspaceLifecycle({
        lifecycle,
        rootDir: repositoryRoot,
        runCommand: (_cwd, script, label) => {
          invocations.push(`${label}:${script}`);
          return 0;
        },
      });
      expect(invocations).toEqual([
        `root application:app:${lifecycle}`,
        `@lensx/plugin-contract (packages/plugin-contract):${lifecycle}`,
        `@lensx/plugin-cli (packages/plugin-cli):${lifecycle}`,
        `@lensx/plugin-sdk (packages/plugin-sdk):${lifecycle}`,
        `@lensx/example-plugin-development-mode-smoke (examples/plugins/development-mode-smoke):${lifecycle}`,
        `@lensx/plugin-testkit (packages/plugin-testkit):${lifecycle}`,
        `@lensx/example-plugin-framework-neutral (examples/plugins/framework-neutral):${lifecycle}`,
        `@lensx/plugin-ui (packages/plugin-ui):${lifecycle}`,
        `@lensx/example-plugin-react-semi (examples/plugins/react-semi):${lifecycle}`,
        `@lensx/official-config-lens (plugins/config-lens):${lifecycle}`,
      ]);
    }
  });

  test('runs the root application when direct member areas are empty and ignores the legacy nested plugin path', () => {
    const invocations: string[] = [];

    runWorkspaceLifecycle({
      lifecycle: 'build',
      rootDir: fixtureRoot('empty'),
      runCommand: (_cwd, script, label) => {
        invocations.push(`${label}:${script}`);
        return 0;
      },
    });

    expect(invocations).toEqual(['root application:app:build']);
  });

  test('rejects a member missing any required lifecycle script', () => {
    expect(() =>
      runWorkspaceLifecycle({
        lifecycle: 'build',
        rootDir: fixtureRoot('missing-script'),
        runCommand: () => 0,
      }),
    ).toThrow('[workspace/required-lifecycle-script] packages/incomplete/package.json: missing scripts.check.');
  });

  test('uses dependency order and propagates a member failure', () => {
    const invocations: string[] = [];

    expect(() =>
      runWorkspaceLifecycle({
        lifecycle: 'test',
        rootDir: fixtureRoot('member-failure'),
        runCommand: (_cwd, script, label) => {
          invocations.push(`${label}:${script}`);
          return label.startsWith('@fixture/failing-plugin') ? 7 : 0;
        },
      }),
    ).toThrow(
      '[workspace/lifecycle-failed] @fixture/failing-plugin (plugins/failing): script "test" exited with status 7.',
    );
    expect(invocations).toEqual([
      'root application:app:test',
      '@fixture/base (packages/base):test',
      '@fixture/failing-plugin (plugins/failing):test',
    ]);
  });

  test('selects and de-duplicates a transitive build closure without relying on dist output', () => {
    const members = discoverWorkspaceMembers(repositoryRoot);
    const targets = members.filter((member) =>
      ['packages/plugin-cli', 'examples/plugins/framework-neutral', 'examples/plugins/react-semi'].includes(
        member.relativePath,
      ),
    );

    expect(selectWorkspaceBuildOrder(members, targets).map((member) => member.name)).toEqual([
      '@lensx/plugin-contract',
      '@lensx/plugin-cli',
      '@lensx/plugin-sdk',
      '@lensx/plugin-testkit',
      '@lensx/example-plugin-framework-neutral',
      '@lensx/plugin-ui',
      '@lensx/example-plugin-react-semi',
    ]);
  });

  test('fails closed for an unknown target and a workspace dependency cycle', () => {
    const members = discoverWorkspaceMembers(repositoryRoot);
    const [first, second] = members;
    if (first === undefined || second === undefined) throw new Error('workspace fixture requires two members');
    expect(() => selectWorkspaceBuildOrder(members, [{ ...first, name: '@fixture/missing' }])).toThrow(
      '[workspace/unknown-build-target] @fixture/missing.',
    );

    const cyclic: WorkspaceMember[] = [
      {
        ...first,
        name: '@fixture/left',
        manifest: { dependencies: { '@fixture/right': 'workspace:*' } },
      },
      {
        ...second,
        name: '@fixture/right',
        manifest: { dependencies: { '@fixture/left': 'workspace:*' } },
      },
    ];
    expect(() => sortWorkspaceMembers(cyclic)).toThrow(
      '[workspace/dependency-cycle] Workspace dependency cycle: @fixture/left, @fixture/right.',
    );
  });
});
