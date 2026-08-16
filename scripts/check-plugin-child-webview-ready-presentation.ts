import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Child WebView ready presentation drift: ${message}`);
};

const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const productStart = adapter.indexOf('pub(crate) fn create_plugin_child_webview');
const productEnd = adapter.indexOf('\n#[derive(', productStart);
const product = adapter.slice(productStart, productEnd);
if (!product.includes('add_child(') || !product.includes('webview.hide()')) {
  fail('product Child WebView is not hidden immediately after native creation');
}

const service = read('src-tauri/src/plugin_child_webview_service.rs');
const showStart = service.indexOf('pub(crate) fn show_current');
const showEnd = service.indexOf('pub(crate) fn hide_current', showStart);
const show = service.slice(showStart, showEnd);
for (const required of ['PluginChildWebviewSessionState::BridgeReady', 'PluginChildWebviewSessionState::SdkReady']) {
  if (!show.includes(required)) fail(`show_current does not require ${required}`);
}
if (!show.includes('PluginChildWebviewPresentationResult::NotReady')) {
  fail('show_current does not reject a pre-ready attempt');
}

const presentation = read('src-tauri/src/plugin_child_webview_presentation.rs');
for (const required of [
  'read_plugin_child_webview_presentation',
  'wait_plugin_child_webview_presentation',
  'expire_current_session_deadline',
  'set_plugin_child_webview_presentation_visibility',
  'service.show_current(attempt)',
  'service.hide_current(attempt)',
]) {
  if (!presentation.includes(required)) fail(`native presentation contract omits ${required}`);
}

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
const readIndex = slot.indexOf('presentationController.waitReadiness');
const showIndex = slot.indexOf('presentationController.setVisible(presentation, true)');
const readyIndex = slot.indexOf("dispatch({ type: 'ready'");
if (readIndex < 0 || showIndex < readIndex || readyIndex < showIndex) {
  fail('React does not read current readiness, show natively, then remove loading feedback in order');
}
const releaseIndex = slot.indexOf('binding.attempt.bindPresentation');
const hideIndex = slot.indexOf('presentationController.setVisible(presentation, false)', releaseIndex);
const destroyIndex = slot.indexOf('presentationController.destroy(presentation)', releaseIndex);
if (releaseIndex < 0 || hideIndex < releaseIndex || destroyIndex < hideIndex) {
  fail('terminal presentation release does not hide before native destroy');
}

const lifecycle = read('src/app/plugins/runtime/lifecycle-controller.ts');
const failStart = lifecycle.indexOf('async fail(code: PluginRuntimeFailureCode)');
const failEnd = lifecycle.indexOf('\n        terminate,', failStart);
const failSection = lifecycle.slice(failStart, failEnd);
if (failSection.indexOf("await terminate('failure')") > failSection.indexOf('input.onFailure(')) {
  fail('Host failure feedback can render before terminal native teardown completes');
}

const tests = read('tests/plugin-runtime-slot.test.tsx');
for (const evidence of [
  'keeps the native view hidden behind loading until current Session ready',
  'destroys the native view before exposing terminal Host feedback',
]) {
  if (!tests.includes(evidence)) fail(`React evidence omits ${evidence}`);
}

console.log('Checked ready-only Child WebView visibility and hide-before-overlay terminal ordering.');
