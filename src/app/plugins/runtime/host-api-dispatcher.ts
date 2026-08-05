import {
  HOST_API_METHOD_CATALOG,
  type HostApiError,
  type HostApiEvent,
  type HostApiMethod,
  type HostApiRequest,
  type HostApiResult,
  PLUGIN_HOST_API_VERSION,
  type PluginRuntimeContext,
  type PluginRuntimeLocale,
  type PluginRuntimeTheme,
  validateHostApiRequest,
  validateHostApiResult,
  validatePluginRuntimeContext,
} from '@lensx/plugin-contract';

import type { LauncherActionService } from '../../launcher/actions';
import type { HostPageTarget } from '../../navigation';
import {
  PLUGIN_PERMISSION_CATALOG,
  PluginClipboardBoundaryError,
  type PluginClipboardProviderFactory,
  type PluginClipboardRequest,
} from '../permission';
import {
  PLUGIN_SCOPED_STORAGE_METHODS,
  PluginScopedStorageBoundaryError,
  type PluginScopedStorageProviderFactory,
  type PluginScopedStorageRequest,
} from '../storage';
import type { PluginRuntimeSessionIdentity } from './session-contract';
import {
  createPluginRuntimeTransportPostResponseOutcome,
  type PluginRuntimeTransportHandler,
} from './transport-adapter';

const BASE_IMPLEMENTED_METHODS = Object.freeze([
  'actions.open',
  'runtime.get_context',
  'ui.close',
] as const satisfies readonly HostApiMethod[]);
const baseImplementedMethodSet = new Set<HostApiMethod>(BASE_IMPLEMENTED_METHODS);
const storageMethodSet = new Set<HostApiMethod>(PLUGIN_SCOPED_STORAGE_METHODS);
const clipboardMethodSet = new Set<HostApiMethod>(['clipboard.read', 'clipboard.write']);
const catalogMethodSet = new Set<HostApiMethod>(HOST_API_METHOD_CATALOG.map(({ method }) => method));

const errors = Object.freeze({
  cancelled: Object.freeze({ code: 'cancelled', message: 'The Host API request was cancelled.' }),
  internal: Object.freeze({ code: 'internal_error', message: 'The Host API request failed.' }),
  conflict: Object.freeze({ code: 'conflict', message: 'The Host API request conflicted with current state.' }),
  invalidParams: Object.freeze({ code: 'invalid_params', message: 'The Host API parameters are invalid.' }),
  methodNotFound: Object.freeze({ code: 'method_not_found', message: 'The Host API method was not found.' }),
  limitExceeded: Object.freeze({ code: 'limit_exceeded', message: 'The Host API limit was exceeded.' }),
  notFound: Object.freeze({ code: 'not_found', message: 'The requested Host resource was not found.' }),
  permissionDenied: Object.freeze({ code: 'permission_denied', message: 'The Host API permission was denied.' }),
  unavailable: Object.freeze({ code: 'unavailable', message: 'The Host API is unavailable.' }),
}) satisfies Readonly<Record<string, HostApiError>>;

export interface PluginHostApiContextState {
  readonly locale: PluginRuntimeLocale;
  readonly theme: PluginRuntimeTheme;
}

export interface PluginHostApiContextSource {
  readonly snapshot: () => PluginHostApiContextState;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface MutablePluginHostApiContextSource extends PluginHostApiContextSource {
  readonly update: (state: PluginHostApiContextState) => void;
}

export interface PluginHostApiNavigation {
  readonly isActivePage: (target: HostPageTarget) => boolean;
  readonly closePageIfMatches: (target: HostPageTarget) => boolean;
}

export interface PluginHostApiDispatcherDependencies {
  readonly actions: LauncherActionService;
  readonly context: PluginHostApiContextSource;
  readonly navigation: PluginHostApiNavigation;
  readonly storage?: PluginScopedStorageProviderFactory;
  readonly clipboard?: PluginClipboardProviderFactory;
}

export interface CreatePluginHostApiDispatcherBindingInput {
  readonly identity: PluginRuntimeSessionIdentity;
  readonly isCurrent: () => boolean;
}

export interface PluginHostApiDispatcherBinding {
  readonly handler: PluginRuntimeTransportHandler;
  readonly attachEmitter: (emit: (event: HostApiEvent) => boolean) => () => void;
  readonly dispose: () => void;
}

export interface PluginHostApiDispatcherFactory {
  readonly create: (input: CreatePluginHostApiDispatcherBindingInput) => PluginHostApiDispatcherBinding;
}

const freezeContextState = (state: PluginHostApiContextState): PluginHostApiContextState => {
  if ((state.locale !== 'en-US' && state.locale !== 'zh-CN') || (state.theme !== 'light' && state.theme !== 'dark')) {
    throw new TypeError('Invalid Host-owned Runtime Context state.');
  }
  return Object.freeze({ locale: state.locale, theme: state.theme });
};

export const createMutablePluginHostApiContextSource = (
  initialState: PluginHostApiContextState,
): MutablePluginHostApiContextSource => {
  let state = freezeContextState(initialState);
  const listeners = new Set<() => void>();
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(nextState: PluginHostApiContextState) {
      const next = freezeContextState(nextState);
      if (next.locale === state.locale && next.theme === state.theme) return;
      state = next;
      for (const listener of listeners) listener();
    },
  });
};

const sameContext = (left: PluginRuntimeContext, right: PluginRuntimeContext): boolean =>
  left.hostApiVersion === right.hostApiVersion &&
  left.locale === right.locale &&
  left.theme === right.theme &&
  left.capabilities.length === right.capabilities.length &&
  left.capabilities.every((method, index) => method === right.capabilities[index]);

const invalidRequestError = (request: unknown): HostApiError => {
  if (request !== null && typeof request === 'object' && !Array.isArray(request)) {
    const method = (request as { readonly method?: unknown }).method;
    if (typeof method === 'string' && catalogMethodSet.has(method as HostApiMethod)) return errors.invalidParams;
  }
  return errors.methodNotFound;
};

const validateResult = (result: HostApiResult): HostApiResult | HostApiError =>
  validateHostApiResult(result).status === 'valid' ? result : errors.internal;

const availableMethods = (
  identity: PluginRuntimeSessionIdentity,
  storageAvailable: boolean,
  clipboardAvailable: boolean,
): readonly HostApiMethod[] =>
  Object.freeze(
    HOST_API_METHOD_CATALOG.flatMap(({ method, permission }) =>
      (baseImplementedMethodSet.has(method) ||
        (storageAvailable && storageMethodSet.has(method)) ||
        (clipboardAvailable &&
          clipboardMethodSet.has(method) &&
          permission !== null &&
          PLUGIN_PERMISSION_CATALOG.some(
            (entry) => entry.permission_id === permission && entry.supported && entry.methods.includes(method),
          ))) &&
      (permission === null || identity.granted_permission_ids.includes(permission))
        ? [method]
        : [],
    ),
  );

const createContextSnapshot = (
  source: PluginHostApiContextSource,
  identity: PluginRuntimeSessionIdentity,
  storageAvailable: boolean,
  clipboardAvailable: boolean,
): PluginRuntimeContext => {
  const state = source.snapshot();
  const validation = validatePluginRuntimeContext({
    hostApiVersion: PLUGIN_HOST_API_VERSION,
    locale: state.locale,
    theme: state.theme,
    capabilities: availableMethods(identity, storageAvailable, clipboardAvailable),
  });
  if (validation.status === 'invalid') throw new TypeError('Invalid Host-owned Runtime Context snapshot.');
  return validation.value;
};

const isAvailable = (disposed: boolean, isCurrent: () => boolean, signal: AbortSignal): HostApiError | undefined => {
  if (signal.aborted) return errors.cancelled;
  if (disposed || !isCurrent()) return errors.unavailable;
  return undefined;
};

export const createPluginHostApiDispatcherFactory = (
  dependencies: PluginHostApiDispatcherDependencies,
): PluginHostApiDispatcherFactory =>
  Object.freeze({
    create({ identity, isCurrent }: CreatePluginHostApiDispatcherBindingInput) {
      let disposed = false;
      let emitter: ((event: HostApiEvent) => boolean) | undefined;
      let emitterAttached = false;
      let latestContext: PluginRuntimeContext | undefined;
      const storage = dependencies.storage?.create({ identity, isCurrent });
      const clipboard = dependencies.clipboard?.create({ identity, isCurrent });

      const readContext = (): PluginRuntimeContext => {
        const context = createContextSnapshot(
          dependencies.context,
          identity,
          storage?.available() ?? false,
          clipboard?.available() ?? false,
        );
        latestContext = context;
        return context;
      };

      try {
        latestContext = readContext();
      } catch {
        latestContext = undefined;
      }

      const publishContext = () => {
        if (disposed || !isCurrent()) return;
        try {
          const previous = latestContext;
          const next = createContextSnapshot(
            dependencies.context,
            identity,
            storage?.available() ?? false,
            clipboard?.available() ?? false,
          );
          latestContext = next;
          if (previous && sameContext(previous, next)) return;
          emitter?.(Object.freeze({ event: 'runtime.context_changed', payload: next }));
        } catch {
          // Invalid Host state is contained and never emitted to a plugin.
        }
      };
      const unsubscribeContext = dependencies.context.subscribe(publishContext);
      const unsubscribeStorage = storage?.subscribeAvailability(publishContext) ?? (() => undefined);
      const unsubscribeClipboard = clipboard?.subscribeAvailability(publishContext) ?? (() => undefined);

      const handler: PluginRuntimeTransportHandler = async ({ request: requestInput, signal }) => {
        const unavailable = isAvailable(disposed, isCurrent, signal);
        if (unavailable) return unavailable;

        const validation = validateHostApiRequest(requestInput);
        if (validation.status === 'invalid') return invalidRequestError(requestInput);
        const request: HostApiRequest = validation.value;

        try {
          switch (request.method) {
            case 'runtime.get_context': {
              const current = isAvailable(disposed, isCurrent, signal);
              if (current) return current;
              return validateResult({ method: request.method, result: readContext() });
            }
            case 'ui.close': {
              const target = Object.freeze({ owner_id: identity.plugin_id, page_id: identity.page_id });
              if (!dependencies.navigation.isActivePage(target)) return errors.notFound;
              const current = isAvailable(disposed, isCurrent, signal);
              if (current) return current;
              return createPluginRuntimeTransportPostResponseOutcome(
                validateResult({ method: request.method, result: { accepted: true } }),
                () => {
                  if (isAvailable(disposed, isCurrent, signal)) return;
                  dependencies.navigation.closePageIfMatches(target);
                },
              );
            }
            case 'actions.open': {
              const current = isAvailable(disposed, isCurrent, signal);
              if (current) return current;
              const actionId = `${identity.plugin_id}.${request.params.actionId}`;
              const descriptor = dependencies.actions.registry
                .snapshot()
                .find(({ action_id: candidate }) => candidate === actionId);
              if (!descriptor || descriptor.owner_id !== identity.plugin_id || !descriptor.enabled)
                return errors.notFound;
              const result = await dependencies.actions.dispatcher.dispatch(actionId);
              const completed = isAvailable(disposed, isCurrent, signal);
              if (completed) return completed;
              if (result.ok) return validateResult({ method: request.method, result: { opened: true } });
              return result.error.code === 'action_execution_failed' ? errors.internal : errors.notFound;
            }
            case 'storage.delete':
            case 'storage.get':
            case 'storage.get_quota':
            case 'storage.list':
            case 'storage.set': {
              if (!storage?.available()) return errors.unavailable;
              const current = isAvailable(disposed, isCurrent, signal);
              if (current) return current;
              try {
                const result = await storage.execute(request as PluginScopedStorageRequest, signal);
                const completed = isAvailable(disposed, isCurrent, signal);
                if (completed) return completed;
                return validateResult(result);
              } catch (error) {
                if (!(error instanceof PluginScopedStorageBoundaryError)) return errors.internal;
                return error.code === 'cancelled'
                  ? errors.cancelled
                  : error.code === 'conflict'
                    ? errors.conflict
                    : error.code === 'invalid_params'
                      ? errors.invalidParams
                      : error.code === 'limit_exceeded'
                        ? errors.limitExceeded
                        : error.code === 'unavailable'
                          ? errors.unavailable
                          : errors.internal;
              }
            }
            case 'clipboard.read':
            case 'clipboard.write': {
              const requiredPermission = HOST_API_METHOD_CATALOG.find(
                ({ method }) => method === request.method,
              )?.permission;
              if (!requiredPermission || !identity.granted_permission_ids.includes(requiredPermission)) {
                return errors.permissionDenied;
              }
              if (!clipboard?.available()) return errors.unavailable;
              const current = isAvailable(disposed, isCurrent, signal);
              if (current) return current;
              try {
                const result = await clipboard.execute(request as PluginClipboardRequest, signal);
                const completed = isAvailable(disposed, isCurrent, signal);
                if (completed) return completed;
                return validateResult(result);
              } catch (error) {
                if (!(error instanceof PluginClipboardBoundaryError)) return errors.internal;
                return error.code === 'cancelled'
                  ? errors.cancelled
                  : error.code === 'permission_denied'
                    ? errors.permissionDenied
                    : error.code === 'limit_exceeded'
                      ? errors.limitExceeded
                      : error.code === 'unavailable'
                        ? errors.unavailable
                        : errors.internal;
              }
            }
          }
        } catch {
          return errors.internal;
        }
      };

      const binding: PluginHostApiDispatcherBinding = Object.freeze({
        handler,
        attachEmitter(nextEmitter: (event: HostApiEvent) => boolean) {
          if (disposed || emitterAttached) throw new TypeError('Plugin Host API emitter is unavailable.');
          emitterAttached = true;
          emitter = nextEmitter;
          let attached = true;
          return () => {
            if (!attached) return;
            attached = false;
            if (emitter === nextEmitter) emitter = undefined;
          };
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          emitter = undefined;
          unsubscribeContext();
          unsubscribeStorage();
          unsubscribeClipboard();
          storage?.dispose();
          clipboard?.dispose();
        },
      });
      return binding;
    },
  });

export const unavailablePluginHostApiDispatcherFactory: PluginHostApiDispatcherFactory = Object.freeze({
  create() {
    let disposed = false;
    return Object.freeze({
      handler: () => (disposed ? errors.cancelled : errors.unavailable),
      attachEmitter: () => () => undefined,
      dispose: () => {
        disposed = true;
      },
    });
  },
});
