import { PLUGIN_HOST_API_VERSION } from '@lensx/plugin-contract';
import {
  createPluginSdk,
  PLUGIN_SDK_VERSION,
  type PluginSdkTransport,
  type PluginSdkTransportOperation,
  type PluginSdkTransportRequest,
} from '@lensx/plugin-sdk';

class ExternalTransport implements PluginSdkTransport {
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

  dispose(): void {}
}

let activations = 0;
const client = createPluginSdk({
  transport: new ExternalTransport(),
  onShortcutActivated: (activation) => {
    const id: number = activation.invocationId;
    if (id !== 1 || client.state !== 'ready') throw new Error('Invalid activation delivery.');
    activations += 1;
  },
});
const context = await client.initialize();
if (activations !== 1 || client.activation?.source !== 'shortcut') throw new Error('Activation contract failed.');
export const exampleResult = `${PLUGIN_SDK_VERSION}:${PLUGIN_HOST_API_VERSION}:${client.state}:${context.locale}`;
await client.dispose();
