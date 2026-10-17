import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface TaoSelection {
  readonly version: string;
  readonly path: string;
  readonly features: readonly string[];
}

export interface TaoTreeResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr?: string;
  readonly error?: Error;
}

export type TaoTreeRunner = (argv: readonly string[], rootDir: string) => TaoTreeResult;

const parseSelection = (output: string, label: string): TaoSelection => {
  const rows = output.trim().split(/\r?\n/u);
  const match = rows.length === 1 ? rows[0]?.match(/^tao v(\S+) \((.+)\)\|([^|\r\n]*)$/u) : undefined;
  if (!match) throw new Error(`[tao/graph-invalid] ${label} must resolve exactly one local Tao package.`);
  return {
    version: match[1] ?? '',
    path: resolve(match[2] ?? ''),
    features: [...new Set((match[3] ?? '').split(',').filter(Boolean))].sort(),
  };
};

export const assertTaoDependencyGraphs = (application: string, selected: string, rootDir: string): void => {
  const expectedPath = resolve(rootDir, 'vendor/frame-aware-navigation/tao');
  const applicationTao = parseSelection(application, 'application');
  const selectedTao = parseSelection(selected, 'selected package');
  for (const [label, tao] of [
    ['application', applicationTao],
    ['selected package', selectedTao],
  ] as const) {
    if (tao.version !== '0.35.3' || tao.path !== expectedPath) {
      throw new Error(`[tao/graph-drift] ${label} must use tao v0.35.3 at ${expectedPath}.`);
    }
  }
  if (applicationTao.features.join(',') !== selectedTao.features.join(',')) {
    throw new Error(
      `[tao/feature-drift] application=${applicationTao.features.join(',')} selected=${selectedTao.features.join(',')}.`,
    );
  }
};

const defaultRunner: TaoTreeRunner = (argv, rootDir) =>
  spawnSync('cargo', [...argv], { cwd: rootDir, encoding: 'utf8' });

export const checkTaoDependencyGraph = (rootDir: string, run: TaoTreeRunner = defaultRunner): void => {
  const tree = (application: boolean): string => {
    const result = run(
      [
        'tree',
        '--locked',
        '--manifest-path',
        'src-tauri/Cargo.toml',
        '-p',
        application ? 'lensx' : 'tao',
        ...(application ? ['--invert', 'tao'] : []),
        '--depth',
        '0',
        '--format',
        '{p}|{f}',
        '--prefix',
        'none',
      ],
      rootDir,
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        `[tao/graph-command-failed] ${application ? 'application' : 'selected package'}: ${result.error?.message ?? result.stderr ?? result.status}.`,
      );
    }
    return result.stdout;
  };
  assertTaoDependencyGraphs(tree(true), tree(false), rootDir);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkTaoDependencyGraph(resolve(import.meta.dirname, '..'));
    console.log('Application and selected Tao path, version, and features agree.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
