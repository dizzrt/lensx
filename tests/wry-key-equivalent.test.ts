import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

const rootDir = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(rootDir, path), 'utf8');
const base = 'vendor/frame-aware-navigation/wry/src/wkwebview/class';

describe('production Child key-equivalent wiring', () => {
  test('forwards descendant commands through the tested Tao policy and the original native selector', () => {
    const tao = 'vendor/frame-aware-navigation/tao/src/platform_impl/macos';
    const source = read(`${tao}/view.rs`);
    expect(read(`${tao}/mod.rs`)).toContain('mod responder;');
    expect(source).toContain('responder::do_command(&mut NativeCommandResponder(this), &command);');
    const adapter = source.slice(source.indexOf('struct NativeCommandResponder'), source.indexOf('// Get characters'));
    for (const fact of [
      'self.0.downcast_ref::<NSView>()',
      'parent.window()',
      'window.firstResponder()',
      'responder.downcast_ref::<NSView>()',
      '!std::ptr::eq(view, parent)',
      'view.window()',
      'std::ptr::eq(&*owner, &*window)',
      '!view.isHiddenOrHasHiddenAncestor()',
      'view.isDescendantOf(parent)',
      'window.isVisible()',
      'window.isKeyWindow()',
      '!parent.isHiddenOrHasHiddenAncestor()',
      'util::superclass(this)',
      'super(this, superclass), doCommandBySelector: *command',
    ])
      expect(adapter.replace(/\s+/gu, '')).toContain(fact.replace(/\s+/gu, ''));
    const policy = read(`${tao}/responder.rs`).split('#[cfg(test)]')[0] ?? '';
    for (const forbidden of [
      /noop:|selectAll:|copy:|paste:/u,
      /keyCode|modifierFlags|performKeyEquivalent|mainMenu/u,
      /config.?lens|publisher|monaco/iu,
      /eval\(|makeFirstResponder|set_focus/u,
    ])
      expect(`${adapter}\n${policy}`).not.toMatch(forbidden);
    expect(policy.match(/adapter\.perform_super\(command\)/gu)).toHaveLength(1);
  });

  test('uses the tested macOS policy with native ownership and the original superclass event', () => {
    const source = read(`${base}/wry_web_view.rs`);
    expect(read(`${base}/mod.rs`)).toContain('#[cfg(target_os = "macos")]\npub(crate) mod key_equivalent;');
    expect(source).toMatch(/key_equivalent::perform\(\s*&mut NativeKeyEquivalent\(self\),\s*event,?\s*\)/u);
    const adapter = source.slice(source.indexOf('struct NativeKeyEquivalent'), source.indexOf('// Custom Protocol'));
    for (const fact of [
      'self.0.window()',
      'window.isVisible()',
      'window.isKeyWindow()',
      'window.firstResponder()',
      'responder.downcast_ref::<NSView>()',
      'view.window()',
      'std::ptr::eq(&*owner, &*window)',
      'view.isDescendantOf(self.0)',
      'view.isHiddenOrHasHiddenAncestor()',
      'self.0.isHiddenOrHasHiddenAncestor()',
      'super(view), performKeyEquivalent: event',
      'handled.as_bool()',
    ])
      expect(adapter.replace(/\s+/gu, '')).toContain(fact.replace(/\s+/gu, ''));
    const policy = read(`${base}/key_equivalent.rs`).split('#[cfg(test)]')[0] ?? '';
    for (const forbidden of [
      /config.?lens/iu,
      /publisher/iu,
      /monaco/iu,
      /eval\(/u,
      /makeFirstResponder/u,
      /set_focus/u,
      /keyCode/u,
      /modifierFlags/u,
    ]) {
      expect(`${adapter}\n${policy}`).not.toMatch(forbidden);
    }
    expect(policy.match(/adapter\.perform_super\(event\)/gu)).toHaveLength(1);
  });

  test('keeps the active local monitor ahead of Child delivery without synthetic events or public grants', () => {
    const host = read('src-tauri/src/launcher_window.rs');
    const monitor = host.slice(
      host.indexOf('fn install_macos_local_command_monitor'),
      host.indexOf('pub(crate) fn release_macos_local_command_monitor'),
    );
    for (const wiring of [
      'NSEventMask::KeyDown',
      'NSEventMask::KeyUp',
      'NSEventMask::FlagsChanged',
      'gestures.input(',
      'NSRunningApplication::currentApplication().isActive()',
      'local_shortcut_facts(',
      'local_recording_input(',
      'local_key_down(',
      'gestures.recording_owned(input)',
      'dispatch_local_detach(',
      'dispatch_current_close_target(',
      'request_macos_application_quit(',
      'event.isARepeat()',
      'event.timestamp()',
      'event.keyCode()',
      'if consumed',
      'std::ptr::null_mut()',
      'event as *const NSEvent as *mut NSEvent',
    ])
      expect(monitor).toContain(wiring);
    expect(monitor).not.toMatch(/eval\(|sendEvent|keyDown:|global_shortcut/u);
    const schema = read('packages/plugin-contract/schema/host-api.schema.json');
    expect(schema).not.toMatch(/key_equivalent|native_keyboard|performKeyEquivalent/u);
    const sdk = read('packages/plugin-contract/src/generated/plugin-host-api-input.ts');
    expect(sdk).not.toMatch(/key_equivalent|native_keyboard|performKeyEquivalent/u);
    expect(read('src-tauri/Cargo.toml')).toContain('wry = { path = "../vendor/frame-aware-navigation/wry" }');
  });

  test('captures close ownership and finishes native quit cleanup before requesting process exit', () => {
    const host = read('src-tauri/src/launcher_window.rs');
    const hide = host.slice(
      host.indexOf('fn dispatch_captured_main_hide'),
      host.indexOf('fn dispatch_current_close_target'),
    );
    expect(hide).toContain('snapshot_for_surface("main")');
    expect(hide).toContain('snapshot_owned(*attempt, owner)');
    expect(hide).toContain('normal_guard(false)');
    expect(hide).toContain('TauriLauncherWindowAdapter { window, guard }');
    const quit = host.slice(
      host.indexOf('fn request_macos_application_quit'),
      host.indexOf('// The local monitor consumes'),
    );
    expect(quit.indexOf('prepare_shutdown()')).toBeLessThan(quit.indexOf('spawn_blocking('));
    expect(quit.indexOf('compare_current_teardown(attempt)')).toBeLessThan(quit.indexOf('cleanup();'));
    expect(quit.indexOf('cleanup();')).toBeLessThan(quit.indexOf('app.exit(0)'));
    expect(quit).not.toMatch(/thread::sleep|from_millis\(300\)/u);
    const native = read('src-tauri/src/plugin_detached_window_native.rs');
    const close = native.slice(native.indexOf('fn close_shell_exact('), native.indexOf('fn close_empty_shell('));
    expect(close.indexOf('claim_shell_close(epoch, revision)')).toBeLessThan(close.indexOf('teardown_surface('));
    const detach = native.slice(
      native.indexOf('pub(crate) fn dispatch_local_detach'),
      native.indexOf('pub(crate) fn dispatch_local_detached_close'),
    );
    expect(detach.indexOf('reserve_detach(request.attempt)')).toBeLessThan(detach.indexOf('spawn_blocking('));
    expect(host).toContain('NSEventMask::KeyDown | NSEventMask::KeyUp | NSEventMask::FlagsChanged');
    expect(host).not.toMatch(/NSEventMask::LeftMouse(?:Down|Up)/u);
    expect(detach).toContain('native_detach_candidate(&state)');
    const candidate = native.slice(
      native.indexOf('fn native_detach_candidate('),
      native.indexOf('/// Synchronous native admission'),
    );
    for (const check of [
      'native_focus_in(',
      'native_main_input_eligible(',
      'host_input_blocked(',
      'source_ready_and_current:',
      'main_hide_blocked()',
      'is_shutting_down()',
    ])
      expect(candidate).toContain(check);
    expect(detach).toContain('configuration_revision == configuration_revision');
  });
});
