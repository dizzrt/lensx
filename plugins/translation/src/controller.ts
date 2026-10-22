import { isSourceLanguage, isSupportedDirection } from './languages.js';
import { TranslationError, type TranslationInput, type TranslationResult } from './provider/index.js';
import type { SettingsController } from './settings.js';

export type TranslationStatus =
  | 'empty'
  | 'config-loading'
  | 'unconfigured'
  | 'http-unavailable'
  | 'config-error'
  | 'input-limit'
  | 'direction'
  | 'paused'
  | 'debouncing'
  | 'translating'
  | 'success'
  | 'error'
  | 'disposed';
export interface TranslationSnapshot {
  readonly text: string;
  readonly translation: string;
  readonly sourceLanguage: string;
  readonly targetLanguage?: string;
  readonly status: TranslationStatus;
  readonly error?: { readonly code: TranslationError['code']; readonly requestId?: string };
  readonly detectedLanguage?: string;
  readonly requestId?: string;
  readonly settingsOpen: boolean;
  readonly composing: boolean;
}
export type Translate = (input: TranslationInput, signal: AbortSignal) => Promise<TranslationResult>;
export interface TranslationController {
  readonly getSnapshot: () => TranslationSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly input: (text: string) => void;
  readonly compositionStart: () => number;
  readonly compositionEnd: (text: string, token: number) => void;
  readonly setSource: (language: string) => void;
  readonly setSettingsOpen: (open: boolean) => void;
  readonly retry: () => void;
  readonly setTransportAvailable: (available: boolean) => void;
  readonly dispose: () => void;
}

/** One instance is one Runtime attempt. Context presentation changes never enter request identity. */
export const createTranslationController = ({
  settings,
  translate,
  transportAvailable = true,
}: {
  readonly settings: SettingsController;
  readonly translate: Translate;
  readonly transportAvailable?: boolean;
}): TranslationController => {
  let snapshot: TranslationSnapshot = {
    text: '',
    translation: '',
    sourceLanguage: 'auto',
    status: 'empty',
    settingsOpen: false,
    composing: false,
  };
  const listeners = new Set<() => void>();
  let disposed = false;
  let generation = 0;
  let composition = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | undefined;
  let requestRevision = settings.getSnapshot().revision;
  let settled: 'success' | 'error' | undefined;

  const publish = (next: TranslationSnapshot) => {
    if (disposed) return;
    snapshot = Object.freeze(next);
    for (const listener of listeners) listener();
  };
  const cancel = () => {
    generation += 1;
    if (debounce !== undefined) clearTimeout(debounce);
    if (deadline !== undefined) clearTimeout(deadline);
    debounce = undefined;
    deadline = undefined;
    active?.abort();
    active = undefined;
  };
  const invalidate = () => {
    cancel();
    settled = undefined;
    publish({ ...snapshot, translation: '', detectedLanguage: undefined, requestId: undefined, error: undefined });
  };
  const conditions = (): TranslationStatus | undefined => {
    if (snapshot.text.trim() === '') return 'empty';
    if (Array.from(snapshot.text).length > 5000) return 'input-limit';
    const config = settings.getSnapshot();
    if (config.phase === 'loading' || config.phase === 'saving') return 'config-loading';
    if (config.phase !== 'ready' || config.targetLanguage === undefined) return 'config-error';
    if (!config.confirmed?.credentials) return 'unconfigured';
    if (!transportAvailable) return 'http-unavailable';
    if (!isSupportedDirection(snapshot.sourceLanguage, config.targetLanguage)) return 'direction';
    if (snapshot.settingsOpen || snapshot.composing) return 'paused';
    return undefined;
  };
  const dispatch = () => {
    debounce = undefined;
    if (disposed || conditions() !== undefined || active) return;
    const config = settings.getSnapshot();
    const credentials = config.confirmed?.credentials;
    const targetLanguage = config.targetLanguage;
    if (!credentials || !targetLanguage) return;
    const ticket = ++generation;
    const controller = new AbortController();
    active = controller;
    publish({ ...snapshot, status: 'translating', error: undefined });
    const current = () => !disposed && ticket === generation && active === controller;
    const finish = () => {
      if (deadline !== undefined) clearTimeout(deadline);
      deadline = undefined;
      active = undefined;
    };
    deadline = setTimeout(() => {
      if (!current()) return;
      cancel();
      settled = 'error';
      publish({ ...snapshot, status: 'error', error: { code: 'timeout' } });
    }, 15_000);
    const input: TranslationInput = {
      text: snapshot.text,
      sourceLanguage: snapshot.sourceLanguage,
      targetLanguage,
      credentials,
    };
    // The deadline starts before signing, including implementations that reject synchronously.
    Promise.resolve()
      .then(() => {
        if (!current()) throw new TranslationError('cancelled');
        return translate(input, controller.signal);
      })
      .then(
        (result) => {
          if (!current()) return;
          finish();
          settled = 'success';
          publish({
            ...snapshot,
            status: 'success',
            translation: result.translation,
            detectedLanguage: result.detectedLanguage,
            requestId: result.requestId,
            error: undefined,
          });
        },
        (error: unknown) => {
          if (!current()) return;
          finish();
          settled = 'error';
          publish({
            ...snapshot,
            status: 'error',
            error:
              error instanceof TranslationError
                ? { code: error.code, requestId: error.requestId }
                : { code: 'network' },
          });
        },
      );
  };
  const reconcile = () => {
    if (disposed) return;
    const config = settings.getSnapshot();
    if (config.revision !== requestRevision) {
      requestRevision = config.revision;
      invalidate();
    }
    snapshot = Object.freeze({ ...snapshot, targetLanguage: config.targetLanguage });
    const blocked = conditions();
    if (blocked !== undefined) {
      cancel();
      publish({ ...snapshot, status: blocked });
      return;
    }
    if (settled) {
      publish({ ...snapshot, status: settled });
      return;
    }
    if (active || debounce !== undefined) return;
    publish({ ...snapshot, status: 'debouncing' });
    debounce = setTimeout(dispatch, 400);
  };
  const input = (text: string) => {
    if (disposed) return;
    if (text === snapshot.text) {
      if (text.trim() === '' && snapshot.composing) {
        composition += 1;
        publish({ ...snapshot, composing: false });
        reconcile();
      }
      return;
    }
    invalidate();
    const cleared = text.trim() === '';
    if (cleared && snapshot.composing) composition += 1;
    publish({ ...snapshot, text, composing: cleared ? false : snapshot.composing });
    reconcile();
  };
  const unsubscribe = settings.subscribe(reconcile);
  reconcile();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    input,
    compositionStart: () => {
      if (disposed) return composition;
      composition += 1;
      cancel();
      publish({ ...snapshot, composing: true });
      reconcile();
      return composition;
    },
    compositionEnd: (text, token) => {
      if (disposed || !snapshot.composing || token !== composition) return;
      input(text);
      publish({ ...snapshot, composing: false });
      reconcile();
    },
    setSource: (sourceLanguage) => {
      if (
        disposed ||
        sourceLanguage === snapshot.sourceLanguage ||
        (sourceLanguage !== 'auto' && !isSourceLanguage(sourceLanguage))
      )
        return;
      invalidate();
      publish({ ...snapshot, sourceLanguage });
      reconcile();
    },
    setSettingsOpen: (settingsOpen) => {
      if (disposed || settingsOpen === snapshot.settingsOpen) return;
      publish({ ...snapshot, settingsOpen });
      reconcile();
    },
    setTransportAvailable: (available) => {
      if (disposed || available === transportAvailable) return;
      transportAvailable = available;
      reconcile();
    },
    retry: () => {
      if (disposed || snapshot.status !== 'error' || conditions() !== undefined) return;
      invalidate();
      dispatch();
    },
    dispose: () => {
      if (disposed) return;
      cancel();
      composition += 1;
      unsubscribe();
      snapshot = {
        text: '',
        translation: '',
        sourceLanguage: 'auto',
        status: 'disposed',
        settingsOpen: false,
        composing: false,
      };
      disposed = true;
      for (const listener of listeners) listener();
      listeners.clear();
    },
  };
};
