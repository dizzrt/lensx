import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

type AppLifecycle = 'build' | 'check' | 'test' | 'typecheck';

interface AppCommand {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
}

const commands: Readonly<Record<AppLifecycle, readonly AppCommand[]>> = Object.freeze({
  build: [
    { executable: 'pnpm', argv: ['run', 'app:typecheck'] },
    { executable: 'rsbuild', argv: ['build'] },
  ],
  check: [
    { executable: 'biome', argv: ['check', '.'] },
    {
      executable: 'node',
      argv: ['--experimental-strip-types', 'scripts/validation/cli.ts', 'gate', 'validation-governance'],
    },
  ],
  test: [
    { executable: 'pnpm', argv: ['--dir', 'packages/plugin-cli', 'run', 'build'] },
    {
      executable: 'pnpm',
      argv: ['--dir', 'examples/plugins/framework-neutral', 'run', 'build'],
      environment: { LENSX_TEMPLATE_MODULE_GRAPH: '1' },
    },
    {
      executable: 'pnpm',
      argv: ['--dir', 'examples/plugins/react-semi', 'run', 'build'],
      environment: { LENSX_TEMPLATE_MODULE_GRAPH: '1' },
    },
    { executable: 'rstest', argv: [] },
  ],
  typecheck: [
    { executable: 'pnpm', argv: ['--dir', 'packages/plugin-cli', 'run', 'build'] },
    { executable: 'tsc', argv: ['--noEmit'] },
    { executable: 'tsc', argv: ['--noEmit', '-p', 'tests/tsconfig.json'] },
  ],
});

export const runAppLifecycle = (lifecycle: AppLifecycle): void => {
  for (const command of commands[lifecycle]) {
    const result = spawnSync(command.executable, [...command.argv], {
      cwd: resolve(import.meta.dirname, '..'),
      env: { ...process.env, ...command.environment },
      stdio: 'inherit',
    });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `[app/lifecycle-failed] ${lifecycle}: ${command.executable} exited with ${result.status ?? 'signal'}.`,
      );
    }
  }
};

const lifecycle = process.argv[2];
if (!['build', 'check', 'test', 'typecheck'].includes(lifecycle ?? '')) {
  console.error('[app/unknown-lifecycle] expected build, check, test, or typecheck.');
  process.exitCode = 1;
} else {
  try {
    runAppLifecycle(lifecycle as AppLifecycle);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
