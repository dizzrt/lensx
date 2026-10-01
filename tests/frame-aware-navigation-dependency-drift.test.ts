import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

const rootDir = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(rootDir, path), 'utf8');

describe('macOS frame-aware navigation dependency patch', () => {
  test('pins the five reviewed crate layers through local path patches without upgrading Tao', () => {
    const manifest = read('src-tauri/Cargo.toml');
    for (const dependency of ['tao', 'tauri', 'tauri-runtime', 'tauri-runtime-wry', 'wry']) {
      expect(manifest).toContain(`${dependency} = { path = "../vendor/frame-aware-navigation/${dependency}" }`);
    }
    const lock = read('src-tauri/Cargo.lock').match(
      /\[\[package\]\]\nname = "tao"[\s\S]*?(?=\n\[\[package\]\]|$)/u,
    )?.[0];
    expect(lock).toContain('version = "0.35.3"');
    expect(lock).not.toContain('source =');
    expect(lock).not.toContain('checksum =');
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

  test('confines responder protection to the macOS resizable setter and complete native Window', () => {
    const window = read('vendor/frame-aware-navigation/tao/src/platform_impl/macos/window.rs');
    const start = window.indexOf('pub fn set_resizable(&self, resizable: bool)');
    const setter = window.slice(start, window.indexOf('\n  #[inline]', start));
    expect(setter).toContain('resizable::set_resizable(&mut adapter, resizable)');
    expect(setter).toContain('util::is_main_thread()');
    expect(setter).toContain('dispatch2::DispatchQueue::main().exec_sync(apply)');
    expect(setter).not.toContain('set_style_mask_async');
    expect(setter).not.toContain('makeFirstResponder');
    expect(setter).not.toContain('ns_view');
    const adapter = window.slice(window.indexOf('struct ResizableStyleAdapter'), start);
    expect(adapter).toContain('type Responder = Retained<NSResponder>');
    expect(adapter).toContain('state.resizable = resizable');
    expect(adapter).toContain('.window()');
    expect(adapter).toContain('makeFirstResponder(Some(responder))');
    const surface = read('src-tauri/src/launcher_surface.rs').split('#[cfg(test)]')[0];
    expect(surface).toContain('.get_window(MAIN_WINDOW_LABEL)');
    expect(surface).toContain('self.is_resizable()');
    for (const forbidden of ['get_webview_window', 'set_focus', 'emit_activation', 'makeFirstResponder']) {
      expect(surface).not.toContain(forbidden);
    }
    const lifecycle = read('src-tauri/src/launcher_window.rs');
    expect(lifecycle).toContain('dispatch_hide(&app, "focus loss")');
    expect(lifecycle).toContain('child.compare_current_teardown(snapshot.attempt)');
  });

  test('documents licenses, scope, and the upstream exit condition', () => {
    const readme = read('vendor/frame-aware-navigation/README.md');
    expect(readme).toContain('Apache-2.0/MIT');
    expect(readme).toContain('No Windows or Linux adapter is included in the lensX patch.');
    expect(readme).toContain('audited upstream release');
    expect(read('vendor/frame-aware-navigation/tao/LICENSE')).toContain('Apache License');
    expect(read('vendor/frame-aware-navigation/tao/LICENSE.spdx')).toContain('PackageLicenseDeclared: Apache-2.0');
    const integrity = JSON.parse(read('vendor/frame-aware-navigation/.lensx-integrity.json'));
    expect(integrity.packages.tao).toBe('0.35.3');
    expect(integrity.patched_files.filter((path: string) => path.startsWith('tao/'))).toEqual([
      'tao/src/platform_impl/macos/window.rs',
      'tao/src/platform_impl/macos/resizable.rs',
    ]);
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
      const integrity = JSON.parse(read('vendor/frame-aware-navigation/.lensx-integrity.json'));
      expect(baseline.stdout).toContain(`Checked ${integrity.files.length} vendored frame-aware dependency files.`);

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
      copyFileSync(
        join(rootDir, 'vendor/frame-aware-navigation/tauri-runtime/src/webview.rs'),
        join(temporaryRoot, 'vendor/frame-aware-navigation/tauri-runtime/src/webview.rs'),
      );
      for (const path of ['tao/src/platform_impl/macos/resizable.rs', 'tao/src/platform_impl/windows/window.rs']) {
        const copied = join(temporaryRoot, 'vendor/frame-aware-navigation', path);
        appendFileSync(copied, '\n// unreviewed Tao patch or unrelated platform edit\n');
        const changed = spawnSync(process.execPath, ['--experimental-strip-types', temporaryScript], {
          cwd: temporaryRoot,
          encoding: 'utf8',
        });
        expect(changed.status).not.toBe(0);
        expect(changed.stderr).toContain('Vendored frame-aware dependency drift detected.');
        copyFileSync(join(rootDir, 'vendor/frame-aware-navigation', path), copied);
      }
      const policy = join(temporaryRoot, 'vendor/frame-aware-navigation/tao/src/platform_impl/macos/resizable.rs');
      rmSync(policy);
      const missing = spawnSync(process.execPath, ['--experimental-strip-types', temporaryScript], {
        cwd: temporaryRoot,
        encoding: 'utf8',
      });
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain('Reviewed frame-aware dependency patch file is missing:');
      copyFileSync(join(rootDir, 'vendor/frame-aware-navigation/tao/src/platform_impl/macos/resizable.rs'), policy);

      const taoManifest = join(temporaryRoot, 'vendor/frame-aware-navigation/tao/Cargo.toml');
      writeFileSync(taoManifest, readFileSync(taoManifest, 'utf8').replace('version = "0.35.3"', 'version = "0.35.4"'));
      const upgraded = spawnSync(process.execPath, ['--experimental-strip-types', temporaryScript], {
        cwd: temporaryRoot,
        encoding: 'utf8',
      });
      expect(upgraded.status).not.toBe(0);
      expect(upgraded.stderr).toContain('tao must remain 0.35.3');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
