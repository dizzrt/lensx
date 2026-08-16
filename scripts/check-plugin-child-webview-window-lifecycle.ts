import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Child WebView window lifecycle drift: ${message}`);
};

const launcher = read('src-tauri/src/launcher_window.rs');
const dispatchStart = launcher.indexOf('pub fn dispatch<R: Runtime>');
const dispatchEnd = launcher.indexOf('\n    }\n}', dispatchStart);
const dispatch = launcher.slice(dispatchStart, dispatchEnd);
if (dispatch.indexOf('hide_current_plugin_presentation(app)') > dispatch.indexOf('execute_with_resolver_policy(')) {
  fail('Launcher hides the parent before the current Child WebView');
}
for (const required of [
  'restore_current_plugin_presentation(app)',
  'service.hide_current(snapshot.attempt)',
  'service.show_current(snapshot.attempt)',
  'service.focus_current(snapshot.attempt)',
]) {
  if (!launcher.includes(required)) fail(`Launcher lifecycle omits ${required}`);
}
if (!launcher.includes('compare_current_teardown(snapshot.attempt)')) {
  fail('failed native hide does not fail closed through compare-current teardown');
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

console.log('Checked resize, scale, hide/restore, focus, shortcut, close, and App teardown presentation wiring.');
