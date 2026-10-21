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

export interface LanguageVersions {
  readonly inputVersion: number;
  readonly selectionVersion: number;
}

export type LanguageSelection =
  | { readonly mode: 'auto'; readonly previousAutoLanguage?: LanguageId }
  | { readonly mode: 'manual'; readonly language: LanguageId };

export interface AnalysisInput extends LanguageVersions {
  readonly source: string;
  readonly selection: LanguageSelection;
}

export interface AnalysisRequest extends AnalysisInput {
  readonly requestId: number;
  readonly operation: 'analyze';
}

export interface LanguageOperationRequest extends LanguageRequest, LanguageVersions {}
export interface LanguageOperationResult extends LanguageResult, LanguageVersions {}

interface AnalysisResultBase extends LanguageVersions {
  readonly requestId: number;
  readonly diagnostics: readonly SafeDiagnostic[];
}

export type AnalysisResult =
  | (AnalysisResultBase & {
      readonly status: 'resolved';
      readonly effectiveLanguage: LanguageId;
      readonly validationStatus: Exclude<LanguageResultStatus, 'internal-error'>;
    })
  | (AnalysisResultBase & { readonly status: 'unresolved' })
  | (AnalysisResultBase & {
      readonly status: 'failed';
      readonly failureStatus: 'limit' | 'internal-error';
    });

export type LanguageWorkerRequest = LanguageOperationRequest | AnalysisRequest;
export type LanguageWorkerResult = LanguageOperationResult | AnalysisResult;

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

const isVersion = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const hasVersions = (value: Record<string, unknown>): boolean =>
  isVersion(value.inputVersion) && isVersion(value.selectionVersion);

const isLanguageSelection = (value: unknown): value is LanguageSelection => {
  if (!isRecord(value)) return false;
  return value.mode === 'auto'
    ? exactKeys(value, ['mode', 'previousAutoLanguage']) &&
        (value.previousAutoLanguage === undefined || LANGUAGE_IDS.includes(value.previousAutoLanguage as LanguageId))
    : value.mode === 'manual' &&
        exactKeys(value, ['mode', 'language']) &&
        LANGUAGE_IDS.includes(value.language as LanguageId);
};

export const isLanguageRequest = (value: unknown): value is LanguageRequest =>
  isRecord(value) &&
  exactKeys(value, ['requestId', 'language', 'operation', 'source']) &&
  Number.isSafeInteger(value.requestId) &&
  (value.requestId as number) >= 0 &&
  LANGUAGE_IDS.includes(value.language as LanguageId) &&
  OPERATIONS.includes(value.operation as LanguageOperation) &&
  typeof value.source === 'string';

export const isLanguageWorkerRequest = (value: unknown): value is LanguageWorkerRequest => {
  if (!isRecord(value) || !isVersion(value.requestId) || !hasVersions(value) || typeof value.source !== 'string') {
    return false;
  }
  const common = ['requestId', 'inputVersion', 'selectionVersion', 'operation', 'source'];
  return value.operation === 'analyze'
    ? exactKeys(value, [...common, 'selection']) && isLanguageSelection(value.selection)
    : exactKeys(value, [...common, 'language']) &&
        OPERATIONS.includes(value.operation as LanguageOperation) &&
        LANGUAGE_IDS.includes(value.language as LanguageId);
};

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
      ((typeof argument === 'number' && Number.isFinite(argument)) ||
        typeof argument === 'boolean' ||
        (typeof argument === 'string' && argument.length <= MAX_DIAGNOSTIC_STRING)),
  );
};

const hasBoundedDiagnostics = (value: Record<string, unknown>, sourceLength: number): boolean =>
  Array.isArray(value.diagnostics) &&
  value.diagnostics.length <= MAX_DIAGNOSTICS &&
  value.diagnostics.every(
    (item) => isSafeDiagnostic(item) && item.offset <= sourceLength && item.length <= sourceLength - item.offset,
  );

export const isLanguageOperationResult = (value: unknown, sourceLength: number): value is LanguageOperationResult => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['requestId', 'inputVersion', 'selectionVersion', 'status', 'diagnostics', 'output']) ||
    !isVersion(value.requestId) ||
    !hasVersions(value) ||
    !hasBoundedDiagnostics(value, sourceLength)
  ) {
    return false;
  }
  const { inputVersion: _input, selectionVersion: _selection, ...result } = value;
  return isLanguageResult(result);
};

export const isAnalysisResult = (value: unknown, sourceLength: number): value is AnalysisResult => {
  if (
    !isRecord(value) ||
    !isVersion(value.requestId) ||
    !hasVersions(value) ||
    !hasBoundedDiagnostics(value, sourceLength)
  ) {
    return false;
  }
  const common = ['requestId', 'inputVersion', 'selectionVersion', 'status', 'diagnostics'];
  switch (value.status) {
    case 'resolved':
      return (
        exactKeys(value, [...common, 'effectiveLanguage', 'validationStatus']) &&
        LANGUAGE_IDS.includes(value.effectiveLanguage as LanguageId) &&
        ['valid', 'invalid', 'unsupported', 'limit'].includes(value.validationStatus as string)
      );
    case 'unresolved':
      return exactKeys(value, common) && (value.diagnostics as unknown[]).length === 0;
    case 'failed':
      return (
        exactKeys(value, [...common, 'failureStatus']) &&
        (value.failureStatus === 'limit' || value.failureStatus === 'internal-error') &&
        (value.diagnostics as unknown[]).length > 0
      );
    default:
      return false;
  }
};

export const failedAnalysis = (
  request: Pick<AnalysisRequest, 'requestId' | 'inputVersion' | 'selectionVersion'>,
  result: LanguageResult,
): AnalysisResult => ({
  requestId: request.requestId,
  inputVersion: request.inputVersion,
  selectionVersion: request.selectionVersion,
  status: 'failed',
  failureStatus: result.status === 'limit' ? 'limit' : 'internal-error',
  diagnostics: result.diagnostics,
});

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
