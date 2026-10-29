import { PLUGIN_HOST_API_VERSION } from '@lensx/plugin-contract';
import {
  createPluginSdk,
  PLUGIN_SDK_VERSION,
  type PluginSdkTransport,
  type PluginSdkTransportOperation,
  type PluginSdkTransportRequest,
} from '@lensx/plugin-sdk';

class ExternalTransport implements PluginSdkTransport {
  disposeCalls = 0;

  async connect(_operation: PluginSdkTransportOperation): Promise<unknown> {
    return {
      capabilities: ['actions.get_activation', 'actions.subscribe_activations'],
      hostApiVersion: PLUGIN_HOST_API_VERSION,
      locale: 'en-US',
      theme: 'light',
    };
  }

  async request<Result = unknown>(_request: PluginSdkTransportRequest): Promise<Result> {
    return (
      _request.method === 'actions.subscribe_activations'
        ? {
            method: _request.method,
            result: { activations: [{ actionId: 'open', invocationId: 1, source: 'shortcut' }] },
          }
        : { method: 'actions.get_activation', result: { activation: null } }
    ) as Result;
  }

  subscribe(_event: string, _listener: (payload: unknown) => void): () => void {
    return () => undefined;
  }

  onDisconnect(_listener: () => void): () => void {
    return () => undefined;
  }

  dispose(): void {
    this.disposeCalls += 1;
  }
}

let activations = 0;
const transport = new ExternalTransport();
const client = createPluginSdk({
  transport,
  onShortcutActivated: (activation) => {
    const id: number = activation.invocationId;
    if (id !== 1 || client.state !== 'ready') throw new Error('Invalid activation delivery.');
    activations += 1;
  },
});
const context = await client.initialize();
if (activations !== 1 || client.activation?.source !== 'shortcut') throw new Error('Activation contract failed.');
const result = await client.request({ method: 'actions.get_activation', params: {} });
if (result.activation !== null) throw new Error('Packed SDK request validation failed.');
export const exampleResult = `${PLUGIN_SDK_VERSION}:${PLUGIN_HOST_API_VERSION}:${client.state}:${context.locale}`;
await client.dispose();
await client.dispose();
if (client.state !== 'disposed' || transport.disposeCalls !== 1) {
  throw new Error('Packed SDK disposal did not release its transport exactly once.');
}
