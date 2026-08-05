import { Button, Spin, Typography } from '@douyinfe/semi-ui';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivePage, PageResolution } from '../../navigation';
import {
  isValidIsolatedPluginRuntimeEntryUrl,
  isValidPluginRuntimeRoute,
  pluginRuntimeIframeSrc,
  pluginRuntimeOriginFromEntryUrl,
} from './helpers';
import { type PluginHostApiDispatcherFactory, unavailablePluginHostApiDispatcherFactory } from './host-api-dispatcher';
import {
  createPluginRuntimeLifecycleService,
  type PluginRuntimeAttempt,
  type PluginRuntimeFailureCode,
  type PluginRuntimeLifecycleService,
} from './lifecycle-controller';
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
import { attachPluginRuntimeTransport } from './transport-adapter';
import type { PluginPageRuntimeDescriptor, PluginPageRuntimeResolver, PluginRuntimeNavigationAdapter } from './types';

export type PluginRuntimeFrameState =
  | { readonly status: 'resolving' }
  | { readonly status: 'loading' | 'loaded'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly status: 'failed'; readonly failureCode: PluginRuntimeFailureCode }
  | { readonly status: 'disposed' };

export type PluginRuntimeFrameEvent =
  | { readonly type: 'resolve' }
  | { readonly type: 'mount'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly type: 'load'; readonly runtimeKey: string }
  | { readonly type: 'fail'; readonly failureCode: PluginRuntimeFailureCode }
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
      return { status: 'failed', failureCode: event.failureCode };
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
  readonly lifecycleService?: PluginRuntimeLifecycleService;
  readonly sessionService?: PluginRuntimeSessionService;
  readonly hostApiDispatcherFactory?: PluginHostApiDispatcherFactory;
}

interface ActiveRuntimeBinding {
  readonly descriptor: PluginPageRuntimeDescriptor;
  readonly attempt: PluginRuntimeAttempt;
  session?: PluginRuntimeSession;
}

export const PluginRuntimeFrame = ({
  activePage,
  navigationAdapter,
  pageResolution,
  pageTitle,
  resolver,
  lifecycleService,
  sessionService,
  hostApiDispatcherFactory = unavailablePluginHostApiDispatcherFactory,
}: PluginRuntimeFrameProps) => {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const [state, dispatch] = useReducer(reducePluginRuntimeFrameState, { status: 'resolving' });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeBindingRef = useRef<ActiveRuntimeBinding | undefined>(undefined);
  const effectiveLifecycleService = useMemo(
    () => lifecycleService ?? createPluginRuntimeLifecycleService(),
    [lifecycleService],
  );
  const effectiveSessionService = useMemo(
    () => sessionService ?? createPluginRuntimeSessionService(),
    [sessionService],
  );
  const request = useMemo(() => ({ activePage, pageResolution, attempt }), [activePage, attempt, pageResolution]);
  const bindIframeElement = useCallback((iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe;
    if (iframe) activeBindingRef.current?.attempt.startLoadDeadline();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lifecycleAttempt: PluginRuntimeAttempt | undefined;
    dispatch({ type: 'resolve' });
    const targetKey = `${activePage.owner_id}\u0000${activePage.page_id}`;

    void effectiveLifecycleService
      .start({
        targetKey,
        onFailure: (failureCode) => {
          if (!cancelled) dispatch({ type: 'fail', failureCode });
        },
      })
      .then(async (runtimeAttempt) => {
        if (!runtimeAttempt) return;
        lifecycleAttempt = runtimeAttempt;
        runtimeAttempt.bindCancellable(() => {
          cancelled = true;
        });
        if (cancelled || !runtimeAttempt.isCurrent()) {
          await runtimeAttempt.terminate('navigation');
          return;
        }
        const descriptor = await resolver.resolve(request);
        if (cancelled || !runtimeAttempt.isCurrent()) return;
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
        if (!runtimeAttempt.bindTrustedIdentity(descriptor.entry_id, descriptor.resource_generation)) {
          await runtimeAttempt.fail('runtime_crash_loop');
          return;
        }
        const lease = await navigationAdapter.activate({
          entry_url: descriptor.entry_url,
          host_fragment: descriptor.host_fragment,
        });
        if (cancelled || !runtimeAttempt.isCurrent()) {
          await navigationAdapter.dispose(lease);
          return;
        }
        runtimeAttempt.bindNavigationLease(async () => {
          await navigationAdapter.dispose(lease);
        });
        const binding: ActiveRuntimeBinding = { descriptor, attempt: runtimeAttempt };
        activeBindingRef.current = binding;
        runtimeAttempt.bindIframe(() => {
          if (activeBindingRef.current === binding) activeBindingRef.current = undefined;
        });
        dispatch({ type: 'mount', descriptor });

        let revalidationRunning = false;
        let revalidationPending = false;
        const revalidate = async () => {
          revalidationPending = true;
          if (revalidationRunning || !resolver.isCurrent) return;
          revalidationRunning = true;
          while (!cancelled && runtimeAttempt.isCurrent() && revalidationPending) {
            revalidationPending = false;
            if (!(await resolver.isCurrent(request, descriptor))) {
              if (!cancelled && runtimeAttempt.isCurrent()) await runtimeAttempt.fail('runtime_unavailable');
              break;
            }
          }
          revalidationRunning = false;
        };
        const unsubscribeInvalidation = resolver.subscribeInvalidation?.(() => {
          void revalidate();
        });
        if (unsubscribeInvalidation) runtimeAttempt.bindSubscription(unsubscribeInvalidation);
      })
      .catch(() => {
        if (!cancelled && lifecycleAttempt?.isCurrent()) {
          void lifecycleAttempt.fail('runtime_unavailable');
        } else if (!cancelled) {
          dispatch({ type: 'fail', failureCode: 'runtime_unavailable' });
        }
      });

    return () => {
      cancelled = true;
      dispatch({ type: 'dispose' });
      if (lifecycleAttempt) void lifecycleAttempt.terminate('navigation');
    };
  }, [activePage.owner_id, activePage.page_id, effectiveLifecycleService, navigationAdapter, request, resolver]);

  const handleLoad = (descriptor: PluginPageRuntimeDescriptor) => {
    const binding = activeBindingRef.current;
    const targetWindow = iframeRef.current?.contentWindow;
    if (
      !binding?.attempt.isCurrent() ||
      binding.descriptor.runtime_key !== descriptor.runtime_key ||
      binding.session ||
      !targetWindow
    ) {
      return;
    }
    dispatch({ type: 'load', runtimeKey: descriptor.runtime_key });
    binding.attempt.completeLoad();
    try {
      let session: PluginRuntimeSession | undefined;
      session = effectiveSessionService.start({
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
        owningAttempt: binding.attempt,
        consumeReadyLease: (lease) => {
          const hostApiBinding = hostApiDispatcherFactory.create({
            identity: lease.identity,
            isCurrent: () => binding.attempt.isCurrent() && activeBindingRef.current === binding,
          });
          const adapter = attachPluginRuntimeTransport({
            lease,
            handler: hostApiBinding.handler,
            isCurrent: () => binding.attempt.isCurrent() && activeBindingRef.current === binding,
            onDisconnect: () => session?.disconnect(),
          });
          const detachEmitter = hostApiBinding.attachEmitter(adapter.emit);
          return () => {
            detachEmitter();
            hostApiBinding.dispose();
            adapter.dispose();
          };
        },
      });
      binding.session = session;
      binding.attempt.bindSession(() => session.dispose());
      const unsubscribeSession = session.subscribe((snapshot) => {
        if (snapshot.state === 'ready' && binding.attempt.isCurrent()) {
          binding.attempt.markReady();
        }
        if (snapshot.state === 'disconnected' && activeBindingRef.current === binding) {
          const code =
            snapshot.error_code === 'handshake_timeout'
              ? 'runtime_handshake_timeout'
              : snapshot.error_code === 'port_disconnected'
                ? 'runtime_session_disconnected'
                : 'runtime_unavailable';
          void binding.attempt.fail(code);
        }
      });
      binding.attempt.bindSubscription(unsubscribeSession);
    } catch {
      void binding.attempt.fail('runtime_unavailable');
    }
  };

  if (state.status === 'failed') {
    const failureDescriptionKey =
      state.failureCode === 'runtime_load_timeout'
        ? 'launcher.page.pluginRuntimeFailure.loadTimeout'
        : state.failureCode === 'runtime_handshake_timeout'
          ? 'launcher.page.pluginRuntimeFailure.handshakeTimeout'
          : state.failureCode === 'runtime_session_disconnected'
            ? 'launcher.page.pluginRuntimeFailure.disconnected'
            : state.failureCode === 'runtime_security_policy_failure'
              ? 'launcher.page.pluginRuntimeFailure.securityPolicy'
              : state.failureCode === 'runtime_crash_loop'
                ? 'launcher.page.pluginRuntimeFailure.crashLoop'
                : 'launcher.page.pluginRuntimeFailure.unavailable';
    return (
      <section
        aria-label={pageTitle}
        className="plugin-runtime-feedback"
        data-runtime-failure-code={state.failureCode}
        role="alert"
      >
        <Typography.Title className="plugin-runtime-feedback-title" heading={5}>
          {t('launcher.page.pluginRuntimeFailureTitle')}
        </Typography.Title>
        <Typography.Text type="secondary">{t(failureDescriptionKey)}</Typography.Text>
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
        ref={bindIframeElement}
        referrerPolicy={PLUGIN_RUNTIME_REFERRER_POLICY}
        sandbox={PLUGIN_RUNTIME_IFRAME_SANDBOX}
        src={descriptor.iframe_src}
        title={t('launcher.page.pluginRuntimeFrameTitle', { title: pageTitle })}
      />
    </section>
  );
};
