import type { PluginActionActivation } from '@lensx/plugin-contract';
import { LauncherActionAdmissionError } from '../launcher/actions/dispatcher';
import type { LauncherActionInvocation } from '../launcher/actions/types';

export class PageActivationAdmissionError extends LauncherActionAdmissionError {
  constructor(readonly code: 'busy' | 'expired' | 'unavailable') {
    super(code);
  }
}

export interface PluginPageActivationSession {
  readonly available: () => boolean;
  readonly current: () => PluginActionActivation | null;
  readonly subscribe: (emit: (activation: PluginActionActivation) => boolean) => readonly PluginActionActivation[];
  readonly dispose: () => void;
  readonly fail: () => void;
}

/** This channel belongs to one Page attempt, never to a reusable Page identity. */
export class PageActivationAttempt {
  #current: PluginActionActivation | null = null;
  #pending: PluginActionActivation[] = [];
  #initialBatch?: readonly PluginActionActivation[];
  #emit?: (activation: PluginActionActivation) => boolean;
  #sequence = 0;
  #invocationWatermark = 0;
  #bound = false;
  #terminal = false;
  #timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly onFailure: (code: 'expired' | 'unavailable') => void = () => undefined) {}

  get terminal() {
    return this.#terminal;
  }

  append(actionId: string, invocation: LauncherActionInvocation) {
    if (this.#terminal) throw new PageActivationAdmissionError('unavailable');
    if (invocation.invocationId <= this.#invocationWatermark) return;
    if (!this.#initialBatch && this.#pending.length >= 32) throw new PageActivationAdmissionError('busy');
    if (this.#sequence >= Number.MAX_SAFE_INTEGER) throw new PageActivationAdmissionError('busy');
    const activation = Object.freeze({ actionId, invocationId: ++this.#sequence, source: invocation.source });
    this.#current = activation;
    this.#invocationWatermark = invocation.invocationId;
    if (this.#initialBatch) {
      if (!this.#emit?.(activation)) {
        this.dispose();
        this.onFailure('unavailable');
        throw new PageActivationAdmissionError('unavailable');
      }
    } else {
      this.#pending.push(activation);
      if (!this.#timer) {
        this.#timer = setTimeout(() => {
          this.dispose();
          this.onFailure('expired');
        }, 10_000);
      }
    }
  }

  bind(): PluginPageActivationSession {
    if (this.#terminal || this.#bound) throw new PageActivationAdmissionError('unavailable');
    this.#bound = true;
    return Object.freeze({
      available: () => !this.#terminal,
      current: () => (this.#terminal ? null : this.#current),
      subscribe: (emit: (activation: PluginActionActivation) => boolean) => {
        if (this.#terminal) throw new PageActivationAdmissionError('unavailable');
        if (this.#initialBatch) return this.#initialBatch;
        // Install the single stream and seal its replay cache in the same synchronous transition.
        this.#emit = emit;
        this.#initialBatch = Object.freeze([...this.#pending]);
        this.#pending = [];
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = undefined;
        return this.#initialBatch;
      },
      dispose: () => this.dispose(),
      fail: () => {
        if (this.#terminal) return;
        this.dispose();
        this.onFailure('unavailable');
      },
    });
  }

  dispose() {
    if (this.#terminal) return;
    this.#terminal = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#pending = [];
    this.#initialBatch = undefined;
    this.#current = null;
    this.#emit = undefined;
  }
}
