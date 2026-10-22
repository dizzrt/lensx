import type { HostApiRequest, HostApiResult } from '@lensx/plugin-contract';
import type { PluginSdkClient } from '@lensx/plugin-sdk';
import { TranslationError } from './types.js';

export type TranslationHttpRequest = Extract<HostApiRequest, { method: 'http.request' }>['params'];
export type TranslationHttpResult = Extract<HostApiResult, { method: 'http.request' }>['result'];
export type TranslationHttpTransport = (
  request: TranslationHttpRequest,
  signal: AbortSignal,
) => Promise<TranslationHttpResult>;

/** Uses only the public method; there is no browser or private native fallback. */
export const createSdkHttpTransport =
  (client: PluginSdkClient): TranslationHttpTransport =>
  async (params, signal) => {
    if (client.state !== 'ready' || !client.context?.capabilities.includes('http.request')) {
      throw new TranslationError('http-unavailable');
    }
    return client.request(
      { method: 'http.request', params },
      { signal, timeoutMs: (params.timeoutMs ?? 15_000) + 1000 },
    );
  };
