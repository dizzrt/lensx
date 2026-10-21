import { OPERATION_DEADLINE_MS, preflightInput } from './limits.js';
import {
  type AnalysisInput,
  type AnalysisRequest,
  type AnalysisResult,
  diagnostic,
  failedAnalysis,
  invalidResult,
  isAnalysisResult,
  isLanguageOperationResult,
  type LanguageId,
  type LanguageOperation,
  type LanguageOperationRequest,
  type LanguageOperationResult,
  type LanguageResult,
  type LanguageVersions,
  type LanguageWorkerRequest,
  type LanguageWorkerResult,
} from './protocol.js';

export interface LanguageWorker {
  onerror: ((event: ErrorEvent) => unknown) | null;
  onmessage: ((event: MessageEvent<unknown>) => unknown) | null;
  postMessage(value: LanguageWorkerRequest): void;
  terminate(): void;
}

export type LanguageWorkerFactory = () => LanguageWorker;

const defaultWorkerFactory: LanguageWorkerFactory = () =>
  new Worker(new URL('./language.worker.ts', import.meta.url), { name: 'config-lens-language', type: 'module' });

export interface LanguageController {
  readonly run: (
    language: LanguageId,
    operation: LanguageOperation,
    source: string,
    versions: LanguageVersions,
  ) => Promise<LanguageOperationResult>;
  readonly analyze: (input: AnalysisInput) => Promise<AnalysisResult>;
  readonly scheduleAnalysis: (
    input: AnalysisInput,
    publish: (result: AnalysisResult) => void,
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
  let analysisTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelCurrent: (() => void) | undefined;
  let disposed = false;

  const releaseCurrent = (terminateWorker: boolean) => {
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
    cancelCurrent = undefined;
  };

  const invalidate = () => {
    cancelCurrent?.();
    currentGeneration += 1;
    if (analysisTimer !== undefined) clearTimeout(analysisTimer);
    analysisTimer = undefined;
  };

  function dispatch(request: AnalysisRequest): Promise<AnalysisResult>;
  function dispatch(request: LanguageOperationRequest): Promise<LanguageOperationResult>;
  function dispatch(request: LanguageWorkerRequest): Promise<LanguageWorkerResult> {
    const wrapFailure = (result: LanguageResult): LanguageWorkerResult =>
      request.operation === 'analyze'
        ? failedAnalysis(request, result)
        : { ...result, inputVersion: request.inputVersion, selectionVersion: request.selectionVersion };
    const failure = (code: string, messageKey: string) =>
      wrapFailure(invalidResult(request.requestId, diagnostic(code, messageKey), 'internal-error'));
    if (disposed) return Promise.resolve(failure('controller.disposed', 'diagnostic.internalFailure'));
    const preflight = preflightInput(request.requestId, request.source);
    if (preflight !== undefined) return Promise.resolve(wrapFailure(preflight));
    if (request.operation === 'analyze' && request.source.trim() === '') {
      const identity = {
        requestId: request.requestId,
        inputVersion: request.inputVersion,
        selectionVersion: request.selectionVersion,
        diagnostics: [],
      } as const;
      return Promise.resolve(
        request.selection.mode === 'manual'
          ? {
              ...identity,
              status: 'resolved',
              effectiveLanguage: request.selection.language,
              validationStatus: 'valid',
            }
          : { ...identity, status: 'unresolved' },
      );
    }
    let currentWorker: LanguageWorker;
    try {
      currentWorker = worker ?? createWorker();
      worker = currentWorker;
    } catch {
      return Promise.resolve(failure('worker.creation-failed', 'diagnostic.workerFailure'));
    }
    return new Promise<LanguageWorkerResult>((resolve) => {
      const finish = (result: LanguageWorkerResult, terminateWorker: boolean) => {
        if (request.requestId !== currentGeneration || worker !== currentWorker) return;
        releaseCurrent(terminateWorker);
        resolve(result);
      };
      cancelCurrent = () => finish(failure('controller.superseded', 'diagnostic.superseded'), true);
      currentWorker.onmessage = ({ data }) => {
        const valid =
          request.operation === 'analyze'
            ? isAnalysisResult(data, request.source.length)
            : isLanguageOperationResult(data, request.source.length);
        if (
          !valid ||
          (data as LanguageWorkerResult).requestId !== request.requestId ||
          (data as LanguageWorkerResult).inputVersion !== request.inputVersion ||
          (data as LanguageWorkerResult).selectionVersion !== request.selectionVersion ||
          (request.operation === 'analyze' &&
            request.selection.mode === 'manual' &&
            ((data as AnalysisResult).status === 'unresolved' ||
              ((data as AnalysisResult).status === 'resolved' &&
                (data as Extract<AnalysisResult, { status: 'resolved' }>).effectiveLanguage !==
                  request.selection.language)))
        ) {
          finish(failure('protocol.result-invalid', 'diagnostic.protocolFailure'), true);
          return;
        }
        finish(data as LanguageWorkerResult, false);
      };
      currentWorker.onerror = () => finish(failure('worker.crashed', 'diagnostic.workerFailure'), true);
      // One timer encloses candidate selection, lazy loading and validation in
      // the Worker. Candidate changes never start a new operation budget.
      timer = setTimeout(() => finish(failure('worker.timeout', 'diagnostic.timeout'), true), deadlineMs);
      try {
        currentWorker.postMessage(request);
      } catch {
        finish(failure('worker.dispatch-failed', 'diagnostic.workerFailure'), true);
      }
    });
  }

  const analyze = (input: AnalysisInput): Promise<AnalysisResult> => {
    invalidate();
    return dispatch({ ...input, requestId: currentGeneration, operation: 'analyze' });
  };
  const run = (
    language: LanguageId,
    operation: LanguageOperation,
    source: string,
    versions: LanguageVersions,
  ): Promise<LanguageOperationResult> => {
    invalidate();
    return dispatch({ ...versions, requestId: currentGeneration, language, operation, source });
  };
  const scheduleAnalysis = (input: AnalysisInput, publish: (result: AnalysisResult) => void, delayMs = 180) => {
    invalidate();
    if (disposed) return;
    analysisTimer = setTimeout(() => {
      analysisTimer = undefined;
      const promise = analyze(input);
      const generation = currentGeneration;
      void promise.then((result) => {
        if (!disposed && currentGeneration === generation) publish(result);
      });
    }, delayMs);
  };

  return Object.freeze({
    run,
    analyze,
    scheduleAnalysis,
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
