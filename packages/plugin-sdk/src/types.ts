import type {
  HostApiEvent,
  HostApiEventName,
  HostApiRequest,
  HostApiResult,
  PluginRuntimeContext,
  PluginRuntimeLocale,
  PluginRuntimeTheme,
} from '@lensx/plugin-contract';

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

export interface PluginSdkTransportRequest<Request extends HostApiRequest = HostApiRequest>
  extends PluginSdkTransportOperation {
  readonly method: Request['method'];
  readonly params: Request['params'];
}

export interface PluginSdkTransport {
  connect(operation: PluginSdkTransportOperation): Promise<unknown>;
  request<Result = unknown, Request extends HostApiRequest = HostApiRequest>(
    request: PluginSdkTransportRequest<Request>,
  ): Promise<Result>;
  subscribe(event: HostApiEventName, listener: (payload: unknown) => void): PluginSdkUnsubscribe;
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

export type PluginSdkRequestResult<Request extends HostApiRequest> = Extract<
  HostApiResult,
  { readonly method: Request['method'] }
>['result'];

export type PluginSdkEvent<EventName extends HostApiEventName> = Extract<HostApiEvent, { readonly event: EventName }>;

export interface PluginSdkClient {
  readonly state: PluginSdkState;
  readonly context: PluginRuntimeContext | undefined;
  initialize(options?: PluginSdkOperationOptions): Promise<PluginRuntimeContext>;
  request<Request extends HostApiRequest>(
    request: Request,
    options?: PluginSdkOperationOptions,
  ): Promise<PluginSdkRequestResult<Request>>;
  subscribe<EventName extends HostApiEventName>(
    event: EventName,
    listener: (event: PluginSdkEvent<EventName>) => void,
  ): PluginSdkUnsubscribe;
  subscribeState(listener: (state: PluginSdkState) => void): PluginSdkUnsubscribe;
  dispose(): Promise<void>;
}
