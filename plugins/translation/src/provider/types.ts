export interface Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface TranslationInput {
  readonly text: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly credentials: Credentials;
}

export interface TranslationResult {
  readonly translation: string;
  readonly detectedLanguage?: string;
  readonly requestId?: string;
}

export type TranslationErrorCode =
  | 'credentials'
  | 'permission'
  | 'clock'
  | 'rate-limit'
  | 'direction'
  | 'input-limit'
  | 'parameters'
  | 'network'
  | 'http-unavailable'
  | 'http-policy'
  | 'request-limit'
  | 'timeout'
  | 'service'
  | 'protocol'
  | 'cancelled';

/** No third-party message, request, credentials or exception is retained. */
export class TranslationError extends Error {
  readonly code: TranslationErrorCode;
  readonly requestId?: string;
  constructor(code: TranslationErrorCode, requestId?: string) {
    super(code);
    this.name = 'TranslationError';
    this.code = code;
    this.requestId = requestId;
  }
}

export type TranslationProvider = (input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>;
