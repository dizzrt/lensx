import type { PluginManifestInput } from '@lensx/plugin-contract';
import { createPluginSdk, type PluginRuntimeContext, type PluginSdkTransport } from '@lensx/plugin-sdk';

import {
  createDeferred,
  createPluginManifestFixture,
  createPluginRuntimeContextFixture,
  FakePluginSdkTransport,
  mutatePluginManifestFixture,
  type PluginManifestFixtureMutation,
  PluginTestCancellationController,
} from '../src/index.js';

const manifest: PluginManifestInput = createPluginManifestFixture();
const mutations: readonly PluginManifestFixtureMutation[] = [
  { op: 'set', path: '/version', value: 'invalid' },
  { op: 'remove', path: '/plugin_id' },
];
const candidate: unknown = mutatePluginManifestFixture(manifest, mutations);
const context: PluginRuntimeContext = createPluginRuntimeContextFixture({
  capabilities: ['lensx.example'],
  locale: 'zh-CN',
  theme: 'dark',
});
const fake: PluginSdkTransport = new FakePluginSdkTransport();
const client = createPluginSdk({ transport: fake });
const cancellation = new PluginTestCancellationController();
void client.initialize({ signal: cancellation.signal });
void createDeferred<number>().promise;
void candidate;
void context;

// @ts-expect-error Runtime context fixtures must not accept Host-owned plugin identity.
createPluginRuntimeContextFixture({ pluginIdentity: 'private' });
// @ts-expect-error Runtime context fixtures must not accept permission grants.
createPluginRuntimeContextFixture({ permissions: ['granted'] });
// @ts-expect-error The public SDK client intentionally has no arbitrary raw Host method API.
void client.request('private.method', {});
// @ts-expect-error The Testkit fake intentionally has no RPC envelope configuration.
void new FakePluginSdkTransport({ origin: 'https://example.com' });
