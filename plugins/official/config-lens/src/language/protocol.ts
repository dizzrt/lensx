export const LANGUAGE_IDS = ['json', 'yaml', 'toml', 'xml'] as const;
export type LanguageId = (typeof LANGUAGE_IDS)[number];

export const OPERATIONS = ['validate', 'format', 'compact'] as const;
export type LanguageOperation = (typeof OPERATIONS)[number];

export const RESULT_STATUSES = ['valid', 'invalid', 'unsupported', 'limit', 'internal-error'] as const;
export type LanguageResultStatus = (typeof RESULT_STATUSES)[number];

export type DiagnosticSeverity = 'error' | 'warning';
export type DiagnosticArgument = string | number | boolean;

export interface SafeDiagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly offset: number;
  readonly length: number;
  readonly messageKey: string;
  readonly arguments?: Readonly<Record<string, DiagnosticArgument>>;
}

export interface LanguageRequest {
  readonly requestId: number;
  readonly language: LanguageId;
  readonly operation: LanguageOperation;
  readonly source: string;
}

export interface LanguageResult {
  readonly requestId: number;
  readonly status: LanguageResultStatus;
  readonly diagnostics: readonly SafeDiagnostic[];
  readonly output?: string;
}

export interface LanguageAdapter {
  readonly language: LanguageId;
  readonly run: (request: LanguageRequest) => LanguageResult | Promise<LanguageResult>;
}

const CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const MESSAGE_KEY = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/u;
const ARGUMENT_KEY = /^[a-z][a-zA-Z0-9]{0,31}$/u;
export const MAX_DIAGNOSTICS = 200;
export const MAX_DIAGNOSTIC_ARGUMENTS = 8;
export const MAX_DIAGNOSTIC_STRING = 120;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

export const isLanguageRequest = (value: unknown): value is LanguageRequest =>
  isRecord(value) &&
  exactKeys(value, ['requestId', 'language', 'operation', 'source']) &&
  Number.isSafeInteger(value.requestId) &&
  (value.requestId as number) >= 0 &&
  LANGUAGE_IDS.includes(value.language as LanguageId) &&
  OPERATIONS.includes(value.operation as LanguageOperation) &&
  typeof value.source === 'string';

export const isSafeDiagnostic = (value: unknown): value is SafeDiagnostic => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['code', 'severity', 'offset', 'length', 'messageKey', 'arguments']) ||
    typeof value.code !== 'string' ||
    !CODE.test(value.code) ||
    (value.severity !== 'error' && value.severity !== 'warning') ||
    !Number.isSafeInteger(value.offset) ||
    (value.offset as number) < 0 ||
    !Number.isSafeInteger(value.length) ||
    (value.length as number) < 0 ||
    typeof value.messageKey !== 'string' ||
    !MESSAGE_KEY.test(value.messageKey)
  ) {
    return false;
  }
  if (value.arguments === undefined) return true;
  if (!isRecord(value.arguments) || Object.keys(value.arguments).length > MAX_DIAGNOSTIC_ARGUMENTS) return false;
  return Object.entries(value.arguments).every(
    ([key, argument]) =>
      ARGUMENT_KEY.test(key) &&
      (typeof argument === 'number' ||
        typeof argument === 'boolean' ||
        (typeof argument === 'string' && argument.length <= MAX_DIAGNOSTIC_STRING)),
  );
};

export const isLanguageResult = (value: unknown): value is LanguageResult => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['requestId', 'status', 'diagnostics', 'output']) ||
    !Number.isSafeInteger(value.requestId) ||
    (value.requestId as number) < 0 ||
    !RESULT_STATUSES.includes(value.status as LanguageResultStatus) ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length > MAX_DIAGNOSTICS ||
    !value.diagnostics.every(isSafeDiagnostic) ||
    (value.output !== undefined && typeof value.output !== 'string')
  ) {
    return false;
  }
  return value.status === 'valid' ? true : value.output === undefined;
};

export const diagnostic = (
  code: string,
  messageKey: string,
  offset = 0,
  length = 0,
  arguments_?: Readonly<Record<string, DiagnosticArgument>>,
): SafeDiagnostic => ({ code, severity: 'error', offset, length, messageKey, arguments: arguments_ });

export const invalidResult = (
  requestId: number,
  diagnosticValue: SafeDiagnostic,
  status: Exclude<LanguageResultStatus, 'valid'> = 'invalid',
): LanguageResult => ({ requestId, status, diagnostics: [diagnosticValue] });

export const validResult = (
  requestId: number,
  output?: string,
  diagnostics: readonly SafeDiagnostic[] = [],
): LanguageResult => ({ requestId, status: 'valid', diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS), output });
