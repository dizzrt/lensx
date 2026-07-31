import { Button, Input, Typography } from '@douyinfe/semi-ui';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  inertLauncherSurfaceController,
  type LauncherPresentationState,
  type LauncherSurfaceController,
} from './app/launcher/surface';
import { useLauncherActivation } from './app/launcher/useLauncherActivation';
import { type ActivePage, type AppNavigationService, productionAppNavigationService } from './app/navigation';
import { PageErrorBoundary } from './app/pages/PageErrorBoundary';
import { SettingsPage } from './app/pages/SettingsPage';
import { type AppPreferencesClient, desktopAppPreferencesClient } from './app/preferences';

export interface AppProps {
  activationSource?: LauncherActivationSource;
  actionService?: LauncherActionService;
  navigationService?: AppNavigationService;
  preferencesClient?: AppPreferencesClient;
  renderPage?: (activePage: ActivePage) => ReactNode;
  startupPreferencesErrorCode?: string;
  surfaceController?: LauncherSurfaceController;
}

const ACTION_RESULTS_LISTBOX_ID = 'launcher-action-results';
const LAUNCHER_STATUS_ID = 'launcher-search-status';

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
  navigationService = productionAppNavigationService,
  preferencesClient = desktopAppPreferencesClient,
  renderPage,
  startupPreferencesErrorCode,
  surfaceController = inertLauncherSurfaceController,
}: AppProps) => {
  const { t } = useTranslation();
  const { locale } = useAppLocale();
  const [activePage, setActivePage] = useState<ActivePage>();
  const [query, setQuery] = useState('');
  const [selectedActionId, setSelectedActionId] = useState<string>();
  const [pendingActionId, setPendingActionId] = useState<string>();
  const [dispatchFeedback, setDispatchFeedback] = useState<DispatchFeedback>();
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingActionIdRef = useRef<string | undefined>(undefined);
  const shouldRestoreInputFocusRef = useRef(false);
  const lastPresentationStateRef = useRef<LauncherPresentationState | undefined>(undefined);
  const focusLauncherInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const results = useMemo(() => {
    void snapshotRevision;
    return searchLauncherActions({
      query,
      locale,
      snapshot: actionService.registry.snapshot(),
      limit: LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0,
    });
  }, [actionService, locale, query, snapshotRevision]);
  const effectiveSelectedActionId = results.some(({ action_id: actionId }) => actionId === selectedActionId)
    ? selectedActionId
    : results[0]?.action_id;
  const selectedIndex = results.findIndex(({ action_id: actionId }) => actionId === effectiveSelectedActionId);
  const hasSearchQuery = normalizeLauncherActionSearchQuery(query, locale).tokens.length > 0;
  const presentationState: LauncherPresentationState = activePage ? 'page' : hasSearchQuery ? 'search' : 'home';

  useEffect(() => {
    focusLauncherInput();
  }, [focusLauncherInput]);

  useEffect(() => {
    if (lastPresentationStateRef.current === presentationState) {
      return;
    }
    lastPresentationStateRef.current = presentationState;
    void surfaceController.setPresentationState(presentationState).catch((error: unknown) => {
      if (import.meta.env.DEV) {
        console.error('Failed to resize the launcher presentation surface.', error);
      }
    });
  }, [presentationState, surfaceController]);

  useEffect(
    () =>
      navigationService.registerHandler((page) => {
        setActivePage(page);
        setQuery('');
        setSelectedActionId(undefined);
        setDispatchFeedback(undefined);
      }),
    [navigationService],
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
    setSnapshotRevision((revision) => revision + 1);
  }, [focusLauncherInput]);

  useLauncherActivation(activationSource, handleLauncherActivation);

  const executeAction = useCallback(
    async (actionId: string) => {
      if (pendingActionIdRef.current) {
        return;
      }

      pendingActionIdRef.current = actionId;
      setPendingActionId(actionId);
      setDispatchFeedback(undefined);

      try {
        const result = await actionService.dispatcher.dispatch(actionId);
        if (result.ok) {
          setQuery('');
          setSelectedActionId(undefined);
          setDispatchFeedback({
            kind: 'success',
            messageKey: 'launcher.search.success',
          });
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
    [actionService, focusLauncherInput],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setSelectedActionId(undefined);
    setDispatchFeedback(undefined);
    focusLauncherInput();
  }, [focusLauncherInput]);

  const closeActivePage = useCallback(() => {
    shouldRestoreInputFocusRef.current = true;
    setActivePage(undefined);
    setQuery('');
    setSelectedActionId(undefined);
    setDispatchFeedback(undefined);
  }, []);

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

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = Math.min(selectedIndex + 1, results.length - 1);
        setSelectedActionId(results[Math.max(0, nextIndex)]?.action_id);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const nextIndex = Math.max(selectedIndex, 0) - 1;
        setSelectedActionId(results[Math.max(0, nextIndex)]?.action_id);
        return;
      }

      if (event.key === 'Enter' && effectiveSelectedActionId) {
        event.preventDefault();
        void executeAction(effectiveSelectedActionId);
      }
    },
    [clearSearch, effectiveSelectedActionId, executeAction, results, selectedIndex],
  );

  const statusMessage = pendingActionId
    ? t('launcher.search.executing', {
        title: results.find(({ action_id: actionId }) => actionId === pendingActionId)?.title ?? '',
      })
    : dispatchFeedback
      ? t(dispatchFeedback.messageKey)
      : hasSearchQuery
        ? results.length > 0
          ? t('launcher.search.resultCount', { count: results.length })
          : t('launcher.search.noResults')
        : startupPreferencesErrorCode
          ? t('launcher.preferences.startupFailure')
          : '';

  return (
    <main aria-labelledby="app-title" className="h-screen flex items-center justify-center p-3">
      <section
        aria-describedby="app-description"
        className="launcher-surface max-h-full w-full flex flex-col gap-2 p-4"
      >
        <div className="flex items-baseline justify-between gap-4">
          <Typography.Title className="launcher-title" heading={1} id="app-title">
            {t('app.name')}
          </Typography.Title>
          <Typography.Text className="launcher-description" id="app-description" type="tertiary">
            {t('app.description')}
          </Typography.Text>
        </div>
        {presentationState === 'page' && activePage ? (
          <header className="active-page-header flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Typography.Title ellipsis heading={2}>
                {t('settings.title')}
              </Typography.Title>
              <Typography.Text type="tertiary">
                {t('launcher.page.openedBy', {
                  action: t('launcher.actions.openSettings.title'),
                })}
              </Typography.Text>
            </div>
            <Button
              aria-label={t('launcher.page.closeLabel')}
              onClick={closeActivePage}
              theme="borderless"
              type="tertiary"
            >
              {t('launcher.page.close')}
            </Button>
          </header>
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
            onChange={handleQueryChange}
            onKeyDown={handleInputKeyDown}
            placeholder={t('launcher.inputPlaceholder')}
            ref={inputRef}
            role="combobox"
            size="large"
            value={query}
          />
        )}
        <div className="launcher-content min-h-0 flex flex-1 flex-col" data-presentation-state={presentationState}>
          {presentationState === 'home' ? (
            <div className="launcher-home flex flex-1 items-center justify-center p-4 text-center">
              <Typography.Text type="tertiary">{t('launcher.home.description')}</Typography.Text>
            </div>
          ) : null}
          {presentationState === 'search' ? (
            <>
              {results.length > 0 ? (
                <ActionSearchResults
                  listboxId={ACTION_RESULTS_LISTBOX_ID}
                  onActivate={(actionId) => void executeAction(actionId)}
                  pendingActionId={pendingActionId}
                  results={results}
                  selectedActionId={effectiveSelectedActionId}
                />
              ) : null}
              <Typography.Text
                aria-atomic="true"
                aria-live="polite"
                className="launcher-search-status"
                data-feedback={dispatchFeedback?.kind}
                id={LAUNCHER_STATUS_ID}
                role="status"
                type={dispatchFeedback?.kind === 'error' ? 'danger' : 'tertiary'}
              >
                {statusMessage}
              </Typography.Text>
            </>
          ) : null}
          {presentationState === 'home' ? (
            <Typography.Text
              aria-atomic="true"
              aria-live="polite"
              className="launcher-search-status"
              data-feedback={startupPreferencesErrorCode ? 'error' : undefined}
              id={LAUNCHER_STATUS_ID}
              role="status"
              type={startupPreferencesErrorCode ? 'danger' : 'tertiary'}
            >
              {statusMessage}
            </Typography.Text>
          ) : null}
          {presentationState === 'page' && activePage ? (
            <PageErrorBoundary key={`${activePage.owner_id}/${activePage.page_id}`}>
              {renderPage ? renderPage(activePage) : <SettingsPage preferencesClient={preferencesClient} />}
            </PageErrorBoundary>
          ) : null}
        </div>
      </section>
    </main>
  );
};

export default App;
