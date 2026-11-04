import { Typography } from '@douyinfe/semi-ui';
import { Input } from '@douyinfe/semi-ui/lib/es/input';
import {
  type ChangeEvent,
  type CompositionEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { type AppMessageKey, useAppLocale } from './app/i18n';
import { ActionSearchResults, getLauncherActionOptionId } from './app/launcher/ActionSearchResults';
import {
  LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0,
  type LauncherActionDispatchErrorCode,
  type LauncherActionService,
  normalizeLauncherActionSearchQuery,
  productionLauncherActionService,
  searchLauncherActions,
} from './app/launcher/actions';
import {
  type NativeActionInvocationPort,
  startNativeActionInvocations,
} from './app/launcher/actions/native-invocations';
import { desktopLauncherActivationSource, type LauncherActivationSource } from './app/launcher/activation';
import {
  desktopLauncherActionCollectionsClient,
  EMPTY_LAUNCHER_ACTION_COLLECTIONS,
  type LauncherActionCollections,
  type LauncherActionCollectionsClient,
  resolveLauncherActionCollection,
} from './app/launcher/collections';
import { LauncherHome } from './app/launcher/LauncherHome';
import {
  inertLauncherSurfaceController,
  type LauncherSurfaceController,
  type LauncherSurfaceLease,
  type LauncherSurfaceTarget,
  launcherSurfaceTargetKey,
} from './app/launcher/surface';
import { useLauncherActivation } from './app/launcher/useLauncherActivation';
import {
  inertLauncherWindowDragController,
  isLauncherWindowDragExcluded,
  type LauncherWindowDragController,
} from './app/launcher/windowDrag';
import {
  type ActivePage,
  type AppNavigationService,
  PageContextBar,
  type PageResolution,
  productionAppNavigationService,
  resolvePageContext,
} from './app/navigation';
import { PageErrorBoundary } from './app/pages/PageErrorBoundary';
import { SettingsPage } from './app/pages/SettingsPage';
import { inertPluginManagementService, type PluginManagementService } from './app/plugins/management';
import { desktopPluginResourceAdapter } from './app/plugins/resource';
import {
  createMutablePluginHostApiContextSource,
  createPluginHostApiDispatcherFactory,
  createPluginPageRuntimeResolver,
  createPluginRuntimeLifecycleService,
  desktopPluginChildWebviewPresentationController,
  type PluginChildWebviewPresentationController,
  type PluginHostApiDispatcherFactory,
  type PluginPageRuntimeResolver,
  PluginRuntimeInstanceRegistry,
  type PluginRuntimeLifecycleService,
  PluginRuntimeSlot,
  startPluginChildWebviewHostDispatcherDesktopAdapter,
} from './app/plugins/runtime';
import { desktopPluginScopedStorageProviderFactory } from './app/plugins/storage';
import type { PluginSurfaceProjectionService } from './app/plugins/surfaces';
import { type AppPreferencesClient, desktopAppPreferencesClient } from './app/preferences';
import { desktopShortcutService, type ShortcutService, unavailableShortcutService } from './app/shortcuts';
import { useAppTheme } from './app/theme';
import { reportHostWindowFailure } from './app/windows/diagnostics';
import { HostWindowCoordinator } from './app/windows/host-window-coordinator';
import { desktopHostWindowPort, type HostWindowPort } from './app/windows/host-window-protocol';
import { PluginWindowRecoveryControls } from './app/windows/PluginWindowControls';
import { usePluginWindowControls } from './app/windows/usePluginWindowControls';

export interface AppProps {
  activationSource?: LauncherActivationSource;
  actionService?: LauncherActionService;
  nativeActionInvocationPort?: NativeActionInvocationPort;
  collectionsClient?: LauncherActionCollectionsClient;
  navigationService?: AppNavigationService;
  preferencesClient?: AppPreferencesClient;
  shortcutsService?: ShortcutService;
  pluginChildWebviewPresentationController?: PluginChildWebviewPresentationController;
  pluginRuntimeLifecycleService?: PluginRuntimeLifecycleService;
  pluginRuntimeResolver?: PluginPageRuntimeResolver;
  pluginHostApiDispatcherFactory?: PluginHostApiDispatcherFactory;
  enablePluginChildWebviewHostDispatcher?: boolean;
  hostWindowPort?: HostWindowPort;
  pluginManagementService?: PluginManagementService;
  renderPage?: (activePage: ActivePage) => ReactNode;
  surfaceProjectionService?: PluginSurfaceProjectionService;
  startupPreferencesErrorCode?: string;
  surfaceController?: LauncherSurfaceController;
  windowDragController?: LauncherWindowDragController;
}

const ACTION_RESULTS_LISTBOX_ID = 'launcher-action-results';
const LAUNCHER_STATUS_ID = 'launcher-status';
const SEARCH_GRID_COLUMN_COUNT = 4;

const dispatchFailureMessageKeys: Record<LauncherActionDispatchErrorCode, AppMessageKey> = {
  action_not_found: 'launcher.search.failure.actionNotFound',
  action_unavailable: 'launcher.search.failure.actionUnavailable',
  action_execution_failed: 'launcher.search.failure.actionExecutionFailed',
};

interface DispatchFeedback {
  readonly kind: 'error' | 'success';
  readonly messageKey: AppMessageKey;
}

const App = ({
  activationSource = desktopLauncherActivationSource,
  actionService = productionLauncherActionService,
  nativeActionInvocationPort,
  collectionsClient = desktopLauncherActionCollectionsClient,
  navigationService = productionAppNavigationService,
  preferencesClient = desktopAppPreferencesClient,
  shortcutsService,
  pluginChildWebviewPresentationController = desktopPluginChildWebviewPresentationController,
  pluginRuntimeLifecycleService,
  pluginRuntimeResolver,
  pluginHostApiDispatcherFactory,
  enablePluginChildWebviewHostDispatcher = false,
  hostWindowPort = desktopHostWindowPort,
  pluginManagementService = inertPluginManagementService,
  renderPage,
  startupPreferencesErrorCode,
  surfaceController = inertLauncherSurfaceController,
  surfaceProjectionService,
  windowDragController = inertLauncherWindowDragController,
}: AppProps) => {
  const { t } = useTranslation();
  const effectiveShortcutsService =
    shortcutsService ?? (enablePluginChildWebviewHostDispatcher ? desktopShortcutService : unavailableShortcutService);
  const { locale } = useAppLocale();
  const { themeMode } = useAppTheme();
  const [activePage, setActivePage] = useState<ActivePage>();
  const [activePageAttemptId, setActivePageAttemptId] = useState<`page_attempt_${number}`>();
  const [query, setQuery] = useState('');
  const [selectedActionId, setSelectedActionId] = useState<string>();
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string>();
  const [dispatchFeedback, setDispatchFeedback] = useState<DispatchFeedback>();
  const [collectionsFeedbackKey, setCollectionsFeedbackKey] = useState<AppMessageKey>();
  const [collections, setCollections] = useState<LauncherActionCollections>(EMPTY_LAUNCHER_ACTION_COLLECTIONS);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [pageRevision, setPageRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const semiInputRef = useRef<Input>(null);
  const committedQueryRef = useRef('');
  const isComposingRef = useRef(false);
  const retiredCompositionRef = useRef(false);
  const acceptsCompositionEndRef = useRef(false);
  const staleCompositionValueRef = useRef<string | undefined>(undefined);
  const inputMountedRef = useRef(true);
  const pendingActionIdRef = useRef<string | undefined>(undefined);
  const shouldRestoreInputFocusRef = useRef(false);
  const lastPresentationTargetKeyRef = useRef<string | undefined>(undefined);
  const pageAttemptSequenceRef = useRef(0);
  const activePageRef = useRef<ActivePage | undefined>(undefined);
  const collectionsMutationRevisionRef = useRef(0);
  const collectionsMutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const focusLauncherInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const resetQuery = useCallback(() => {
    if (isComposingRef.current) {
      staleCompositionValueRef.current = inputRef.current?.value;
    }
    isComposingRef.current = false;
    retiredCompositionRef.current = true;
    acceptsCompositionEndRef.current = false;
    committedQueryRef.current = '';
    // Semi's unchanged controlled value cannot clear an internal draft or its
    // composition flag. Reset those input-local facts without replacing the DOM.
    if (semiInputRef.current) {
      semiInputRef.current.foundation.compositionEnter = false;
      semiInputRef.current.foundation.setValue('');
    }
    setQuery('');
    setSelectedActionId(undefined);
  }, []);

  useEffect(() => {
    inputMountedRef.current = true;
    return () => {
      inputMountedRef.current = false;
      isComposingRef.current = false;
      retiredCompositionRef.current = true;
      acceptsCompositionEndRef.current = false;
      staleCompositionValueRef.current = undefined;
    };
  }, []);

  const registrySnapshot = useMemo(() => {
    void snapshotRevision;
    return actionService.registry.snapshot();
  }, [actionService, snapshotRevision]);
  const effectivePluginRuntimeResolver = useMemo(
    () =>
      pluginRuntimeResolver ??
      (surfaceProjectionService
        ? createPluginPageRuntimeResolver({
            resourceAdapter: desktopPluginResourceAdapter,
            surfaceProjectionService,
          })
        : undefined),
    [pluginRuntimeResolver, surfaceProjectionService],
  );
  const effectivePluginRuntimeLifecycleService = useMemo(
    () => pluginRuntimeLifecycleService ?? createPluginRuntimeLifecycleService(),
    [pluginRuntimeLifecycleService],
  );
  const instanceRegistry = useMemo(
    () =>
      new PluginRuntimeInstanceRegistry(
        effectivePluginRuntimeLifecycleService,
        enablePluginChildWebviewHostDispatcher
          ? (attemptId, reason, owner) =>
              ['navigation', 'retry', 'failure'].includes(reason)
                ? hostWindowPort.replaceInstance(attemptId, owner)
                : hostWindowPort.closeInstance(attemptId)
          : undefined,
      ),
    [effectivePluginRuntimeLifecycleService, enablePluginChildWebviewHostDispatcher, hostWindowPort],
  );
  const windowCoordinatorRef = useRef<HostWindowCoordinator | undefined>(undefined);
  const preferenceSnapshotRef = useRef({ locale, themeMode });
  preferenceSnapshotRef.current = { locale, themeMode };
  const [surfaceLease, setSurfaceLease] = useState<LauncherSurfaceLease>();
  const [detachmentPending, setDetachmentPending] = useState(false);
  const reconcilePluginWindows = useCallback(async () => {
    await windowCoordinatorRef.current?.reconcile();
  }, []);
  const pluginWindowControls = usePluginWindowControls({
    enabled: enablePluginChildWebviewHostDispatcher,
    port: hostWindowPort,
    instances: instanceRegistry,
    transferPending: detachmentPending,
    reconcile: reconcilePluginWindows,
  });
  const mainInteractionFrozen = detachmentPending || pluginWindowControls.interactionFrozen;
  const mainNavigationSequenceRef = useRef(0);
  const nativePageAttemptsRef = useRef(new Map<string, `page_attempt_${number}`>());
  const renderWaitersRef = useRef(new Set<() => void>());
  const [, requestRender] = useState(0);
  const awaitMainRender = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        const finish = () => {
          clearTimeout(timer);
          renderWaitersRef.current.delete(finish);
          resolve();
        };
        const timer = setTimeout(() => {
          renderWaitersRef.current.delete(finish);
          reject(new Error('Host presentation did not acknowledge.'));
        }, 10_000);
        renderWaitersRef.current.add(finish);
        requestRender((value) => value + 1);
      }),
    [],
  );
  useLayoutEffect(() => {
    for (const complete of [...renderWaitersRef.current]) complete();
  });
  useEffect(
    () => () => {
      for (const complete of [...renderWaitersRef.current]) complete();
    },
    [],
  );
  useEffect(() => {
    if (!enablePluginChildWebviewHostDispatcher || !effectivePluginRuntimeResolver) return;
    const coordinator = new HostWindowCoordinator({
      port: hostWindowPort,
      navigation: navigationService,
      instances: instanceRegistry,
      actions: actionService.registry,
      resolver: effectivePluginRuntimeResolver,
      mainPresentation: pluginChildWebviewPresentationController,
      awaitMainRender,
      suspendMainPresentation: () => {
        surfaceController.suspend?.();
        setDetachmentPending(true);
        setSurfaceLease(undefined);
      },
      resumeMainPresentation: () => setDetachmentPending(false),
      onOperationSettled: pluginWindowControls.observeOperation,
    });
    windowCoordinatorRef.current = coordinator;
    void coordinator.start().catch(() => undefined);
    coordinator.updatePreferences(preferenceSnapshotRef.current.locale, preferenceSnapshotRef.current.themeMode);
    return () => {
      coordinator.dispose();
      if (windowCoordinatorRef.current === coordinator) windowCoordinatorRef.current = undefined;
    };
  }, [
    enablePluginChildWebviewHostDispatcher,
    effectivePluginRuntimeResolver,
    hostWindowPort,
    navigationService,
    instanceRegistry,
    actionService,
    pluginChildWebviewPresentationController,
    awaitMainRender,
    surfaceController,
    pluginWindowControls.observeOperation,
  ]);
  useEffect(() => {
    windowCoordinatorRef.current?.updatePreferences(locale, themeMode);
  }, [locale, themeMode]);
  useEffect(() => {
    if (enablePluginChildWebviewHostDispatcher)
      void hostWindowPort
        .interaction(activePage?.owner_id === 'lensx.core' && activePage.page_id === 'settings')
        .catch(() => undefined);
  }, [enablePluginChildWebviewHostDispatcher, hostWindowPort, activePage?.owner_id, activePage?.page_id]);
  const [pluginHostApiContextSource] = useState(() =>
    createMutablePluginHostApiContextSource({ locale, theme: themeMode }),
  );
  const productionPluginHostApiDispatcherFactory = useMemo(
    () =>
      createPluginHostApiDispatcherFactory({
        actions: actionService,
        context: pluginHostApiContextSource,
        navigation: navigationService,
        bindActivations: (target, runtimeAttemptId) =>
          runtimeAttemptId === undefined
            ? navigationService.bindActivations(target)
            : navigationService.bindNativeActivations(target, runtimeAttemptId),
        isActivationAttemptCurrent: (target, runtimeAttemptId) =>
          navigationService.isNativeActivationAttemptCurrent(target, runtimeAttemptId),
        storage: desktopPluginScopedStorageProviderFactory,
        nativeHttpAvailable: enablePluginChildWebviewHostDispatcher,
        awaitInstanceStable: enablePluginChildWebviewHostDispatcher
          ? (attemptId, signal) =>
              windowCoordinatorRef.current?.awaitInstanceStable(attemptId, signal) ?? Promise.resolve(false)
          : undefined,
      }),
    [actionService, navigationService, pluginHostApiContextSource, enablePluginChildWebviewHostDispatcher],
  );
  const effectivePluginHostApiDispatcherFactory =
    pluginHostApiDispatcherFactory ?? productionPluginHostApiDispatcherFactory;

  useEffect(() => {
    if (!enablePluginChildWebviewHostDispatcher) return;
    let disposed = false;
    let detach: (() => void) | undefined;
    void startPluginChildWebviewHostDispatcherDesktopAdapter(effectivePluginHostApiDispatcherFactory).then(
      (nextDetach) => {
        if (disposed) nextDetach();
        else detach = nextDetach;
      },
    );
    return () => {
      disposed = true;
      detach?.();
    };
  }, [effectivePluginHostApiDispatcherFactory, enablePluginChildWebviewHostDispatcher]);

  useEffect(() => {
    pluginHostApiContextSource.update({ locale, theme: themeMode });
  }, [locale, pluginHostApiContextSource, themeMode]);

  useEffect(() => {
    const terminateForReload = () => {
      navigationService.clearAll();
      void effectivePluginRuntimeLifecycleService.terminateAll('host_reload');
    };
    window.addEventListener('beforeunload', terminateForReload);
    window.addEventListener('pagehide', terminateForReload);
    return () => {
      window.removeEventListener('beforeunload', terminateForReload);
      window.removeEventListener('pagehide', terminateForReload);
      navigationService.clearAll();
      void effectivePluginRuntimeLifecycleService.terminateAll('app_teardown');
    };
  }, [effectivePluginRuntimeLifecycleService, navigationService]);
  const results = useMemo(
    () =>
      searchLauncherActions({
        query,
        locale,
        snapshot: registrySnapshot,
        limit: LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0,
      }),
    [locale, query, registrySnapshot],
  );
  const recentActions = useMemo(
    () => resolveLauncherActionCollection(collections.recent_action_ids, registrySnapshot),
    [collections.recent_action_ids, registrySnapshot],
  );
  const pinnedActions = useMemo(
    () => resolveLauncherActionCollection(collections.pinned_action_ids, registrySnapshot),
    [collections.pinned_action_ids, registrySnapshot],
  );
  const effectiveSelectedActionId = results.some(({ action_id: actionId }) => actionId === selectedActionId)
    ? selectedActionId
    : results[0]?.action_id;
  const selectedIndex = results.findIndex(({ action_id: actionId }) => actionId === effectiveSelectedActionId);
  const hasSearchQuery = normalizeLauncherActionSearchQuery(query).tokens.length > 0;
  const presentationState = activePage ? ('page' as const) : hasSearchQuery ? ('search' as const) : ('home' as const);
  const pageResolution: PageResolution | undefined = useMemo(() => {
    void pageRevision;
    return activePage ? navigationService.resolvePage(activePage) : undefined;
  }, [activePage, navigationService, pageRevision]);
  const presentationTarget: LauncherSurfaceTarget = useMemo(() => {
    if (!activePage) return hasSearchQuery ? { kind: 'search' } : { kind: 'home' };
    if (pageResolution?.provider.kind === 'plugin' && pageResolution.page.presentation && activePageAttemptId) {
      return {
        kind: 'plugin_page',
        owner_id: pageResolution.page.owner_id,
        page_id: pageResolution.page.page_id,
        page_attempt_id: activePageAttemptId,
        initial_size: pageResolution.page.presentation.initial_size,
        resizable: pageResolution.page.presentation.resizable,
      };
    }
    return { kind: 'host_page' };
  }, [activePage, activePageAttemptId, hasSearchQuery, pageResolution]);
  const pageContext = useMemo(
    () =>
      activePage && pageResolution
        ? resolvePageContext({
            activePage,
            hostOwnerName: t('launcher.page.hostOwner'),
            locale,
            resolution: pageResolution,
            snapshot: registrySnapshot,
          })
        : undefined,
    [activePage, locale, pageResolution, registrySnapshot, t],
  );
  const pageLayout =
    pageResolution?.provider.kind === 'host' &&
    activePage?.owner_id === 'lensx.core' &&
    activePage.page_id === 'settings'
      ? 'settings-split'
      : pageResolution?.provider.kind === 'plugin'
        ? 'plugin-edge-to-edge'
        : undefined;

  const enqueueCollectionMutation = useCallback((operation: () => Promise<LauncherActionCollections>) => {
    const result = collectionsMutationQueueRef.current.then(operation, operation);
    collectionsMutationQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  useEffect(() => {
    let mounted = true;
    const revision = collectionsMutationRevisionRef.current;
    void collectionsClient
      .read()
      .then((confirmed) => {
        if (mounted && revision === collectionsMutationRevisionRef.current) {
          setCollections(confirmed);
        }
      })
      .catch(() => {
        if (mounted && revision === collectionsMutationRevisionRef.current) {
          setCollections(EMPTY_LAUNCHER_ACTION_COLLECTIONS);
          setCollectionsFeedbackKey('launcher.collections.loadFailure');
        }
      });
    return () => {
      mounted = false;
    };
  }, [collectionsClient]);

  useEffect(() => {
    focusLauncherInput();
  }, [focusLauncherInput]);

  useEffect(() => {
    if (surfaceController.prepareNavigation && !surfaceLease) return;
    const targetKey =
      launcherSurfaceTargetKey(presentationTarget) +
      (surfaceLease ? `\0${surfaceLease.hostEpoch}\0${surfaceLease.intentEpoch}` : '');
    if (lastPresentationTargetKeyRef.current === targetKey) return;
    lastPresentationTargetKeyRef.current = targetKey;
    const update = surfaceLease
      ? surfaceController.setPresentationState(
          presentationTarget,
          surfaceLease,
          instanceRegistry.forSurface('main')?.presentation ?? null,
        )
      : surfaceController.setPresentationState(presentationTarget);
    let current = true;
    void update.catch((error: unknown) => {
      if (!current) return;
      lastPresentationTargetKeyRef.current = undefined;
      reportHostWindowFailure('main_surface', error);
    });
    return () => {
      current = false;
    };
  }, [presentationTarget, surfaceController, surfaceLease, instanceRegistry]);

  useEffect(() => {
    let registered = true;
    const applyPage = (
      page: ActivePage | undefined,
      change?: import('./app/navigation/service').AppNavigationChange,
      lease?: LauncherSurfaceLease,
    ) => {
      if (!registered) return;
      const migration = change?.reason === 'transfer' || change?.reason === 'restore' || change?.reason === 'metadata';
      shouldRestoreInputFocusRef.current = !page && !migration;
      if (
        !page ||
        page.owner_id !== activePageRef.current?.owner_id ||
        page.page_id !== activePageRef.current?.page_id
      ) {
        const retainedId = change?.nativeAttemptId
          ? nativePageAttemptsRef.current.get(change.nativeAttemptId)
          : undefined;
        setActivePageAttemptId(
          page ? (retainedId ?? (`page_attempt_${++pageAttemptSequenceRef.current}` as const)) : undefined,
        );
      }
      setSurfaceLease(lease);
      activePageRef.current = page;
      setActivePage(page);
      resetQuery();
      setDispatchFeedback(undefined);
    };
    const handle: import('./app/navigation/service').AppNavigationHandler = (page, change) => {
      const sequence = ++mainNavigationSequenceRef.current;
      if (change?.reason === 'transfer' || change?.reason === 'restore') {
        surfaceController.suspend?.();
        applyPage(page, change);
        return;
      }
      if (!surfaceController.prepareNavigation) {
        applyPage(page, change);
        return;
      }
      const previous = instanceRegistry.forSurface('main');
      const replacement =
        previous &&
        (!page || page.owner_id !== previous.descriptor.plugin_id || page.page_id !== previous.descriptor.page_id);
      void Promise.resolve(replacement ? previous.attempt.terminate('navigation') : undefined)
        .then(() => surfaceController.prepareNavigation?.())
        .then((lease) => {
          if (registered && mainNavigationSequenceRef.current === sequence) applyPage(page, change, lease);
        })
        .catch((error: unknown) => {
          if (registered && mainNavigationSequenceRef.current === sequence)
            reportHostWindowFailure('main_navigation', error);
        });
    };
    const unsubscribe = navigationService.registerHandler(handle);
    if (!navigationService.getActivePage() && surfaceController.prepareNavigation)
      handle(undefined, { surfaceId: 'main', reason: 'metadata' });
    return () => {
      registered = false;
      ++mainNavigationSequenceRef.current;
      unsubscribe();
    };
  }, [navigationService, resetQuery, surfaceController, instanceRegistry]);

  useEffect(() => {
    const unsubscribe = navigationService.subscribeToPages(() => setPageRevision((revision) => revision + 1));
    return () => {
      unsubscribe();
    };
  }, [navigationService]);

  useEffect(
    () => actionService.registry.subscribe?.(() => setSnapshotRevision((revision) => revision + 1)),
    [actionService],
  );

  useEffect(() => {
    if (!activePage && shouldRestoreInputFocusRef.current) {
      shouldRestoreInputFocusRef.current = false;
      focusLauncherInput();
    }
  }, [activePage, focusLauncherInput]);

  useEffect(() => {
    setSelectedActionId(results[0]?.action_id);
  }, [results]);

  const handleLauncherActivation = useCallback(() => {
    void windowCoordinatorRef.current?.reconcile();
    focusLauncherInput();
    if (surfaceProjectionService) {
      void surfaceProjectionService.handleLauncherActivation().finally(() => {
        setSnapshotRevision((revision) => revision + 1);
        setPageRevision((revision) => revision + 1);
      });
    } else {
      setSnapshotRevision((revision) => revision + 1);
    }
  }, [focusLauncherInput, surfaceProjectionService]);

  useLauncherActivation(activationSource, handleLauncherActivation);

  const recordSuccessfulUse = useCallback(
    (actionId: string) => {
      collectionsMutationRevisionRef.current += 1;
      void enqueueCollectionMutation(() => collectionsClient.recordUse(actionId))
        .then((confirmed) => {
          setCollections(confirmed);
        })
        .catch(() => {
          setCollectionsFeedbackKey('launcher.collections.syncFailure');
        });
    },
    [collectionsClient, enqueueCollectionMutation],
  );

  useEffect(
    () => actionService.dispatcher.subscribeSuccessfulInvocations?.(recordSuccessfulUse),
    [actionService, recordSuccessfulUse],
  );

  useEffect(() => {
    void effectiveShortcutsService
      .updateTargets(registrySnapshot.filter((action) => action.enabled).map((action) => action.action_id))
      .catch(() => undefined);
  }, [effectiveShortcutsService, registrySnapshot]);

  useEffect(() => {
    const reportFailure = () =>
      setDispatchFeedback({ kind: 'error', messageKey: 'launcher.search.failure.actionExecutionFailed' });
    const unsubscribe = navigationService.subscribeActivationFailures((_code, instance) => {
      if (instance?.attemptId) {
        void instanceRegistry.forAttempt(instance.attemptId)?.attempt.fail('runtime_unavailable');
        if (instance.surfaceId !== 'main') return;
      } else void effectivePluginRuntimeLifecycleService.failCurrent?.('runtime_unavailable');
      reportHostWindowFailure('activation');
    });
    if (!enablePluginChildWebviewHostDispatcher && !nativeActionInvocationPort) return unsubscribe;
    let disposed = false;
    let detach: (() => void) | undefined;
    const controller = new AbortController();
    const coordinatedActions: LauncherActionService = {
      registry: actionService.registry,
      dispatcher: {
        dispatch: (id, current, context) => actionService.dispatcher.dispatch(id, current, context),
        dispatchShortcut: actionService.dispatcher.dispatchShortcut
          ? async (id, current) => {
              if (windowCoordinatorRef.current) await windowCoordinatorRef.current.reconcile();
              const dispatch = actionService.dispatcher.dispatchShortcut;
              if (!dispatch) throw new Error('Action shortcut is unavailable.');
              return dispatch.call(actionService.dispatcher, id, current);
            }
          : undefined,
      },
    };
    void startNativeActionInvocations(coordinatedActions, reportFailure, nativeActionInvocationPort, controller.signal)
      .then((next) => {
        if (disposed) next();
        else detach = next;
      })
      .catch(reportFailure);
    return () => {
      disposed = true;
      controller.abort();
      unsubscribe();
      detach?.();
    };
  }, [
    actionService,
    enablePluginChildWebviewHostDispatcher,
    navigationService,
    effectivePluginRuntimeLifecycleService,
    instanceRegistry,
    nativeActionInvocationPort,
  ]);

  const executeAction = useCallback(
    async (actionId: string) => {
      if (pendingActionIdRef.current || mainInteractionFrozen) {
        return;
      }

      pendingActionIdRef.current = actionId;
      setPendingActionId(actionId);
      setDispatchFeedback(undefined);
      setCollectionsFeedbackKey(undefined);

      try {
        if (windowCoordinatorRef.current) await windowCoordinatorRef.current.reconcile();
        const result = await actionService.dispatcher.dispatch(actionId);
        if (result.ok) {
          resetQuery();
          setDispatchFeedback({
            kind: 'success',
            messageKey: 'launcher.search.success',
          });
          if (!actionService.dispatcher.subscribeSuccessfulInvocations) recordSuccessfulUse(actionId);
        } else {
          setDispatchFeedback({
            kind: 'error',
            messageKey: dispatchFailureMessageKeys[result.error.code],
          });
        }
      } catch {
        setDispatchFeedback({
          kind: 'error',
          messageKey: 'launcher.search.failure.actionExecutionFailed',
        });
      } finally {
        pendingActionIdRef.current = undefined;
        setPendingActionId(undefined);
        if (!activePageRef.current) focusLauncherInput();
      }
    },
    [actionService, focusLauncherInput, recordSuccessfulUse, resetQuery, mainInteractionFrozen],
  );

  const clearSearch = useCallback(() => {
    resetQuery();
    setDispatchFeedback(undefined);
    focusLauncherInput();
  }, [focusLauncherInput, resetQuery]);

  const closeActivePage = useCallback(() => {
    shouldRestoreInputFocusRef.current = true;
    const instance = instanceRegistry.forSurface('main');
    const closing = instance?.presentation ? instanceRegistry.close(instance.presentation.attemptId) : undefined;
    navigationService.closePage();
    void closing;
  }, [navigationService, instanceRegistry]);

  const handleQueryChange = useCallback((value: string, event: ChangeEvent<HTMLInputElement>) => {
    if (!inputMountedRef.current || event.target !== inputRef.current) return;
    const nativeEvent = event.nativeEvent;
    if (
      retiredCompositionRef.current &&
      nativeEvent instanceof InputEvent &&
      (nativeEvent.isComposing || nativeEvent.inputType.includes('Composition'))
    ) {
      staleCompositionValueRef.current = value;
      semiInputRef.current?.foundation.setValue(committedQueryRef.current);
      return;
    }
    if (event.type === 'compositionend') {
      if (!acceptsCompositionEndRef.current) return;
      acceptsCompositionEndRef.current = false;
    } else if (value === staleCompositionValueRef.current) {
      semiInputRef.current?.foundation.setValue(committedQueryRef.current);
      return;
    }
    if (isComposingRef.current) return;
    staleCompositionValueRef.current = undefined;
    if (value === committedQueryRef.current) return;
    committedQueryRef.current = value;
    setQuery(value);
    setDispatchFeedback(undefined);
  }, []);

  const handleCompositionStart = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    if (!inputMountedRef.current || event.target !== inputRef.current) return;
    isComposingRef.current = true;
    retiredCompositionRef.current = false;
    acceptsCompositionEndRef.current = false;
    staleCompositionValueRef.current = undefined;
  }, []);

  const handleCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    if (!inputMountedRef.current || event.target !== inputRef.current) return;
    acceptsCompositionEndRef.current = isComposingRef.current;
    isComposingRef.current = false;
    const value = event.currentTarget.value;
    if (!acceptsCompositionEndRef.current) {
      retiredCompositionRef.current = true;
      staleCompositionValueRef.current = value;
    }
    // Semi sends its final onChange after this notification. Reconcile both
    // cancellation and late ends before that single query commit entry point.
    semiInputRef.current?.foundation.setValue(acceptsCompositionEndRef.current ? value : committedQueryRef.current);
  }, []);

  const handleInputPaste = useCallback(() => {
    staleCompositionValueRef.current = undefined;
  }, []);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (isComposingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
        return;
      }

      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
        staleCompositionValueRef.current = undefined;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        clearSearch();
        return;
      }

      if (results.length === 0) {
        return;
      }

      const currentIndex = Math.max(0, selectedIndex);
      const targetByKey: Partial<Record<string, number>> = {
        ArrowLeft: currentIndex - 1,
        ArrowRight: currentIndex + 1,
        ArrowUp: currentIndex - SEARCH_GRID_COLUMN_COUNT,
        ArrowDown: currentIndex + SEARCH_GRID_COLUMN_COUNT,
      };
      const targetIndex = targetByKey[event.key];
      if (targetIndex !== undefined) {
        event.preventDefault();
        if (targetIndex >= 0 && targetIndex < results.length) {
          setSelectedActionId(results[targetIndex]?.action_id);
        }
        return;
      }

      if (event.key === 'Enter' && effectiveSelectedActionId) {
        event.preventDefault();
        void executeAction(effectiveSelectedActionId);
      }
    },
    [clearSearch, effectiveSelectedActionId, executeAction, results, selectedIndex],
  );

  const handleLauncherDragMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isLauncherWindowDragExcluded(event.target)) {
        return;
      }

      void windowDragController.startDragging().catch((error: unknown) => {
        if (import.meta.env.DEV) {
          console.error('Failed to start dragging the launcher window.', error);
        }
      });
    },
    [windowDragController],
  );

  const searchStatusMessage = pendingActionId
    ? t('launcher.search.executing', {
        title:
          results.find(({ action_id: actionId }) => actionId === pendingActionId)?.title ??
          registrySnapshot.find(({ action_id: actionId }) => actionId === pendingActionId)?.title['en-US'] ??
          '',
      })
    : dispatchFeedback?.kind === 'success'
      ? t(dispatchFeedback.messageKey)
      : hasSearchQuery
        ? results.length > 0
          ? t('launcher.search.resultCount', { count: results.length })
          : t('launcher.search.noResults')
        : '';
  const visibleSearchError =
    dispatchFeedback?.kind === 'error' &&
    !(
      pageResolution?.provider.kind === 'plugin' &&
      dispatchFeedback.messageKey === 'launcher.search.failure.actionExecutionFailed'
    )
      ? t(dispatchFeedback.messageKey)
      : undefined;
  const homeFeedbackMessage = collectionsFeedbackKey
    ? t(collectionsFeedbackKey)
    : startupPreferencesErrorCode
      ? t('launcher.preferences.startupFailure')
      : '';

  const nonSearchFeedbackMessage = presentationState === 'search' ? '' : visibleSearchError || homeFeedbackMessage;

  return (
    <main className="h-screen flex items-center justify-center">
      <section className="launcher-surface h-full max-h-full w-full flex flex-col" data-page-layout={pageLayout}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: native window dragging is pointer-only surface behavior, not a product control */}
        <div
          className="launcher-drag-region w-full flex-none px-4 pt-4 pb-3"
          data-launcher-drag-region="true"
          onMouseDown={handleLauncherDragMouseDown}
        >
          <div className="launcher-top-row flex items-center gap-3">
            {presentationState === 'page' && activePage && pageContext ? (
              <PageContextBar
                closeLabel={t(
                  pageResolution?.provider.kind === 'plugin'
                    ? 'launcher.page.closePluginLabel'
                    : 'launcher.page.closeLabel',
                )}
                context={pageContext}
                onClose={closeActivePage}
              />
            ) : (
              <Input
                aria-activedescendant={
                  effectiveSelectedActionId ? getLauncherActionOptionId(effectiveSelectedActionId) : undefined
                }
                aria-autocomplete="list"
                aria-busy={Boolean(pendingActionId)}
                aria-controls={results.length > 0 ? ACTION_RESULTS_LISTBOX_ID : undefined}
                aria-describedby={LAUNCHER_STATUS_ID}
                aria-expanded={results.length > 0}
                aria-label={t('launcher.inputLabel')}
                autoComplete="off"
                className="launcher-input min-w-0 flex-1"
                composition
                disabled={mainInteractionFrozen}
                forwardRef={inputRef}
                onChange={handleQueryChange}
                onBlur={() => setIsInputFocused(false)}
                onFocus={() => setIsInputFocused(true)}
                onCompositionEnd={handleCompositionEnd}
                onCompositionStart={handleCompositionStart}
                onKeyDown={handleInputKeyDown}
                onPaste={handleInputPaste}
                placeholder={t('launcher.inputPlaceholder')}
                ref={semiInputRef}
                role="combobox"
                size="large"
                value={query}
              />
            )}
            <div aria-hidden="true" className="launcher-avatar flex flex-none items-center justify-center">
              LX
            </div>
          </div>
        </div>
        <PluginWindowRecoveryControls controls={pluginWindowControls} />
        <div
          className="launcher-body min-h-0 flex flex-1 flex-col gap-3 px-4 pb-4"
          data-page-layout={pageLayout}
          inert={mainInteractionFrozen && pageResolution?.provider.kind !== 'plugin'}
        >
          <div className="launcher-content min-h-0 flex flex-1 flex-col" data-presentation-state={presentationState}>
            {presentationState === 'home' ? (
              <LauncherHome
                locale={locale}
                onActivate={(actionId) => void executeAction(actionId)}
                pendingActionId={pendingActionId}
                pinnedActions={pinnedActions}
                recentActions={recentActions}
              />
            ) : null}
            {presentationState === 'search' ? (
              <ActionSearchResults
                isInputFocused={isInputFocused}
                locale={locale}
                listboxId={ACTION_RESULTS_LISTBOX_ID}
                onActivate={(actionId) => void executeAction(actionId)}
                pendingActionId={pendingActionId}
                results={results}
                selectedActionId={effectiveSelectedActionId}
                visibleError={visibleSearchError}
              />
            ) : null}
            {presentationState === 'page' && activePage ? (
              <PageErrorBoundary key={`${activePage.owner_id}/${activePage.page_id}`}>
                {renderPage ? (
                  renderPage(activePage)
                ) : pageResolution?.provider.kind === 'host' &&
                  activePage.owner_id === 'lensx.core' &&
                  activePage.page_id === 'settings' ? (
                  <SettingsPage
                    managementService={pluginManagementService}
                    preferencesClient={preferencesClient}
                    shortcutsService={effectiveShortcutsService}
                    actions={registrySnapshot}
                  />
                ) : pageResolution?.provider.kind === 'plugin' && pageContext && effectivePluginRuntimeResolver ? (
                  <PluginRuntimeSlot
                    activePage={activePage}
                    onRetry={() => navigationService.restartActivationAttempt(activePage)}
                    onNativeAttempt={(attemptId) => {
                      navigationService.attachNativeActivationAttempt(activePage, attemptId);
                      if (activePageAttemptId) nativePageAttemptsRef.current.set(attemptId, activePageAttemptId);
                      for (const id of nativePageAttemptsRef.current.keys())
                        if (!instanceRegistry.forAttempt(id)) nativePageAttemptsRef.current.delete(id);
                    }}
                    lifecycleService={effectivePluginRuntimeLifecycleService}
                    instanceRegistry={instanceRegistry}
                    pageResolution={pageResolution}
                    pageTitle={pageContext.page_title}
                    presentationController={pluginChildWebviewPresentationController}
                    resolver={effectivePluginRuntimeResolver}
                  />
                ) : null}
              </PageErrorBoundary>
            ) : null}
          </div>
          <Typography.Text
            aria-atomic="true"
            aria-live="polite"
            className={nonSearchFeedbackMessage ? 'launcher-feedback' : 'sr-only'}
            data-feedback={nonSearchFeedbackMessage ? 'error' : undefined}
            id={LAUNCHER_STATUS_ID}
            role="status"
            type={nonSearchFeedbackMessage ? 'danger' : 'tertiary'}
          >
            {nonSearchFeedbackMessage || searchStatusMessage || homeFeedbackMessage}
          </Typography.Text>
        </div>
      </section>
    </main>
  );
};

export default App;
