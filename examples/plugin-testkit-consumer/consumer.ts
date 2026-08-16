import {
  normalizePluginManifest,
  PLUGIN_HOST_API_VERSION,
  validatePluginManifest,
  validatePluginRuntimeContext,
} from '@lensx/plugin-contract';
import { createPluginSdk } from '@lensx/plugin-sdk';
import {
  createInvalidPluginRuntimeContextFixture,
  createPluginManifestFixture,
  createPluginRuntimeContextFixture,
  FakePluginSdkTransport,
} from '@lensx/plugin-testkit';

const manifestValidation = validatePluginManifest(createPluginManifestFixture());
if (manifestValidation.status !== 'valid') {
  throw new Error('The Testkit Manifest fixture is not current.');
}
const manifest = normalizePluginManifest(manifestValidation, {
  host_api: PLUGIN_HOST_API_VERSION,
  lensx: '0.1.0',
});
const stored = new Map<string, unknown>();
const transport = new FakePluginSdkTransport({
  connect: async () =>
    createPluginRuntimeContextFixture({
      capabilities: ['storage.delete', 'storage.get', 'storage.get_quota', 'storage.list', 'storage.set'],
    }),
  request: async ({ method, params }) => {
    if (method === 'storage.set') {
      const storageParams = params as { readonly key: string; readonly value: unknown };
      stored.set(storageParams.key, storageParams.value);
      return { method, result: { stored: true } };
    }
    if (method === 'storage.get') {
      const storageParams = params as { readonly key: string };
      return stored.has(storageParams.key)
        ? { method, result: { found: true, value: stored.get(storageParams.key) } }
        : { method, result: { found: false } };
    }
    if (method === 'storage.delete') {
      const storageParams = params as { readonly key: string };
      return { method, result: { deleted: stored.delete(storageParams.key) } };
    }
    if (method === 'storage.list') return { method, result: { keys: [...stored.keys()].sort() } };
    if (method === 'storage.get_quota') {
      return { method, result: { usedBytes: 9, limitBytes: 1_048_576 } };
    }
    throw new Error('Unexpected public Testkit consumer request.');
  },
});
const client = createPluginSdk({ transport });
const states: string[] = [];
client.subscribeState((state) => states.push(state));
const context = await client.initialize();
await client.request({ method: 'storage.set', params: { key: 'settings', value: { mode: 'dark' } } });
const read = await client.request({ method: 'storage.get', params: { key: 'settings' } });
await client.request({ method: 'storage.list', params: {} });
await client.request({ method: 'storage.get_quota', params: {} });
await client.request({ method: 'storage.delete', params: { key: 'settings' } });
const invalidContext = createInvalidPluginRuntimeContextFixture('unknown-capability');
if (validatePluginRuntimeContext(invalidContext).status !== 'invalid') {
  throw new Error('The Testkit invalid Context fixture was unexpectedly accepted.');
}
const snapshot = transport.observation;
for (const privateFact of ['bridge', 'sourceLabel', 'nativeHandle', 'resourceGeneration', 'entryUrl']) {
  if (privateFact in snapshot) throw new Error(`The semantic Testkit exposed private fact ${privateFact}.`);
}
await client.dispose();

export const exampleResult = [
  manifest.status,
  context.locale,
  client.state,
  snapshot.connectAttempts,
  snapshot.requests.length,
  read.found,
  states.join(','),
].join(':');
