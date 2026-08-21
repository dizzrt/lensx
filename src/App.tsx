import { Input, Typography } from '@douyinfe/semi-ui';
import {
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
import { useAppTheme } from './app/theme';

export interface AppProps {
  activationSource?: LauncherActivationSource;
  actionService?: LauncherActionService;
  collectionsClient?: LauncherActionCollectionsClient;
  navigationService?: AppNavigationService;
  preferencesClient?: AppPreferencesClient;
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
  collectionsClient = desktopLauncherActionCollectionsClient,
  navigationService = productionAppNavigationService,
  preferencesClient = desktopAppPreferencesClient,
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
  const { locale } = useAppLocale();
  const { themeMode } = useAppTheme();
  const [activePage, setActivePage] = useState<ActivePage>();
  const [activePageAttemptId, setActivePageAttemptId] = useState<`page_attempt_${number}`>();
  const [query, setQuery] = useState('');
  const [selectedActionId, setSelectedActionId] = useState<string>();
  const [pendingActionId, setPendingActionId] = useState<string>();
  const [dispatchFeedback, setDispatchFeedback] = useState<DispatchFeedback>();
  const [collectionsFeedbackKey, setCollectionsFeedbackKey] = useState<AppMessageKey>();
  const [collections, setCollections] = useState<LauncherActionCollections>(EMPTY_LAUNCHER_ACTION_COLLECTIONS);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [pageRevision, setPageRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingActionIdRef = useRef<string | undefined>(undefined);
  const shouldRestoreInputFocusRef = useRef(false);
  const lastPresentationTargetKeyRef = useRef<string | undefined>(undefined);
  const pageAttemptSequenceRef = useRef(0);
  const collectionsMutationRevisionRef = useRef(0);
  const collectionsMutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const focusLauncherInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
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
        storage: desktopPluginScopedStorageProviderFactory,
      }),
    [actionService, navigationService, pluginHostApiContextSource],
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
  const hasSearchQuery = normalizeLauncherActionSearchQuery(query, locale).tokens.length > 0;
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
        setActivePageAttemptId(page ? (`page_attempt_${++pageAttemptSequenceRef.current}` as const) : undefined);
        setActivePage(page);
        setQuery('');
        setSelectedActionId(undefined);
        setDispatchFeedback(undefined);
      }),
    [navigationService],
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
          setQuery('');
          setSelectedActionId(undefined);
          setDispatchFeedback({
            kind: 'success',
            messageKey: 'launcher.search.success',
          });
          recordSuccessfulUse(actionId);
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
        focusLauncherInput();
      }
    },
    [actionService, focusLauncherInput, recordSuccessfulUse],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setSelectedActionId(undefined);
    setDispatchFeedback(undefined);
    focusLauncherInput();
  }, [focusLauncherInput]);

  const closeActivePage = useCallback(() => {
    shouldRestoreInputFocusRef.current = true;
    navigationService.closePage();
  }, [navigationService]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setDispatchFeedback(undefined);
  }, []);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        clearSearch();
        return;
      }

      if (event.nativeEvent.isComposing || results.length === 0) {
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
                onChange={handleQueryChange}
                onKeyDown={handleInputKeyDown}
                placeholder={t('launcher.inputPlaceholder')}
                ref={inputRef}
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
                  <SettingsPage managementService={pluginManagementService} preferencesClient={preferencesClient} />
                ) : pageResolution?.provider.kind === 'plugin' && pageContext && effectivePluginRuntimeResolver ? (
                  <PluginRuntimeSlot
                    activePage={activePage}
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
            className={presentationState === 'home' && homeFeedbackMessage ? 'launcher-feedback' : 'sr-only'}
            data-feedback={presentationState === 'home' && homeFeedbackMessage ? 'error' : undefined}
            id={LAUNCHER_STATUS_ID}
            role="status"
            type={presentationState === 'home' && homeFeedbackMessage ? 'danger' : 'tertiary'}
          >
            {presentationState === 'home'
              ? homeFeedbackMessage || searchStatusMessage
              : searchStatusMessage || homeFeedbackMessage}
          </Typography.Text>
        </div>
      </section>
    </main>
  );
};

export default App;
