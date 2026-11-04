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
const showStart = service.indexOf('pub(crate) fn show_owned');
const showEnd = service.indexOf('pub(crate) fn hide_current', showStart);
const show = service.slice(showStart, showEnd);
for (const required of ['PluginChildWebviewSessionState::BridgeReady', 'PluginChildWebviewSessionState::SdkReady']) {
  if (!show.includes(required)) fail(`show_owned does not require ${required}`);
}
if (!show.includes('current.matches_owner(owner)')) fail('show_owned does not check the expected owner');
if (!show.includes('PluginChildWebviewPresentationResult::NotReady')) {
  fail('show_owned does not reject a pre-ready attempt');
}

const presentation = read('src-tauri/src/plugin_child_webview_presentation.rs');
for (const required of [
  'read_plugin_child_webview_presentation',
  'wait_plugin_child_webview_presentation',
  'expire_owned_session_deadline',
  'wait_owned_presentation_readiness(attempt, &owner)',
  'snapshot_owned(attempt, &owner)',
  'parse_owner(',
  'webview.label()',
  'webview.window().label()',
  'set_plugin_child_webview_presentation_visibility',
  'service.show_owned(attempt, &owner)',
  'service.hide_owned(attempt, &owner)',
  'service.focus_owned(attempt, &owner)',
  'service.compare_owned_teardown(attempt, &owner)',
]) {
  if (!presentation.includes(required)) fail(`native presentation contract omits ${required}`);
}

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
const readIndex = slot.indexOf('const readiness = await controller.waitReadiness(native)');
const showIndex = slot.indexOf('await controller.setVisible(native, true)', readIndex);
const readyIndex = slot.indexOf("registry.publish(binding, { status: 'ready'", showIndex);
if (readIndex < 0 || showIndex < readIndex || readyIndex < showIndex) {
  fail('React does not read current readiness, show natively, then remove loading feedback in order');
}
const instances = read('src/app/plugins/runtime/instance-registry.ts');
if (!instances.includes('attempt.bindRuntime((reason) => this.#releaseNative(binding, reason))')) {
  fail('application instance registry does not own native terminal cleanup');
}
const releaseIndex = instances.indexOf('async #releaseNative(');
const hideIndex = instances.indexOf('binding.controller.setVisible(presentation, false)', releaseIndex);
const destroyIndex = instances.indexOf('binding.controller.destroy(presentation)', releaseIndex);
if (
  releaseIndex < 0 ||
  hideIndex < releaseIndex ||
  destroyIndex < hideIndex ||
  !instances.includes('this.closeNative(presentation.attemptId, reason, presentation.owner)')
) {
  fail('terminal Runtime cleanup lost current-owner forwarding or hide-before-destroy fallback');
}
const app = read('src/App.tsx');
if (
  !app.includes('hostWindowPort.replaceInstance(attemptId, owner)') ||
  !app.includes('hostWindowPort.closeInstance(attemptId)')
) {
  fail('main coordination does not distinguish Page replacement from explicit instance close');
}
const presentationLease = slot.slice(slot.indexOf('binding.attempt.bindPresentation'), readIndex);
if (!presentationLease.includes('queue.stop()') || /controller\.(?:destroy|setVisible)/u.test(presentationLease)) {
  fail('presentation unbinding must release geometry without terminating the Runtime');
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
