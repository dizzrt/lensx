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
      capabilities: [],
      hostApiVersion: PLUGIN_HOST_API_VERSION,
      locale: 'en-US',
      theme: 'light',
    };
  }

  async request<Result = unknown>(_request: PluginSdkTransportRequest): Promise<Result> {
    return undefined as Result;
  }

  subscribe(_event: string, _listener: (payload: unknown) => void): () => void {
    return () => undefined;
  }

  onDisconnect(_listener: () => void): () => void {
    return () => undefined;
  }

  dispose(): void {}
}

const client = createPluginSdk({ transport: new ExternalTransport() });
const context = await client.initialize();
export const exampleResult = `${PLUGIN_SDK_VERSION}:${PLUGIN_HOST_API_VERSION}:${client.state}:${context.locale}`;
await client.dispose();
