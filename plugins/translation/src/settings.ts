import { validateHostApiError } from '@lensx/plugin-contract';
import { type PluginRuntimeLocale, type PluginSdkClient, PluginSdkError } from '@lensx/plugin-sdk';

import { defaultTargetLanguage, isTargetLanguage } from './languages.js';
import type { Credentials } from './provider/index.js';

export const SETTINGS_KEY = 'settings.v1';

export interface SettingsV1 {
  readonly version: 1;
  readonly provider: 'volcengine';
  readonly targetLanguage?: string;
  readonly credentials?: Credentials;
}

export type SettingsPhase = 'loading' | 'ready' | 'invalid' | 'invalid-target' | 'read-error' | 'saving';
export type SettingsError = 'read' | 'invalid' | 'invalid-target' | 'save' | 'unavailable' | 'credentials';
export interface SettingsSnapshot {
  readonly phase: SettingsPhase;
  readonly confirmed?: SettingsV1;
  readonly targetLanguage?: string;
  readonly error?: SettingsError;
  /** Changes only when effective request parameters change, never for a no-op write. */
  readonly revision: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const validKey = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 4096 && /^[\x21-\x7e]+$/.test(value);

export const normalizeCredentials = (input: Credentials): Credentials | undefined => {
  const accessKeyId = input.accessKeyId.trim();
  const secretAccessKey = input.secretAccessKey.trim();
  return validKey(accessKeyId) && validKey(secretAccessKey) ? { accessKeyId, secretAccessKey } : undefined;
};

export const parseSettings = (value: unknown): SettingsV1 | undefined => {
  if (
    !isRecord(value) ||
    !hasOnly(value, ['version', 'provider', 'targetLanguage', 'credentials']) ||
    value.version !== 1 ||
    value.provider !== 'volcengine' ||
    ('targetLanguage' in value && (typeof value.targetLanguage !== 'string' || value.targetLanguage.length === 0))
  )
    return undefined;
  if ('credentials' in value) {
    if (
      !isRecord(value.credentials) ||
      !hasOnly(value.credentials, ['accessKeyId', 'secretAccessKey']) ||
      !validKey(value.credentials.accessKeyId) ||
      !validKey(value.credentials.secretAccessKey)
    )
      return undefined;
  }
  return Object.freeze({
    version: 1,
    provider: 'volcengine',
    ...(value.targetLanguage === undefined ? {} : { targetLanguage: value.targetLanguage as string }),
    ...(value.credentials === undefined
      ? {}
      : {
          credentials: Object.freeze({
            accessKeyId: (value.credentials as Record<string, string>).accessKeyId,
            secretAccessKey: (value.credentials as Record<string, string>).secretAccessKey,
          }),
        }),
  });
};

const sameRequestConfig = (left: SettingsSnapshot, right: SettingsSnapshot): boolean =>
  left.targetLanguage === right.targetLanguage &&
  left.confirmed?.provider === right.confirmed?.provider &&
  left.confirmed?.credentials?.accessKeyId === right.confirmed?.credentials?.accessKeyId &&
  left.confirmed?.credentials?.secretAccessKey === right.confirmed?.credentials?.secretAccessKey;

// Only rejections known to precede a storage commit can preserve the old confirmed value.
// A transport loss or an internal error can occur after the durable commit boundary.
const isDefiniteFailure = (error: unknown): boolean => {
  if (error instanceof PluginSdkError) return error.code === 'invalid_argument';
  const result = validateHostApiError(error);
  return (
    result.status === 'valid' &&
    [
      'invalid_params',
      'invalid_request',
      'limit_exceeded',
      'method_not_found',
      'not_found',
      'conflict',
      'unavailable',
    ].includes(result.value.code)
  );
};

export interface SettingsController {
  readonly getSnapshot: () => SettingsSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly load: () => Promise<void>;
  readonly saveCredentials: (credentials: Credentials) => Promise<boolean>;
  readonly selectTarget: (language: string) => Promise<boolean>;
  readonly dispose: () => void;
}

export const createSettingsController = ({
  client,
  initialLocale,
}: {
  readonly client: PluginSdkClient;
  readonly initialLocale: PluginRuntimeLocale;
}): SettingsController => {
  let snapshot: SettingsSnapshot = { phase: 'loading', revision: 0 };
  const listeners = new Set<() => void>();
  let disposed = false;
  let busy = false;
  let operation = 0;
  let active: AbortController | undefined;

  const publish = (next: Omit<SettingsSnapshot, 'revision'>) => {
    if (disposed) return;
    const candidate = { ...next, revision: snapshot.revision };
    snapshot = Object.freeze({
      ...candidate,
      revision: snapshot.revision + (sameRequestConfig(snapshot, candidate) ? 0 : 1),
    });
    for (const listener of listeners) listener();
  };
  const confirmedState = (confirmed: SettingsV1): Omit<SettingsSnapshot, 'revision'> => {
    if (confirmed.targetLanguage !== undefined && !isTargetLanguage(confirmed.targetLanguage)) {
      return { phase: 'invalid-target', confirmed, error: 'invalid-target' };
    }
    return {
      phase: 'ready',
      confirmed,
      targetLanguage: confirmed.targetLanguage ?? defaultTargetLanguage(initialLocale),
    };
  };
  const read = async (ticket: number, signal: AbortSignal) => {
    if (!client.context?.capabilities.includes('storage.get')) {
      publish({ ...snapshot, phase: 'read-error', error: 'unavailable' });
      return;
    }
    try {
      const result = await client.request({ method: 'storage.get', params: { key: SETTINGS_KEY } }, { signal });
      if (disposed || ticket !== operation) return;
      const confirmed = result.found
        ? parseSettings(result.value)
        : { version: 1 as const, provider: 'volcengine' as const };
      publish(confirmed === undefined ? { phase: 'invalid', error: 'invalid' } : confirmedState(confirmed));
    } catch {
      if (!disposed && ticket === operation) publish({ ...snapshot, phase: 'read-error', error: 'read' });
    }
  };
  const load = async () => {
    if (disposed || busy) return;
    busy = true;
    const ticket = ++operation;
    active = new AbortController();
    publish({ ...snapshot, phase: 'loading', error: undefined });
    try {
      await read(ticket, active.signal);
    } finally {
      if (ticket === operation) {
        busy = false;
        active = undefined;
      }
    }
  };
  const commit = async (next: SettingsV1): Promise<boolean> => {
    if (disposed || busy || !snapshot.confirmed || !['ready', 'invalid-target'].includes(snapshot.phase)) return false;
    if (!client.context?.capabilities.includes('storage.set')) {
      publish({ ...snapshot, error: 'unavailable' });
      return false;
    }
    busy = true;
    const previous = snapshot;
    const ticket = ++operation;
    active = new AbortController();
    publish({ ...snapshot, phase: 'saving', error: undefined });
    try {
      await client.request(
        {
          method: 'storage.set',
          params: {
            key: SETTINGS_KEY,
            value: {
              version: next.version,
              provider: next.provider,
              ...(next.targetLanguage === undefined ? {} : { targetLanguage: next.targetLanguage }),
              ...(next.credentials === undefined
                ? {}
                : {
                    credentials: {
                      accessKeyId: next.credentials.accessKeyId,
                      secretAccessKey: next.credentials.secretAccessKey,
                    },
                  }),
            },
          },
        },
        { signal: active.signal },
      );
      if (disposed || ticket !== operation) return false;
      // Clone and freeze the same validated record, rather than retain editable form objects.
      const confirmed = parseSettings(next);
      if (!confirmed) return false;
      publish(confirmedState(confirmed));
      return true;
    } catch (error) {
      if (disposed || ticket !== operation) return false;
      if (isDefiniteFailure(error)) {
        publish({ ...previous, error: 'save' });
        return false;
      }
      publish({ ...snapshot, phase: 'loading', error: undefined });
      await read(ticket, active.signal);
      if (disposed || ticket !== operation) return false;
      const matched =
        snapshot.phase === 'ready' && JSON.stringify(snapshot.confirmed) === JSON.stringify(parseSettings(next));
      if (!matched && ['ready', 'invalid-target'].includes(snapshot.phase)) publish({ ...snapshot, error: 'save' });
      return matched;
    } finally {
      if (ticket === operation) {
        busy = false;
        active = undefined;
      }
    }
  };
  let unsubscribe = () => {};
  let unsubscribeContext = () => {};
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    operation += 1;
    active?.abort();
    active = undefined;
    busy = false;
    unsubscribe();
    unsubscribeContext();
    snapshot = { phase: 'read-error', error: 'unavailable', revision: snapshot.revision + 1 };
    for (const listener of listeners) listener();
    listeners.clear();
  };
  unsubscribe = client.subscribeState((state) => {
    if (state === 'disconnected' || state === 'disposed') dispose();
  });
  unsubscribeContext = client.subscribe('runtime.context_changed', ({ payload }) => {
    if (!payload.capabilities.includes('storage.get')) {
      operation += 1;
      active?.abort();
      active = undefined;
      busy = false;
      publish({ ...snapshot, phase: 'read-error', error: 'unavailable' });
    }
  });
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    saveCredentials: async (input) => {
      if (disposed || busy || !snapshot.confirmed || snapshot.phase !== 'ready') return false;
      const credentials = normalizeCredentials(input);
      if (!credentials) {
        publish({ ...snapshot, error: 'credentials' });
        return false;
      }
      return commit({ ...snapshot.confirmed, credentials });
    },
    selectTarget: async (targetLanguage) => {
      if (!isTargetLanguage(targetLanguage) || !snapshot.confirmed) return false;
      return commit({ ...snapshot.confirmed, targetLanguage });
    },
    dispose,
  };
};
