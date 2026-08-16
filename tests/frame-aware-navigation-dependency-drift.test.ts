import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

const rootDir = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(rootDir, path), 'utf8');

describe('macOS frame-aware navigation dependency patch', () => {
  test('pins the four reviewed crate layers through local path patches', () => {
    const manifest = read('src-tauri/Cargo.toml');
    for (const dependency of ['tauri', 'tauri-runtime', 'tauri-runtime-wry', 'wry']) {
      expect(manifest).toContain(`${dependency} = { path = "../vendor/frame-aware-navigation/${dependency}" }`);
    }
  });

  test('derives a finite frame class from WKNavigationAction before deciding', () => {
    const navigation = read('vendor/frame-aware-navigation/wry/src/wkwebview/navigation.rs');
    expect(navigation).toContain('action.targetFrame().map_or(NavigationFrame::Unknown');
    expect(navigation).toContain('frame.isMainFrame()');
    expect(navigation.indexOf('action.targetFrame()')).toBeLessThan(
      navigation.indexOf('match function(url.to_string(), frame)'),
    );
  });

  test('carries the frame only through the reviewed macOS Tauri builder path', () => {
    const runtime = read('vendor/frame-aware-navigation/tauri-runtime/src/webview.rs');
    const runtimeWry = read('vendor/frame-aware-navigation/tauri-runtime-wry/src/lib.rs');
    const tauri = read('vendor/frame-aware-navigation/tauri/src/webview/mod.rs');
    expect(runtime).toContain('pub enum NavigationFrame');
    expect(runtime).toContain('pub navigation_handler_with_frame');
    expect(runtimeWry).toContain('#[cfg(target_os = "macos")]');
    expect(runtimeWry).toContain('with_navigation_handler_with_frame');
    expect(runtimeWry).toContain('unwrap_or(false)');
    expect(tauri).toContain('pub fn on_navigation_with_frame');
  });

  test('documents licenses, scope, and the upstream exit condition', () => {
    const readme = read('vendor/frame-aware-navigation/README.md');
    expect(readme).toContain('Apache-2.0/MIT');
    expect(readme).toContain('No Windows or Linux adapter is included.');
    expect(readme).toContain('audited upstream release');
  });

  test('fails closed when a future dependency update has not been reviewed', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'lensx-frame-aware-drift-'));
    const temporaryScript = join(temporaryRoot, 'scripts/frame-aware-navigation-dependency-drift.ts');

    try {
      mkdirSync(join(temporaryRoot, 'scripts'), { recursive: true });
      copyFileSync(join(rootDir, 'scripts/frame-aware-navigation-dependency-drift.ts'), temporaryScript);
      cpSync(join(rootDir, 'vendor/frame-aware-navigation'), join(temporaryRoot, 'vendor/frame-aware-navigation'), {
        recursive: true,
      });

      const baseline = spawnSync(process.execPath, ['--experimental-strip-types', temporaryScript], {
        cwd: temporaryRoot,
        encoding: 'utf8',
      });
      expect(baseline.status).toBe(0);
      expect(baseline.stdout).toContain('Checked 255 vendored frame-aware dependency files.');

      appendFileSync(
        join(temporaryRoot, 'vendor/frame-aware-navigation/tauri-runtime/src/webview.rs'),
        '\n// simulated unreviewed dependency update\n',
      );
      const drifted = spawnSync(process.execPath, ['--experimental-strip-types', temporaryScript], {
        cwd: temporaryRoot,
        encoding: 'utf8',
      });
      expect(drifted.status).not.toBe(0);
      expect(`${drifted.stdout}\n${drifted.stderr}`).toContain(
        'Vendored frame-aware dependency drift detected. Review the exact diff',
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
