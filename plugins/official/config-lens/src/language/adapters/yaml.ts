import { parseAllDocuments } from 'yaml';

import {
  diagnostic,
  invalidResult,
  type LanguageAdapter,
  type LanguageRequest,
  type LanguageResult,
  validResult,
} from '../protocol.js';

const MAX_YAML_ALIASES = 50;
const MAX_YAML_DEPTH = 128;

const inventory = (source: string): readonly string[] =>
  source
    .match(/(?:^|\s)(?:#[^\r\n]*|%[A-Z]+[^\r\n]*|[&*!][A-Za-z0-9_.-]+|---|\.\.\.)/gmu)
    ?.map((item) => item.trim()) ?? [];

const depthOf = (value: unknown, depth = 0, seen = new Set<unknown>()): number => {
  if (typeof value !== 'object' || value === null) return depth;
  if (seen.has(value)) return depth;
  seen.add(value);
  let maximum = depth;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    maximum = Math.max(maximum, depthOf(child, depth + 1, seen));
    if (maximum > MAX_YAML_DEPTH) break;
  }
  return maximum;
};

const canonical = (value: unknown, seen = new Set<unknown>()): string => {
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (typeof value !== 'object' || value === null) return `${typeof value}:${String(value)}`;
  if (seen.has(value)) return 'alias:<cycle>';
  seen.add(value);
  if (Array.isArray(value)) return `[${value.map((child) => canonical(child, seen)).join(',')}]`;
  return `{${Object.entries(value)
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child, seen)}`)
    .join(',')}}`;
};

const parseYaml = (source: string) => {
  const documents = parseAllDocuments(source, {
    keepSourceTokens: true,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });
  const firstError = documents.flatMap((document) => document.errors)[0];
  if (firstError !== undefined) throw firstError;
  const values = documents.map((document) => document.toJS({ maxAliasCount: MAX_YAML_ALIASES }));
  if (values.some((value) => depthOf(value) > MAX_YAML_DEPTH)) throw new Error('yaml-depth-limit');
  return { documents, fingerprint: values.map((value) => canonical(value)), inventory: inventory(source) };
};

export const runYaml = (request: LanguageRequest): LanguageResult => {
  if (request.operation === 'compact') {
    return invalidResult(
      request.requestId,
      diagnostic('yaml.compact-unsupported', 'diagnostic.compactUnsupported'),
      'unsupported',
    );
  }
  try {
    const input = parseYaml(request.source);
    if (request.operation === 'validate') return validResult(request.requestId);
    const output = input.documents.map((document) => document.toString({ lineWidth: 0 })).join('');
    const reparsed = parseYaml(output);
    if (
      JSON.stringify(input.fingerprint) !== JSON.stringify(reparsed.fingerprint) ||
      JSON.stringify(input.inventory) !== JSON.stringify(reparsed.inventory)
    ) {
      return invalidResult(
        request.requestId,
        diagnostic('yaml.fidelity', 'diagnostic.fidelityRejected'),
        'internal-error',
      );
    }
    return validResult(request.requestId, output);
  } catch (error) {
    const text = error instanceof Error ? error.message : '';
    const isLimit = text.includes('alias') || text.includes('depth-limit');
    return invalidResult(
      request.requestId,
      diagnostic(
        isLimit ? 'yaml.resource-limit' : 'yaml.syntax',
        isLimit ? 'diagnostic.yamlLimit' : 'diagnostic.yamlSyntax',
      ),
      isLimit ? 'limit' : 'invalid',
    );
  }
};

export const yamlAdapter: LanguageAdapter = { language: 'yaml', run: runYaml };
