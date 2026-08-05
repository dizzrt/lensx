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
if (manifestValidation.status === 'invalid') {
  throw new Error('The Testkit Manifest fixture is invalid.');
}
const manifest = normalizePluginManifest(manifestValidation, {
  host_api: PLUGIN_HOST_API_VERSION,
  lensx: '0.1.0',
});
const transport = new FakePluginSdkTransport({
  connect: async () => createPluginRuntimeContextFixture(),
});
const client = createPluginSdk({ transport });
const states: string[] = [];
client.subscribeState((state) => states.push(state));
const context = await client.initialize();
const invalidContext = createInvalidPluginRuntimeContextFixture('unknown-capability');
if (validatePluginRuntimeContext(invalidContext).status !== 'invalid') {
  throw new Error('The Testkit invalid Context fixture was unexpectedly accepted.');
}
const snapshot = transport.observation;
await client.dispose();

export const exampleResult = [
  manifest.status,
  context.locale,
  client.state,
  snapshot.connectAttempts,
  states.join(','),
].join(':');
