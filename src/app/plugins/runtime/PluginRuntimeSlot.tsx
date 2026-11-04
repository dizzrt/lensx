import { Button, Spin, Typography } from '@douyinfe/semi-ui';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ActivePage, PageResolution } from '../../navigation';
import {
  isValidIsolatedPluginRuntimeEntryUrl,
  isValidPluginRuntimeRoute,
  pluginRuntimeOriginFromEntryUrl,
} from './helpers';
import { type PluginRuntimeInstanceBinding, PluginRuntimeInstanceRegistry } from './instance-registry';
import {
  createPluginRuntimeLifecycleService,
  PLUGIN_RUNTIME_RESOLUTION_DEADLINE_MS,
  type PluginRuntimeAttempt,
  type PluginRuntimeFailureCode,
  type PluginRuntimeLifecycleService,
  type PluginRuntimeOwner,
} from './lifecycle-controller';
import {
  desktopPluginChildWebviewPresentationController,
  isStalePluginPresentationWrite,
  type PluginChildWebviewAdmission,
  type PluginChildWebviewPresentationController,
  validPluginResourceGeneration,
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
  readonly onRetry?: () => void;
  readonly onNativeAttempt?: (attemptId: string) => void;
  readonly activePage: ActivePage;
  readonly pageResolution: PageResolution;
  readonly pageTitle: string;
  readonly resolver: PluginPageRuntimeResolver;
  readonly lifecycleService?: PluginRuntimeLifecycleService;
  readonly instanceRegistry?: PluginRuntimeInstanceRegistry;
  readonly presentationController?: PluginChildWebviewPresentationController;
}

const validDescriptor = (descriptor: PluginPageRuntimeDescriptor, ownerId: string, pageId: string): boolean =>
  descriptor.runtime_key.length > 0 &&
  descriptor.plugin_id === ownerId &&
  descriptor.page_id === pageId &&
  isValidIsolatedPluginRuntimeEntryUrl(descriptor.entry_url) &&
  isValidPluginRuntimeRoute(descriptor.host_fragment) &&
  descriptor.expected_origin === pluginRuntimeOriginFromEntryUrl(descriptor.entry_url) &&
  validPluginResourceGeneration(descriptor.resource_generation);

export const PluginRuntimeSlot = ({
  activePage,
  onRetry,
  onNativeAttempt,
  pageResolution,
  pageTitle,
  resolver,
  lifecycleService,
  instanceRegistry,
  presentationController = desktopPluginChildWebviewPresentationController,
}: PluginRuntimeSlotProps) => {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const retainedOnMount = useRef(instanceRegistry?.forSurface('main', activePage));
  const [state, dispatch] = useReducer(
    reducePluginRuntimeSlotState,
    retainedOnMount.current?.state ?? { status: 'resolving' },
  );
  const [bindingRevision, setBindingRevision] = useState(0);
  const slotRef = useRef<HTMLDivElement>(null);
  const activeBindingRef = useRef<PluginRuntimeInstanceBinding | undefined>(retainedOnMount.current);
  const attachedOwnerRef = useRef<PluginRuntimeOwner | undefined>(undefined);
  const lastFocusedPageRef = useRef<ActivePage | undefined>(undefined);
  const onNativeAttemptRef = useRef(onNativeAttempt);
  onNativeAttemptRef.current = onNativeAttempt;
  const effectiveLifecycleService = useMemo(
    () => lifecycleService ?? createPluginRuntimeLifecycleService(),
    [lifecycleService],
  );
  const registry = useMemo(
    () => instanceRegistry ?? new PluginRuntimeInstanceRegistry(effectiveLifecycleService),
    [instanceRegistry, effectiveLifecycleService],
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
    let viewActive = true;
    let runtime: PluginRuntimeAttempt | undefined;
    let binding: PluginRuntimeInstanceBinding | undefined;
    let unsubscribeView: (() => void) | undefined;
    const cancellation = new AbortController();
    let cancelAdmission: () => void = () => undefined;
    const publishView = () => {
      if (!viewActive || !binding) return;
      activeBindingRef.current = binding;
      setBindingRevision(binding.revision);
      if (binding.state.status === 'loading') dispatch({ type: 'mount', descriptor: binding.descriptor });
      else if (binding.state.status === 'ready') dispatch({ type: 'ready', descriptor: binding.descriptor });
      else if (binding.state.status === 'failed') dispatch({ type: 'fail', failureCode: binding.state.failureCode });
      else dispatch({ type: 'dispose' });
    };
    const adopt = (next: PluginRuntimeInstanceBinding) => {
      binding = next;
      runtime = next.attempt;
      activeBindingRef.current = next;
      unsubscribeView = registry.subscribeBinding(next, publishView);
      if (next.presentation) onNativeAttemptRef.current?.(next.presentation.attemptId);
      publishView();
    };
    const retained = registry.forSurface('main', { owner_id: activePage.owner_id, page_id: activePage.page_id });
    if (retained) adopt(retained);
    else {
      dispatch({ type: 'resolve' });
      void Promise.resolve()
        .then(async () => {
          const admission =
            resolver.admit === undefined
              ? undefined
              : await new Promise<PluginChildWebviewAdmission>((resolve, reject) => {
                  let pending = true;
                  const finish = (settle: () => void) => {
                    if (!pending) return;
                    pending = false;
                    clearTimeout(timer);
                    settle();
                  };
                  const timer = setTimeout(() => {
                    cancellation.abort();
                    finish(() => reject(new Error('Plugin admission timed out.')));
                  }, PLUGIN_RUNTIME_RESOLUTION_DEADLINE_MS);
                  cancelAdmission = () => finish(() => reject(new Error('Plugin admission cancelled.')));
                  void Promise.resolve()
                    .then(() => resolver.admit?.(request, cancellation.signal))
                    .then(
                      (value) =>
                        finish(() =>
                          value === undefined ? reject(new Error('Plugin admission is missing.')) : resolve(value),
                        ),
                      (error) => finish(() => reject(error)),
                    );
                });
          if (cancelled) return;
          runtime = await effectiveLifecycleService.start({
            targetKey: `${activePage.owner_id}\0${activePage.page_id}`,
            trustedIdentity: admission && { entryId: admission.entryId, generation: admission.generation },
            onFailure: (failureCode) => {
              if (binding) registry.publish(binding, { status: 'failed', failureCode });
              else if (viewActive) dispatch({ type: 'fail', failureCode });
            },
          });
          if (!runtime) return;
          const runtimeAttempt = runtime;
          runtimeAttempt.bindCancellable(() => {
            cancelled = true;
            cancellation.abort();
          });
          runtimeAttempt.startResolutionDeadline();
          if (cancelled || !runtimeAttempt.isCurrent()) {
            await runtimeAttempt.terminate('navigation');
            return;
          }
          const descriptor = await resolver.resolve(request, admission, cancellation.signal);
          if (cancelled || !runtimeAttempt.isCurrent()) return;
          if (!validDescriptor(descriptor, activePage.owner_id, activePage.page_id))
            throw new TypeError('Invalid Host-private Plugin Runtime descriptor.');
          if (!runtimeAttempt.bindTrustedIdentity(descriptor.entry_id, descriptor.resource_generation)) {
            await runtimeAttempt.fail('runtime_crash_loop');
            return;
          }
          runtimeAttempt.completeResolution();
          const record = registry.register(request, descriptor, runtimeAttempt, presentationController);
          adopt(record);
          let running = false;
          let pending = false;
          const revalidate = async () => {
            pending = true;
            if (running || !resolver.isCurrent) return;
            running = true;
            try {
              while (!cancelled && runtimeAttempt.isCurrent() && pending) {
                pending = false;
                if (!(await resolver.isCurrent(request, record.descriptor))) {
                  if (!cancelled && runtimeAttempt.isCurrent()) await runtimeAttempt.fail('runtime_unavailable');
                  break;
                }
              }
            } finally {
              running = false;
            }
          };
          const unsubscribe = resolver.subscribeInvalidation?.(() => {
            void revalidate();
          });
          if (unsubscribe) runtimeAttempt.bindSubscription(unsubscribe);
        })
        .catch(() => {
          if (!cancelled && runtime?.isCurrent()) void runtime.fail('runtime_unavailable');
          else if (!cancelled && viewActive) dispatch({ type: 'fail', failureCode: 'runtime_unavailable' });
        });
    }
    return () => {
      viewActive = false;
      unsubscribeView?.();
      const current = binding ?? activeBindingRef.current;
      if (!current || (current.attempt.currentOwner().surfaceId === 'main' && current.phase === 'stable')) {
        cancelled = true;
        cancellation.abort();
        cancelAdmission();
        if (runtime) void runtime.terminate('navigation');
      }
    };
  }, [
    activePage.owner_id,
    activePage.page_id,
    effectiveLifecycleService,
    registry,
    request,
    resolver,
    presentationController,
  ]);

  useLayoutEffect(() => {
    void bindingRevision;
    const binding = activeBindingRef.current;
    const element = slotRef.current;
    if (state.status !== 'loading' && state.status !== 'ready') return;
    if (!binding || !element || binding.owner.surfaceId !== 'main' || !binding.attempt.isCurrent()) return;
    return registry.bindGeometry(binding, () => {
      if (!element.isConnected) throw new Error('Host slot is unavailable.');
      const scaleFactor = window.devicePixelRatio;
      return { scaleFactor, bounds: physicalBoundsFromDomRect(element.getBoundingClientRect(), scaleFactor) };
    });
  }, [registry, state.status, bindingRevision]);

  useLayoutEffect(() => {
    void bindingRevision;
    const element = slotRef.current;
    const binding = activeBindingRef.current;
    if (
      (state.status !== 'loading' && state.status !== 'ready') ||
      !element ||
      !binding ||
      binding.owner.surfaceId !== 'main' ||
      binding.phase !== 'stable' ||
      !binding.attempt.isCurrent() ||
      attachedOwnerRef.current === binding.owner
    )
      return;
    let setupCancelled = false;
    const owner = binding.owner;
    const current = () =>
      binding.attempt.isOwner(owner) && binding.phase === 'stable' && activeBindingRef.current === binding;
    const geometry = () => ({
      scaleFactor: window.devicePixelRatio,
      physicalBounds: physicalBoundsFromDomRect(element.getBoundingClientRect(), window.devicePixelRatio),
    });
    const fail = () => {
      if (current()) void binding.attempt.fail('runtime_unavailable');
    };
    void Promise.resolve()
      .then(async () => {
        let presentation = binding.presentation;
        const created = presentation === undefined;
        if (!presentation) {
          presentation = await binding.controller.create({
            identity: {
              entryId: binding.descriptor.entry_id,
              pluginId: binding.descriptor.plugin_id,
              version: binding.descriptor.version,
              pageId: binding.descriptor.page_id,
              expectedRevision: binding.descriptor.registration_revision,
            },
            ...geometry(),
            presentationRevision: 1n,
          });
          if (setupCancelled || !current()) {
            await binding.controller.destroy(presentation);
            return;
          }
          registry.attachNative(binding, presentation);
          if (presentation.resourceGeneration !== binding.descriptor.resource_generation)
            throw new TypeError('Plugin generation changed during native creation.');
          const expectedOrigin = pluginRuntimeOriginFromEntryUrl(presentation.entryUrl);
          if (!expectedOrigin) throw new TypeError('Invalid native Runtime origin.');
          binding.descriptor = Object.freeze({
            ...binding.descriptor,
            entry_url: presentation.entryUrl,
            expected_origin: expectedOrigin,
          });
          onNativeAttemptRef.current?.(presentation.attemptId);
          binding.slotRevision = 1n;
        }
        const native = presentation;
        const controller = binding.controller;
        element.dataset.nativePresentation = created ? 'created' : 'visible';
        attachedOwnerRef.current = owner;
        let active = true;
        const queue = createLatestPluginChildWebviewSlotUpdateQueue(async (update) => {
          if (!current() || binding.presentation !== native) return;
          try {
            await controller.updateSlot(native, update.scaleFactor, update.physicalBounds, update.presentationRevision);
          } catch (error) {
            // Native can fence the old owner before main receives prepare_transfer.
            if (!current() || binding.presentation !== native || isStalePluginPresentationWrite(error, 'slot')) return;
            throw error;
          }
        }, fail);
        const syncBounds = () => {
          if (!active || !current()) return;
          try {
            binding.slotRevision++;
            queue.enqueue({
              attemptId: native.attemptId,
              owner: native.owner,
              ...geometry(),
              presentationRevision: binding.slotRevision,
            });
          } catch {
            fail();
          }
        };
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncBounds);
        observer?.observe(element);
        window.addEventListener('resize', syncBounds);
        binding.attempt.bindPresentation(async () => {
          active = false;
          observer?.disconnect();
          window.removeEventListener('resize', syncBounds);
          if (attachedOwnerRef.current === owner) attachedOwnerRef.current = undefined;
          await queue.stop();
        });
        if (!created) {
          syncBounds();
          return;
        }
        const readiness = await controller.waitReadiness(native);
        if (readiness.status === 'failed') {
          if (current()) await binding.attempt.fail(readiness.failureCode);
          return;
        }
        if (!current()) return;
        await controller.setVisible(native, true);
        if (current()) {
          binding.attempt.markReady();
          element.dataset.nativePresentation = 'visible';
          registry.publish(binding, { status: 'ready', descriptor: binding.descriptor });
        }
      })
      .catch(fail);
    return () => {
      setupCancelled = true;
    };
  }, [registry, state.status, bindingRevision]);

  useEffect(() => {
    if (lastFocusedPageRef.current === activePage) return;
    lastFocusedPageRef.current = activePage;
    const binding = activeBindingRef.current;
    if (
      binding?.presentation &&
      binding.phase === 'stable' &&
      binding.owner.surfaceId === 'main' &&
      binding.attempt.isCurrent()
    ) {
      const { owner, presentation } = binding;
      void binding.controller.setVisible(presentation, true).catch((error: unknown) => {
        if (
          activeBindingRef.current !== binding ||
          binding.presentation !== presentation ||
          !binding.attempt.isOwner(owner) ||
          binding.phase !== 'stable' ||
          isStalePluginPresentationWrite(error, 'visibility')
        )
          return;
        void binding.attempt.fail('runtime_unavailable');
      });
    }
  }, [activePage]);

  const retry = useCallback(() => {
    onRetry?.();
    setAttempt((current) => current + 1);
  }, [onRetry]);
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
