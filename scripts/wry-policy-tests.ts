import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface CommandResult {
  readonly error?: Error;
  readonly status: number | null;
}

export type WryPolicyCommandRunner = (executable: string, argv: readonly string[], cwd: string) => CommandResult;

const defaultRunner: WryPolicyCommandRunner = (executable, argv, cwd) =>
  spawnSync(executable, [...argv], { cwd, stdio: 'inherit' });

export const runWryPolicyTests = ({
  rootDir,
  runCommand = defaultRunner,
}: {
  rootDir: string;
  runCommand?: WryPolicyCommandRunner;
}): void => {
  const targetDir = join(rootDir, 'src-tauri', 'target');
  mkdirSync(targetDir, { recursive: true });
  const outputDir = mkdtempSync(join(targetDir, 'wry-policy-tests-'));
  try {
    for (const policy of ['key_equivalent']) {
      const source = join(
        rootDir,
        'vendor',
        'frame-aware-navigation',
        'wry',
        'src',
        'wkwebview',
        'class',
        `${policy}.rs`,
      );
      const binary = join(outputDir, `${policy}-tests${process.platform === 'win32' ? '.exe' : ''}`);
      for (const [phase, executable, argv] of [
        ['compile', 'rustc', ['--edition=2021', '--test', source, '-o', binary]],
        ['test', binary, []],
      ] as const) {
        const result = runCommand(executable, argv, rootDir);
        if (result.error !== undefined) {
          throw new Error(`[wry-policy-tests/launch-failed] ${policy} ${phase}: ${result.error.message}`);
        }
        if (result.status !== 0) {
          throw new Error(`[wry-policy-tests/failed] ${policy} ${phase}: status=${result.status ?? 'signal'}`);
        }
      }
    }
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runWryPolicyTests({ rootDir: fileURLToPath(new URL('..', import.meta.url)) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
