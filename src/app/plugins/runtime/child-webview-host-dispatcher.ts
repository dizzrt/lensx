import {
  type HostApiError,
  type HostApiEvent,
  type HostApiRequest,
  type HostApiResult,
  validateHostApiRequest,
} from '@lensx/plugin-contract';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import type {
  PluginHostApiAuthorityIdentity,
  PluginHostApiDispatcherBinding,
  PluginHostApiDispatcherFactory,
} from './host-api-dispatcher';
import { preparePluginRuntimeTransportSettlement } from './transport-adapter';

export const PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION = '0.1.0' as const;
export const PLUGIN_CHILD_WEBVIEW_HOST_DISPATCH_EVENT = 'plugin-child-webview-host-dispatch' as const;
export const PLUGIN_CHILD_WEBVIEW_HOST_CANCEL_EVENT = 'plugin-child-webview-host-cancel' as const;
export const PLUGIN_CHILD_WEBVIEW_HOST_DISCONNECT_EVENT = 'plugin-child-webview-host-disconnect' as const;
export const SETTLE_PLUGIN_CHILD_WEBVIEW_HOST_DISPATCH_COMMAND = 'settle_plugin_child_webview_host_dispatch' as const;
export const FAIL_PLUGIN_CHILD_WEBVIEW_HOST_DISPATCH_COMMAND = 'fail_plugin_child_webview_host_dispatch' as const;
export const EMIT_PLUGIN_CHILD_WEBVIEW_HOST_EVENT_COMMAND = 'emit_plugin_child_webview_host_event' as const;

interface PluginChildWebviewHostDispatchEvent {
  readonly contract_version: typeof PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION;
  readonly session_id: string;
  readonly dispatch_id: string;
  readonly identity: PluginHostApiAuthorityIdentity;
  readonly request: HostApiRequest;
}

interface PluginChildWebviewHostCancelEvent {
  readonly contract_version: typeof PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION;
  readonly session_id: string;
  readonly dispatch_id: string;
}

interface PluginChildWebviewHostDisconnectEvent {
  readonly contract_version: typeof PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION;
  readonly session_id: string;
}

export interface PluginChildWebviewHostNativePort {
  readonly settle: (dispatchId: string, output: HostApiResult | HostApiError) => Promise<boolean>;
  readonly fail: (dispatchId: string) => Promise<boolean>;
  readonly emitEvent: (sessionId: string, event: HostApiEvent) => boolean;
}

export interface PluginChildWebviewHostDispatcherController {
  readonly dispatch: (payload: unknown) => boolean;
  readonly cancel: (payload: unknown) => boolean;
  readonly disconnect: (payload: unknown) => boolean;
  readonly dispose: () => void;
}

interface ActiveSession {
  readonly identity: PluginHostApiAuthorityIdentity;
  readonly binding: PluginHostApiDispatcherBinding;
  readonly detachEmitter: () => void;
  active: boolean;
}

interface PendingDispatch {
  readonly sessionId: string;
  readonly controller: AbortController;
}

const OPAQUE_ID_PATTERN = /^[0-9a-f]{32}$/u;
const plainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const opaqueId = (value: unknown): value is string => typeof value === 'string' && OPAQUE_ID_PATTERN.test(value);

const parseIdentity = (value: unknown): PluginHostApiAuthorityIdentity | undefined => {
  if (!plainRecord(value) || !exact(value, ['entry_id', 'plugin_id', 'version', 'page_id'])) return undefined;
  if (
    typeof value.entry_id !== 'string' ||
    typeof value.plugin_id !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.page_id !== 'string' ||
    [value.entry_id, value.plugin_id, value.version, value.page_id].some(
      (part) => part.length === 0 || part.length > 512,
    )
  ) {
    return undefined;
  }
  return Object.freeze({
    entry_id: value.entry_id,
    plugin_id: value.plugin_id,
    version: value.version,
    page_id: value.page_id,
  });
};

const parseDispatch = (value: unknown): PluginChildWebviewHostDispatchEvent | undefined => {
  if (
    !plainRecord(value) ||
    !exact(value, ['contract_version', 'session_id', 'dispatch_id', 'identity', 'request']) ||
    value.contract_version !== PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION ||
    !opaqueId(value.session_id) ||
    !opaqueId(value.dispatch_id)
  ) {
    return undefined;
  }
  const identity = parseIdentity(value.identity);
  const request = validateHostApiRequest(value.request);
  if (identity === undefined || request.status === 'invalid') return undefined;
  return Object.freeze({
    contract_version: PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION,
    session_id: value.session_id,
    dispatch_id: value.dispatch_id,
    identity,
    request: request.value,
  });
};

const parseCancel = (value: unknown): PluginChildWebviewHostCancelEvent | undefined => {
  if (
    !plainRecord(value) ||
    !exact(value, ['contract_version', 'session_id', 'dispatch_id']) ||
    value.contract_version !== PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION ||
    !opaqueId(value.session_id) ||
    !opaqueId(value.dispatch_id)
  ) {
    return undefined;
  }
  return Object.freeze({
    contract_version: PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION,
    session_id: value.session_id,
    dispatch_id: value.dispatch_id,
  });
};

const parseDisconnect = (value: unknown): PluginChildWebviewHostDisconnectEvent | undefined => {
  if (
    !plainRecord(value) ||
    !exact(value, ['contract_version', 'session_id']) ||
    value.contract_version !== PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION ||
    !opaqueId(value.session_id)
  ) {
    return undefined;
  }
  return Object.freeze({
    contract_version: PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION,
    session_id: value.session_id,
  });
};

const sameIdentity = (left: PluginHostApiAuthorityIdentity, right: PluginHostApiAuthorityIdentity): boolean =>
  left.entry_id === right.entry_id &&
  left.plugin_id === right.plugin_id &&
  left.version === right.version &&
  left.page_id === right.page_id;

export const createPluginChildWebviewHostDispatcherController = (
  factory: PluginHostApiDispatcherFactory,
  native: PluginChildWebviewHostNativePort,
): PluginChildWebviewHostDispatcherController => {
  const sessions = new Map<string, ActiveSession>();
  const pending = new Map<string, PendingDispatch>();
  let disposed = false;

  const failSafely = (dispatchId: string) => {
    void native.fail(dispatchId).catch(() => undefined);
  };

  const disposeSession = (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (session === undefined) return;
    session.active = false;
    for (const [dispatchId, operation] of pending) {
      if (operation.sessionId !== sessionId) continue;
      operation.controller.abort();
      pending.delete(dispatchId);
    }
    session.detachEmitter();
    session.binding.dispose();
    sessions.delete(sessionId);
  };

  const createSession = (sessionId: string, identity: PluginHostApiAuthorityIdentity): ActiveSession => {
    let session: ActiveSession | undefined;
    const binding = factory.create({
      identity,
      isCurrent: () => !disposed && session?.active === true && sessions.get(sessionId) === session,
    });
    const detachEmitter = binding.attachEmitter(
      (event) => !disposed && session?.active === true && native.emitEvent(sessionId, event),
    );
    session = { identity, binding, detachEmitter, active: true };
    sessions.set(sessionId, session);
    return session;
  };

  return Object.freeze({
    dispatch(payload: unknown): boolean {
      if (disposed) return false;
      const event = parseDispatch(payload);
      if (event === undefined || pending.has(event.dispatch_id)) return false;
      const existing = sessions.get(event.session_id);
      if (existing !== undefined && !sameIdentity(existing.identity, event.identity)) {
        disposeSession(event.session_id);
        failSafely(event.dispatch_id);
        return false;
      }
      const session = existing ?? createSession(event.session_id, event.identity);
      const operation: PendingDispatch = {
        sessionId: event.session_id,
        controller: new AbortController(),
      };
      pending.set(event.dispatch_id, operation);
      void Promise.resolve(session.binding.execute(event.request, operation.controller.signal))
        .then(async (output) => {
          if (disposed || operation.controller.signal.aborted || pending.get(event.dispatch_id) !== operation) return;
          const settlement = preparePluginRuntimeTransportSettlement(output);
          const accepted = await native.settle(event.dispatch_id, settlement.response);
          if (disposed || operation.controller.signal.aborted || pending.get(event.dispatch_id) !== operation) return;
          pending.delete(event.dispatch_id);
          if (accepted) settlement.effect?.();
        })
        .catch(async () => {
          if (disposed || operation.controller.signal.aborted || pending.get(event.dispatch_id) !== operation) return;
          pending.delete(event.dispatch_id);
          failSafely(event.dispatch_id);
        });
      return true;
    },
    cancel(payload: unknown): boolean {
      if (disposed) return false;
      const event = parseCancel(payload);
      const operation = event === undefined ? undefined : pending.get(event.dispatch_id);
      if (event === undefined || operation?.sessionId !== event.session_id) return false;
      pending.delete(event.dispatch_id);
      operation.controller.abort();
      return true;
    },
    disconnect(payload: unknown): boolean {
      if (disposed) return false;
      const event = parseDisconnect(payload);
      if (event === undefined || !sessions.has(event.session_id)) return false;
      disposeSession(event.session_id);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const sessionId of [...sessions.keys()]) disposeSession(sessionId);
    },
  });
};

const desktopNativePort = (): PluginChildWebviewHostNativePort =>
  Object.freeze({
    settle: (dispatchId: string, output: HostApiResult | HostApiError) =>
      invoke<boolean>(SETTLE_PLUGIN_CHILD_WEBVIEW_HOST_DISPATCH_COMMAND, {
        request: {
          contract_version: PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION,
          dispatch_id: dispatchId,
          output,
        },
      }),
    fail: (dispatchId: string) =>
      invoke<boolean>(FAIL_PLUGIN_CHILD_WEBVIEW_HOST_DISPATCH_COMMAND, {
        request: {
          contract_version: PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION,
          dispatch_id: dispatchId,
        },
      }),
    emitEvent(sessionId: string, event: HostApiEvent) {
      void invoke<boolean>(EMIT_PLUGIN_CHILD_WEBVIEW_HOST_EVENT_COMMAND, {
        request: {
          contract_version: PLUGIN_CHILD_WEBVIEW_HOST_ADAPTER_VERSION,
          session_id: sessionId,
          event,
        },
      });
      return true;
    },
  });

export const startPluginChildWebviewHostDispatcherDesktopAdapter = async (
  factory: PluginHostApiDispatcherFactory,
): Promise<() => void> => {
  const controller = createPluginChildWebviewHostDispatcherController(factory, desktopNativePort());
  const unlisten: UnlistenFn[] = [];
  try {
    unlisten.push(
      await listen<unknown>(PLUGIN_CHILD_WEBVIEW_HOST_DISPATCH_EVENT, ({ payload }) => {
        controller.dispatch(payload);
      }),
    );
    unlisten.push(
      await listen<unknown>(PLUGIN_CHILD_WEBVIEW_HOST_CANCEL_EVENT, ({ payload }) => {
        controller.cancel(payload);
      }),
    );
    unlisten.push(
      await listen<unknown>(PLUGIN_CHILD_WEBVIEW_HOST_DISCONNECT_EVENT, ({ payload }) => {
        controller.disconnect(payload);
      }),
    );
  } catch (error) {
    for (const detach of unlisten) detach();
    controller.dispose();
    throw error;
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const detach of unlisten) detach();
    controller.dispose();
  };
};
