import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Child WebView window lifecycle drift: ${message}`);
};

const launcher = read('src-tauri/src/launcher_window.rs');
for (const required of [
  '.get_window(MAIN_WINDOW_LABEL)',
  '.get_webview(MAIN_WINDOW_LABEL)',
  'hide_current_plugin_presentation(child)',
  'rollback_current_plugin_presentation(child, hidden_attempt)',
  'restore_current_plugin_presentation(child)',
  'child.hide_current(snapshot.attempt)',
  'child.show_current(snapshot.attempt)',
  'child.focus_current(snapshot.attempt)',
]) {
  if (!launcher.includes(required)) fail(`Launcher lifecycle omits ${required}`);
}
if (!launcher.includes('child.compare_current_teardown(snapshot.attempt)')) {
  fail('failed native hide does not fail closed through compare-current teardown');
}
if (launcher.includes('get_webview_window(MAIN_WINDOW_LABEL)') || launcher.includes('WebviewWindow<R>')) {
  fail('post-creation Launcher paths regressed to the single-WebviewWindow lookup');
}

const surface = read('src-tauri/src/launcher_surface.rs');
if (!surface.includes('.get_window(MAIN_WINDOW_LABEL)') || surface.includes('get_webview_window')) {
  fail('Launcher surface sizing does not resolve the complete native Window');
}
if (
  !surface.includes('assert!(app.manage(LauncherSurfaceCoordinator::default()))') ||
  surface.includes('debug_assert!(app.manage(LauncherSurfaceCoordinator::default()))')
) {
  fail('Launcher surface coordinator is not installed in release builds');
}

const presentation = read('src-tauri/src/plugin_child_webview_presentation.rs');
if (presentation.includes('get_webview_window(MAIN_WINDOW_LABEL)')) {
  fail('presentation geometry depends on a post-creation single-WebviewWindow conversion');
}

const nativeDialogStart = launcher.indexOf('pub(crate) fn begin_launcher_native_dialog');
const nativeDialogEnd = launcher.indexOf('\n}', nativeDialogStart);
const nativeDialog = launcher.slice(nativeDialogStart, nativeDialogEnd);
if (!nativeDialog.includes('app.get_window(MAIN_WINDOW_LABEL)')) {
  fail('native dialog parent does not resolve the complete native Window');
}

const rustTests = launcher.slice(launcher.indexOf('#[cfg(test)]\nmod tests'));
for (const required of [
  'composed_hide_resolves_native_window_before_child_first_parent_second_mutation',
  'dialog_guard_suppresses_child_and_parent_hide_after_native_resolution',
  'native_hide_failure_restores_and_refocuses_the_same_child',
  'rollback_failure_tears_down_current_child_but_stale_rollback_is_inert',
  'restore_resolves_host_then_shows_parent_before_the_same_child',
  'target_resolution_failures_never_mutate_child_presentation',
]) {
  if (!rustTests.includes(required)) fail(`Rust atomic lifecycle coverage omits ${required}`);
}

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
for (const required of [
  'window.devicePixelRatio',
  'physicalBoundsFromDomRect(element.getBoundingClientRect(), scaleFactor)',
  "window.addEventListener('resize', syncBounds)",
  'presentationRevision: revision',
]) {
  if (!slot.includes(required)) fail(`React slot lifecycle omits ${required}`);
}

const app = read('src/App.tsx');
for (const required of [
  "window.addEventListener('beforeunload', terminateForReload)",
  "window.addEventListener('pagehide', terminateForReload)",
  "terminateCurrent('app_teardown')",
]) {
  if (!app.includes(required)) fail(`App terminal lifecycle omits ${required}`);
}

const slotTests = read('tests/plugin-runtime-slot.test.tsx');
const navigationTests = read('tests/plugin-page-navigation-ui.test.tsx');
if (!slotTests.includes('recomputes physical bounds and scale on the same current presentation')) {
  fail('missing resize/scale continuity evidence');
}
if (!navigationTests.includes('keeps one current Runtime across shortcut activation refresh')) {
  fail('missing shortcut activation continuity evidence');
}
if (!navigationTests.includes('returns Home and restores input focus before deferred Child teardown completes')) {
  fail('missing deferred Page-close resize and focus evidence');
}

const surfaceAdapter = read('src/app/launcher/surface.ts');
const surfaceTests = read('tests/launcher-surface-desktop-adapter.test.ts');
for (const mode of ["'home'", "'search'", "'host_page'", "'plugin_page'"]) {
  if (!surfaceAdapter.includes(mode) || !surfaceTests.includes(mode)) {
    fail(`typed Launcher surface boundary omits ${mode}`);
  }
}
for (const required of [
  'page_attempt_id',
  'initial_size',
  'resizable',
  'Number.isInteger(value.initial_size.width)',
  'Number.isInteger(value.initial_size.height)',
  'hasExactKeys(value, PLUGIN_TARGET_KEYS)',
]) {
  if (!surfaceAdapter.includes(required)) fail(`Launcher plugin surface validation omits ${required}`);
}
for (const forbidden of ['windowLabel', '@tauri-apps/api/window']) {
  if (surfaceAdapter.includes(forbidden)) fail(`Launcher surface adapter exposes ${forbidden}`);
}

console.log(
  'Checked native Window/Host WebView identity, atomic failure recovery, resize, focus, shortcut, close, and teardown wiring.',
);
