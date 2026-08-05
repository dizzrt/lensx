import { Button, Spin, Typography } from '@douyinfe/semi-ui';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivePage, PageResolution } from '../../navigation';
import {
  isValidIsolatedPluginRuntimeEntryUrl,
  isValidPluginRuntimeRoute,
  pluginRuntimeIframeSrc,
  pluginRuntimeOriginFromEntryUrl,
} from './helpers';
import {
  PLUGIN_RUNTIME_IFRAME_SANDBOX,
  PLUGIN_RUNTIME_PERMISSIONS_POLICY,
  PLUGIN_RUNTIME_REFERRER_POLICY,
} from './policy';
import {
  createPluginRuntimeSessionService,
  type PluginRuntimeSession,
  type PluginRuntimeSessionService,
} from './session-service';
import type {
  PluginPageRuntimeDescriptor,
  PluginPageRuntimeResolver,
  PluginRuntimeNavigationAdapter,
  PluginRuntimeNavigationLease,
} from './types';

export type PluginRuntimeFrameState =
  | { readonly status: 'resolving' }
  | { readonly status: 'loading' | 'loaded'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly status: 'failed' }
  | { readonly status: 'disposed' };

export type PluginRuntimeFrameEvent =
  | { readonly type: 'resolve' }
  | { readonly type: 'mount'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly type: 'load'; readonly runtimeKey: string }
  | { readonly type: 'fail' }
  | { readonly type: 'dispose' };

export const reducePluginRuntimeFrameState = (
  state: PluginRuntimeFrameState,
  event: PluginRuntimeFrameEvent,
): PluginRuntimeFrameState => {
  switch (event.type) {
    case 'resolve':
      return { status: 'resolving' };
    case 'mount':
      return { status: 'loading', descriptor: event.descriptor };
    case 'load':
      return (state.status === 'loading' || state.status === 'loaded') &&
        state.descriptor.runtime_key === event.runtimeKey
        ? { status: 'loaded', descriptor: state.descriptor }
        : state;
    case 'fail':
      return { status: 'failed' };
    case 'dispose':
      return { status: 'disposed' };
  }
};

export interface PluginRuntimeFrameProps {
  readonly activePage: ActivePage;
  readonly navigationAdapter: PluginRuntimeNavigationAdapter;
  readonly pageResolution: PageResolution;
  readonly pageTitle: string;
  readonly resolver: PluginPageRuntimeResolver;
  readonly sessionService?: PluginRuntimeSessionService;
}

interface ActiveRuntimeBinding {
  readonly descriptor: PluginPageRuntimeDescriptor;
  readonly release: () => void;
  session?: PluginRuntimeSession;
  unsubscribeSession?: () => void;
}

export const PluginRuntimeFrame = ({
  activePage,
  navigationAdapter,
  pageResolution,
  pageTitle,
  resolver,
  sessionService,
}: PluginRuntimeFrameProps) => {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const [state, dispatch] = useReducer(reducePluginRuntimeFrameState, { status: 'resolving' });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeBindingRef = useRef<ActiveRuntimeBinding | undefined>(undefined);
  const effectiveSessionService = useMemo(
    () => sessionService ?? createPluginRuntimeSessionService(),
    [sessionService],
  );
  const request = useMemo(() => ({ activePage, pageResolution, attempt }), [activePage, attempt, pageResolution]);

  useEffect(() => {
    let cancelled = false;
    let activeLease: PluginRuntimeNavigationLease | undefined;
    let leaseReleased = false;
    let unsubscribeInvalidation: (() => void) | undefined;
    let revalidationRunning = false;
    let revalidationPending = false;
    dispatch({ type: 'resolve' });

    const releaseLease = () => {
      if (leaseReleased) return;
      leaseReleased = true;
      if (activeLease) void navigationAdapter.dispose(activeLease);
    };

    const revoke = () => {
      const binding = activeBindingRef.current;
      if (binding) {
        binding.unsubscribeSession?.();
        binding.session?.dispose();
        activeBindingRef.current = undefined;
      }
      releaseLease();
    };

    void resolver
      .resolve(request)
      .then(async (descriptor) => {
        if (cancelled) return;
        if (
          descriptor.runtime_key.length === 0 ||
          descriptor.plugin_id !== activePage.owner_id ||
          descriptor.page_id !== activePage.page_id ||
          !isValidIsolatedPluginRuntimeEntryUrl(descriptor.entry_url) ||
          !isValidPluginRuntimeRoute(descriptor.host_fragment) ||
          descriptor.expected_origin !== pluginRuntimeOriginFromEntryUrl(descriptor.entry_url) ||
          descriptor.iframe_src !== pluginRuntimeIframeSrc(descriptor.entry_url, descriptor.host_fragment)
        ) {
          throw new TypeError('Invalid Host-private Plugin Runtime descriptor.');
        }
        const lease = await navigationAdapter.activate({
          entry_url: descriptor.entry_url,
          host_fragment: descriptor.host_fragment,
        });
        if (cancelled) {
          await navigationAdapter.dispose(lease);
          return;
        }
        activeLease = lease;
        activeBindingRef.current = { descriptor, release: releaseLease };
        dispatch({ type: 'mount', descriptor });

        const revalidate = async () => {
          revalidationPending = true;
          if (revalidationRunning || !resolver.isCurrent) return;
          revalidationRunning = true;
          while (!cancelled && revalidationPending) {
            revalidationPending = false;
            if (!(await resolver.isCurrent(request, descriptor))) {
              if (!cancelled) {
                revoke();
                dispatch({ type: 'fail' });
              }
              break;
            }
          }
          revalidationRunning = false;
        };
        unsubscribeInvalidation = resolver.subscribeInvalidation?.(() => {
          void revalidate();
        });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'fail' });
      });

    return () => {
      cancelled = true;
      unsubscribeInvalidation?.();
      dispatch({ type: 'dispose' });
      revoke();
    };
  }, [activePage.owner_id, activePage.page_id, navigationAdapter, request, resolver]);

  const handleLoad = (descriptor: PluginPageRuntimeDescriptor) => {
    dispatch({ type: 'load', runtimeKey: descriptor.runtime_key });
    const binding = activeBindingRef.current;
    const targetWindow = iframeRef.current?.contentWindow;
    if (!binding || binding.descriptor.runtime_key !== descriptor.runtime_key || binding.session || !targetWindow) {
      return;
    }
    try {
      const session = effectiveSessionService.start({
        identity: {
          entry_id: descriptor.entry_id,
          plugin_id: descriptor.plugin_id,
          version: descriptor.version,
          page_id: descriptor.page_id,
          expected_origin: descriptor.expected_origin,
          resource_generation: descriptor.resource_generation,
          runtime_attempt_key: descriptor.runtime_attempt_key,
          registration_revision: descriptor.registration_revision,
          granted_permission_ids: descriptor.granted_permission_ids,
        },
        targetWindow: targetWindow as unknown as Parameters<PluginRuntimeSessionService['start']>[0]['targetWindow'],
        targetOrigin: descriptor.expected_origin,
      });
      binding.session = session;
      binding.unsubscribeSession = session.subscribe((snapshot) => {
        if (snapshot.state === 'disconnected' && activeBindingRef.current === binding) {
          binding.release();
          activeBindingRef.current = undefined;
          dispatch({ type: 'fail' });
        }
      });
    } catch {
      binding.release();
      activeBindingRef.current = undefined;
      dispatch({ type: 'fail' });
    }
  };

  if (state.status === 'failed') {
    return (
      <section aria-label={pageTitle} className="plugin-runtime-feedback" role="alert">
        <Typography.Title className="plugin-runtime-feedback-title" heading={5}>
          {t('launcher.page.pluginRuntimeFailureTitle')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('launcher.page.pluginRuntimeFailureDescription')}</Typography.Text>
        <Button autoFocus onClick={() => setAttempt((current) => current + 1)} theme="solid" type="primary">
          {t('launcher.page.pluginRuntimeRetry')}
        </Button>
      </section>
    );
  }

  if (state.status === 'resolving' || state.status === 'disposed') {
    return (
      <section
        aria-busy="true"
        aria-label={pageTitle}
        aria-live="polite"
        className="plugin-runtime-feedback"
        role="status"
      >
        <Spin size="large" />
        <Typography.Text type="secondary">{t('launcher.page.pluginRuntimeResolving')}</Typography.Text>
      </section>
    );
  }

  const { descriptor } = state;
  return (
    <section
      aria-busy={state.status === 'loading'}
      aria-label={pageTitle}
      className="plugin-runtime-container"
      data-runtime-state={state.status}
    >
      {state.status === 'loading' ? (
        <div aria-live="polite" className="plugin-runtime-loading" role="status">
          <Spin size="large" />
          <Typography.Text type="secondary">{t('launcher.page.pluginRuntimeLoading')}</Typography.Text>
        </div>
      ) : null}
      <iframe
        allow={PLUGIN_RUNTIME_PERMISSIONS_POLICY}
        className="plugin-runtime-iframe"
        key={descriptor.runtime_key}
        onLoad={() => handleLoad(descriptor)}
        ref={iframeRef}
        referrerPolicy={PLUGIN_RUNTIME_REFERRER_POLICY}
        sandbox={PLUGIN_RUNTIME_IFRAME_SANDBOX}
        src={descriptor.iframe_src}
        title={t('launcher.page.pluginRuntimeFrameTitle', { title: pageTitle })}
      />
    </section>
  );
};
