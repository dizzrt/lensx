import { preflightInput } from './limits.js';
import {
  type AnalysisRequest,
  type AnalysisResult,
  diagnostic,
  failedAnalysis,
  invalidResult,
  isLanguageOperationResult,
  isLanguageWorkerRequest,
  type LanguageAdapter,
  type LanguageId,
  type LanguageRequest,
  type LanguageResult,
  type LanguageWorkerResult,
} from './protocol.js';

const adapterFor = async (language: LanguageId): Promise<LanguageAdapter> => {
  switch (language) {
    case 'json':
      return (await import('./adapters/json.js')).jsonAdapter;
    case 'yaml':
      return (await import('./adapters/yaml.js')).yamlAdapter;
    case 'toml':
      return (await import('./adapters/toml.js')).tomlAdapter;
    case 'xml':
      return (await import('./adapters/xml.js')).xmlAdapter;
  }
};

const runAdapter = async (request: LanguageRequest): Promise<LanguageResult> => {
  const adapter = await adapterFor(request.language);
  return adapter.run(request);
};

const TOML_KEY = String.raw`(?:[A-Za-z0-9_-]+|"(?:[^"\\]|\\.)*"|'[^']*')`;
const TOML_PATH = String.raw`${TOML_KEY}(?:[ \t]*\.[ \t]*${TOML_KEY})*`;
const TOML_ASSIGNMENT = new RegExp(String.raw`^${TOML_PATH}[ \t]*=`, 'u');
const TOML_TABLE = new RegExp(
  String.raw`^(?:\[[ \t]*${TOML_PATH}[ \t]*\]|\[\[[ \t]*${TOML_PATH}[ \t]*\]\])[ \t]*(?:#.*)?$`,
  'u',
);

const detectLanguage = async (
  source: string,
  validate: (language: LanguageId) => Promise<LanguageResult>,
): Promise<LanguageId | undefined> => {
  const trimmed = source.trimStart();
  if (/^<(?:\?|!--|!DOCTYPE\b|!ENTITY\b|!\[CDATA\[|\/?[A-Za-z_:])/u.test(trimmed)) return 'xml';

  // Strict JSON containers win their overlap with YAML. Scalars never establish
  // an initial language, even though multiple parsers accept them.
  if (/^[{[]/u.test(trimmed) && (await validate('json')).status === 'valid') return 'json';
  const firstLine =
    trimmed
      .split(/\r?\n/u)
      .find((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
      ?.trim() ?? '';
  if (TOML_ASSIGNMENT.test(firstLine) || TOML_TABLE.test(firstLine)) return 'toml';

  // Preserve clear JSON intent during incomplete editing. Unquoted YAML flow
  // keys/items remain eligible for YAML rather than being failed JSON fallbacks.
  if (/^\{\s*(?:"|$)/u.test(trimmed) || /^\[\s*(?:$|["{[]|-?\d|true\b|false\b|null\b)/u.test(trimmed)) {
    return 'json';
  }
  if (
    /^(?:%YAML\b|%TAG\b|---(?:\s|$)|\.\.\.(?:\s|$)|[-?](?:[ \t]|$))/u.test(firstLine) ||
    /^(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^#[\]{},]+):(?:[ \t]|$)/u.test(firstLine)
  ) {
    return 'yaml';
  }
  const { inspectYamlStructure } = await import('./adapters/yaml.js');
  return inspectYamlStructure(source) ? 'yaml' : undefined;
};

export const emptyAnalysis = (request: AnalysisRequest): AnalysisResult => {
  const identity = {
    requestId: request.requestId,
    inputVersion: request.inputVersion,
    selectionVersion: request.selectionVersion,
    diagnostics: [],
  } as const;
  return request.selection.mode === 'manual'
    ? { ...identity, status: 'resolved', effectiveLanguage: request.selection.language, validationStatus: 'valid' }
    : { ...identity, status: 'unresolved' };
};

const analyze = async (request: AnalysisRequest): Promise<AnalysisResult> => {
  if (request.source.trim() === '') return emptyAnalysis(request);
  const cache = new Map<LanguageId, Promise<LanguageResult>>();
  const validate = (language: LanguageId): Promise<LanguageResult> => {
    let result = cache.get(language);
    if (result === undefined) {
      result = runAdapter({ requestId: request.requestId, source: request.source, language, operation: 'validate' });
      cache.set(language, result);
    }
    return result;
  };
  const language =
    request.selection.mode === 'manual'
      ? request.selection.language
      : ((await detectLanguage(request.source, validate)) ?? request.selection.previousAutoLanguage);
  const identity = {
    requestId: request.requestId,
    inputVersion: request.inputVersion,
    selectionVersion: request.selectionVersion,
  };
  if (language === undefined) return { ...identity, status: 'unresolved', diagnostics: [] };
  const result = await validate(language);
  if (!isLanguageOperationResult({ ...result, ...identity }, request.source.length)) {
    return failedAnalysis(
      request,
      invalidResult(
        request.requestId,
        diagnostic('protocol.result-invalid', 'diagnostic.protocolFailure'),
        'internal-error',
      ),
    );
  }
  return result.status === 'internal-error'
    ? failedAnalysis(request, result)
    : {
        ...identity,
        status: 'resolved',
        effectiveLanguage: language,
        validationStatus: result.status,
        diagnostics: result.diagnostics,
      };
};

export const executeLanguageRequest = async (value: unknown): Promise<LanguageWorkerResult> => {
  if (!isLanguageWorkerRequest(value)) {
    return {
      ...invalidResult(0, diagnostic('protocol.request-invalid', 'diagnostic.protocolFailure'), 'internal-error'),
      inputVersion: 0,
      selectionVersion: 0,
    };
  }
  const versions = { inputVersion: value.inputVersion, selectionVersion: value.selectionVersion };
  const wrapFailure = (result: LanguageResult): LanguageWorkerResult =>
    value.operation === 'analyze' ? failedAnalysis(value, result) : { ...result, ...versions };
  const preflight = preflightInput(value.requestId, value.source);
  if (preflight !== undefined) return wrapFailure(preflight);
  try {
    if (value.operation === 'analyze') return await analyze(value);
    const result = { ...(await runAdapter(value)), ...versions };
    return isLanguageOperationResult(result, value.source.length)
      ? result
      : wrapFailure(
          invalidResult(
            value.requestId,
            diagnostic('protocol.result-invalid', 'diagnostic.protocolFailure'),
            'internal-error',
          ),
        );
  } catch {
    return wrapFailure(
      invalidResult(value.requestId, diagnostic('adapter.internal', 'diagnostic.internalFailure'), 'internal-error'),
    );
  }
};
