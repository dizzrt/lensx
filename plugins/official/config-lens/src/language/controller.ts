import { OPERATION_DEADLINE_MS, preflightInput } from './limits.js';
import {
  diagnostic,
  invalidResult,
  isLanguageResult,
  type LanguageId,
  type LanguageOperation,
  type LanguageRequest,
  type LanguageResult,
} from './protocol.js';

export interface LanguageWorker {
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null;
  postMessage(value: LanguageRequest): void;
  terminate(): void;
}

export type LanguageWorkerFactory = () => LanguageWorker;

const defaultWorkerFactory: LanguageWorkerFactory = () =>
  new Worker(new URL('./language.worker.ts', import.meta.url), { name: 'config-lens-language', type: 'module' });

export interface LanguageController {
  readonly run: (language: LanguageId, operation: LanguageOperation, source: string) => Promise<LanguageResult>;
  readonly scheduleValidation: (
    language: LanguageId,
    source: string,
    publish: (result: LanguageResult) => void,
    delayMs?: number,
  ) => void;
  readonly invalidate: () => void;
  readonly dispose: () => void;
  readonly generation: () => number;
}

export const createLanguageController = (
  createWorker: LanguageWorkerFactory = defaultWorkerFactory,
  deadlineMs = OPERATION_DEADLINE_MS,
): LanguageController => {
  let currentGeneration = 0;
  let worker: LanguageWorker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let validationTimer: ReturnType<typeof setTimeout> | undefined;
  let settle: ((result: LanguageResult) => void) | undefined;
  let activeRequestId: number | undefined;
  let disposed = false;

  const releaseCurrent = (terminateWorker: boolean, result?: LanguageResult) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (worker !== undefined) {
      worker.onmessage = null;
      worker.onerror = null;
      if (terminateWorker) {
        worker.terminate();
        worker = undefined;
      }
    }
    if (result !== undefined) settle?.(result);
    settle = undefined;
    activeRequestId = undefined;
  };

  const invalidate = () => {
    currentGeneration += 1;
    if (validationTimer !== undefined) clearTimeout(validationTimer);
    validationTimer = undefined;
    if (activeRequestId !== undefined) {
      releaseCurrent(
        true,
        invalidResult(activeRequestId, diagnostic('controller.superseded', 'diagnostic.superseded'), 'internal-error'),
      );
    }
  };

  const run = async (language: LanguageId, operation: LanguageOperation, source: string): Promise<LanguageResult> => {
    if (disposed) {
      return invalidResult(0, diagnostic('controller.disposed', 'diagnostic.internalFailure'), 'internal-error');
    }
    invalidate();
    const requestId = currentGeneration;
    const preflight = preflightInput(requestId, source);
    if (preflight !== undefined) return preflight;
    const currentWorker = worker ?? createWorker();
    worker = currentWorker;
    activeRequestId = requestId;
    return new Promise<LanguageResult>((resolve) => {
      settle = resolve;
      const finish = (result: LanguageResult, terminateWorker: boolean) => {
        if (requestId !== currentGeneration || worker !== currentWorker) return;
        releaseCurrent(terminateWorker);
        resolve(result);
      };
      currentWorker.onmessage = ({ data }) => {
        if (!isLanguageResult(data) || data.requestId !== requestId) {
          finish(
            invalidResult(
              requestId,
              diagnostic('protocol.result-invalid', 'diagnostic.protocolFailure'),
              'internal-error',
            ),
            true,
          );
          return;
        }
        finish(data, false);
      };
      currentWorker.onerror = () =>
        finish(
          invalidResult(requestId, diagnostic('worker.crashed', 'diagnostic.workerFailure'), 'internal-error'),
          true,
        );
      timer = setTimeout(
        () =>
          finish(invalidResult(requestId, diagnostic('worker.timeout', 'diagnostic.timeout'), 'internal-error'), true),
        deadlineMs,
      );
      currentWorker.postMessage({ requestId, language, operation, source });
    });
  };

  const scheduleValidation = (
    language: LanguageId,
    source: string,
    publish: (result: LanguageResult) => void,
    delayMs = 180,
  ) => {
    invalidate();
    validationTimer = setTimeout(() => {
      validationTimer = undefined;
      void run(language, 'validate', source).then(publish);
    }, delayMs);
  };

  return Object.freeze({
    run,
    scheduleValidation,
    invalidate,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      invalidate();
      releaseCurrent(true);
    },
    generation: () => currentGeneration,
  });
};
