import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@rstest/core';

import { runWorkspaceLifecycle } from '../scripts/workspace-lifecycle.ts';

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
        `@lensx/plugin-testkit (packages/plugin-testkit):${lifecycle}`,
        `@lensx/example-plugin-framework-neutral (examples/plugins/framework-neutral):${lifecycle}`,
        `@lensx/plugin-ui (packages/plugin-ui):${lifecycle}`,
        `@lensx/example-plugin-react-semi (examples/plugins/react-semi):${lifecycle}`,
      ]);
    }
  });

  test('runs the root application when member areas are empty', () => {
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
      '[workspace/lifecycle-failed] @fixture/failing-plugin (plugins/official/failing): script "test" exited with status 7.',
    );
    expect(invocations).toEqual([
      'root application:app:test',
      '@fixture/base (packages/base):test',
      '@fixture/failing-plugin (plugins/official/failing):test',
    ]);
  });
});
