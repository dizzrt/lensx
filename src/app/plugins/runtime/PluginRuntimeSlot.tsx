import { Button, Spin, Typography } from '@douyinfe/semi-ui';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ActivePage, PageResolution } from '../../navigation';
import {
  isValidIsolatedPluginRuntimeEntryUrl,
  isValidPluginRuntimeRoute,
  pluginRuntimeGenerationFromEntryUrl,
  pluginRuntimeOriginFromEntryUrl,
} from './helpers';
import {
  createPluginRuntimeLifecycleService,
  type PluginRuntimeAttempt,
  type PluginRuntimeFailureCode,
  type PluginRuntimeLifecycleService,
} from './lifecycle-controller';
import {
  desktopPluginChildWebviewPresentationController,
  type PluginChildWebviewPresentationBinding,
  type PluginChildWebviewPresentationController,
} from './pluginChildWebviewPresentation';
import { createLatestPluginChildWebviewSlotUpdateQueue, physicalBoundsFromDomRect } from './pluginChildWebviewSlot';
import type { PluginPageRuntimeDescriptor, PluginPageRuntimeRequest, PluginPageRuntimeResolver } from './types';

export type PluginRuntimeSlotState =
  | { readonly status: 'resolving' }
  | { readonly status: 'loading'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly status: 'ready'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly status: 'failed'; readonly failureCode: PluginRuntimeFailureCode }
  | { readonly status: 'disposed' };

export type PluginRuntimeSlotEvent =
  | { readonly type: 'resolve' }
  | { readonly type: 'mount'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly type: 'ready'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly type: 'fail'; readonly failureCode: PluginRuntimeFailureCode }
  | { readonly type: 'dispose' };

export const reducePluginRuntimeSlotState = (
  _state: PluginRuntimeSlotState,
  event: PluginRuntimeSlotEvent,
): PluginRuntimeSlotState => {
  switch (event.type) {
    case 'resolve':
      return { status: 'resolving' };
    case 'mount':
      return { status: 'loading', descriptor: event.descriptor };
    case 'ready':
      return { status: 'ready', descriptor: event.descriptor };
    case 'fail':
      return { status: 'failed', failureCode: event.failureCode };
    case 'dispose':
      return { status: 'disposed' };
  }
};

export interface PluginRuntimeSlotProps {
  readonly activePage: ActivePage;
  readonly pageResolution: PageResolution;
  readonly pageTitle: string;
  readonly resolver: PluginPageRuntimeResolver;
  readonly lifecycleService?: PluginRuntimeLifecycleService;
  readonly presentationController?: PluginChildWebviewPresentationController;
}

interface ActiveRuntimeBinding {
  readonly descriptor: PluginPageRuntimeDescriptor;
  readonly attempt: PluginRuntimeAttempt;
  presentation?: PluginChildWebviewPresentationBinding;
}

const validDescriptor = (descriptor: PluginPageRuntimeDescriptor, ownerId: string, pageId: string): boolean =>
  descriptor.runtime_key.length > 0 &&
  descriptor.plugin_id === ownerId &&
  descriptor.page_id === pageId &&
  isValidIsolatedPluginRuntimeEntryUrl(descriptor.entry_url) &&
  isValidPluginRuntimeRoute(descriptor.host_fragment) &&
  descriptor.expected_origin === pluginRuntimeOriginFromEntryUrl(descriptor.entry_url) &&
  descriptor.resource_generation === pluginRuntimeGenerationFromEntryUrl(descriptor.entry_url);

export const PluginRuntimeSlot = ({
  activePage,
  pageResolution,
  pageTitle,
  resolver,
  lifecycleService,
  presentationController = desktopPluginChildWebviewPresentationController,
}: PluginRuntimeSlotProps) => {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const [state, dispatch] = useReducer(reducePluginRuntimeSlotState, { status: 'resolving' });
  const slotRef = useRef<HTMLDivElement>(null);
  const activeBindingRef = useRef<ActiveRuntimeBinding | undefined>(undefined);
  const effectiveLifecycleService = useMemo(
    () => lifecycleService ?? createPluginRuntimeLifecycleService(),
    [lifecycleService],
  );
  const request = useMemo<PluginPageRuntimeRequest>(
    () => ({
      activePage: { owner_id: activePage.owner_id, page_id: activePage.page_id },
      pageResolution: {
        provider: { kind: pageResolution.provider.kind, owner_id: pageResolution.provider.owner_id },
        page: {
          owner_id: pageResolution.page.owner_id,
          page_id: pageResolution.page.page_id,
          available: pageResolution.page.available,
          route: pageResolution.page.route,
        },
      },
      attempt,
    }),
    [
      activePage.owner_id,
      activePage.page_id,
      attempt,
      pageResolution.provider.kind,
      pageResolution.provider.owner_id,
      pageResolution.page.owner_id,
      pageResolution.page.page_id,
      pageResolution.page.available,
      pageResolution.page.route,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    let lifecycleAttempt: PluginRuntimeAttempt | undefined;
    dispatch({ type: 'resolve' });
    const targetKey = `${activePage.owner_id}\u0000${activePage.page_id}`;
    void effectiveLifecycleService
      .start({
        targetKey,
        onFailure: (failureCode) => dispatch({ type: 'fail', failureCode }),
      })
      .then(async (runtimeAttempt) => {
        if (runtimeAttempt === undefined) return;
        lifecycleAttempt = runtimeAttempt;
        runtimeAttempt.bindCancellable(() => {
          cancelled = true;
        });
        runtimeAttempt.startResolutionDeadline();
        if (cancelled || !runtimeAttempt.isCurrent()) {
          await runtimeAttempt.terminate('navigation');
          return;
        }
        const descriptor = await resolver.resolve(request);
        if (cancelled || !runtimeAttempt.isCurrent()) return;
        if (!validDescriptor(descriptor, activePage.owner_id, activePage.page_id)) {
          throw new TypeError('Invalid Host-private Plugin Runtime descriptor.');
        }
        if (!runtimeAttempt.bindTrustedIdentity(descriptor.entry_id, descriptor.resource_generation)) {
          await runtimeAttempt.fail('runtime_crash_loop');
          return;
        }
        runtimeAttempt.completeResolution();
        const binding: ActiveRuntimeBinding = { descriptor, attempt: runtimeAttempt };
        activeBindingRef.current = binding;
        dispatch({ type: 'mount', descriptor });

        let revalidationRunning = false;
        let revalidationPending = false;
        const revalidate = async () => {
          revalidationPending = true;
          if (revalidationRunning || resolver.isCurrent === undefined) return;
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
        if (unsubscribeInvalidation !== undefined) runtimeAttempt.bindSubscription(unsubscribeInvalidation);
      })
      .catch(() => {
        if (!cancelled && lifecycleAttempt?.isCurrent()) void lifecycleAttempt.fail('runtime_unavailable');
        else if (!cancelled) dispatch({ type: 'fail', failureCode: 'runtime_unavailable' });
      });

    return () => {
      cancelled = true;
      dispatch({ type: 'dispose' });
      if (lifecycleAttempt !== undefined) void lifecycleAttempt.terminate('navigation');
    };
  }, [activePage.owner_id, activePage.page_id, effectiveLifecycleService, request, resolver]);

  useLayoutEffect(() => {
    if (state.status !== 'loading') return;
    const element = slotRef.current;
    const binding = activeBindingRef.current;
    if (
      element === null ||
      binding === undefined ||
      binding.presentation !== undefined ||
      binding.descriptor.runtime_key !== state.descriptor.runtime_key ||
      !binding.attempt.isCurrent()
    ) {
      return;
    }
    let setupCancelled = false;
    let active = true;
    let revision = 1n;
    const geometry = () => {
      const scaleFactor = window.devicePixelRatio;
      return {
        scaleFactor,
        physicalBounds: physicalBoundsFromDomRect(element.getBoundingClientRect(), scaleFactor),
      };
    };
    const failPresentation = () => {
      if (active && binding.attempt.isCurrent()) void binding.attempt.fail('runtime_unavailable');
    };
    void Promise.resolve()
      .then(async () => {
        const initial = geometry();
        const presentation = await presentationController.create({
          identity: {
            entryId: binding.descriptor.entry_id,
            pluginId: binding.descriptor.plugin_id,
            version: binding.descriptor.version,
            pageId: binding.descriptor.page_id,
            expectedRevision: binding.descriptor.registration_revision,
          },
          ...initial,
          presentationRevision: revision,
        });
        if (setupCancelled || !binding.attempt.isCurrent() || activeBindingRef.current !== binding) {
          await presentationController.destroy(presentation);
          return;
        }
        binding.presentation = presentation;
        element.dataset.nativePresentation = 'created';
        const updateQueue = createLatestPluginChildWebviewSlotUpdateQueue(
          (update) =>
            presentationController.updateSlot(
              presentation,
              update.scaleFactor,
              update.physicalBounds,
              update.presentationRevision,
            ),
          failPresentation,
        );
        const syncBounds = () => {
          if (!active || binding.presentation !== presentation || !binding.attempt.isCurrent()) return;
          try {
            revision += 1n;
            updateQueue.enqueue({ attemptId: presentation.attemptId, ...geometry(), presentationRevision: revision });
          } catch {
            failPresentation();
          }
        };
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncBounds);
        observer?.observe(element);
        window.addEventListener('resize', syncBounds);
        binding.attempt.bindPresentation(async () => {
          active = false;
          observer?.disconnect();
          window.removeEventListener('resize', syncBounds);
          await updateQueue.stop();
          await presentationController.setVisible(presentation, false).catch(() => undefined);
          await presentationController.destroy(presentation);
          if (binding.presentation === presentation) binding.presentation = undefined;
        });
        const readiness = await presentationController.waitReadiness(presentation);
        if (readiness.status === 'failed') {
          if (active && binding.attempt.isCurrent()) await binding.attempt.fail(readiness.failureCode);
          return;
        }
        if (!active || !binding.attempt.isCurrent() || activeBindingRef.current !== binding) return;
        await presentationController.setVisible(presentation, true);
        if (active && binding.attempt.isCurrent() && activeBindingRef.current === binding) {
          binding.attempt.markReady();
          element.dataset.nativePresentation = 'visible';
          dispatch({ type: 'ready', descriptor: binding.descriptor });
        }
      })
      .catch(failPresentation);
    return () => {
      setupCancelled = true;
    };
  }, [presentationController, state]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
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
        <Button autoFocus onClick={retry} theme="solid" type="primary">
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
  return (
    <section
      aria-busy={state.status === 'loading'}
      aria-label={pageTitle}
      className="plugin-runtime-container"
      data-runtime-state={state.status}
    >
      <div aria-hidden="true" className="plugin-runtime-slot" data-plugin-runtime-slot="true" ref={slotRef} />
      {state.status === 'loading' ? (
        <div aria-live="polite" className="plugin-runtime-loading" role="status">
          <Spin size="large" />
          <Typography.Text type="secondary">{t('launcher.page.pluginRuntimeLoading')}</Typography.Text>
        </div>
      ) : null}
    </section>
  );
};
