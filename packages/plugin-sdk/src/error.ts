import { type HostApiError, validateHostApiError } from '@lensx/plugin-contract';

export type PluginSdkErrorCode =
  | 'cancelled'
  | 'timeout'
  | 'disconnected'
  | 'disposed'
  | 'incompatible_host_api'
  | 'invalid_runtime_context'
  | 'invalid_argument'
  | 'transport_failure';

const ERROR_MESSAGES: Readonly<Record<PluginSdkErrorCode, string>> = {
  cancelled: 'The SDK operation was cancelled.',
  timeout: 'The SDK operation timed out.',
  disconnected: 'The SDK transport is disconnected.',
  disposed: 'The SDK client has been disposed.',
  incompatible_host_api: 'The Host API version is not supported by this SDK.',
  invalid_runtime_context: 'The Runtime context is invalid.',
  invalid_argument: 'An SDK argument is invalid.',
  transport_failure: 'The SDK transport operation failed.',
};

export class PluginSdkError extends Error {
  readonly code: PluginSdkErrorCode;

  constructor(code: PluginSdkErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'PluginSdkError';
    this.code = code;
  }
}

export const toPluginSdkError = (error: unknown): PluginSdkError =>
  error instanceof PluginSdkError ? error : new PluginSdkError('transport_failure');

export const toPluginSdkOperationError = (error: unknown): PluginSdkError | HostApiError => {
  if (error instanceof PluginSdkError) return error;
  const hostError = validateHostApiError(error);
  return hostError.status === 'valid' ? hostError.value : new PluginSdkError('transport_failure');
};
