import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@rstest/core';
import { assertLauncherRoundedCornersContract } from '../scripts/launcher-rounded-corners-contract';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const styles = read('src/styles/global.less');
const nativePolicy = read('src-tauri/src/launcher_rounded_corners.rs');
const product = (path: string) => read(path).split('#[cfg(test)]\nmod tests')[0] ?? '';
const section = (source: string, start: string, end: string): string => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
};
const ordered = (source: string, ...operations: string[]): void => {
  let after = -1;
  for (const operation of operations) {
    const position = source.indexOf(operation, after + 1);
    expect(position, `Missing or out-of-order production operation: ${operation}`).toBeGreaterThan(after);
    after = position;
  }
};

describe('Launcher outline source consistency (not native pixel evidence)', () => {
  test('keeps DOM and native logical radius aligned with transparent roots and the ordinary rectangular slot', () => {
    expect(() => assertLauncherRoundedCornersContract(styles, nativePolicy)).not.toThrow();
  });

  test.each([
    ['CSS radius', styles.replace('border-radius: 18px', 'border-radius: 20px'), nativePolicy],
    ['native radius', styles, nativePolicy.replace('POINTS: f64 = 18.0', 'POINTS: f64 = 36.0')],
    ['missing native radius', styles, ''],
    ['DOM clipping', styles.replace('.launcher-surface {\n  overflow: hidden;', '.launcher-surface {'), nativePolicy],
    [
      'outer shadow',
      styles.replace('.launcher-surface {', '.launcher-surface {\n  box-shadow: 0 0 4px black;'),
      nativePolicy,
    ],
    ['opaque root', styles.replace('background: transparent;', 'background: white;'), nativePolicy],
    ['plugin inset', styles.replace('padding-inline: 0;', 'padding-inline: 4px;'), nativePolicy],
    [
      'inner card radius',
      styles.replace('.plugin-runtime-container {', '.plugin-runtime-container {\n  border-radius: 18px;'),
      nativePolicy,
    ],
  ])('rejects %s drift without rendering a browser or WebView', (_label, changedStyles, changedNative) => {
    expect(() => assertLauncherRoundedCornersContract(changedStyles, changedNative)).toThrow();
  });
});

describe('Launcher native outline production wiring (paired with Cargo policy tests)', () => {
  test('uses the current complete Window content root and its existing layer without a focus or hierarchy replacement', () => {
    const source = product('src-tauri/src/launcher_rounded_corners.rs');
    ordered(
      source,
      'fn ensure_on_main_thread',
      'MainThreadMarker::new()',
      'window.label() != crate::launcher_window::MAIN_WINDOW_LABEL',
      '.ns_view()',
      '.window()',
      '.ok_or(LauncherRoundedCornersError::WindowUnavailable)?',
      '.contentView()',
      '.ok_or(LauncherRoundedCornersError::ContentViewUnavailable)?',
      'ensure_rounded_content(',
    );
    for (const required of [
      'setWantsLayer(true)',
      '.layer()',
      'objc2::msg_send![&*layer, cornerRadius]',
      '.masksToBounds()',
      '.maskedCorners()',
      'objc2::msg_send![&*layer, setCornerRadius: logical_radius]',
      'setMasksToBounds(true)',
    ]) {
      expect(source).toContain(required);
    }
    for (const forbidden of [
      'setContentView(',
      'setLayer(',
      'makeFirstResponder(',
      'setShadow(',
      'setBackgroundColor(',
      'scale_factor()',
      'get_webview(',
      '.ns_window()',
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(read('src-tauri/Cargo.toml')).toContain('"objc2-quartz-core"');
    expect(source).toContain('#[cfg(not(target_os = "macos"))]');
  });

  test('creates macOS hidden and confirms the outline before enabling services or the explicit first reveal', () => {
    const setup = product('src-tauri/src/frame_aware_navigation_setup.rs');
    ordered(
      setup,
      'WebviewWindowBuilder::from_config',
      '.visible(false)',
      '.build()?',
      '.get_window(',
      'ensure_launcher_rounded_corners(&window)',
      'Ok(policy)',
    );
    const lib = product('src-tauri/src/lib.rs');
    ordered(
      lib,
      'frame_aware_navigation_setup::setup_frame_aware_navigation_policy(',
      'plugin_child_webview_service::setup_plugin_child_webview_service(',
      'launcher_window::setup_launcher_window(',
      'launcher_surface::setup_launcher_surface(',
      'launcher_window::schedule_launcher_startup(',
    );
    expect(lib).toContain('#[cfg(target_os = "macos")]\n            launcher_window::schedule_launcher_startup');
    const window = product('src-tauri/src/launcher_window.rs');
    expect(window).toContain('crate::macos_launcher::queue_next_main_turn(move ||');
    expect(product('src-tauri/src/macos_launcher.rs')).toContain(
      'NSOperationQueue::mainQueue().addOperationWithBlock(&block)',
    );
    expect(window).toContain('reveal_startup_once(&actions.startup_revealed');
    expect(window).toContain('LauncherWindowAction::Show(LauncherActivationReason::Startup)');
  });

  test('gates parent and current ready Child reveals and keeps teardown separate from the Window outline', () => {
    const window = product('src-tauri/src/launcher_window.rs');
    const showWindow = section(window, 'fn show_native<', 'fn show_with_host<');
    ordered(showWindow, 'window.ensure_rounded_corners()', 'window.restore()', 'window.show()', 'window.focus()');
    expect(showWindow).toContain('window.hide()');
    const nativeAdapter = section(
      window,
      'impl<R: Runtime> LauncherWindowAdapter for TauriLauncherWindowAdapter<R>',
      'fn is_visible(',
    );
    ordered(nativeAdapter, 'self.confirmed(', 'ensure_launcher_rounded_corners(window)');
    const mainExecutor = product('src-tauri/src/launcher_native_execution.rs');
    ordered(mainExecutor, 'app.run_on_main_thread(', 'callback_guard.is_current()', 'execute(&callback_guard)');
    const service = product('src-tauri/src/plugin_child_webview_service.rs');
    const showChild = section(service, 'pub(crate) fn show_owned(', 'pub(crate) fn hide_current(');
    ordered(
      showChild,
      '.get_mut(&attempt)',
      'current.matches_owner(owner)',
      'PluginChildWebviewSessionState::BridgeReady',
      'handle.present_owned(',
      'let mut state = self.lock_state()',
      '.get_mut(&attempt)',
      'current.matches_owner(owner)',
      'PluginChildWebviewSessionState::BridgeReady',
      '!guard.is_current()',
      'current.state = PluginChildWebviewState::Visible',
    );
    const execution = product('src-tauri/src/plugin_child_webview_execution.rs');
    const policy = section(
      execution,
      'pub(crate) fn perform_owned_presentation(',
      'pub(crate) fn confirm_native_execution(',
    );
    ordered(
      policy,
      '!guard.is_current()',
      'NativePresentationStep::ConfirmClip',
      '!guard.is_current()',
      'NativePresentationStep::HideUnconfirmed',
      'NativePresentationStep::Apply(operation)',
    );
    expect(showChild).toContain('NativePresentationOutcome::FailedHidden');
    expect(service).toContain('current.presentation_epoch.revoke()');
    const teardown = section(service, 'pub(crate) fn compare_current_teardown(', 'pub(crate) fn snapshot(');
    expect(teardown).not.toMatch(/rounded_corners|setMasksToBounds|setCornerRadius/u);
    const adapter = product('src-tauri/src/plugin_child_webview_adapter.rs');
    const ensure = section(
      adapter.slice(adapter.indexOf('impl<R: Runtime> PluginChildWebviewNativeHandle for PluginChildWebviewHandle<R>')),
      'fn ensure_rounded_corners(&self)',
      'fn hide_unconfirmed_content(',
    );
    ordered(ensure, 'self.webview.window()', 'ensure_launcher_rounded_corners(&parent)');
    expect(ensure).not.toContain('.hide()');
    const hideUnsafe = section(
      adapter.slice(adapter.indexOf('impl<R: Runtime> PluginChildWebviewNativeHandle for PluginChildWebviewHandle<R>')),
      'fn hide_unconfirmed_content(&self) -> Result<(), ()> {',
      'fn source_label(',
    );
    expect(hideUnsafe).toContain('self.webview.hide()');
    expect(hideUnsafe).toContain('self.webview.window().hide()');
    const nativeExecution = section(
      adapter,
      'fn execute_owned_presentation_on_main_thread',
      'fn deliver_structured_plugin_child_webview_frame',
    );
    expect(nativeExecution).toContain('window.label() != expected_window');
    expect(nativeExecution).toContain('expected_native_window');
    expect(nativeExecution).toContain('perform_owned_presentation(&guard');
    expect(nativeExecution).toContain('view.setHidden(true)');
    expect(nativeExecution).toContain('native_window.orderOut(None)');
    expect(nativeExecution).toMatch(/receiver\s*\.try_recv\(\)/u);
  });

  test('confirms completion after surface configuration and does not treat main-thread queue submission as success', () => {
    const surface = product('src-tauri/src/launcher_surface.rs');
    const apply = section(surface, 'fn apply_snapshot<', 'fn transition<');
    ordered(apply, '.set_logical_size(', '.set_resizable(snapshot.resizable)', '.ensure_rounded_corners()');
    expect(surface).toContain('ensure_launcher_rounded_corners(window)');
    const source = product('src-tauri/src/launcher_rounded_corners.rs');
    expect(source).toContain('if is_main_thread {\n        return execute();');
    expect(source).toContain('.recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))');
    expect(source).toContain('window.run_on_main_thread(job)');
    expect(source).not.toContain('webview.show()');
    expect(source).not.toContain('window.show()');
  });
  test('confirms AppKit content geometry in the same native callback for main and detached windows', () => {
    const surface = product('src-tauri/src/launcher_surface.rs');
    const content = section(surface, 'pub(crate) fn set_macos_content_geometry(', 'pub(crate) fn set_macos_resizable');
    for (const operation of [
      'write_and_confirm_content_geometry(',
      'native.setContentSize(size)',
      'native.setContentMinSize(size)',
      'native.setContentMaxSize(size)',
      'native.contentRectForFrameRect(native.frame()).size',
      'native.contentMinSize()',
      'native.contentMaxSize()',
    ])
      expect(content).toContain(operation);
    const native = product('src-tauri/src/plugin_detached_window_native.rs');
    const configure = section(native, 'fn configure_window(', '#[cfg(not(target_os = "macos"))]');
    expect(configure).toContain('set_macos_content_geometry(');
    expect(configure).toContain('ContentGeometry::Size');
    expect(configure).not.toContain('window.set_size(');
    expect(surface).toContain('self.geometry(ContentGeometry::Size, size)');
  });

  test('keeps the detached system title bar opaque and outside the full rectangular plugin content', () => {
    const source = product('src-tauri/src/plugin_detached_window_native.rs');
    const window = section(source, 'let window = WindowBuilder::new(app, label)', 'let policy = Arc::clone');
    for (const setting of [
      '.decorations(true)',
      '.title_bar_style(tauri::TitleBarStyle::Transparent)',
      '.hidden_title(true)',
      '.closable(true)',
      '.minimizable(true)',
      '.maximizable(true)',
      '.fullscreen(false)',
      '.transparent(false)',
    ])
      expect(window).toContain(setting);
    const titlebar = section(source, 'fn configure_detached_titlebar(', 'fn create_hidden_shell(');
    for (const confirmation of [
      'native.isOpaque()',
      '!native.titlebarAppearsTransparent()',
      '!style.contains(NSWindowStyleMask::FullSizeContentView)',
      'NSWindowButton::CloseButton',
      'NSWindowButton::MiniaturizeButton',
      'NSWindowButton::ZoomButton',
      'NSWindowCollectionBehavior::FullScreenPrimary',
      'native.setCollectionBehavior(behavior)',
      'native.setMaxFullScreenContentSize(',
    ])
      expect(titlebar).toContain(confirmation);
    const resizePolicy = section(
      product('src-tauri/src/launcher_surface.rs'),
      'fn set_macos_resizable',
      'pub(crate) struct GuardedSurfaceWindow',
    );
    expect(resizePolicy).toContain('window.set_resizable(resizable)');
    expect(resizePolicy).toContain('window.set_maximizable(true)');
    const presentation = section(source, 'fn update_windowed_surface(', 'struct NativeHostControl(');
    ordered(
      presentation,
      'shell.window.is_fullscreen()',
      'if fullscreen',
      '*pending = Some((revision, page))',
      'return Ok(())',
      'pending.take().filter',
      'apply_owned_window_surface(',
      'refresh_owned_window_surface(',
    );
    expect(nativePolicy).toContain('ensure_content_clip(&mut content, 0.0)');
    const config = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(config.app.windows.find((entry: { label: string }) => entry.label === 'main')?.transparent).toBe(true);
  });
});
