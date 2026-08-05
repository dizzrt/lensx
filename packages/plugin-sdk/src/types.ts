import type { PluginRuntimeContext, PluginRuntimeLocale, PluginRuntimeTheme } from '@lensx/plugin-contract';

export type PluginSdkState = 'idle' | 'initializing' | 'ready' | 'disconnected' | 'disposed';
export type { PluginRuntimeContext, PluginRuntimeLocale, PluginRuntimeTheme };

export interface PluginSdkCancellationSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export type PluginSdkUnsubscribe = () => void;

export interface PluginSdkTransportOperation {
  readonly signal: PluginSdkCancellationSignal;
}

export interface PluginSdkTransportRequest extends PluginSdkTransportOperation {
  readonly method: string;
  readonly params: unknown;
}

export interface PluginSdkTransport {
  connect(operation: PluginSdkTransportOperation): Promise<unknown>;
  request<Result = unknown>(request: PluginSdkTransportRequest): Promise<Result>;
  subscribe(event: string, listener: (payload: unknown) => void): PluginSdkUnsubscribe;
  onDisconnect(listener: () => void): PluginSdkUnsubscribe;
  dispose(): void | Promise<void>;
}

export interface PluginSdkOperationOptions {
  readonly signal?: PluginSdkCancellationSignal;
  readonly timeoutMs?: number;
}

export interface CreatePluginSdkOptions {
  readonly transport: PluginSdkTransport;
  readonly timeoutMs?: number;
}

export interface PluginSdkClient {
  readonly state: PluginSdkState;
  readonly context: PluginRuntimeContext | undefined;
  initialize(options?: PluginSdkOperationOptions): Promise<PluginRuntimeContext>;
  subscribeState(listener: (state: PluginSdkState) => void): PluginSdkUnsubscribe;
  dispose(): Promise<void>;
}
