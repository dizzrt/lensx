import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

const rootDir = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(rootDir, path), 'utf8');
const base = 'vendor/frame-aware-navigation/wry/src/wkwebview/class';

describe('production Child key-equivalent wiring', () => {
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
      'dispatch_macos_local_key(',
      'NSRunningApplication::currentApplication().isActive()',
      'modifiers == NSEventModifierFlags::Command',
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
});
