import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

  test('keeps hit-test compilation aligned with its Windows and Linux/BSD consumers', () => {
    const tao = 'vendor/frame-aware-navigation/tao/src';
    const dispatch = read(`${tao}/platform_impl/mod.rs`);
    const consumerPlatforms = [
      ...dispatch.matchAll(/#\[cfg\(([\s\S]*?)\)\]\s*#\[path = "(windows|linux)\/mod\.rs"\]/gu),
    ].flatMap((match) => [...(match[1] ?? '').matchAll(/target_os\s*=\s*"([^"]+)"/gu)].map((os) => os[1]));
    const cfg = read(`${tao}/window.rs`).match(/#\[cfg\(([^#]*?)\)\]\s*pub\(crate\) fn hit_test\(/u)?.[1];
    expect(cfg).toBeDefined();
    expect(cfg?.trim()).toMatch(/^any\([\s\S]*\)$/u);
    const enabledPlatforms = [...(cfg ?? '').matchAll(/target_os\s*=\s*"([^"]+)"/gu)].map((os) => os[1]);
    expect(enabledPlatforms.sort()).toEqual(['dragonfly', 'freebsd', 'linux', 'netbsd', 'openbsd', 'windows']);
    expect(enabledPlatforms).toEqual(consumerPlatforms.sort());
    expect(cfg?.replace(/target_os\s*=\s*"[^"]+"/gu, '').replace(/[\s(),]/gu, '')).toBe('any');
    for (const platform of ['windows', 'linux']) {
      expect(read(`${tao}/platform_impl/${platform}/event_loop.rs`)).toContain('crate::window::hit_test(');
    }
  });

  test('limits new Tao lint exceptions to the documented retained RGBA field', () => {
    const tao = 'vendor/frame-aware-navigation/tao/src';
    const icon = read(`${tao}/platform_impl/macos/icon.rs`);
    expect(icon).toMatch(/#\[derive\(Debug, Clone\)\]\s*pub struct PlatformIcon\(/u);
    expect(icon).toMatch(/\/\/ macOS[^\n]*validated payload[^\n]*Debug and Clone\./u);
    expect(icon).toMatch(/pub struct PlatformIcon\(\s*\/\/[^\n]*\n\s*#\[allow\(dead_code\)\]\s*RgbaIcon,?\s*\);/u);
    expect(icon).toContain('RgbaIcon::from_rgba(rgba, width, height)?');

    // Reviewed upstream exceptions remain valid. File, scope, lint set, and count
    // are fixed so another allowance cannot silently hide a future diagnostic.
    const census = readdirSync(join(rootDir, tao), { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.rs'))
      .sort()
      .flatMap((path) => {
        const source = read(`${tao}/${path}`).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//gu, '');
        const counts = new Map<string, number>();
        for (const match of source.matchAll(/#(!?)\[\s*(allow|expect|cfg_attr)\s*\(([\s\S]*?)\)\s*\]/gu)) {
          if (match[2] === 'cfg_attr' && !/\b(?:allow|expect)\s*\(/u.test(match[3] ?? '')) continue;
          const attribute = `${match[1]}${match[2]}(${match[3]?.replace(/\s+/gu, '')})`;
          counts.set(attribute, (counts.get(attribute) ?? 0) + 1);
        }
        const attributes = [...counts].map(([attribute, count]) => `${attribute}${count > 1 ? ` x${count}` : ''}`);
        return attributes.length === 0 ? [] : [`${path}: ${attributes.join('; ')}`];
      });
    expect(census).toEqual([
      'error.rs: allow(dead_code) x2; allow(unused_macros)',
      'event.rs: allow(deprecated) x6',
      'event_loop.rs: cfg_attr(any(target_os="linux",target_os="dragonfly",target_os="freebsd",target_os="netbsd",target_os="openbsd"),allow(clippy::unnecessary_mut_passed)); allow(non_upper_case_globals)',
      'icon.rs: allow(dead_code)',
      'lib.rs: !allow(clippy::match_str_case_mismatch,clippy::upper_case_acronyms,clippy::from_over_into,clippy::option_map_unit_fn,clippy::needless_lifetimes,clippy::type_complexity,clippy::identity_op,clippy::wrong_self_convention,clippy::non_send_fields_in_send_ty); allow(unused_imports)',
      'platform_impl/android/ndk_glue.rs: allow(non_snake_case) x6',
      'platform_impl/ios/app_state.rs: allow(unused) x2',
      'platform_impl/ios/event_loop.rs: allow(non_upper_case_globals) x3',
      'platform_impl/ios/ffi.rs: !allow(non_camel_case_types,non_snake_case,non_upper_case_globals); allow(non_camel_case_types); allow(deprecated) x2; allow(dead_code) x4; allow(clippy::duplicated_attributes)',
      'platform_impl/ios/monitor.rs: allow(unused)',
      'platform_impl/ios/scene.rs: allow(non_snake_case)',
      'platform_impl/ios/view.rs: allow(non_snake_case) x3; allow(deprecated) x4',
      'platform_impl/ios/window.rs: allow(deprecated)',
      'platform_impl/linux/device.rs: allow(clippy::uninit_assumed_init)',
      'platform_impl/linux/keyboard.rs: allow(clippy::just_underscores_and_digits,non_upper_case_globals) x2',
      'platform_impl/macos/app_delegate.rs: allow(deprecated) x3',
      'platform_impl/macos/app_state.rs: allow(deprecated)',
      'platform_impl/macos/dock.rs: !allow(non_snake_case,non_upper_case_globals)',
      'platform_impl/macos/event.rs: allow(clippy::unnecessary_unwrap)',
      'platform_impl/macos/ffi.rs: !allow(dead_code,non_snake_case,non_upper_case_globals,clippy::enum_variant_names); allow(non_camel_case_types) x2; allow(deprecated) x2; allow(non_upper_case_globals) x2; allow(non_snake_case) x2',
      'platform_impl/macos/icon.rs: allow(dead_code)',
      'platform_impl/macos/mod.rs: allow(dead_code)',
      'platform_impl/macos/monitor.rs: allow(dead_code)',
      'platform_impl/macos/observer.rs: allow(dead_code); allow(non_upper_case_globals) x6; allow(non_snake_case) x2',
      'platform_impl/macos/progress_bar.rs: allow(deprecated) x2',
      'platform_impl/macos/util/cursor.rs: allow(deprecated)',
      'platform_impl/macos/util/mod.rs: allow(dead_code) x2; allow(clippy::needless_lifetimes)',
      'platform_impl/macos/view.rs: !allow(unused_unsafe); !allow(deprecated); allow(clippy::match_like_matches_macro)',
      'platform_impl/macos/window.rs: !allow(unused_unsafe); allow(deprecated) x6',
      'platform_impl/macos/window_delegate.rs: allow(deprecated) x3',
      'platform_impl/windows/dark_mode.rs: !allow(non_snake_case)',
      'platform_impl/windows/dpi.rs: !allow(non_snake_case,unused_unsafe)',
      'platform_impl/windows/drop_handler.rs: allow(non_snake_case)',
      'platform_impl/windows/event_loop.rs: !allow(non_snake_case); allow(non_upper_case_globals); allow(unused_must_use)',
      'platform_impl/windows/mod.rs: allow(unused)',
      'platform_impl/windows/raw_input.rs: allow(dead_code) x3',
      'platform_impl/windows/util.rs: allow(non_snake_case) x15',
      'window.rs: allow(rustdoc::broken_intra_doc_links); allow(unused) x3; allow(clippy::large_enum_variant)',
    ]);
  });

  test('keeps maintained Rust commands free of broad warning suppression', () => {
    const paths = [
      'package.json',
      'src-tauri/Cargo.toml',
      'vendor/frame-aware-navigation/tao/Cargo.toml',
      'scripts/validation/catalog.ts',
      'scripts/tao-dependency-graph.ts',
      'scripts/tao-policy-tests.ts',
      'scripts/wry-policy-tests.ts',
      ...readdirSync(join(rootDir, '.github/workflows')).map((path) => `.github/workflows/${path}`),
    ];
    for (const path of paths) {
      expect(read(path), path).not.toMatch(/--cap-lints(?:=|\s+)allow\b/u);
      expect(read(path), path).not.toMatch(/-A(?:\s+|=)?(?:warnings|unused(?:_\w+)?|deprecated|dead_code)\b/u);
      expect(read(path), path).not.toMatch(/\b(?:warnings|unused|deprecated|dead_code)\s*=\s*["']allow["']/u);
    }
  });

  test('uses checked file URL reading and the production policy at every drag phase', () => {
    const tao = 'vendor/frame-aware-navigation/tao/src/platform_impl/macos';
    const window = read(`${tao}/window.rs`);
    const delegate = read(`${tao}/window_delegate.rs`);
    expect(read(`${tao}/mod.rs`)).toContain('mod file_drop;');
    expect(window).toContain('registerForDraggedTypes(&NSArray::arrayWithObject(appkit::NSPasteboardTypeFileURL))');
    const reader = delegate.slice(
      delegate.indexOf('fn read_file_drop_candidates('),
      delegate.indexOf('fn dispatch_file_drop('),
    );
    for (const check of [
      'sender.is_null()',
      'Option<Retained<Object>>',
      'downcast::<NSPasteboard>().ok()',
      'NSArray::from_slice(&[NSURL::class()])',
      'NSPasteboardURLReadingFileURLsOnlyKey',
      'NSNumber::numberWithBool(true)',
      'readObjectsForClasses_options(&classes, Some(&options))',
      'downcast::<NSURL>().ok()?',
      'if !url.isFileURL()',
      'url.to_file_path()',
    ])
      expect(reader).toContain(check);
    expect(reader).not.toMatch(/unwrap\(|cast_unchecked|UTF8String|percent_decode|std::fs|File::open/u);
    for (const [callback, phase] of [
      ['dragging_entered', 'Enter'],
      ['prepare_for_drag_operation', 'Prepare'],
      ['perform_drag_operation', 'Drop'],
    ]) {
      const start = delegate.indexOf(`extern "C" fn ${callback}(`);
      const callbackSource = delegate.slice(start, delegate.indexOf('\n}', start));
      expect(callbackSource).toContain(`dispatch_file_drop(this, Phase::${phase}, read_file_drop_candidates(sender))`);
    }
    expect(delegate).toContain('file_drop::dispatch(phase, candidates, |event|');
    for (const event of ['HoveredFile(path)', 'DroppedFile(path)', 'HoveredFileCancelled']) {
      expect(delegate).toContain(`FileDropEvent::${event} => WindowEvent::${event}`);
    }
    expect(delegate).toContain('dispatch_file_drop(this, Phase::Exit, std::iter::empty())');
    expect(`${window}\n${delegate}`).not.toContain('NSFilenamesPboardType');
    expect(delegate).not.toContain('propertyListForType');
  });

  test('declares dragging bindings directly and registers native operation and BOOL return types', () => {
    const manifest = read('vendor/frame-aware-navigation/tao/Cargo.toml');
    const appkit = manifest
      .split('[target.\'cfg(target_os = "macos")\'.dependencies.objc2-app-kit]')[1]
      ?.split('\n[')[0];
    expect(appkit).toContain('"NSDragging"');
    const foundation = manifest
      .split('[target.\'cfg(target_os = "macos")\'.dependencies.objc2-foundation]')[1]
      ?.split('\n[')[0];
    for (const feature of ['NSObject', 'NSValue', 'NSURL']) expect(foundation).toContain(`"${feature}"`);
    const delegate = read('vendor/frame-aware-navigation/tao/src/platform_impl/macos/window_delegate.rs');
    for (const [callback, returnType] of [
      ['dragging_entered', 'NSDragOperation'],
      ['prepare_for_drag_operation', 'BOOL'],
      ['perform_drag_operation', 'BOOL'],
    ]) {
      expect(delegate).toContain(`${callback} as extern "C" fn(_, _, _) -> ${returnType}`);
      expect(delegate).toContain(`extern "C" fn ${callback}(this: &Object, _: Sel, sender: id) -> ${returnType}`);
    }
    expect(delegate).toContain('NSDragOperation::Copy');
    expect(delegate).toContain('NSDragOperation::None');
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
    expect(integrity.files.some((entry: { path: string }) => /\/(?:target|\.gradle)\//u.test(entry.path))).toBe(false);
    expect(integrity.patched_files.filter((path: string) => path.startsWith('tao/'))).toEqual([
      'tao/Cargo.toml',
      'tao/src/platform/macos.rs',
      'tao/src/platform_impl/macos/app.rs',
      'tao/src/platform_impl/macos/app_delegate.rs',
      'tao/src/platform_impl/macos/event.rs',
      'tao/src/platform_impl/macos/event_loop.rs',
      'tao/src/platform_impl/macos/file_drop.rs',
      'tao/src/platform_impl/macos/icon.rs',
      'tao/src/platform_impl/macos/mod.rs',
      'tao/src/platform_impl/macos/monitor.rs',
      'tao/src/platform_impl/macos/resizable.rs',
      'tao/src/platform_impl/macos/util/async.rs',
      'tao/src/platform_impl/macos/util/mod.rs',
      'tao/src/platform_impl/macos/window.rs',
      'tao/src/platform_impl/macos/window_delegate.rs',
      'tao/src/window.rs',
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

      const ignoredBuildCache = join(temporaryRoot, 'vendor/frame-aware-navigation/tauri/mobile/android/.gradle');
      mkdirSync(ignoredBuildCache, { recursive: true });
      writeFileSync(join(ignoredBuildCache, 'local-cache.bin'), 'unrelated machine-local build cache');
      const baseline = spawnSync(process.execPath, ['--experimental-strip-types', temporaryScript], {
        cwd: temporaryRoot,
        encoding: 'utf8',
      });
      expect(baseline.status).toBe(0);
      expect(readFileSync(join(ignoredBuildCache, 'local-cache.bin'), 'utf8')).toBe(
        'unrelated machine-local build cache',
      );
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
      for (const path of [
        'tao/Cargo.toml',
        'tao/src/platform_impl/macos/file_drop.rs',
        'tao/src/platform_impl/macos/resizable.rs',
        'wry/src/wkwebview/class/mod.rs',
        'wry/src/wkwebview/class/wry_web_view.rs',
        'wry/src/wkwebview/class/key_equivalent.rs',
        'tao/src/platform_impl/windows/window.rs',
      ]) {
        const copied = join(temporaryRoot, 'vendor/frame-aware-navigation', path);
        appendFileSync(copied, '\n// unreviewed vendor patch or unrelated platform edit\n');
        const changed = spawnSync(process.execPath, ['--experimental-strip-types', temporaryScript], {
          cwd: temporaryRoot,
          encoding: 'utf8',
        });
        expect(changed.status).not.toBe(0);
        expect(changed.stderr).toContain('Vendored frame-aware dependency drift detected.');
        copyFileSync(join(rootDir, 'vendor/frame-aware-navigation', path), copied);
      }
      for (const path of [
        'tao/Cargo.toml',
        'tao/src/platform_impl/macos/file_drop.rs',
        'tao/src/platform_impl/macos/resizable.rs',
        'wry/src/wkwebview/class/mod.rs',
        'wry/src/wkwebview/class/wry_web_view.rs',
        'wry/src/wkwebview/class/key_equivalent.rs',
      ]) {
        const reviewed = join(temporaryRoot, 'vendor/frame-aware-navigation', path);
        rmSync(reviewed);
        const missing = spawnSync(process.execPath, ['--experimental-strip-types', temporaryScript], {
          cwd: temporaryRoot,
          encoding: 'utf8',
        });
        expect(missing.status).not.toBe(0);
        expect(missing.stderr).toContain(
          path === 'tao/Cargo.toml' ? 'ENOENT' : 'Reviewed frame-aware dependency patch file is missing:',
        );
        copyFileSync(join(rootDir, 'vendor/frame-aware-navigation', path), reviewed);
      }

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
