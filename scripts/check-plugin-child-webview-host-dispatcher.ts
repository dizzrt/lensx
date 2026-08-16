import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const native = read('src-tauri/src/plugin_child_webview_host_dispatcher.rs');
const service = read('src-tauri/src/plugin_child_webview_service.rs');
const adapter = read('src/app/plugins/runtime/child-webview-host-dispatcher.ts');
const dispatcher = read('src/app/plugins/runtime/host-api-dispatcher.ts');
const bootstrap = read('src/app/AppBootstrap.tsx');
const app = read('src/App.tsx');
const lib = read('src-tauri/src/lib.rs');

for (const marker of [
  'EventTarget::webview("main")',
  'PluginChildWebviewHostAuthorityIdentity',
  'settle_plugin_child_webview_host_dispatch',
  'fail_plugin_child_webview_host_dispatch',
  'emit_plugin_child_webview_host_event',
  'service.attach_ready_dispatcher(dispatcher.clone())',
  'service.attach_rpc_dispatcher(dispatcher.clone())',
]) {
  if (!native.includes(marker)) failures.push(`native Host dispatcher binding is missing ${marker}.`);
}
for (const forbidden of [
  'entry_url:',
  'source_label: String,\n    pub(crate) identity',
  'resource_generation: u64,\n    pub(crate) request',
]) {
  const eventStart = native.indexOf('pub(crate) struct PluginChildWebviewHostDispatchEvent');
  const eventEnd = native.indexOf('pub(crate) struct PluginChildWebviewHostCancelEvent');
  if (native.slice(eventStart, eventEnd).includes(forbidden)) {
    failures.push(`Host React dispatch event exposes native Session fact ${forbidden}.`);
  }
}
for (const marker of [
  'createPluginChildWebviewHostDispatcherController',
  'binding.execute(event.request, operation.controller.signal)',
  'preparePluginRuntimeTransportSettlement(output)',
  'if (accepted) settlement.effect?.()',
  'operation.controller.abort()',
  'session.binding.dispose()',
]) {
  if (!adapter.includes(marker)) failures.push(`React Host dispatcher adapter is missing ${marker}.`);
}
if (!dispatcher.includes('readonly execute:'))
  failures.push('existing Host API dispatcher lacks carrier-independent execution.');
if (!bootstrap.includes('enablePluginChildWebviewHostDispatcher')) {
  failures.push('production bootstrap does not opt into the Child WebView Host dispatcher.');
}
if (!app.includes('startPluginChildWebviewHostDispatcherDesktopAdapter')) {
  failures.push('App root does not own Child WebView Host dispatcher start/disposal.');
}
for (const command of [
  'settle_plugin_child_webview_host_dispatch',
  'fail_plugin_child_webview_host_dispatch',
  'emit_plugin_child_webview_host_event',
]) {
  if ((lib.match(new RegExp(command, 'gu')) ?? []).length !== 2) {
    failures.push(`${command} is not registered in both Host invoke configurations.`);
  }
}
if (!service.includes('plugin_version: self.plugin_version.clone()')) {
  failures.push('trusted native plugin version is not carried into Host dispatcher authority.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Current Child WebView Session to existing Host API Dispatcher binding passed.');
