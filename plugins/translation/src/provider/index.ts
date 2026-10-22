import { validateHostApiError } from '@lensx/plugin-contract';
import { PluginSdkError } from '@lensx/plugin-sdk';
import { isSourceLanguage, isSupportedDirection } from '../languages.js';
import { type SignedTranslationRequest, signTranslationRequest } from './signing.js';
import type { TranslationHttpTransport } from './transport.js';
import {
  TranslationError,
  type TranslationErrorCode,
  type TranslationInput,
  type TranslationProvider,
  type TranslationResult,
} from './types.js';

export type {
  Credentials,
  TranslationErrorCode,
  TranslationInput,
  TranslationProvider,
  TranslationResult,
} from './types.js';
export { TranslationError } from './types.js';
export const RESPONSE_BYTE_LIMIT = 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 15_000;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const safeRequestId = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : undefined;

const serviceCodes: Readonly<Record<string, TranslationErrorCode>> = {
  '-400': 'parameters',
  '-415': 'direction',
  '-429': 'rate-limit',
  '-500': 'service',
  MissingAuthenticationToken: 'credentials',
  MissingRequestInfo: 'credentials',
  MissingSignature: 'credentials',
  InvalidClientTokenId: 'credentials',
  InvalidAccessKey: 'credentials',
  InvalidCredential: 'credentials',
  '100025': 'credentials',
  SignatureDoesNotMatch: 'credentials',
  '100003': 'credentials',
  '100004': 'credentials',
  '100005': 'credentials',
  '100009': 'credentials',
  '100010': 'credentials',
  InvalidTimestamp: 'clock',
  SignatureExpired: 'clock',
  '100006': 'clock',
  LackPolicy: 'permission',
  AccessDenied: 'permission',
  LackProjectPolicy: 'permission',
  ServiceShouldCallSelfApi: 'permission',
  InnerApiNeedAccountInfo: 'permission',
  '100011': 'permission',
  '100012': 'permission',
  '100013': 'permission',
  '100017': 'permission',
  '100021': 'permission',
  FlowLimitExceeded: 'rate-limit',
  QuotaExceeded: 'rate-limit',
  '100018': 'rate-limit',
  MissingParameter: 'parameters',
  InvalidActionOrVersion: 'parameters',
  MethodNotAllowed: 'parameters',
  '100002': 'parameters',
  '100008': 'parameters',
  '100020': 'parameters',
};

const httpError = (status: number): TranslationErrorCode =>
  status === 401 ? 'credentials' : status === 403 ? 'permission' : status === 429 ? 'rate-limit' : 'service';

const checkAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new TranslationError('cancelled');
};

const parseResponse = (text: string, response: { status: number; ok: boolean }): TranslationResult => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TranslationError(response.ok ? 'protocol' : httpError(response.status));
  }
  if (!record(value)) throw new TranslationError(response.ok ? 'protocol' : httpError(response.status));
  const metadata = value.ResponseMetadata;
  if (metadata !== undefined && !record(metadata)) throw new TranslationError('protocol');
  const requestId = record(metadata) ? safeRequestId(metadata.RequestId) : undefined;
  const error = record(metadata) ? metadata.Error : undefined;
  if (error !== undefined && error !== null) {
    if (
      !record(error) ||
      (typeof error.Code !== 'string' && typeof error.Code !== 'number' && !Number.isInteger(error.CodeN))
    ) {
      throw new TranslationError('protocol', requestId);
    }
    const code = String(error.Code);
    const codeN = Number.isInteger(error.CodeN) ? String(error.CodeN) : '';
    const classification = Object.hasOwn(serviceCodes, code)
      ? serviceCodes[code]
      : Object.hasOwn(serviceCodes, codeN)
        ? serviceCodes[codeN]
        : 'service';
    throw new TranslationError(classification, requestId);
  }
  if (!response.ok) throw new TranslationError(httpError(response.status), requestId);
  const list = value.TranslationList;
  if (!Array.isArray(list) || list.length !== 1 || !record(list[0]) || typeof list[0].Translation !== 'string') {
    throw new TranslationError('protocol', requestId);
  }
  const detected = list[0].DetectedSourceLanguage;
  if (detected !== undefined && (typeof detected !== 'string' || !isSourceLanguage(detected))) {
    throw new TranslationError('protocol', requestId);
  }
  return {
    translation: list[0].Translation,
    ...(detected === undefined ? {} : { detectedLanguage: detected }),
    ...(requestId === undefined ? {} : { requestId }),
  };
};

export interface ProviderDependencies {
  readonly request: TranslationHttpTransport;
  readonly now?: () => Date;
  readonly sign?: (input: TranslationInput, date: Date) => SignedTranslationRequest | Promise<SignedTranslationRequest>;
}

/** One bounded request, with no polling or automatic retries. */
export const createTranslationProvider = (dependencies: ProviderDependencies): TranslationProvider => {
  const request = dependencies.request;
  const now = dependencies.now ?? (() => new Date());
  const sign = dependencies.sign ?? signTranslationRequest;
  return async (input, externalSignal) => {
    if (!isSupportedDirection(input.sourceLanguage, input.targetLanguage)) throw new TranslationError('direction');
    if (input.text.trim() === '') throw new TranslationError('parameters');
    if ([...input.text].length > 5000) throw new TranslationError('input-limit');
    if (
      !/^[\x21-\x7e]+$/u.test(input.credentials.accessKeyId) ||
      !/^[\x21-\x7e]+$/u.test(input.credentials.secretAccessKey)
    ) {
      throw new TranslationError('credentials');
    }
    const controller = new AbortController();
    let rejectStopped: (error: TranslationError) => void = () => undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      rejectStopped = reject;
    });
    const stop = (code: 'cancelled' | 'timeout') => {
      rejectStopped(new TranslationError(code));
      controller.abort();
    };
    const abort = () => stop('cancelled');
    externalSignal.addEventListener('abort', abort, { once: true });
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    const timeout = setTimeout(() => stop('timeout'), REQUEST_TIMEOUT_MS);
    const ensureCurrent = () => {
      if (Date.now() >= deadline) throw new TranslationError('timeout');
      checkAborted(controller.signal);
    };
    const work = async (): Promise<TranslationResult> => {
      ensureCurrent();
      let signed: SignedTranslationRequest;
      try {
        signed = await sign(input, now());
      } catch {
        throw new TranslationError('credentials');
      }
      ensureCurrent();
      const timeoutMs = Math.max(1, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()));
      const response = await request(
        {
          url: signed.url,
          method: 'POST',
          headers: Object.entries(signed.headers).map(([name, value]) => ({ name, value })),
          body: signed.body,
          timeoutMs,
        },
        controller.signal,
      );
      ensureCurrent();
      if (
        typeof response.body !== 'string' ||
        !Number.isInteger(response.status) ||
        response.status < 100 ||
        response.status > 599 ||
        new TextEncoder().encode(response.body).byteLength > RESPONSE_BYTE_LIMIT
      )
        throw new TranslationError('protocol');
      return parseResponse(response.body, {
        status: response.status,
        ok: response.status >= 200 && response.status < 300,
      });
    };
    if (externalSignal.aborted) abort();
    try {
      return await Promise.race([work(), stopped]);
    } catch (error) {
      if (error instanceof TranslationError) throw error;
      if (error instanceof PluginSdkError) {
        if (error.code === 'timeout') throw new TranslationError('timeout');
        if (error.code === 'cancelled') throw new TranslationError('cancelled');
        throw new TranslationError('http-unavailable');
      }
      const hostError = validateHostApiError(error);
      if (hostError.status === 'valid') {
        const code = hostError.value.code;
        if (code === 'timeout' || code === 'cancelled') throw new TranslationError(code);
        if (code === 'limit_exceeded') throw new TranslationError('request-limit');
        if (code === 'invalid_params' || code === 'invalid_request') throw new TranslationError('http-policy');
        if (code === 'method_not_found') throw new TranslationError('http-unavailable');
      }
      throw new TranslationError('network');
    } finally {
      clearTimeout(timeout);
      externalSignal.removeEventListener('abort', abort);
    }
  };
};
