import { PluginSdkError, toPluginSdkOperationError } from './error.js';
import type { PluginSdkCancellationSignal } from './types.js';

interface TimerRuntime {
  clearTimeout(handle: unknown): void;
  setTimeout(handler: () => void, timeoutMs: number): unknown;
}

interface PendingOperation {
  abort(error: PluginSdkError): void;
}

export type PendingOperationSet = Set<PendingOperation>;

const timers = globalThis as unknown as TimerRuntime;

class InternalCancellationSignal implements PluginSdkCancellationSignal {
  #aborted = false;
  readonly #listeners = new Set<() => void>();

  get aborted(): boolean {
    return this.#aborted;
  }

  addEventListener(type: 'abort', listener: () => void): void {
    if (type !== 'abort') {
      return;
    }
    if (this.#aborted) {
      listener();
      return;
    }
    this.#listeners.add(listener);
  }

  removeEventListener(type: 'abort', listener: () => void): void {
    if (type === 'abort') {
      this.#listeners.delete(listener);
    }
  }

  abort(): void {
    if (this.#aborted) {
      return;
    }
    this.#aborted = true;
    for (const listener of [...this.#listeners]) {
      listener();
    }
    this.#listeners.clear();
  }
}

export const validateTimeout = (timeoutMs: number): number => {
  if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new PluginSdkError('invalid_argument');
  }
  return timeoutMs;
};

export const validateCancellationSignal = (signal: PluginSdkCancellationSignal | undefined): void => {
  if (signal === undefined) {
    return;
  }
  try {
    if (
      typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' ||
      typeof signal.removeEventListener !== 'function'
    ) {
      throw new PluginSdkError('invalid_argument');
    }
  } catch {
    throw new PluginSdkError('invalid_argument');
  }
};

export const abortPendingOperations = (pendingOperations: PendingOperationSet, error: PluginSdkError): void => {
  for (const operation of [...pendingOperations]) {
    operation.abort(error);
  }
};

export const runSdkOperation = <Result>({
  operation,
  pendingOperations,
  signal,
  timeoutMs,
}: {
  readonly operation: (signal: PluginSdkCancellationSignal) => Promise<Result>;
  readonly pendingOperations: PendingOperationSet;
  readonly signal?: PluginSdkCancellationSignal;
  readonly timeoutMs: number;
}): Promise<Result> => {
  validateTimeout(timeoutMs);
  validateCancellationSignal(signal);
  if (signal?.aborted === true) {
    return Promise.reject(new PluginSdkError('cancelled'));
  }

  return new Promise<Result>((resolve, reject) => {
    const transportSignal = new InternalCancellationSignal();
    let settled = false;
    let timer: unknown;

    const cleanup = (): void => {
      if (timer !== undefined) {
        timers.clearTimeout(timer);
      }
      try {
        signal?.removeEventListener('abort', onCallerAbort);
      } catch {
        // Caller-owned cancellation cleanup must not leak its implementation error.
      }
      pendingOperations.delete(pendingOperation);
    };
    const rejectOnce = (error: PluginSdkError, abortTransport: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (abortTransport) {
        transportSignal.abort();
      }
      cleanup();
      reject(error);
    };
    const pendingOperation: PendingOperation = {
      abort: (error) => rejectOnce(error, true),
    };
    const onCallerAbort = (): void => rejectOnce(new PluginSdkError('cancelled'), true);

    pendingOperations.add(pendingOperation);
    try {
      signal?.addEventListener('abort', onCallerAbort);
    } catch {
      rejectOnce(new PluginSdkError('invalid_argument'), true);
      return;
    }
    timer = timers.setTimeout(() => rejectOnce(new PluginSdkError('timeout'), true), timeoutMs);

    Promise.resolve()
      .then(() => operation(transportSignal))
      .then(
        (value) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(toPluginSdkOperationError(error));
        },
      );
  });
};
