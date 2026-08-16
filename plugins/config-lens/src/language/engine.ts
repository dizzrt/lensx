import { preflightInput } from './limits.js';
import {
  diagnostic,
  invalidResult,
  isLanguageRequest,
  isLanguageResult,
  type LanguageAdapter,
  type LanguageRequest,
  type LanguageResult,
} from './protocol.js';

const adapterFor = async (request: LanguageRequest): Promise<LanguageAdapter> => {
  switch (request.language) {
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

export const executeLanguageRequest = async (value: unknown): Promise<LanguageResult> => {
  if (!isLanguageRequest(value)) {
    return invalidResult(0, diagnostic('protocol.request-invalid', 'diagnostic.protocolFailure'), 'internal-error');
  }
  const preflight = preflightInput(value.requestId, value.source);
  if (preflight !== undefined) return preflight;
  try {
    const adapter = await adapterFor(value);
    const result = await adapter.run(value);
    return isLanguageResult(result)
      ? result
      : invalidResult(
          value.requestId,
          diagnostic('protocol.result-invalid', 'diagnostic.protocolFailure'),
          'internal-error',
        );
  } catch {
    return invalidResult(
      value.requestId,
      diagnostic('adapter.internal', 'diagnostic.internalFailure'),
      'internal-error',
    );
  }
};
