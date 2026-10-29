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
  type PluginRuntimeLifecycleService,
  PluginRuntimeSlot,
  startPluginChildWebviewHostDispatcherDesktopAdapter,
} from './app/plugins/runtime';
import { desktopPluginScopedStorageProviderFactory } from './app/plugins/storage';
import type { PluginSurfaceProjectionService } from './app/plugins/surfaces';
import { type AppPreferencesClient, desktopAppPreferencesClient } from './app/preferences';
import { desktopShortcutService, type ShortcutService, unavailableShortcutService } from './app/shortcuts';
import { useAppTheme } from './app/theme';

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
      void effectivePluginRuntimeLifecycleService.terminateCurrent('host_reload');
    };
    window.addEventListener('beforeunload', terminateForReload);
    window.addEventListener('pagehide', terminateForReload);
    return () => {
      window.removeEventListener('beforeunload', terminateForReload);
      window.removeEventListener('pagehide', terminateForReload);
      void effectivePluginRuntimeLifecycleService.terminateCurrent('app_teardown');
    };
  }, [effectivePluginRuntimeLifecycleService]);
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
    const targetKey = launcherSurfaceTargetKey(presentationTarget);
    if (lastPresentationTargetKeyRef.current === targetKey) {
      return;
    }
    lastPresentationTargetKeyRef.current = targetKey;
    void surfaceController.setPresentationState(presentationTarget).catch((error: unknown) => {
      if (import.meta.env.DEV) {
        console.error('Failed to resize the launcher presentation surface.', error);
      }
    });
  }, [presentationTarget, surfaceController]);

  useEffect(
    () =>
      navigationService.registerHandler((page) => {
        if (!page) {
          shouldRestoreInputFocusRef.current = true;
        }
        if (
          !page ||
          page.owner_id !== activePageRef.current?.owner_id ||
          page.page_id !== activePageRef.current?.page_id
        ) {
          setActivePageAttemptId(page ? (`page_attempt_${++pageAttemptSequenceRef.current}` as const) : undefined);
        }
        activePageRef.current = page;
        setActivePage(page);
        resetQuery();
        setDispatchFeedback(undefined);
      }),
    [navigationService, resetQuery],
  );

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
    const unsubscribe = navigationService.subscribeActivationFailures(() => {
      reportFailure();
      void effectivePluginRuntimeLifecycleService.failCurrent?.('runtime_unavailable');
    });
    if (!enablePluginChildWebviewHostDispatcher && !nativeActionInvocationPort) return unsubscribe;
    let disposed = false;
    let detach: (() => void) | undefined;
    const controller = new AbortController();
    void startNativeActionInvocations(actionService, reportFailure, nativeActionInvocationPort, controller.signal)
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
    nativeActionInvocationPort,
  ]);

  const executeAction = useCallback(
    async (actionId: string) => {
      if (pendingActionIdRef.current) {
        return;
      }

      pendingActionIdRef.current = actionId;
      setPendingActionId(actionId);
      setDispatchFeedback(undefined);
      setCollectionsFeedbackKey(undefined);

      try {
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
    [actionService, focusLauncherInput, recordSuccessfulUse, resetQuery],
  );

  const clearSearch = useCallback(() => {
    resetQuery();
    setDispatchFeedback(undefined);
    focusLauncherInput();
  }, [focusLauncherInput, resetQuery]);

  const closeActivePage = useCallback(() => {
    shouldRestoreInputFocusRef.current = true;
    navigationService.closePage();
  }, [navigationService]);

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
  const visibleSearchError = dispatchFeedback?.kind === 'error' ? t(dispatchFeedback.messageKey) : undefined;
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
        <div className="launcher-body min-h-0 flex flex-1 flex-col gap-3 px-4 pb-4" data-page-layout={pageLayout}>
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
                    onNativeAttempt={(attemptId) =>
                      navigationService.attachNativeActivationAttempt(activePage, attemptId)
                    }
                    lifecycleService={effectivePluginRuntimeLifecycleService}
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
