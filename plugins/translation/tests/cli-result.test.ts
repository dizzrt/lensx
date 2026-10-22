import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@rstest/core';

import { parseCliResult } from '../scripts/cli-result.ts';

type CliProcessResult = Parameters<typeof parseCliResult>[1];
const processResult = (overrides: Partial<CliProcessResult> = {}): CliProcessResult => ({
  signal: null,
  status: 0,
  stdout: '',
  stderr: '',
  ...overrides,
});
const envelope = (command: 'validate' | 'pack' | 'inspect', result: Record<string, unknown>) => ({
  schema_version: '1',
  command,
  status: command === 'pack' ? 'success' : 'compatible',
  result,
  diagnostics: [],
});

describe('public CLI process results', () => {
  test.each(['ENOENT', 'EACCES'])('identifies %s startup failure before status or JSON', (code) => {
    expect(() =>
      parseCliResult('validate', processResult({ error: { code }, status: 1, signal: 'SIGTERM', stdout: 'not JSON' })),
    ).toThrow(`lensx-plugin validate: startup failure (${code})`);
  });

  test('uses the error name and explicit placeholders when startup produces no output', () => {
    expect(() =>
      parseCliResult(
        'pack',
        processResult({ error: { name: 'SpawnError' }, status: null, stdout: undefined, stderr: null }),
      ),
    ).toThrow('lensx-plugin pack: startup failure (SpawnError)\nstdout: <empty>\nstderr: <empty>');
  });

  test('retains both output streams in failed-command context', () => {
    expect(() =>
      parseCliResult('inspect', processResult({ status: 3, stdout: 'partial output', stderr: 'detail' })),
    ).toThrow('lensx-plugin inspect: exited with status 3\nstdout: partial output\nstderr: detail');
  });

  test('identifies signal termination before exit status or JSON', () => {
    expect(() => parseCliResult('pack', processResult({ signal: 'SIGTERM', status: 1, stdout: 'not JSON' }))).toThrow(
      'lensx-plugin pack: terminated by signal SIGTERM',
    );
  });

  test('rejects unknown null exit status without attempting JSON', () => {
    expect(() => parseCliResult('validate', processResult({ status: null, stdout: 'not JSON' }))).toThrow(
      'lensx-plugin validate: process ended without an exit status or signal',
    );
  });

  test.each([undefined, null, '', ' \n\t '])('rejects empty successful output: %s', (stdout) => {
    expect(() => parseCliResult('validate', processResult({ stdout }))).toThrow(
      'lensx-plugin validate: output protocol error: empty stdout',
    );
  });

  test('distinguishes malformed JSON from startup and exit failures', () => {
    expect(() => parseCliResult('inspect', processResult({ stdout: 'not JSON' }))).toThrow(
      'lensx-plugin inspect: output protocol error: invalid JSON',
    );
  });

  test.each(
    [
      null,
      [],
      'compatible',
      {},
      { ...envelope('validate', {}), schema_version: '2' },
      { ...envelope('inspect', {}) },
      { ...envelope('validate', {}), result: null },
      { ...envelope('validate', {}), result: [] },
      { ...envelope('validate', {}), result: undefined },
      { ...envelope('validate', {}), diagnostics: null },
    ].map((output) => ({ output })),
  )('rejects malformed success envelopes: %j', ({ output }) => {
    expect(() => parseCliResult('validate', processResult({ stdout: JSON.stringify(output) }))).toThrow(
      'lensx-plugin validate: output protocol error: invalid result envelope',
    );
  });

  test.each(['invalid', 'incompatible', 'success', undefined])('rejects validate result status %s', (status) => {
    const output = { ...envelope('validate', {}), status };
    expect(() => parseCliResult('validate', processResult({ stdout: JSON.stringify(output) }))).toThrow(
      'lensx-plugin validate: output protocol error: expected status compatible',
    );
  });

  test('requires pack success rather than compatible', () => {
    const output = { ...envelope('pack', {}), status: 'compatible' };
    expect(() => parseCliResult('pack', processResult({ stdout: JSON.stringify(output) }))).toThrow(
      'lensx-plugin pack: output protocol error: expected status success',
    );
  });

  test.each(['validate', 'pack', 'inspect'] as const)('returns the existing %s result', (command) => {
    const result = {
      plugin_id: 'dev.lensx.translation',
      file_count: 3,
      package_digest: { algorithm: 'sha256', value: 'abc' },
    };
    expect(parseCliResult(command, processResult({ stdout: JSON.stringify(envelope(command, result)) }))).toEqual(
      result,
    );
  });

  test('bounds each diagnostic stream to 4 KiB including the marker without breaking Unicode', () => {
    let failure: unknown;
    try {
      parseCliResult('inspect', processResult({ status: 1, stdout: '译😀'.repeat(2000), stderr: 'e'.repeat(5000) }));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    const stdout = message.split('\nstdout: ')[1]?.split('\nstderr: ')[0] ?? '';
    const stderr = message.split('\nstderr: ')[1] ?? '';
    for (const summary of [stdout, stderr]) {
      expect(Buffer.byteLength(summary, 'utf8')).toBeLessThanOrEqual(4096);
      expect(summary).toContain('\n<truncated>');
      expect(summary).not.toContain('\uFFFD');
    }
    expect(stdout.startsWith('译😀')).toBe(true);
    expect(stderr.startsWith('e')).toBe(true);
  });

  test('keeps exactly 4 KiB of output unchanged', () => {
    const stdout = 'a'.repeat(4096);
    expect(() => parseCliResult('validate', processResult({ status: 1, stdout }))).toThrow(
      `lensx-plugin validate: exited with status 1\nstdout: ${stdout}\nstderr: <empty>`,
    );
  });
});
