import { afterEach, describe, expect, rs, test } from '@rstest/core';

import { createLanguageController, type LanguageWorker } from '../src/language/controller.js';
import { MAX_INPUT_BYTES, MAX_INPUT_LINES, OPERATION_DEADLINE_MS } from '../src/language/limits.js';
import type { AnalysisInput, LanguageWorkerRequest } from '../src/language/protocol.js';

class FakeWorker implements LanguageWorker {
  onerror: ((event: ErrorEvent) => unknown) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null = null;
  terminated = false;
  readonly requests: LanguageWorkerRequest[] = [];
  postMessage(request: LanguageWorkerRequest) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  respond(patch: Record<string, unknown> = {}) {
    const request = this.requests.at(-1);
    this.onmessage?.(
      new MessageEvent('message', {
        data: {
          requestId: request?.requestId,
          inputVersion: request?.inputVersion,
          selectionVersion: request?.selectionVersion,
          status: 'resolved',
          effectiveLanguage: 'json',
          validationStatus: 'valid',
          diagnostics: [],
          ...patch,
        },
      }),
    );
  }
}

const input: AnalysisInput = {
  source: '{"value":1}',
  inputVersion: 2,
  selectionVersion: 3,
  selection: { mode: 'auto' },
};
const setup = () => {
  const workers: FakeWorker[] = [];
  const controller = createLanguageController(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { workers, controller };
};

afterEach(() => {
  rs.useRealTimers();
});

describe('bounded analysis controller', () => {
  test('debounces a whole analysis once for 180ms and only publishes the latest input', async () => {
    rs.useFakeTimers();
    const { controller, workers } = setup();
    const firstPublish = rs.fn();
    const nextPublish = rs.fn();
    controller.scheduleAnalysis(input, firstPublish);
    await rs.advanceTimersByTimeAsync(179);
    expect(workers).toHaveLength(0);
    controller.scheduleAnalysis({ ...input, source: '<root/>', inputVersion: 3 }, nextPublish);
    await rs.advanceTimersByTimeAsync(179);
    expect(workers).toHaveLength(0);
    await rs.advanceTimersByTimeAsync(1);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.requests).toHaveLength(1);
    expect(workers[0]?.requests[0]).toMatchObject({ operation: 'analyze', source: '<root/>', inputVersion: 3 });
    workers[0]?.respond({ effectiveLanguage: 'xml' });
    await rs.advanceTimersByTimeAsync(0);
    expect(firstPublish).not.toHaveBeenCalled();
    expect(nextPublish).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved', effectiveLanguage: 'xml' }));
    controller.dispose();
  });

  test('all candidates share one five-second deadline without intermediate dispatch or restart', async () => {
    rs.useFakeTimers();
    const { controller, workers } = setup();
    const pending = controller.analyze({ ...input, source: '{key: [one, two]}' });
    const settled = rs.fn();
    void pending.then(settled);
    await rs.advanceTimersByTimeAsync(OPERATION_DEADLINE_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    expect(workers[0]?.requests).toHaveLength(1);
    await rs.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      failureStatus: 'internal-error',
      diagnostics: [{ code: 'worker.timeout' }],
    });
    expect(workers[0]?.terminated).toBe(true);
    const recovered = controller.analyze(input);
    workers[1]?.respond();
    await expect(recovered).resolves.toMatchObject({ status: 'resolved' });
    controller.dispose();
  });

  test('rejects oversized input before Worker creation and preserves request versions', async () => {
    const { controller, workers } = setup();
    for (const source of ['x'.repeat(MAX_INPUT_BYTES + 1), '\n'.repeat(MAX_INPUT_LINES)]) {
      await expect(controller.analyze({ ...input, source })).resolves.toMatchObject({
        inputVersion: 2,
        selectionVersion: 3,
        status: 'failed',
        failureStatus: 'limit',
      });
    }
    expect(workers).toHaveLength(0);
    controller.dispose();
  });

  test('empty auto resets while empty manual stays locked without dispatch', async () => {
    const { controller, workers } = setup();
    await expect(
      controller.analyze({ ...input, source: ' ', selection: { mode: 'auto', previousAutoLanguage: 'xml' } }),
    ).resolves.toMatchObject({ status: 'unresolved', diagnostics: [] });
    await expect(
      controller.analyze({ ...input, source: '', selection: { mode: 'manual', language: 'xml' } }),
    ).resolves.toMatchObject({ status: 'resolved', effectiveLanguage: 'xml', validationStatus: 'valid' });
    expect(workers).toHaveLength(0);
    controller.dispose();
  });

  test('manual selection supersedes the entire pending detection and ignores saved late callbacks', async () => {
    const { controller, workers } = setup();
    const first = controller.analyze(input);
    const stale = workers[0]?.onmessage;
    const second = controller.analyze({
      ...input,
      selectionVersion: 4,
      selection: { mode: 'manual', language: 'toml' },
    });
    await expect(first).resolves.toMatchObject({ status: 'failed', diagnostics: [{ code: 'controller.superseded' }] });
    expect(workers[0]?.terminated).toBe(true);
    stale?.(
      new MessageEvent('message', {
        data: {
          requestId: 1,
          inputVersion: 2,
          selectionVersion: 3,
          status: 'resolved',
          effectiveLanguage: 'xml',
          validationStatus: 'valid',
          diagnostics: [],
        },
      }),
    );
    workers[1]?.respond({ effectiveLanguage: 'toml' });
    await expect(second).resolves.toMatchObject({ status: 'resolved', effectiveLanguage: 'toml', selectionVersion: 4 });
    controller.dispose();
  });

  test.each([
    { inputVersion: 99 },
    { selectionVersion: 99 },
    { requestId: 99 },
    { effectiveLanguage: 'javascript' },
    {
      diagnostics: [
        { code: 'json.syntax', severity: 'error', messageKey: 'diagnostic.jsonSyntax', offset: 99, length: 1 },
      ],
    },
    { rawError: '/private/secret' },
  ])('terminates malformed response %j and recovers in a new Worker', async (patch) => {
    const { controller, workers } = setup();
    const pending = controller.analyze(input);
    workers[0]?.respond(patch);
    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [{ code: 'protocol.result-invalid' }],
    });
    expect(workers[0]?.terminated).toBe(true);
    const recovered = controller.analyze(input);
    workers[1]?.respond();
    await expect(recovered).resolves.toMatchObject({ status: 'resolved' });
    controller.dispose();
  });

  test('rejects a resolved language that contradicts manual request selection', async () => {
    const { controller, workers } = setup();
    const pending = controller.analyze({ ...input, selection: { mode: 'manual', language: 'xml' } });
    workers[0]?.respond();
    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [{ code: 'protocol.result-invalid' }],
    });
    controller.dispose();
  });

  test('recovers from crashes and never exposes raw Worker exceptions', async () => {
    const { controller, workers } = setup();
    const pending = controller.analyze(input);
    workers[0]?.onerror?.(new ErrorEvent('error', { message: '/private/secret' }));
    await expect(pending).resolves.toMatchObject({ status: 'failed', diagnostics: [{ code: 'worker.crashed' }] });
    const recovered = controller.analyze(input);
    workers[1]?.respond();
    await expect(recovered).resolves.toMatchObject({ status: 'resolved' });
    expect(JSON.stringify(await pending)).not.toContain('/private');
    controller.dispose();
  });

  test('rejects unresolved results for an explicitly selected language', async () => {
    const { controller, workers } = setup();
    const pending = controller.analyze({ ...input, selection: { mode: 'manual', language: 'xml' } });
    const request = workers[0]?.requests[0];
    workers[0]?.onmessage?.(
      new MessageEvent('message', {
        data: {
          requestId: request?.requestId,
          inputVersion: 2,
          selectionVersion: 3,
          status: 'unresolved',
          diagnostics: [],
        },
      }),
    );
    await expect(pending).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [{ code: 'protocol.result-invalid' }],
    });
    expect(workers[0]?.terminated).toBe(true);
    controller.dispose();
  });

  test('cancels publication and timers on invalidation, disposal and retry', async () => {
    rs.useFakeTimers();
    const { controller, workers } = setup();
    const publish = rs.fn();
    controller.scheduleAnalysis(input, publish);
    await rs.advanceTimersByTimeAsync(180);
    controller.invalidate();
    await rs.advanceTimersByTimeAsync(0);
    expect(publish).not.toHaveBeenCalled();
    expect(workers[0]?.terminated).toBe(true);
    controller.scheduleAnalysis(input, publish);
    controller.dispose();
    controller.dispose();
    await rs.advanceTimersByTimeAsync(OPERATION_DEADLINE_MS + 180);
    expect(workers).toHaveLength(1);
    expect(publish).not.toHaveBeenCalled();
    const retry = setup();
    const fresh = retry.controller.analyze(input);
    retry.workers[0]?.respond();
    await expect(fresh).resolves.toMatchObject({ status: 'resolved' });
    retry.controller.dispose();
  });

  test('handles Worker construction and dispatch failures as recoverable typed results', async () => {
    let attempt = 0;
    const worker = new FakeWorker();
    const controller = createLanguageController(() => {
      if (attempt++ === 0) throw new Error('/private/secret');
      return worker;
    });
    await expect(controller.analyze(input)).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [{ code: 'worker.creation-failed' }],
    });
    worker.postMessage = () => {
      throw new Error('/private/secret');
    };
    await expect(controller.analyze(input)).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [{ code: 'worker.dispatch-failed' }],
    });
    expect(worker.terminated).toBe(true);
    controller.dispose();
  });
});
