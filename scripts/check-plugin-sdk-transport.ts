import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PLUGIN_TRANSPORT_CANCEL_TYPE as sdkCancel,
  PLUGIN_TRANSPORT_DISCONNECT_TYPE as sdkDisconnect,
  PLUGIN_TRANSPORT_EVENT_TYPE as sdkEvent,
  PLUGIN_TRANSPORT_REQUEST_TYPE as sdkRequest,
  PLUGIN_TRANSPORT_RESPONSE_TYPE as sdkResponse,
  PLUGIN_TRANSPORT_CONTRACT_VERSION as sdkVersion,
} from '../packages/plugin-sdk/src/internal/transport-contract.ts';
import {
  PLUGIN_WEBVIEW_BRIDGE_CANCEL_TYPE as sdkBridgeCancel,
  PLUGIN_WEBVIEW_BRIDGE_DISCONNECT_TYPE as sdkBridgeDisconnect,
  PLUGIN_WEBVIEW_BRIDGE_EVENT_TYPE as sdkBridgeEvent,
  PLUGIN_WEBVIEW_BRIDGE_READY_TYPE as sdkBridgeReady,
  PLUGIN_WEBVIEW_BRIDGE_REQUEST_TYPE as sdkBridgeRequest,
  PLUGIN_WEBVIEW_BRIDGE_RESPONSE_TYPE as sdkBridgeResponse,
  PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION as sdkBridgeVersion,
} from '../packages/plugin-sdk/src/internal/webview-bridge-contract.ts';
import {
  PLUGIN_TRANSPORT_CANCEL_TYPE as hostCancel,
  PLUGIN_TRANSPORT_DISCONNECT_TYPE as hostDisconnect,
  PLUGIN_TRANSPORT_EVENT_TYPE as hostEvent,
  PLUGIN_TRANSPORT_REQUEST_TYPE as hostRequest,
  PLUGIN_TRANSPORT_RESPONSE_TYPE as hostResponse,
  PLUGIN_TRANSPORT_CONTRACT_VERSION as hostVersion,
} from '../src/app/plugins/runtime/transport-contract.ts';
import {
  PLUGIN_WEBVIEW_BRIDGE_CANCEL_TYPE as hostBridgeCancel,
  PLUGIN_WEBVIEW_BRIDGE_DISCONNECT_TYPE as hostBridgeDisconnect,
  PLUGIN_WEBVIEW_BRIDGE_EVENT_TYPE as hostBridgeEvent,
  PLUGIN_WEBVIEW_BRIDGE_READY_TYPE as hostBridgeReady,
  PLUGIN_WEBVIEW_BRIDGE_REQUEST_TYPE as hostBridgeRequest,
  PLUGIN_WEBVIEW_BRIDGE_RESPONSE_TYPE as hostBridgeResponse,
  PLUGIN_WEBVIEW_BRIDGE_CARRIER_VERSION as hostBridgeVersion,
} from '../src/app/plugins/runtime/webview-bridge-contract.ts';

const root = join(import.meta.dirname, '..');
const fail = (message: string): never => {
  throw new Error(`Plugin SDK transport drift: ${message}`);
};
const sdk = [sdkVersion, sdkRequest, sdkResponse, sdkEvent, sdkCancel, sdkDisconnect];
const host = [hostVersion, hostRequest, hostResponse, hostEvent, hostCancel, hostDisconnect];
if (JSON.stringify(sdk) !== JSON.stringify(host)) fail('plugin and Host frame constants differ');
const sdkBridge = [
  sdkBridgeVersion,
  sdkBridgeReady,
  sdkBridgeRequest,
  sdkBridgeResponse,
  sdkBridgeEvent,
  sdkBridgeCancel,
  sdkBridgeDisconnect,
];
const hostBridge = [
  hostBridgeVersion,
  hostBridgeReady,
  hostBridgeRequest,
  hostBridgeResponse,
  hostBridgeEvent,
  hostBridgeCancel,
  hostBridgeDisconnect,
];
if (JSON.stringify(sdkBridge) !== JSON.stringify(hostBridge)) fail('plugin and Host WebView bridge constants differ');
if (sdkBridgeVersion !== '0.2.0') fail('WebView bridge carrier version is not 0.2.0');

const metadata = JSON.parse(readFileSync(join(root, 'packages/plugin-sdk/package.json'), 'utf8')) as {
  version?: string;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
};
if (metadata.version !== '0.3.0') fail('SDK package version is not 0.3.0');
if (Object.keys(metadata.exports ?? {}).join('\0') !== '.\0./webview') {
  fail('public exports are not root plus WebView');
}
if (Object.keys(metadata.dependencies ?? {}).join('\0') !== '@lensx/plugin-contract') {
  fail('a new SDK Runtime dependency was introduced');
}
const childDispatcher = readFileSync(join(root, 'src/app/plugins/runtime/child-webview-host-dispatcher.ts'), 'utf8');
const publicWebviewTransport = readFileSync(join(root, 'packages/plugin-sdk/src/webview.ts'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
if (!childDispatcher.includes('factory.create')) {
  fail('Child WebView Host dispatcher does not install an authority binding');
}
if (!app.includes('createPluginHostApiDispatcherFactory')) fail('App does not compose the production Dispatcher');
for (const forbidden of ['invoke(', '@tauri-apps/api/core', 'storage.get', 'clipboard.read']) {
  if (publicWebviewTransport.includes(forbidden)) fail(`public WebView transport gained ${forbidden}`);
}

console.log('Checked Plugin SDK transport constants, exports, dependencies, and production Dispatcher boundary.');
