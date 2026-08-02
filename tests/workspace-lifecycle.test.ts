import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@rstest/core';

import { runWorkspaceLifecycle } from '../scripts/workspace-lifecycle.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

const fixtureRoot = (name: string): string =>
  fileURLToPath(new URL(`fixtures/workspace-lifecycle/${name}`, import.meta.url));

describe('workspace lifecycle aggregation', () => {
  test('covers every Contract package lifecycle from the real workspace', () => {
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
      expect(invocations).toContain(`@lensx/plugin-contract (packages/plugin-contract):${lifecycle}`);
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
