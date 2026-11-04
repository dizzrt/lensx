import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

import { runWryPolicyTests, type WryPolicyCommandRunner } from '../scripts/wry-policy-tests.ts';

const withFixture = (run: (rootDir: string) => void): void => {
  const rootDir = mkdtempSync(join(tmpdir(), 'lensx wry policy '));
  try {
    run(rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
};

describe('vendored Wry policy runner', () => {
  test('connects retained native mutations to the tested policy and finalizes before reply delivery', () => {
    const source = (path: string) =>
      readFileSync(new URL(`../vendor/frame-aware-navigation/${path}`, import.meta.url), 'utf8');
    const native = source('wry/src/wkwebview/mod.rs');
    const snapshot = native.slice(
      native.indexOf('impl NativeReparentSnapshot'),
      native.indexOf('pub struct InnerWebView'),
    );
    expect(snapshot).toContain('reparent::execute_retained(');
    expect(snapshot).toContain('impl reparent::RetainedNativeAdapter for AppKitRetainedReparent');
    for (const operation of ['Visibility(visible)', 'RetainedOperation::Move', 'RetainedOperation::Restore']) {
      expect(snapshot).toContain(operation);
    }
    const runtime = source('tauri-runtime-wry/src/lib.rs');
    const commit = runtime.slice(
      runtime.indexOf('WebviewMessage::CommitReparent(token, publish, on_committed, sender) =>'),
      runtime.indexOf('WebviewMessage::FinishTerminatedReparent(token, on_finished, sender) =>'),
    );
    expect(commit.indexOf('on_committed()')).toBeGreaterThanOrEqual(0);
    expect(commit.indexOf('sender.send(result)')).toBeGreaterThan(commit.indexOf('on_committed()'));
    const retained = source('tauri-runtime-wry/src/reparent_transaction.rs');
    expect(retained).toMatch(/\.policy\s*\.can_reclaim\(/u);
    expect(retained).toContain('Rc::ptr_eq(&view.inner, &held.inner)');
    expect(retained).not.toContain('abandon_unobserved_begin');
    expect(source('tauri/src/webview/reparent_transaction.rs')).toContain('super::reparent::finish_once(');
    const stableData = runtime.slice(
      runtime.indexOf('WebviewMessage::WithWebviewData(deliver) =>'),
      runtime.indexOf('let webview_handle = windows.0.borrow().get(&window_id)'),
    );
    expect(stableData).toContain('data_view(&windows, webview_id)');
    expect(stableData).not.toContain('set_bounds(');
    expect(stableData).not.toContain('set_visible(');
    expect(source('tauri-runtime-wry/src/reparent_transaction.rs')).toContain('select_data_source(');
    const bridge = readFileSync(new URL('../src-tauri/src/plugin_child_webview_adapter.rs', import.meta.url), 'utf8');
    const delivery = bridge.slice(bridge.indexOf('fn deliver_structured_plugin_child_webview_frame'));
    expect(delivery).toContain('.with_webview_data(');
  });

  test('runs the production module in unique ignored directories and preserves unrelated output', () => {
    withFixture((rootDir) => {
      const targetDir = join(rootDir, 'src-tauri', 'target');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'existing-output'), 'keep');
      const outputDirs = new Set<string>();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const sources: string[] = [];
        const executions: string[] = [];
        runWryPolicyTests({
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
        const sourceDir = join(rootDir, 'vendor', 'frame-aware-navigation');
        expect(sources).toEqual([
          join(sourceDir, 'wry/src/wkwebview/class/key_equivalent.rs'),
          join(sourceDir, 'wry/src/wkwebview/reparent.rs'),
          join(sourceDir, 'tauri-runtime-wry/src/reparent.rs'),
          join(sourceDir, 'tauri-runtime-wry/src/data_delivery.rs'),
          join(sourceDir, 'tauri/src/webview/reparent.rs'),
          join(sourceDir, 'tauri/src/ipc/channel_recipient.rs'),
        ]);
        const suffix = process.platform === 'win32' ? '.exe' : '';
        expect(executions).toEqual(
          [
            'key_equivalent',
            'native_reparent',
            'runtime_reparent',
            'data_delivery',
            'wrapper_reparent',
            'channel_recipient',
          ].map((name) => `${name}-tests${suffix}`),
        );
        expect(readdirSync(targetDir)).toEqual(['existing-output']);
      }
      expect(outputDirs.size).toBe(2);
    });
  });

  test('cleans partial compiler output and stops before running a failed compilation', () => {
    withFixture((rootDir) => {
      const invocations: string[] = [];
      expect(() =>
        runWryPolicyTests({
          rootDir,
          runCommand: (executable, argv) => {
            invocations.push(executable);
            const binary = argv[4];
            if (binary === undefined) throw new Error('missing compiler output');
            writeFileSync(binary, 'partial compiler output');
            return { status: 1 };
          },
        }),
      ).toThrow('[wry-policy-tests/failed] key_equivalent compile: status=1');
      expect(invocations).toEqual(['rustc']);
      expect(readdirSync(join(rootDir, 'src-tauri', 'target'))).toEqual([]);
    });
  });

  test('cleans compiled binaries and stops when production policy tests fail', () => {
    withFixture((rootDir) => {
      const invocations: string[] = [];
      expect(() =>
        runWryPolicyTests({
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
      ).toThrow('[wry-policy-tests/failed] key_equivalent test: status=7');
      expect(invocations).toHaveLength(2);
      expect(readdirSync(join(rootDir, 'src-tauri', 'target'))).toEqual([]);
    });
  });

  test('cleans output after launch errors, signals, and thrown subprocess failures', () => {
    withFixture((rootDir) => {
      const failures: readonly [WryPolicyCommandRunner, string][] = [
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
        expect(() => runWryPolicyTests({ rootDir, runCommand })).toThrow(message);
        expect(readdirSync(join(rootDir, 'src-tauri', 'target'))).toEqual([]);
      }
    });
  });

  test('cleanup tolerates an already removed output directory', () => {
    withFixture((rootDir) => {
      let compilations = 0;
      runWryPolicyTests({
        rootDir,
        runCommand: (executable) => {
          if (executable === 'rustc') compilations += 1;
          else if (compilations === 1) rmSync(dirname(executable), { recursive: true, force: true });
          return { status: 0 };
        },
      });
      expect(compilations).toBe(6);
      expect(readdirSync(join(rootDir, 'src-tauri', 'target'))).toEqual([]);
    });
  });
});
