export const JSON_RPC_VERSION = '2.0' as const;

export enum JsonRpcErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  PermissionDenied = -32001,
  Timeout = -32002,
  UnauthorizedSource = -32003,
}

export type JsonRpcId = string | number;

export type JsonRpcRequest<TParams = unknown> = {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  method: string;
  params?: TParams;
};

export type JsonRpcNotification<TParams = unknown> = {
  jsonrpc: typeof JSON_RPC_VERSION;
  method: string;
  params?: TParams;
};

export type JsonRpcErrorObject = {
  code: JsonRpcErrorCode | number;
  message: string;
  data?: unknown;
};

export type JsonRpcResponse<TResult = unknown> = {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  result?: TResult;
  error?: JsonRpcErrorObject;
};

export const createJsonRpcRequest = <TParams>(
  id: JsonRpcId,
  method: string,
  params?: TParams
): JsonRpcRequest<TParams> => ({
  jsonrpc: JSON_RPC_VERSION,
  id,
  method,
  params,
});

export const createJsonRpcError = (
  id: JsonRpcId,
  code: JsonRpcErrorCode | number,
  message: string,
  data?: unknown
): JsonRpcResponse => ({
  jsonrpc: JSON_RPC_VERSION,
  id,
  error: {
    code,
    message,
    data,
  },
});

export const isJsonRpcResponse = (value: unknown): value is JsonRpcResponse =>
  typeof value === 'object' &&
  value !== null &&
  (value as { jsonrpc?: unknown }).jsonrpc === JSON_RPC_VERSION &&
  'id' in value &&
  ('result' in value || 'error' in value);

export class JsonRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(error: JsonRpcErrorObject) {
    super(error.message);
    this.name = 'JsonRpcError';
    this.code = error.code;
    this.data = error.data;
  }
}
