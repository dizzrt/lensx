import { describe, expect, test } from '@rstest/core';

import {
  diagnostic,
  isAnalysisResult,
  isLanguageOperationResult,
  isLanguageWorkerRequest,
  MAX_DIAGNOSTICS,
} from '../src/language/protocol.js';

const identity = { requestId: 7, inputVersion: 3, selectionVersion: 2 };
const request = { ...identity, operation: 'analyze', source: '{}', selection: { mode: 'auto' } };
const resolved = {
  ...identity,
  status: 'resolved',
  effectiveLanguage: 'json',
  validationStatus: 'valid',
  diagnostics: [],
};

describe('versioned language analysis protocol', () => {
  test('accepts auto history, locked manual selection and explicit-language operations', () => {
    expect(isLanguageWorkerRequest(request)).toBe(true);
    expect(isLanguageWorkerRequest({ ...request, selection: { mode: 'auto', previousAutoLanguage: 'xml' } })).toBe(
      true,
    );
    expect(isLanguageWorkerRequest({ ...request, selection: { mode: 'manual', language: 'toml' } })).toBe(true);
    expect(isLanguageWorkerRequest({ ...identity, operation: 'format', language: 'json', source: '{}' })).toBe(true);
  });

  test.each([
    { inputVersion: -1 },
    { selectionVersion: 1.5 },
    { inputVersion: undefined },
    { selectionVersion: Number.MAX_SAFE_INTEGER + 1 },
    { language: 'json' },
    { selection: { mode: 'manual', language: 'javascript' } },
    { selection: { mode: 'manual', language: 'json', previousAutoLanguage: 'xml' } },
    { selection: { mode: 'auto', previousAutoLanguage: 'javascript' } },
    { selection: { mode: 'auto', language: 'json' } },
    { selection: { mode: 'automatic' } },
    { source: null },
    { path: '/private/config' },
  ])('rejects malformed analysis request %j', (patch) => {
    expect(isLanguageWorkerRequest({ ...request, ...patch })).toBe(false);
  });

  test('requires a known explicit language, not auto, for transformations', () => {
    for (const language of [undefined, 'auto', 'javascript']) {
      expect(isLanguageWorkerRequest({ ...identity, operation: 'format', language, source: '{}' })).toBe(false);
    }
  });

  test('keeps resolution and syntax validity independent', () => {
    expect(isAnalysisResult(resolved, 2)).toBe(true);
    expect(isAnalysisResult({ ...resolved, effectiveLanguage: 'xml', validationStatus: 'invalid' }, 2)).toBe(true);
    expect(isAnalysisResult({ ...identity, status: 'unresolved', diagnostics: [] }, 2)).toBe(true);
    expect(
      isAnalysisResult(
        {
          ...identity,
          status: 'failed',
          failureStatus: 'limit',
          diagnostics: [diagnostic('input.limit', 'diagnostic.inputBytesLimit')],
        },
        2,
      ),
    ).toBe(true);
  });

  test.each([
    { status: 'unresolved' },
    { status: 'failed', failureStatus: 'internal-error' },
    { effectiveLanguage: 'auto' },
    { effectiveLanguage: undefined },
    { validationStatus: 'internal-error' },
    { failureStatus: 'limit' },
    { inputVersion: -1 },
    { selectionVersion: undefined },
    { output: '{}' },
    { rawError: '/private/path' },
  ])('rejects incompatible result fields %j', (patch) => {
    expect(isAnalysisResult({ ...resolved, ...patch }, 2)).toBe(false);
  });

  test('rejects diagnostics on unresolved and empty diagnostics on failures', () => {
    expect(
      isAnalysisResult(
        { ...identity, status: 'unresolved', diagnostics: [diagnostic('json.syntax', 'diagnostic.jsonSyntax')] },
        2,
      ),
    ).toBe(false);
    expect(
      isAnalysisResult({ ...identity, status: 'failed', failureStatus: 'internal-error', diagnostics: [] }, 2),
    ).toBe(false);
  });

  test('bounds diagnostics in UTF-16 source units, counts and restricted arguments', () => {
    const syntax = diagnostic('json.syntax', 'diagnostic.jsonSyntax', 1, 1);
    expect(
      isAnalysisResult({ ...resolved, diagnostics: Array.from({ length: MAX_DIAGNOSTICS }, () => syntax) }, 2),
    ).toBe(true);
    for (const diagnostics of [
      Array.from({ length: MAX_DIAGNOSTICS + 1 }, () => syntax),
      [{ ...syntax, offset: 3 }],
      [{ ...syntax, offset: 2 }],
      [{ ...syntax, length: Number.MAX_SAFE_INTEGER }],
      [{ ...syntax, arguments: { maximum: Number.POSITIVE_INFINITY } }],
      [{ ...syntax, arguments: { source: 'x'.repeat(121) } }],
      [{ ...syntax, stack: 'private stack' }],
    ]) {
      expect(isAnalysisResult({ ...resolved, diagnostics }, 2)).toBe(false);
    }
    expect(isAnalysisResult({ ...resolved, diagnostics: [{ ...syntax, offset: 2, length: 0 }] }, 2)).toBe(true);
  });

  test('requires operation results to carry versions and bounded diagnostics', () => {
    const result = { ...identity, status: 'valid', diagnostics: [], output: '{}' };
    expect(isLanguageOperationResult(result, 2)).toBe(true);
    expect(isLanguageOperationResult({ ...result, inputVersion: undefined }, 2)).toBe(false);
    expect(
      isLanguageOperationResult({ ...result, diagnostics: [diagnostic('json.syntax', 'diagnostic.jsonSyntax', 3)] }, 2),
    ).toBe(false);
    expect(isLanguageOperationResult({ ...result, status: 'invalid' }, 2)).toBe(false);
  });
});
