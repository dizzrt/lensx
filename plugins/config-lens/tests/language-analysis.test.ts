import { describe, expect, test } from '@rstest/core';

import { executeLanguageRequest } from '../src/language/engine.js';
import { isAnalysisResult, type LanguageSelection } from '../src/language/protocol.js';

const analyze = (source: string, selection: LanguageSelection = { mode: 'auto' }) =>
  executeLanguageRequest({
    requestId: 9,
    operation: 'analyze',
    inputVersion: 5,
    selectionVersion: 2,
    source,
    selection,
  });

describe('structure-guided real parser analysis', () => {
  test.each([
    ['json', '{"a":1}'],
    ['json', '[1, true, {"a": null}]'],
    ['json', '{"large":900719925474099312345,"duplicate":1,"duplicate":2}'],
    ['toml', '[server]'],
    ['toml', '[[servers]]\nport = 8080\n'],
    ['toml', 'port = 8080'],
    ['toml', '# server\n"server".port = 8080\n'],
    ['xml', '<xml></xml>'],
    ['xml', '<?xml version="1.0"?><xml/>'],
    ['xml', '<!-- configuration --><xml/>'],
    ['yaml', 'server:\n  port: 8080\n'],
    ['yaml', '- one\n- two\n'],
    ['yaml', '%YAML 1.2\n---\nvalue: true\n'],
    ['yaml', '---\nplain scalar\n'],
    ['yaml', '{one: 1, two: [a, b]}'],
    ['yaml', '[one, two]'],
    ['yaml', '&items [one, two]'],
  ])('resolves %s from a real valid fixture without source transformation', async (language, source) => {
    const result = await analyze(source);
    expect(result).toMatchObject({
      requestId: 9,
      inputVersion: 5,
      selectionVersion: 2,
      status: 'resolved',
      effectiveLanguage: language,
      validationStatus: 'valid',
    });
    expect(result).not.toHaveProperty('output');
    expect(isAnalysisResult(result, source.length)).toBe(true);
  });

  test.each([
    ['xml', '<xml>'],
    ['xml', '<root><child></root>'],
    ['json', '{"a": 1,}'],
    ['json', '{"a":'],
    ['json', '[1,2,]'],
    ['json', '['],
    ['toml', 'port ='],
    ['yaml', 'value: [one, two'],
    ['yaml', '[one, two'],
  ])('retains %s structure while syntax is incomplete or invalid', async (language, source) => {
    const result = await analyze(source);
    expect(result).toMatchObject({ status: 'resolved', effectiveLanguage: language, validationStatus: 'invalid' });
    expect(isAnalysisResult(result, source.length)).toBe(true);
    expect(result).not.toHaveProperty('output');
  });

  test.each([
    'hello',
    'true',
    '123',
    '"hello"',
    '# ordinary comment',
    '# first\n# second\n',
    '',
  ])('keeps fresh scalar or comment %j unresolved', async (source) => {
    await expect(analyze(source)).resolves.toMatchObject({ status: 'unresolved', diagnostics: [] });
  });

  test('retains only previous automatic evidence when text becomes temporarily ambiguous', async () => {
    await expect(analyze('hello', { mode: 'auto', previousAutoLanguage: 'json' })).resolves.toMatchObject({
      status: 'resolved',
      effectiveLanguage: 'json',
      validationStatus: 'invalid',
    });
    await expect(analyze('port = 8080', { mode: 'auto', previousAutoLanguage: 'xml' })).resolves.toMatchObject({
      status: 'resolved',
      effectiveLanguage: 'toml',
      validationStatus: 'valid',
    });
    await expect(analyze(' ', { mode: 'auto', previousAutoLanguage: 'xml' })).resolves.toMatchObject({
      status: 'unresolved',
      diagnostics: [],
    });
  });

  test('manual language remains locked across other syntax and clearing', async () => {
    await expect(analyze('{"a":1}', { mode: 'manual', language: 'xml' })).resolves.toMatchObject({
      status: 'resolved',
      effectiveLanguage: 'xml',
      validationStatus: 'invalid',
    });
    await expect(analyze('', { mode: 'manual', language: 'xml' })).resolves.toMatchObject({
      status: 'resolved',
      effectiveLanguage: 'xml',
      validationStatus: 'valid',
    });
  });

  test.each([
    '<!DOCTYPE root SYSTEM "https://example.invalid/external.dtd"><root/>',
    '<!DOCTYPE root [<!ENTITY external SYSTEM "file:///private/secret">]><root>&external;</root>',
    '<root xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="secret"/></root>',
  ])('resolves unsafe XML structurally but rejects external constructs', async (source) => {
    await expect(analyze(source)).resolves.toMatchObject({
      status: 'resolved',
      effectiveLanguage: 'xml',
      validationStatus: 'unsupported',
      diagnostics: [{ code: 'xml.external-unsupported' }],
    });
  });

  test('preserves versions and lexical fidelity on explicit operations', async () => {
    const source = '{"big":900719925474099312345,"a":1,"a":2}';
    await expect(
      executeLanguageRequest({
        requestId: 12,
        inputVersion: 8,
        selectionVersion: 4,
        operation: 'compact',
        language: 'json',
        source,
      }),
    ).resolves.toEqual({
      requestId: 12,
      inputVersion: 8,
      selectionVersion: 4,
      status: 'valid',
      diagnostics: [],
      output: source,
    });
  });

  test('retains YAML structural evidence when collection validation hits alias limits', async () => {
    const source = `&items [&base [1, 2], ${Array.from({ length: 51 }, () => '*base').join(', ')}]`;
    await expect(analyze(source)).resolves.toMatchObject({
      status: 'resolved',
      effectiveLanguage: 'yaml',
      validationStatus: 'limit',
      diagnostics: [{ code: 'yaml.resource-limit' }],
    });
  });
});
