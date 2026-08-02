import type { PluginSdkCancellationSignal } from '@lensx/plugin-sdk';

export class PluginTestCancellationController implements PluginSdkCancellationSignal {
  #aborted = false;
  readonly #listeners = new Set<() => void>();

  get aborted(): boolean {
    return this.#aborted;
  }

  get signal(): PluginSdkCancellationSignal {
    return this;
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
    const listeners = [...this.#listeners];
    this.#listeners.clear();
    for (const listener of listeners) {
      listener();
    }
  }
}

export interface PluginTestDeferred<Value> {
  readonly promise: Promise<Value>;
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: Value | PromiseLike<Value>) => void;
}

export const createDeferred = <Value>(): PluginTestDeferred<Value> => {
  let resolvePromise: (value: Value | PromiseLike<Value>) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  let settled = false;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return Object.freeze({
    promise,
    reject: (reason?: unknown) => {
      if (!settled) {
        settled = true;
        rejectPromise(reason);
      }
    },
    resolve: (value: Value | PromiseLike<Value>) => {
      if (!settled) {
        settled = true;
        resolvePromise(value);
      }
    },
  });
};
