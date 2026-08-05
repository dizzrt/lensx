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
  PLUGIN_TRANSPORT_CANCEL_TYPE as hostCancel,
  PLUGIN_TRANSPORT_DISCONNECT_TYPE as hostDisconnect,
  PLUGIN_TRANSPORT_EVENT_TYPE as hostEvent,
  PLUGIN_TRANSPORT_REQUEST_TYPE as hostRequest,
  PLUGIN_TRANSPORT_RESPONSE_TYPE as hostResponse,
  PLUGIN_TRANSPORT_CONTRACT_VERSION as hostVersion,
} from '../src/app/plugins/runtime/transport-contract.ts';

const root = join(import.meta.dirname, '..');
const fail = (message: string): never => {
  throw new Error(`Plugin SDK transport drift: ${message}`);
};
const sdk = [sdkVersion, sdkRequest, sdkResponse, sdkEvent, sdkCancel, sdkDisconnect];
const host = [hostVersion, hostRequest, hostResponse, hostEvent, hostCancel, hostDisconnect];
if (JSON.stringify(sdk) !== JSON.stringify(host)) fail('plugin and Host frame constants differ');

const metadata = JSON.parse(readFileSync(join(root, 'packages/plugin-sdk/package.json'), 'utf8')) as {
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
};
if (Object.keys(metadata.exports ?? {}).join('\0') !== '.\0./iframe') fail('public exports are not root plus iframe');
if (Object.keys(metadata.dependencies ?? {}).join('\0') !== '@lensx/plugin-contract') {
  fail('a new SDK Runtime dependency was introduced');
}
const frame = readFileSync(join(root, 'src/app/plugins/runtime/PluginRuntimeFrame.tsx'), 'utf8');
if (!frame.includes('unavailablePluginRuntimeTransportHandler'))
  fail('production Runtime does not install unavailable');
for (const forbidden of ['invoke(', '@tauri-apps/api/core', 'storage.get', 'clipboard.read']) {
  if (frame.includes(forbidden)) fail(`production Runtime Frame gained a forbidden dispatch surface: ${forbidden}`);
}

console.log('Checked Plugin SDK transport constants, exports, dependencies, and production unavailable boundary.');
