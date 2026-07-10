import {
  createJsonRpcError,
  JSON_RPC_VERSION,
  JsonRpcErrorCode,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from '@lensx/plugin-sdk';

export type HostApiHandler = (params: unknown, pluginId: string) => Promise<unknown> | unknown;

export type HostApiRegistration = {
  method: string;
  permission?: string;
  handler: HostApiHandler;
};

export type PluginBridgeOptions = {
  pluginId: string;
  source: Window;
  targetOrigin: string;
  declaredPermissions: ReadonlySet<string>;
  grantedPermissions: ReadonlySet<string>;
  methods: readonly HostApiRegistration[];
};

const isJsonRpcRequest = (value: unknown): value is JsonRpcRequest =>
  typeof value === 'object' &&
  value !== null &&
  (value as { jsonrpc?: unknown }).jsonrpc === JSON_RPC_VERSION &&
  typeof (value as { method?: unknown }).method === 'string' &&
  'id' in value;

export class PluginBridge {
  private readonly methods = new Map<string, HostApiRegistration>();

  constructor(private readonly options: PluginBridgeOptions) {
    for (const method of options.methods) {
      this.methods.set(method.method, method);
    }
  }

  start(): void {
    window.addEventListener('message', this.handleMessage);
  }

  stop(): void {
    window.removeEventListener('message', this.handleMessage);
  }

  notify(method: string, params?: unknown): void {
    this.options.source.postMessage(
      {
        jsonrpc: JSON_RPC_VERSION,
        method,
        params,
      },
      this.options.targetOrigin
    );
  }

  private readonly handleMessage = async (event: MessageEvent<unknown>): Promise<void> => {
    if (event.source !== this.options.source) {
      return;
    }

    if (!isJsonRpcRequest(event.data)) {
      return;
    }

    const request = event.data;
    const registration = this.methods.get(request.method);

    if (!registration) {
      this.respond(
        createJsonRpcError(request.id, JsonRpcErrorCode.MethodNotFound, `Unknown method: ${request.method}`)
      );
      return;
    }

    if (registration.permission) {
      if (!this.options.declaredPermissions.has(registration.permission)) {
        this.respond(
          createJsonRpcError(
            request.id,
            JsonRpcErrorCode.PermissionDenied,
            `Plugin did not declare permission: ${registration.permission}`
          )
        );
        return;
      }

      if (!this.options.grantedPermissions.has(registration.permission)) {
        this.respond(
          createJsonRpcError(
            request.id,
            JsonRpcErrorCode.PermissionDenied,
            `Permission not granted: ${registration.permission}`
          )
        );
        return;
      }
    }

    try {
      const result = await registration.handler(request.params, this.options.pluginId);
      this.respond({
        jsonrpc: JSON_RPC_VERSION,
        id: request.id,
        result,
      });
    } catch (error) {
      this.respond(
        createJsonRpcError(
          request.id,
          JsonRpcErrorCode.InternalError,
          error instanceof Error ? error.message : 'Host API failed'
        )
      );
    }
  };

  private respond(response: JsonRpcResponse): void {
    this.options.source.postMessage(response, this.options.targetOrigin);
  }
}
