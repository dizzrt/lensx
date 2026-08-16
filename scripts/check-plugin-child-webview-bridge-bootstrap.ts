import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = join(import.meta.dirname, '..');
const adapter = readFileSync(join(root, 'src-tauri/src/plugin_child_webview_adapter.rs'), 'utf8');
const failures: string[] = [];
const match = /const PLUGIN_CHILD_WEBVIEW_BRIDGE_BOOTSTRAP: &str = r#"\n([\s\S]*?)\n"#;/u.exec(adapter);
if (match?.[1] === undefined) throw new Error('Child WebView bridge bootstrap source is unavailable.');
const bootstrap = match[1].replace('__LENSX_BRIDGE_FRESHNESS__', '0123456789abcdef0123456789abcdef');

const posted: string[] = [];
const context = vm.createContext({
  TextEncoder,
  ipc: Object.freeze({ postMessage: (value: string) => posted.push(value) }),
});
vm.runInContext(bootstrap, context, { timeout: 1_000 });
const bridge = vm.runInContext('globalThis.__LENSX_PLUGIN_WEBVIEW_BRIDGE__', context) as {
  send(value: unknown): boolean;
  subscribe(listener: (value: unknown) => void): (() => boolean) | undefined;
};
const deliver = vm.runInContext('globalThis.__LENSX_PLUGIN_WEBVIEW_DELIVER__', context) as (value: unknown) => boolean;
const descriptor = vm.runInContext(
  "Object.getOwnPropertyDescriptor(globalThis, '__LENSX_PLUGIN_WEBVIEW_BRIDGE__')",
  context,
) as PropertyDescriptor;

if (!Object.isFrozen(bridge) || Object.keys(bridge).sort().join(',') !== 'bootstrap,send,subscribe') {
  failures.push('bridge is not a frozen minimal bootstrap/send/subscribe surface.');
}
if (!Object.isFrozen((bridge as typeof bridge & { bootstrap?: unknown }).bootstrap)) {
  failures.push('bridge bootstrap frame is mutable.');
}
if (descriptor.configurable !== false || descriptor.writable !== false || descriptor.enumerable !== false) {
  failures.push('bridge global is reconfigurable or enumerable.');
}
const ready = vm.runInContext(
  "({ contract_version: '0.2.0', type: 'lensx.plugin_bridge.ready', freshness: '0123456789abcdef0123456789abcdef' })",
  context,
) as Record<string, unknown>;
if (
  !bridge.send(ready) ||
  posted.length !== 1 ||
  JSON.stringify(JSON.parse(posted[0] ?? 'null')) !== JSON.stringify(ready)
) {
  failures.push('bridge did not carry one valid versioned ready frame.');
}
const invalidFrames = vm.runInContext(
  `[
    { contract_version: '0.2.0', type: 'lensx.plugin_bridge.ready', freshness: '0123456789abcdef0123456789abcdef', extra: true },
    { contract_version: '0.1.0', type: 'lensx.plugin_bridge.disconnect' },
    { contract_version: '0.2.0', type: 'unknown' }
  ]`,
  context,
) as unknown[];
for (const invalid of invalidFrames) {
  if (bridge.send(invalid)) failures.push('bridge accepted a non-closed carrier frame.');
}
const oversized = vm.runInContext(
  `({
    contract_version: '0.2.0',
    type: 'lensx.plugin_bridge.event',
    event: { payload: 'x'.repeat(5242880) }
  })`,
  context,
) as unknown;
if (bridge.send(oversized)) failures.push('bridge accepted a frame beyond the maintained RPC byte budget.');
let received: unknown;
const unsubscribe = bridge.subscribe((frame) => {
  received = frame;
});
if (unsubscribe === undefined || !deliver(ready) || received !== ready) {
  failures.push('bridge subscription did not receive a valid Host-delivered frame.');
}
const structured = vm.runInContext(
  `({
    contract_version: '0.2.0',
    type: 'lensx.plugin_bridge.response',
    request_id: 'request_0000000000000001',
    result: {
      method: 'storage.get',
      result: { found: true, value: '雪❄️</script><script>globalThis.injected=true</script>\\u2028\\u2029' }
    }
  })`,
  context,
) as Record<string, unknown>;
if (!deliver(structured) || received !== structured || vm.runInContext('globalThis.injected', context) !== undefined) {
  failures.push('Unicode, HTML, or script-shaped Host delivery escaped the structured frame boundary.');
}
unsubscribe?.();
if (Reflect.defineProperty(context, '__LENSX_PLUGIN_WEBVIEW_BRIDGE__', { value: null })) {
  failures.push('plugin script can redefine the bridge global.');
}
for (const privateFact of [
  'webview_label',
  'origin_scope',
  'path_scope',
  'entry_id',
  'plugin_id',
  '__TAURI',
  'invoke(',
]) {
  if (bootstrap.includes(privateFact)) failures.push(`bridge bootstrap exposes ${privateFact}.`);
}
if ((adapter.match(/plugin_child_webview_bridge_bootstrap\(BRIDGE_PROBE_FRESHNESS\)/gu) ?? []).length < 3) {
  failures.push('bridge bootstrap is not installed before every isolated Child WebView probe document.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Document-start non-reconfigurable closed Child WebView bridge bootstrap passed.');
