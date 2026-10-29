import { type LauncherActionRegistry, resolveRegisteredLauncherAction } from './registry';
import type { LauncherActionDispatchResult, LauncherActionInvocation } from './types';

const failure = (
  actionId: string,
  code: 'action_execution_failed' | 'action_not_found' | 'action_unavailable',
  message: string,
): LauncherActionDispatchResult =>
  Object.freeze({ ok: false, action_id: actionId, error: Object.freeze({ code, message }) });

export class LauncherActionAdmissionError extends Error {
  constructor(readonly code: 'busy' | 'expired' | 'unavailable') {
    super('The Action invocation could not be admitted.');
  }
}

interface QueuedInvocation {
  readonly actionId: string;
  readonly invocation: LauncherActionInvocation;
  readonly isCurrent?: () => boolean | Promise<boolean>;
  readonly resolve: (result: LauncherActionDispatchResult) => void;
  readonly reject: (error: LauncherActionAdmissionError) => void;
  readonly deadline: number;
  timer: ReturnType<typeof setTimeout>;
}

/** One Host-owned admission path for UI, plugin requests, and native bindings. */
export class LauncherActionDispatcher {
  readonly #queue: QueuedInvocation[] = [];
  readonly #successListeners = new Set<(actionId: string, invocation: LauncherActionInvocation) => void>();
  #running = false;
  #sequence = 0;

  constructor(private readonly registry: LauncherActionRegistry) {}

  dispatch(actionId: string, isCurrent?: () => boolean | Promise<boolean>): Promise<LauncherActionDispatchResult> {
    return this.#admit(actionId, 'normal', isCurrent);
  }

  /** Host-private: called only after the main native binding has been atomically claimed. */
  dispatchShortcut(
    actionId: string,
    isCurrent?: () => boolean | Promise<boolean>,
  ): Promise<LauncherActionDispatchResult> {
    return this.#admit(actionId, 'shortcut', isCurrent);
  }

  subscribeSuccessfulInvocations(listener: (actionId: string, invocation: LauncherActionInvocation) => void) {
    this.#successListeners.add(listener);
    return () => {
      this.#successListeners.delete(listener);
    };
  }

  #admit(
    actionId: string,
    source: LauncherActionInvocation['source'],
    isCurrent?: () => boolean | Promise<boolean>,
  ): Promise<LauncherActionDispatchResult> {
    if (this.#queue.length >= 32 || this.#sequence >= Number.MAX_SAFE_INTEGER) {
      return Promise.reject(new LauncherActionAdmissionError('busy'));
    }
    const invocation = Object.freeze({ invocationId: ++this.#sequence, source });
    return new Promise((resolve, reject) => {
      const queued: QueuedInvocation = {
        actionId,
        invocation,
        isCurrent,
        resolve,
        reject,
        deadline: Date.now() + 10_000,
        timer: setTimeout(() => {
          const index = this.#queue.indexOf(queued);
          if (index < 0) return;
          this.#queue.splice(index, 1);
          reject(new LauncherActionAdmissionError('expired'));
        }, 10_000),
      };
      this.#queue.push(queued);
      void this.#drain();
    });
  }

  async #drain() {
    if (this.#running) return;
    this.#running = true;
    try {
      for (let queued = this.#queue.shift(); queued; queued = this.#queue.shift()) {
        clearTimeout(queued.timer);
        try {
          if (queued.isCurrent && !(await this.#checkCurrent(queued)))
            throw new LauncherActionAdmissionError('unavailable');
          const result = await this.#execute(queued.actionId, queued.invocation);
          if (result.ok) {
            for (const listener of this.#successListeners) {
              try {
                listener(queued.actionId, queued.invocation);
              } catch {
                /* Observers cannot change execution. */
              }
            }
          }
          queued.resolve(result);
        } catch (error) {
          queued.reject(
            error instanceof LauncherActionAdmissionError ? error : new LauncherActionAdmissionError('unavailable'),
          );
        }
      }
    } finally {
      this.#running = false;
    }
  }

  async #checkCurrent(queued: QueuedInvocation): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (Date.now() >= queued.deadline) throw new LauncherActionAdmissionError('expired');
    try {
      return await Promise.race([
        Promise.resolve().then(() => queued.isCurrent?.() ?? true),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new LauncherActionAdmissionError('expired')),
            Math.max(0, queued.deadline - Date.now()),
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async #execute(actionId: string, invocation: LauncherActionInvocation): Promise<LauncherActionDispatchResult> {
    const registration = resolveRegisteredLauncherAction(this.registry, actionId);
    if (!registration) return failure(actionId, 'action_not_found', 'Launcher action was not found.');
    if (!registration.descriptor.enabled)
      return failure(actionId, 'action_unavailable', 'Launcher action is unavailable.');
    try {
      const result: unknown = await registration.executor(invocation);
      if (result !== undefined)
        return failure(actionId, 'action_execution_failed', 'Launcher action execution failed.');
    } catch (error) {
      if (error instanceof LauncherActionAdmissionError) throw error;
      return failure(actionId, 'action_execution_failed', 'Launcher action execution failed.');
    }
    return Object.freeze({ ok: true, action_id: actionId });
  }
}
