import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  isPluginRegistrationEntryId,
  parsePluginRegistrationChangedEvent,
  parsePluginRegistrationDetailResponse,
  parsePluginRegistrationQueryError,
  parsePluginRegistrationSnapshot,
} from './parse';
import {
  PLUGIN_REGISTRATION_CHANGED_EVENT,
  type PluginRegistrationDesktopAdapter,
  type PluginRegistrationDetailResponse,
  PluginRegistrationQueryError,
  type PluginRegistrationQueryOperation,
  type PluginRegistrationSnapshot,
  READ_PLUGIN_REGISTRATION_DETAIL_COMMAND,
  READ_PLUGIN_REGISTRATION_SNAPSHOT_COMMAND,
} from './types';

export type PluginRegistrationInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
export type PluginRegistrationListen = (
  event: typeof PLUGIN_REGISTRATION_CHANGED_EVENT,
  listener: (event: { readonly payload: unknown }) => void,
) => Promise<() => void>;

export interface PluginRegistrationDesktopDependencies {
  readonly invoke?: PluginRegistrationInvoke;
  readonly listen?: PluginRegistrationListen;
}

const boundaryError = (operation: PluginRegistrationQueryOperation) =>
  new PluginRegistrationQueryError({
    code: 'invalid_boundary_payload',
    operation,
    message: 'Plugin registration boundary returned an invalid payload.',
  });

const mapInvokeError = (error: unknown, operation: PluginRegistrationQueryOperation) => {
  try {
    return new PluginRegistrationQueryError(parsePluginRegistrationQueryError(error));
  } catch {
    return boundaryError(operation);
  }
};

const revisionValue = (revision: string) => BigInt(revision);

export const createPluginRegistrationDesktopAdapter = (
  dependencies: PluginRegistrationDesktopDependencies = {},
): PluginRegistrationDesktopAdapter => {
  const invokeCommand = dependencies.invoke ?? (invoke as PluginRegistrationInvoke);
  const listenEvent = dependencies.listen ?? (listen as PluginRegistrationListen);
  const subscribers = new Set<(snapshot: PluginRegistrationSnapshot) => void>();
  const errorSubscribers = new Set<(error: PluginRegistrationQueryError) => void>();
  const detailCache = new Map<string, PluginRegistrationDetailResponse>();
  let snapshot: PluginRegistrationSnapshot | undefined;
  let latestEventRevision: string | undefined;
  let refreshPromise: Promise<PluginRegistrationSnapshot> | undefined;
  let installPromise: Promise<void> | undefined;
  let unlisten: (() => void) | undefined;
  let disposed = false;

  const reportError = (error: PluginRegistrationQueryError) => {
    for (const listener of errorSubscribers) {
      listener(error);
    }
  };

  const readSnapshot = async () => {
    try {
      return parsePluginRegistrationSnapshot(await invokeCommand(READ_PLUGIN_REGISTRATION_SNAPSHOT_COMMAND));
    } catch (error) {
      if (error instanceof PluginRegistrationQueryError) {
        throw error;
      }
      if (error instanceof TypeError) {
        throw boundaryError('read_snapshot');
      }
      throw mapInvokeError(error, 'read_snapshot');
    }
  };

  const requestRefresh = (): Promise<PluginRegistrationSnapshot> => {
    if (disposed) {
      return Promise.reject(boundaryError('read_snapshot'));
    }
    if (refreshPromise !== undefined) {
      return refreshPromise;
    }
    refreshPromise = (async () => {
      let next: PluginRegistrationSnapshot;
      do {
        next = await readSnapshot();
        if (snapshot?.revision !== next.revision) {
          detailCache.clear();
        }
        snapshot = next;
      } while (latestEventRevision !== undefined && revisionValue(next.revision) < revisionValue(latestEventRevision));
      latestEventRevision = next.revision;
      for (const listener of subscribers) {
        listener(next);
      }
      return next;
    })().finally(() => {
      refreshPromise = undefined;
    });
    return refreshPromise;
  };

  const handleEvent = (payload: unknown) => {
    try {
      const event = parsePluginRegistrationChangedEvent(payload);
      if (latestEventRevision === undefined || revisionValue(event.revision) > revisionValue(latestEventRevision)) {
        latestEventRevision = event.revision;
      }
    } catch {
      reportError(boundaryError('read_snapshot'));
    }
    detailCache.clear();
    void requestRefresh().catch((error: unknown) => {
      reportError(error instanceof PluginRegistrationQueryError ? error : boundaryError('read_snapshot'));
    });
  };

  const installListener = async () => {
    if (unlisten !== undefined) {
      return;
    }
    if (installPromise !== undefined) {
      return installPromise;
    }
    installPromise = listenEvent(PLUGIN_REGISTRATION_CHANGED_EVENT, ({ payload }) => handleEvent(payload))
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch(() => {
        throw boundaryError('read_snapshot');
      })
      .finally(() => {
        installPromise = undefined;
      });
    return installPromise;
  };

  const initialize = async () => {
    await installListener();
    return requestRefresh();
  };

  return {
    initialize,
    refresh: requestRefresh,
    async readDetail(entryId) {
      if (!isPluginRegistrationEntryId(entryId)) {
        throw new PluginRegistrationQueryError({
          code: 'invalid_request',
          operation: 'read_detail',
          message: 'Plugin registration request is invalid.',
        });
      }
      const cached = detailCache.get(entryId);
      if (cached !== undefined && cached.revision === snapshot?.revision) {
        return cached;
      }
      for (;;) {
        let detail: PluginRegistrationDetailResponse;
        try {
          detail = parsePluginRegistrationDetailResponse(
            await invokeCommand(READ_PLUGIN_REGISTRATION_DETAIL_COMMAND, { request: { entry_id: entryId } }),
          );
        } catch (error) {
          if (error instanceof TypeError) {
            throw boundaryError('read_detail');
          }
          throw mapInvokeError(error, 'read_detail');
        }
        if (snapshot === undefined || detail.revision !== snapshot.revision) {
          await requestRefresh();
          continue;
        }
        detailCache.set(entryId, detail);
        return detail;
      }
    },
    handleLauncherActivation: requestRefresh,
    async recoverListener() {
      unlisten?.();
      unlisten = undefined;
      await installListener();
      return requestRefresh();
    },
    subscribe(listener, onError) {
      subscribers.add(listener);
      if (onError !== undefined) {
        errorSubscribers.add(onError);
      }
      if (snapshot !== undefined) {
        listener(snapshot);
      }
      return () => {
        subscribers.delete(listener);
        if (onError !== undefined) {
          errorSubscribers.delete(onError);
        }
      };
    },
    async destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      const pendingInstall = installPromise;
      if (pendingInstall !== undefined) {
        await pendingInstall.catch(() => undefined);
      }
      unlisten?.();
      unlisten = undefined;
      subscribers.clear();
      errorSubscribers.clear();
      detailCache.clear();
    },
  };
};
