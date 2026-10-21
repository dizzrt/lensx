import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

import { runTaoPolicyTests, type TaoPolicyCommandRunner } from '../scripts/tao-policy-tests.ts';

const withFixture = (run: (rootDir: string) => void): void => {
  const rootDir = mkdtempSync(join(tmpdir(), 'lensx tao policy '));
  try {
    run(rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
};

describe('vendored Tao policy runner', () => {
  test('runs all production modules in unique ignored directories and preserves unrelated output', () => {
    withFixture((rootDir) => {
      const targetDir = join(rootDir, 'src-tauri', 'target');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'existing-output'), 'keep');
      const outputDirs = new Set<string>();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const sources: string[] = [];
        const executions: string[] = [];
        runTaoPolicyTests({
          rootDir,
          runCommand: (executable, argv, cwd) => {
            expect(cwd).toBe(rootDir);
            if (executable === 'rustc') {
              expect(argv.slice(0, 2)).toEqual(['--edition=2021', '--test']);
              expect(argv[3]).toBe('-o');
              const source = argv[2];
              const binary = argv[4];
              if (source === undefined || binary === undefined) throw new Error('missing policy compiler arguments');
              sources.push(source);
              expect(dirname(dirname(binary))).toBe(targetDir);
              outputDirs.add(dirname(binary));
              writeFileSync(binary, 'compiled fixture');
            } else {
              expect(existsSync(executable)).toBe(true);
              expect(argv).toEqual([]);
              executions.push(basename(executable));
            }
            return { status: 0 };
          },
        });
        const sourceDir = join(rootDir, 'vendor', 'frame-aware-navigation', 'tao', 'src', 'platform_impl', 'macos');
        expect(sources).toEqual([
          join(sourceDir, 'resizable.rs'),
          join(sourceDir, 'file_drop.rs'),
          join(sourceDir, 'responder.rs'),
        ]);
        const suffix = process.platform === 'win32' ? '.exe' : '';
        expect(executions).toEqual([
          `resizable-tests${suffix}`,
          `file_drop-tests${suffix}`,
          `responder-tests${suffix}`,
        ]);
        expect(readdirSync(targetDir)).toEqual(['existing-output']);
      }
      expect(outputDirs.size).toBe(2);
    });
  });

  test('cleans partial compiler output and stops before running a failed compilation', () => {
    withFixture((rootDir) => {
      const invocations: string[] = [];
      expect(() =>
        runTaoPolicyTests({
          rootDir,
          runCommand: (executable, argv) => {
            invocations.push(executable);
            const binary = argv[4];
            if (binary === undefined) throw new Error('missing compiler output');
            writeFileSync(binary, 'partial compiler output');
            return { status: 1 };
          },
        }),
      ).toThrow('[tao-policy-tests/failed] resizable compile: status=1');
      expect(invocations).toEqual(['rustc']);
      expect(readdirSync(join(rootDir, 'src-tauri', 'target'))).toEqual([]);
    });
  });

  test('cleans compiled binaries and stops when production policy tests fail', () => {
    withFixture((rootDir) => {
      const invocations: string[] = [];
      expect(() =>
        runTaoPolicyTests({
          rootDir,
          runCommand: (executable, argv) => {
            invocations.push(executable);
            if (executable === 'rustc') {
              const binary = argv[4];
              if (binary === undefined) throw new Error('missing compiler output');
              writeFileSync(binary, 'compiled fixture');
              return { status: 0 };
            }
            expect(existsSync(executable)).toBe(true);
            return { status: 7 };
          },
        }),
      ).toThrow('[tao-policy-tests/failed] resizable test: status=7');
      expect(invocations).toHaveLength(2);
      expect(readdirSync(join(rootDir, 'src-tauri', 'target'))).toEqual([]);
    });
  });

  test('cleans output after launch errors, signals, and thrown subprocess failures', () => {
    withFixture((rootDir) => {
      const failures: readonly [TaoPolicyCommandRunner, string][] = [
        [() => ({ error: new Error('compiler unavailable'), status: null }), 'compiler unavailable'],
        [() => ({ status: null }), 'status=signal'],
        [
          () => {
            throw new Error('runner failed');
          },
          'runner failed',
        ],
      ];
      for (const [runCommand, message] of failures) {
        expect(() => runTaoPolicyTests({ rootDir, runCommand })).toThrow(message);
        expect(readdirSync(join(rootDir, 'src-tauri', 'target'))).toEqual([]);
      }
    });
  });

  test('cleanup tolerates an already removed output directory', () => {
    withFixture((rootDir) => {
      let compilations = 0;
      runTaoPolicyTests({
        rootDir,
        runCommand: (executable) => {
          if (executable === 'rustc') compilations += 1;
          else if (compilations === 3) rmSync(dirname(executable), { recursive: true, force: true });
          return { status: 0 };
        },
      });
      expect(compilations).toBe(3);
      expect(readdirSync(join(rootDir, 'src-tauri', 'target'))).toEqual([]);
    });
  });
});
