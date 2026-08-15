import { describe, expect, test } from '@rstest/core';

import { createLanguageController, type LanguageWorker } from '../src/language/controller.js';
import { MAX_INPUT_BYTES, MAX_INPUT_LINES, measureInput, preflightInput } from '../src/language/limits.js';
import { diagnosticToMarker } from '../src/language/markers.js';
import { isLanguageRequest, isLanguageResult, MAX_DIAGNOSTICS } from '../src/language/protocol.js';

class FakeWorker implements LanguageWorker {
  onerror: ((event: ErrorEvent) => unknown) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null = null;
  terminated = false;
  request?: unknown;
  postMessage(value: unknown) {
    this.request = value;
  }
  terminate() {
    this.terminated = true;
  }
}

describe('language protocol and generation controller', () => {
  test('validates both boundaries and rejects content-bearing or oversized diagnostics', () => {
    expect(isLanguageRequest({ requestId: 1, language: 'json', operation: 'format', source: '{}' })).toBe(true);
    expect(
      isLanguageRequest({ requestId: 1, language: 'json', operation: 'format', source: '{}', path: '/tmp/a' }),
    ).toBe(false);
    expect(
      isLanguageResult({
        requestId: 1,
        status: 'invalid',
        diagnostics: Array.from({ length: MAX_DIAGNOSTICS + 1 }, () => ({
          code: 'json.syntax',
          severity: 'error',
          offset: 0,
          length: 1,
          messageKey: 'diagnostic.jsonSyntax',
        })),
      }),
    ).toBe(false);
  });

  test('enforces exact byte and line boundaries before Worker dispatch', async () => {
    expect(measureInput('😀').bytes).toBe(4);
    expect(preflightInput(1, 'x'.repeat(MAX_INPUT_BYTES))).toBeUndefined();
    expect(preflightInput(1, '\n'.repeat(MAX_INPUT_LINES - 1))).toBeUndefined();
    const workers: FakeWorker[] = [];
    const controller = createLanguageController(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    await expect(controller.run('json', 'format', 'x'.repeat(MAX_INPUT_BYTES + 1))).resolves.toMatchObject({
      status: 'limit',
    });
    await expect(controller.run('json', 'format', `${'\n'.repeat(MAX_INPUT_LINES)}`)).resolves.toMatchObject({
      status: 'limit',
    });
    expect(workers).toHaveLength(0);
    controller.dispose();
  });

  test('accepts exactly 200 safe diagnostics and converts Unicode offsets as Monaco UTF-16 units', () => {
    const diagnostics = Array.from({ length: MAX_DIAGNOSTICS }, (_, index) => ({
      code: 'json.syntax',
      severity: 'error' as const,
      offset: index,
      length: 1,
      messageKey: 'diagnostic.jsonSyntax',
    }));
    expect(isLanguageResult({ requestId: 1, status: 'invalid', diagnostics })).toBe(true);
    const source = '😀x\nvalue';
    const getPositionAt = (offset: number) => {
      const before = source.slice(0, offset);
      const lines = before.split('\n');
      return { lineNumber: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
    };
    expect(
      diagnosticToMarker(
        { getPositionAt, getValueLength: () => source.length },
        diagnostics[2] as (typeof diagnostics)[number],
        'safe',
      ),
    ).toMatchObject({ startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 4 });
  });

  test('terminates superseded, malformed, crashed and timed-out Workers and recovers', async () => {
    const workers: FakeWorker[] = [];
    const controller = createLanguageController(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }, 5);
    const malformed = controller.run('json', 'format', '{}');
    workers[0]?.onmessage?.(new MessageEvent('message', { data: { rawError: '/private/path' } }));
    await expect(malformed).resolves.toMatchObject({ status: 'internal-error' });
    expect(workers[0]?.terminated).toBe(true);

    const crashed = controller.run('json', 'format', '{}');
    workers[1]?.onerror?.(new ErrorEvent('error', { message: '/private/path' }));
    await expect(crashed).resolves.toMatchObject({ status: 'internal-error' });

    await expect(controller.run('json', 'format', '{}')).resolves.toMatchObject({ status: 'internal-error' });
    expect(workers[2]?.terminated).toBe(true);

    const recovered = controller.run('json', 'format', '{}');
    const request = workers[3]?.request as { requestId: number };
    workers[3]?.onmessage?.(
      new MessageEvent('message', {
        data: { requestId: request.requestId, status: 'valid', diagnostics: [], output: '{}\n' },
      }),
    );
    await expect(recovered).resolves.toMatchObject({ status: 'valid', output: '{}\n' });
    controller.dispose();
  });

  test('settles a superseded request before dispatching its replacement', async () => {
    const workers: FakeWorker[] = [];
    const controller = createLanguageController(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const first = controller.run('json', 'format', '{}');
    const second = controller.run('yaml', 'format', 'value: 1');
    await expect(first).resolves.toMatchObject({
      status: 'internal-error',
      diagnostics: [{ code: 'controller.superseded' }],
    });
    expect(workers[0]?.terminated).toBe(true);
    const request = workers[1]?.request as { requestId: number };
    workers[1]?.onmessage?.(
      new MessageEvent('message', {
        data: { requestId: request.requestId, status: 'valid', diagnostics: [], output: 'value: 1\n' },
      }),
    );
    await expect(second).resolves.toMatchObject({ status: 'valid', output: 'value: 1\n' });
    controller.dispose();
  });
});
