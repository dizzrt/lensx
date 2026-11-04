import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { AppProviders } from '../src/app/AppProviders';
import { LauncherActionDispatcher, LauncherActionRegistry } from '../src/app/launcher/actions';
import { type ActivePage, AppNavigationService, PageRegistry } from '../src/app/navigation';
import type {
  PluginChildWebviewPresentationController,
  PluginPageRuntimeDescriptor,
  PluginPageRuntimeResolver,
} from '../src/app/plugins/runtime';
import {
  createMutablePluginHostApiContextSource,
  createPluginChildWebviewHostDispatcherController,
  createPluginHostApiDispatcherFactory,
  createPluginRuntimeLifecycleService,
  PluginRuntimeInstanceRegistry,
  PluginRuntimeSlot,
  preparePluginRuntimeTransportSettlement,
} from '../src/app/plugins/runtime';
import { MAIN_PLUGIN_CHILD_WEBVIEW_OWNER } from '../src/app/plugins/runtime/pluginChildWebviewOwner';
import type { PluginScopedStorageRequest } from '../src/app/plugins/storage';
import { HostWindowCoordinator } from '../src/app/windows/host-window-coordinator';
import {
  createHostWindowPort,
  type HostWindowOperation,
  type HostWindowPort,
  type HostWindowSnapshot,
} from '../src/app/windows/host-window-protocol';

const pluginId = 'com.acme.workspace';
const target = { owner_id: pluginId, page_id: 'home' };
const source = MAIN_PLUGIN_CHILD_WEBVIEW_OWNER;
const destination = { windowLabel: 'plugin-window-0000000000000001', ownershipRevision: 2n };
const entryUrl =
  'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d652e776f726b7370616365/1.2.3/index.html';
const bounds = { x: 20, y: 40, width: 300, height: 200 };
const originalRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 20, top: 40, right: 320, bottom: 240, width: 300, height: 200 }) as DOMRect;
});
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});
const need = <T,>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Fixture value is missing.');
  return value;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fixture() {
  const pages = new PageRegistry([]);
  pages.replaceProviderBatch(pluginId, {
    provider: { kind: 'plugin', owner_id: pluginId, display_name: { 'en-US': 'Workspace', 'zh-CN': '工作区' } },
    pages: ['home', 'other'].map((page_id) => ({
      owner_id: pluginId,
      page_id,
      title: { 'en-US': page_id },
      available: true,
      route: `/${page_id}`,
      presentation: { initial_size: { width: 650, height: 600 }, resizable: true },
    })),
  });
  const navigation = new AppNavigationService(pages);
  const metadataActions = new LauncherActionRegistry();
  const lifecycle = createPluginRuntimeLifecycleService();
  let sequence = 0;
  const controller: PluginChildWebviewPresentationController = {
    create: rs.fn(async (input) => ({
      attemptId: `attempt_${(++sequence).toString(16).padStart(16, '0')}` as `attempt_${string}`,
      owner: input.owner ?? source,
      entryUrl,
      resourceGeneration: '1',
    })),
    updateSlot: rs.fn(async () => undefined),
    setVisible: rs.fn(async () => undefined),
    destroy: rs.fn(async () => true),
    readReadiness: rs.fn(async () => ({ status: 'ready' as const })),
    waitReadiness: rs.fn(async () => ({ status: 'ready' as const })),
  };
  const resolver: PluginPageRuntimeResolver = {
    admit: rs.fn(async () => ({ entryId: 'entry_0123456789abcdef', revision: '7', generation: '1' })),
    resolve: rs.fn(
      async (request): Promise<PluginPageRuntimeDescriptor> => ({
        runtime_key: `${request.activePage.owner_id}/${request.activePage.page_id}/${request.attempt}`,
        entry_url: entryUrl,
        host_fragment: `/${request.activePage.page_id}`,
        entry_id: 'entry_0123456789abcdef',
        plugin_id: request.activePage.owner_id,
        version: '1.2.3',
        page_id: request.activePage.page_id,
        expected_origin: 'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost',
        resource_generation: '1',
        runtime_attempt_key: `entry:1:${request.attempt}`,
        registration_revision: '7',
      }),
    ),
  };
  let snapshot: HostWindowSnapshot = {
    contract_version: '0.1.0',
    shell_epoch: 'shell_1',
    revision: '1',
    owner: destination,
    phase: 'preparing',
    page: { ...target, title: 'home', plugin_name: 'Workspace', action_name: 'home' },
    locale: 'en-US',
    theme: 'light',
    binding: null,
    error_code: null,
  };
  let replay: HostWindowOperation[] = [];
  const port: HostWindowPort = {
    ...createHostWindowPort(async () => {
      throw new Error('Unexpected fixture command');
    }),
    bootstrap: rs.fn(async () => ({ mode: 'main' as const })),
    listenOperations: rs.fn(async () => () => undefined),
    listenSnapshots: rs.fn(async () => () => undefined),
    readOperations: rs.fn(async () => replay),
    acknowledge: rs.fn(async () => true),
    readSnapshot: rs.fn(async () => snapshot),
    readSnapshotByEpoch: rs.fn(async () => snapshot),
    subscribeShell: rs.fn(async () => snapshot),
    closeInstance: rs.fn(async () => undefined),
    replaceInstance: rs.fn(async () => undefined),
    ready: rs.fn(async () => true),
    updateSlot: rs.fn(async () => true),
    waitOwner: rs.fn(async (id: string) => instances.forAttempt(id)?.presentation?.owner),
    preferences: rs.fn(async () => true),
    interaction: rs.fn(async () => true),
    publishMain: rs.fn(async () => true),
    publishShell: rs.fn<HostWindowPort['publishShell']>(async (input, owner, page, binding) => {
      snapshot = { ...snapshot, ...input, owner, page, binding, revision: String(Number(snapshot.revision) + 1) };
      return snapshot;
    }),
    geometry: rs.fn(async () => ({ scaleFactor: 1, bounds })),
    presentation: () => controller,
  };
  const instances = new PluginRuntimeInstanceRegistry(lifecycle, (id, reason, owner) =>
    ['navigation', 'retry', 'failure'].includes(reason) ? port.replaceInstance(id, owner) : port.closeInstance(id),
  );
  const suspendMain = rs.fn();
  const resumeMain = rs.fn();
  let requestPaint: (() => void) | undefined;
  const paintWaiters = new Set<() => void>();
  const coordinator = new HostWindowCoordinator({
    port,
    navigation,
    instances,
    resolver,
    mainPresentation: controller,
    actions: metadataActions,
    suspendMainPresentation: suspendMain,
    resumeMainPresentation: resumeMain,
    awaitMainRender: () =>
      new Promise<void>((resolve) => {
        paintWaiters.add(resolve);
        requestPaint?.();
      }),
  });
  const Harness = () => {
    const [page, setPage] = useState<ActivePage>();
    const [, paint] = useState(0);
    requestPaint = () => paint((value) => value + 1);
    useLayoutEffect(() => {
      for (const ready of paintWaiters) ready();
      paintWaiters.clear();
    });
    useEffect(() => navigation.registerHandler(setPage), []);
    return (
      <AppProviders>
        {page ? (
          <PluginRuntimeSlot
            key={`${page.owner_id}/${page.page_id}`}
            activePage={page}
            pageResolution={need(navigation.resolvePage(page))}
            pageTitle={page.page_id}
            resolver={resolver}
            lifecycleService={lifecycle}
            instanceRegistry={instances}
            presentationController={controller}
            onNativeAttempt={(id) => navigation.attachNativeActivationAttempt(page, id)}
          />
        ) : (
          <input aria-label="main-home" />
        )}
      </AppProviders>
    );
  };
  const open = async () => {
    await coordinator.start();
    await act(async () => {
      navigation.openPage(target, `${pluginId}.open`, { invocationId: ++sequence, source: 'normal' });
    });
    await waitFor(() => expect(instances.forSurface('main')?.state.status).toBe('ready'));
    return need(instances.forSurface('main'));
  };
  let operationSequence = 0;
  const operation = (
    kind: HostWindowOperation['kind'],
    attemptId: string,
    outcome: HostWindowOperation['outcome'] = null,
  ): HostWindowOperation => ({
    contract_version: '0.1.0',
    operation_id: `operation_${++operationSequence}`,
    transfer_token: 'migration_1',
    attempt_id: attemptId,
    kind,
    shell_epoch: 'shell_1',
    outcome,
    from_owner: kind === 'restore_navigation' ? destination : source,
    to_owner:
      kind === 'restore_navigation' || outcome === 'restored' ? { ...source, ownershipRevision: 2n } : destination,
  });
  const send = async (op: HostWindowOperation) => {
    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = coordinator.receive(op);
      await flush();
    });
    expect(await need(pending)).toBe(true);
  };
  return {
    pages,
    metadataActions,
    suspendMain,
    resumeMain,
    navigation,
    lifecycle,
    controller,
    resolver,
    instances,
    coordinator,
    port,
    Harness,
    open,
    operation,
    send,
    replay: (ops: HostWindowOperation[]) => {
      replay = ops;
    },
  };
}

describe('central detached-window composition', () => {
  test.each([
    false,
    true,
  ])('restores the same component Runtime before/after navigation staging without reload (staged=%s)', async (staged) => {
    const f = fixture();
    const view = render(<f.Harness />);
    const instance = await f.open();
    const id = need(instance.presentation).attemptId;
    const originalAttempt = instance.attempt;
    const activation = await f.navigation.bindNativeActivations(target, id);
    const originalActivation = activation?.current();
    await f.send(f.operation('prepare_transfer', id));
    if (staged) {
      await f.send(f.operation('transfer_navigation', id));
      expect(screen.getByRole('textbox', { name: 'main-home' })).toBeInTheDocument();
    }
    const restore = f.operation('restore_navigation', id);
    await f.send(restore);
    expect(f.port.acknowledge).toHaveBeenCalledWith(restore, true, { scaleFactor: window.devicePixelRatio, bounds });
    await f.send(f.operation('settle_transfer', id, 'restored'));
    await waitFor(() => expect(document.querySelector('[data-runtime-state="ready"]')).not.toBeNull());
    expect(f.instances.forSurface('main')).toBe(instance);
    expect(instance.attempt).toBe(originalAttempt);
    expect(instance.presentation?.owner).toEqual({ windowLabel: 'main', ownershipRevision: 2n });
    expect(activation?.available()).toBe(true);
    expect(activation?.current()).toEqual(originalActivation);
    expect(f.resolver.resolve).toHaveBeenCalledTimes(1);
    expect(f.controller.create).toHaveBeenCalledTimes(1);
    expect(f.controller.waitReadiness).toHaveBeenCalledTimes(1);
    expect(f.port.closeInstance).not.toHaveBeenCalled();
    fireEvent(window, new Event('resize'));
    await waitFor(() =>
      expect(f.controller.updateSlot).toHaveBeenCalledWith(
        expect.objectContaining({ attemptId: id, owner: { windowLabel: 'main', ownershipRevision: 2n } }),
        expect.any(Number),
        bounds,
        expect.any(BigInt),
      ),
    );
    view.unmount();
    await f.lifecycle.dispose();
    f.coordinator.dispose();
  });

  test('detaches A1, opens same-plugin A2 in main, and delivers caller Action/close only to A1', async () => {
    const f = fixture();
    const view = render(<f.Harness />);
    const first = await f.open();
    const id = need(first.presentation).attemptId;
    const activation = await f.navigation.bindNativeActivations(target, id);
    const events: unknown[] = [];
    activation?.subscribe((event) => {
      events.push(event);
      return true;
    });
    await f.send(f.operation('prepare_transfer', id));
    await f.send(f.operation('transfer_navigation', id));
    await f.send(f.operation('set_main_home', id));
    await f.send(f.operation('settle_transfer', id, 'committed'));
    const second = await f.open();
    expect(second).not.toBe(first);
    expect(first.attempt.isCurrent()).toBe(true);
    f.navigation.openPage(
      target,
      `${pluginId}.again`,
      { invocationId: 100, source: 'normal' },
      { runtimeAttemptId: id },
    );
    await flush();
    expect(events).toEqual([{ actionId: 'again', invocationId: 2, source: 'normal' }]);
    expect(f.navigation.surfaceForAttempt(id)).toBe(destination.windowLabel);
    expect(f.navigation.surfaceForAttempt(need(second.presentation).attemptId)).toBe('main');
    expect(f.controller.create).toHaveBeenCalledTimes(2);
    const actions = new LauncherActionRegistry();
    const factory = createPluginHostApiDispatcherFactory({
      actions: { registry: actions, dispatcher: new LauncherActionDispatcher(actions) },
      navigation: f.navigation,
      context: createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'light' }),
    });
    const session = factory.create({
      runtimeAttemptId: id,
      identity: { entry_id: first.descriptor.entry_id, plugin_id: pluginId, version: '1.2.3', page_id: 'home' },
      isCurrent: () => first.attempt.isCurrent(),
    });
    const output = await session.execute({ method: 'ui.close', params: {} }, new AbortController().signal);
    const settlement = preparePluginRuntimeTransportSettlement(output);
    expect(first.attempt.isCurrent()).toBe(true);
    await act(async () => {
      settlement.effect?.();
      await flush();
    });
    expect(first.attempt.isCurrent()).toBe(false);
    expect(second.attempt.isCurrent()).toBe(true);
    expect(f.port.closeInstance).toHaveBeenCalledExactlyOnceWith(id);
    expect(f.navigation.isActivePage(target)).toBe(true);
    view.unmount();
    await f.lifecycle.dispose();
    f.coordinator.dispose();
  });

  test('lost ACK replay does not repeat owner renewal and recovery blocks Action navigation', async () => {
    const f = fixture();
    const view = render(<f.Harness />);
    const instance = await f.open();
    const id = need(instance.presentation).attemptId;
    await f.send(f.operation('prepare_transfer', id));
    const restore = f.operation('restore_navigation', id);
    (f.port.acknowledge as ReturnType<typeof rs.fn>).mockRejectedValueOnce(new Error('reply lost'));
    await f.send(restore);
    const localOwner = instance.attempt.currentOwner();
    f.replay([restore]);
    await act(async () => {
      await f.coordinator.reconcile();
    });
    expect(instance.attempt.currentOwner()).toBe(localOwner);
    expect(f.controller.create).toHaveBeenCalledTimes(1);
    await f.send(f.operation('settle_transfer', id, 'recovery_required'));
    expect(() =>
      f.navigation.openPage(
        target,
        `${pluginId}.again`,
        { invocationId: 9, source: 'normal' },
        { runtimeAttemptId: id },
      ),
    ).toThrow();
    expect(instance.attempt.isCurrent()).toBe(true);
    await f.send(f.operation('settle_transfer', id, 'terminated'));
    expect(instance.attempt.isCurrent()).toBe(false);
    view.unmount();
    await f.lifecycle.dispose();
    f.coordinator.dispose();
  });
  test('a close response prepared in main closes the same caller after migration, while failed delivery has no close effect', async () => {
    for (const delivered of [false, true]) {
      const f = fixture();
      const view = render(<f.Harness />);
      const first = await f.open();
      const id = need(first.presentation).attemptId;
      const actions = new LauncherActionRegistry();
      const factory = createPluginHostApiDispatcherFactory({
        actions: { registry: actions, dispatcher: new LauncherActionDispatcher(actions) },
        navigation: f.navigation,
        context: createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'light' }),
        isActivationAttemptCurrent: (target, attempt) => f.navigation.isActiveInstance(target, attempt),
      });
      let release!: (accepted: boolean) => void;
      const settle = rs.fn(
        () =>
          new Promise<boolean>((resolve) => {
            release = resolve;
          }),
      );
      const controller = createPluginChildWebviewHostDispatcherController(factory, {
        settle,
        fail: async () => true,
        emitEvent: () => true,
      });
      controller.dispatch({
        contract_version: '0.1.0',
        session_id: 'a'.repeat(32),
        dispatch_id: '1'.repeat(32),
        attempt_id: id,
        identity: { entry_id: first.descriptor.entry_id, plugin_id: pluginId, version: '1.2.3', page_id: 'home' },
        request: { method: 'ui.close', params: {} },
      });
      await waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
      await f.send(f.operation('prepare_transfer', id));
      await f.send(f.operation('transfer_navigation', id));
      await f.send(f.operation('settle_transfer', id, 'committed'));
      const second = await f.open();
      await act(async () => {
        release(delivered);
        await flush();
      });
      expect(first.attempt.isCurrent()).toBe(!delivered);
      expect(second.attempt.isCurrent()).toBe(true);
      expect(f.port.closeInstance).toHaveBeenCalledTimes(delivered ? 1 : 0);
      controller.dispose();
      view.unmount();
      await f.lifecycle.dispose();
      f.coordinator.dispose();
    }
  });

  test('detached storage Session stays current through main replacement and close preserves a committed shared write', async () => {
    const f = fixture();
    const view = render(<f.Harness />);
    const first = await f.open();
    const firstId = need(first.presentation).attemptId;
    const actions = new LauncherActionRegistry();
    const store = new Map<string, Extract<PluginScopedStorageRequest, { method: 'storage.set' }>['params']['value']>();
    const disposed = [rs.fn(), rs.fn()];
    const signals: AbortSignal[] = [];
    let storageInstances = 0;
    let finishWrite!: () => void;
    const factory = createPluginHostApiDispatcherFactory({
      actions: { registry: actions, dispatcher: new LauncherActionDispatcher(actions) },
      navigation: f.navigation,
      context: createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'light' }),
      isActivationAttemptCurrent: (target, id) => f.navigation.isActiveInstance(target, id),
      storage: {
        create: ({ identity, isCurrent }) => {
          const instance = storageInstances++;
          return {
            available: isCurrent,
            subscribeAvailability: () => () => undefined,
            dispose: disposed[instance],
            execute: async (request, signal) => {
              signals.push(signal);
              if (request.method === 'storage.set') {
                const key = `${identity.plugin_id}/${request.params.key}`;
                store.set(key, request.params.value);
                await new Promise<void>((resolve) => {
                  finishWrite = resolve;
                });
                return { method: 'storage.set', result: { stored: true } };
              }
              if (request.method === 'storage.get') {
                const key = `${identity.plugin_id}/${request.params.key}`;
                return { method: 'storage.get', result: { found: true, value: need(store.get(key)) } };
              }
              throw new Error('Unexpected fixture request');
            },
          };
        },
      },
    });
    const results: Array<{ id: string; result: unknown }> = [];
    const controller = createPluginChildWebviewHostDispatcherController(factory, {
      settle: async (id, result) => {
        results.push({ id, result });
        return true;
      },
      fail: async () => true,
      emitEvent: () => true,
    });
    const identities = new Map<string, string>([[firstId, 'a'.repeat(32)]]);
    (f.port.closeInstance as ReturnType<typeof rs.fn>).mockImplementation(async (id: string) => {
      const session = identities.get(id);
      if (session) controller.disconnect({ contract_version: '0.1.0', session_id: session });
    });
    const dispatch = (id: string, session: string, sequence: string, request: unknown) =>
      controller.dispatch({
        contract_version: '0.1.0',
        session_id: session,
        dispatch_id: sequence.repeat(32),
        attempt_id: id,
        identity: { entry_id: first.descriptor.entry_id, plugin_id: pluginId, version: '1.2.3', page_id: 'home' },
        request,
      });
    dispatch(firstId, 'a'.repeat(32), '1', { method: 'storage.set', params: { key: 'shared', value: 'committed' } });
    await waitFor(() => expect(store.get(`${pluginId}/shared`)).toBe('committed'));
    await f.send(f.operation('prepare_transfer', firstId));
    await f.send(f.operation('transfer_navigation', firstId));
    await f.send(f.operation('settle_transfer', firstId, 'committed'));
    const second = await f.open();
    const secondId = need(second.presentation).attemptId;
    identities.set(secondId, 'b'.repeat(32));
    dispatch(secondId, 'b'.repeat(32), '2', { method: 'storage.get', params: { key: 'shared' } });
    await waitFor(() =>
      expect(results).toContainEqual({
        id: '2'.repeat(32),
        result: { method: 'storage.get', result: { found: true, value: 'committed' } },
      }),
    );
    expect(signals[0].aborted).toBe(false);
    expect(first.attempt.isCurrent()).toBe(true);
    dispatch(firstId, 'a'.repeat(32), '3', { method: 'ui.close', params: {} });
    await waitFor(() => expect(first.attempt.isCurrent()).toBe(false));
    expect(signals[0].aborted).toBe(true);
    expect(disposed[0]).toHaveBeenCalledTimes(1);
    expect(disposed[1]).not.toHaveBeenCalled();
    finishWrite();
    await flush();
    expect(results.some(({ id }) => id === '1'.repeat(32))).toBe(false);
    expect(store.get(`${pluginId}/shared`)).toBe('committed');
    expect(second.attempt.isCurrent()).toBe(true);
    dispatch(secondId, 'b'.repeat(32), '4', { method: 'storage.get', params: { key: 'shared' } });
    await waitFor(() =>
      expect(results).toContainEqual({
        id: '4'.repeat(32),
        result: { method: 'storage.get', result: { found: true, value: 'committed' } },
      }),
    );
    controller.dispose();
    view.unmount();
    await f.lifecycle.dispose();
    f.coordinator.dispose();
  });
  test('caller-scoped Action replaces only its detached Page and preserves the owning shell', async () => {
    const f = fixture();
    const view = render(<f.Harness />);
    const first = await f.open();
    const firstId = need(first.presentation).attemptId;
    await f.send(f.operation('prepare_transfer', firstId));
    await f.send(f.operation('transfer_navigation', firstId));
    await f.send(f.operation('settle_transfer', firstId, 'committed'));
    const main = await f.open();
    const mainId = need(main.presentation).attemptId;
    const other = { owner_id: pluginId, page_id: 'other' };
    const actions = new LauncherActionRegistry();
    const executor = rs.fn((invocation, context) => {
      f.navigation.openPage(other, `${pluginId}.open_other`, invocation, context);
    });
    expect(
      actions.register({
        descriptor: {
          action_id: `${pluginId}.open_other`,
          owner_id: pluginId,
          title: { 'en-US': 'Other' },
          default_keywords: {},
          enabled: true,
        },
        executor,
      }).ok,
    ).toBe(true);
    const factory = createPluginHostApiDispatcherFactory({
      actions: { registry: actions, dispatcher: new LauncherActionDispatcher(actions) },
      navigation: f.navigation,
      context: createMutablePluginHostApiContextSource({ locale: 'en-US', theme: 'light' }),
      isActivationAttemptCurrent: (page, attempt) => f.navigation.isActiveInstance(page, attempt),
    });
    const session = factory.create({
      runtimeAttemptId: firstId,
      identity: { entry_id: first.descriptor.entry_id, plugin_id: pluginId, version: '1.2.3', page_id: 'home' },
      isCurrent: () => first.attempt.isCurrent(),
    });
    await act(async () => {
      await session.execute(
        { method: 'actions.open', params: { actionId: 'open_other' } },
        new AbortController().signal,
      );
    });
    await waitFor(() => expect(f.instances.forSurface(destination.windowLabel)?.state.status).toBe('ready'));
    const replacement = need(f.instances.forSurface(destination.windowLabel));
    expect(replacement.descriptor.page_id).toBe('other');
    expect(replacement.attempt).not.toBe(first.attempt);
    expect(replacement.presentation?.owner).toEqual({ windowLabel: destination.windowLabel, ownershipRevision: 1n });
    expect(f.port.replaceInstance).toHaveBeenCalledExactlyOnceWith(firstId, destination);
    expect(f.port.closeInstance).not.toHaveBeenCalled();
    expect(f.instances.forSurface('main')).toBe(main);
    expect(f.navigation.surfaceForAttempt(mainId)).toBe('main');
    expect(f.controller.create).toHaveBeenCalledTimes(3);
    expect(f.port.listenOperations).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith({ invocationId: 1, source: 'normal' }, { runtimeAttemptId: firstId });
    const activation = await f.navigation.bindNativeActivations(other, need(replacement.presentation).attemptId);
    expect(activation?.current()).toEqual({ actionId: 'open_other', invocationId: 1, source: 'normal' });
    view.unmount();
    await f.lifecycle.dispose();
    f.coordinator.dispose();
  });
  test('localized opening-Action metadata updates independently of Page identity and falls back without reload', async () => {
    const f = fixture();
    f.metadataActions.replaceProviderBatch(pluginId, [
      {
        descriptor: {
          action_id: `${pluginId}.open`,
          owner_id: pluginId,
          title: { 'en-US': 'Open workspace', 'zh-CN': '打开工作区' },
          default_keywords: {},
          enabled: true,
        },
        executor: () => undefined,
      },
    ]);
    const view = render(<f.Harness />);
    const original = await f.open();
    const id = need(original.presentation).attemptId;
    await f.send(f.operation('prepare_transfer', id));
    await f.send(f.operation('transfer_navigation', id));
    await f.send(f.operation('settle_transfer', id, 'committed'));
    await act(async () => {
      f.coordinator.updatePreferences('zh-CN', 'dark');
      await flush();
    });
    await waitFor(() =>
      expect(f.port.publishShell).toHaveBeenLastCalledWith(
        expect.anything(),
        destination,
        expect.objectContaining({ title: 'home', action_name: '打开工作区', plugin_name: '工作区' }),
        expect.objectContaining({ attemptId: id }),
      ),
    );
    f.metadataActions.replaceProviderBatch(pluginId, []);
    await waitFor(() =>
      expect(f.port.publishShell).toHaveBeenLastCalledWith(
        expect.anything(),
        destination,
        expect.objectContaining({ title: 'home', action_name: 'home' }),
        expect.objectContaining({ attemptId: id }),
      ),
    );
    expect(f.controller.create).toHaveBeenCalledTimes(1);
    expect(original.attempt.isCurrent()).toBe(true);
    view.unmount();
    await f.lifecycle.dispose();
    f.coordinator.dispose();
  });

  test('coordinator teardown cancels detached preflight before any late native creation', async () => {
    const f = fixture();
    const view = render(<f.Harness />);
    const original = await f.open();
    const id = need(original.presentation).attemptId;
    await f.send(f.operation('prepare_transfer', id));
    await f.send(f.operation('transfer_navigation', id));
    await f.send(f.operation('settle_transfer', id, 'committed'));
    let finish!: (value: { entryId: string; revision: string; generation: string }) => void;
    const admission = f.resolver.admit as ReturnType<typeof rs.fn>;
    admission.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      f.navigation.openPage(
        { owner_id: pluginId, page_id: 'other' },
        `${pluginId}.open_other`,
        { invocationId: 10, source: 'normal' },
        { runtimeAttemptId: id },
      );
    });
    await waitFor(() => expect(admission).toHaveBeenCalledTimes(2));
    f.coordinator.dispose();
    await act(async () => {
      finish({ entryId: original.descriptor.entry_id, revision: '7', generation: '1' });
      await flush();
    });
    expect(f.controller.create).toHaveBeenCalledTimes(1);
    expect(f.lifecycle.getCurrent(destination.windowLabel)).toBeUndefined();
    view.unmount();
    await f.lifecycle.dispose();
  });
  test('late distinct operation IDs cannot refreeze or move an already restored original', async () => {
    const f = fixture();
    const view = render(<f.Harness />);
    const original = await f.open();
    const id = need(original.presentation).attemptId;
    const prepare = f.operation('prepare_transfer', id);
    const restore = f.operation('restore_navigation', id);
    await f.send(prepare);
    await f.send(restore);
    await f.send(f.operation('settle_transfer', id, 'restored'));
    const owner = original.attempt.currentOwner();
    for (const late of [
      { ...prepare, operation_id: 'late_prepare' },
      { ...restore, operation_id: 'late_restore' },
      f.operation('transfer_navigation', id),
    ]) {
      let result = true;
      await act(async () => {
        result = await f.coordinator.receive(late);
      });
      expect(result).toBe(false);
    }
    expect(original.attempt.currentOwner()).toBe(owner);
    expect(original.phase).toBe('stable');
    expect(f.navigation.instanceIsFrozen(id)).toBe(false);
    expect(f.instances.forSurface('main')).toBe(original);
    expect(f.controller.create).toHaveBeenCalledTimes(1);
    view.unmount();
    await f.lifecycle.dispose();
    f.coordinator.dispose();
  });
  test('replayed recovery settlement freezes the original when every earlier stage message was lost', async () => {
    const f = fixture();
    const view = render(<f.Harness />);
    const original = await f.open();
    const id = need(original.presentation).attemptId;
    const notice = { ...f.operation('settle_transfer', id, 'recovery_required'), to_owner: source };
    await f.send(notice);
    expect(f.port.readSnapshotByEpoch).toHaveBeenCalledWith('shell_1');
    expect(original.phase).toBe('recovery_required');
    expect(original.attempt.isCurrent()).toBe(true);
    expect(original.presentation?.owner).toEqual(source);
    expect(() => f.navigation.openPage({ owner_id: pluginId, page_id: 'other' }, `${pluginId}.open_other`)).toThrow();
    expect(f.controller.create).toHaveBeenCalledTimes(1);
    expect(f.port.closeInstance).not.toHaveBeenCalled();
    await f.send(f.operation('restore_navigation', id));
    await f.send(f.operation('settle_transfer', id, 'restored'));
    expect(original.phase).toBe('stable');
    expect(f.navigation.instanceIsFrozen(id)).toBe(false);
    view.unmount();
    await f.lifecycle.dispose();
    f.coordinator.dispose();
  });
  test('terminal notice releases only its matching pending Main presentation reservation', async () => {
    const f = fixture();
    const view = render(<f.Harness />);
    const original = await f.open();
    const id = need(original.presentation).attemptId;
    await f.send(f.operation('prepare_transfer', id));
    expect(f.suspendMain).toHaveBeenCalledTimes(1);
    await f.send({
      ...f.operation('settle_transfer', 'attempt_ffffffffffffffff', 'terminated'),
      transfer_token: 'other_token',
    });
    expect(f.resumeMain).not.toHaveBeenCalled();
    expect(original.attempt.isCurrent()).toBe(true);
    await f.send({ ...f.operation('close_instance', id, 'terminated'), to_owner: source });
    expect(f.resumeMain).toHaveBeenCalledTimes(1);
    expect(original.attempt.isCurrent()).toBe(false);
    expect(f.navigation.getActivePage()).toBeUndefined();
    view.unmount();
    await f.lifecycle.dispose();
    f.coordinator.dispose();
  });
});

test('serializes confirmed preferences before localized metadata and excludes closed instances from later publication', async () => {
  const f = fixture();
  const view = render(<f.Harness />);
  const first = await f.open();
  const firstId = need(first.presentation).attemptId;
  await f.send(f.operation('prepare_transfer', firstId));
  await f.send(f.operation('transfer_navigation', firstId));
  await f.send(f.operation('settle_transfer', firstId, 'committed'));
  const second = await f.open();
  await act(async () => {
    await flush();
  });
  const shellPublishes = rs.mocked(f.port.publishShell);
  const mainPublishes = rs.mocked(f.port.publishMain);
  shellPublishes.mockClear();
  mainPublishes.mockClear();
  let confirmFirst!: (value: boolean) => void;
  let confirmLatest!: (value: boolean) => void;
  rs.mocked(f.port.preferences)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          confirmFirst = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          confirmLatest = resolve;
        }),
    );
  f.coordinator.updatePreferences('zh-CN', 'dark');
  f.coordinator.updatePreferences('en-US', 'light');
  expect(f.port.preferences).toHaveBeenCalledTimes(1);
  expect(shellPublishes).not.toHaveBeenCalled();
  await act(async () => {
    confirmFirst(true);
    await flush();
  });
  expect(f.port.preferences).toHaveBeenLastCalledWith('en-US', 'light');
  expect(shellPublishes).not.toHaveBeenCalled();
  await act(async () => {
    confirmLatest(true);
    await flush();
  });
  await waitFor(() => expect(shellPublishes).toHaveBeenCalled());
  expect(shellPublishes).toHaveBeenLastCalledWith(
    expect.anything(),
    destination,
    expect.objectContaining({ plugin_name: 'Workspace' }),
    expect.objectContaining({ attemptId: firstId }),
  );
  expect(mainPublishes).toHaveBeenLastCalledWith(
    expect.objectContaining({ attemptId: second.presentation?.attemptId }),
    expect.objectContaining({ plugin_name: 'Workspace' }),
  );
  await act(async () => {
    await f.instances.close(firstId);
  });
  shellPublishes.mockClear();
  await act(async () => {
    f.coordinator.updatePreferences('zh-CN', 'dark');
    await flush();
  });
  expect(shellPublishes).not.toHaveBeenCalled();
  expect(mainPublishes).toHaveBeenLastCalledWith(
    expect.objectContaining({ attemptId: second.presentation?.attemptId }),
    expect.objectContaining({ plugin_name: '工作区' }),
  );
  expect(second.attempt.isCurrent()).toBe(true);
  expect(f.controller.create).toHaveBeenCalledTimes(2);
  f.coordinator.dispose();
  const before = rs.mocked(f.port.preferences).mock.calls.length;
  f.coordinator.updatePreferences('en-US', 'light');
  expect(f.port.preferences).toHaveBeenCalledTimes(before);
  view.unmount();
  await f.lifecycle.dispose();
});

test('an old focus reply after rollback cannot fail renewed owner2, while its own not-ready reply remains terminal', async () => {
  const f = fixture();
  const view = render(<f.Harness />);
  const instance = await f.open();
  const original = need(instance.presentation);
  let rejectOld!: (error: unknown) => void;
  rs.mocked(f.controller.setVisible).mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectOld = reject;
      }),
  );
  await act(async () => {
    f.navigation.openPage(target, `${pluginId}.again`, { invocationId: 90, source: 'normal' });
  });
  await waitFor(() => expect(rejectOld).toBeDefined());
  expect(f.controller.setVisible).toHaveBeenLastCalledWith(original, true);
  await f.send(f.operation('prepare_transfer', original.attemptId));
  await f.send(f.operation('restore_navigation', original.attemptId));
  await f.send(f.operation('settle_transfer', original.attemptId, 'restored'));
  const renewed = need(instance.presentation);
  expect(renewed.owner).toEqual({ windowLabel: 'main', ownershipRevision: 2n });
  await act(async () => {
    rejectOld({ contract_version: '0.3.0', code: 'not_ready', message: 'Old owner reply.' });
    await flush();
  });
  expect(instance.attempt.isCurrent()).toBe(true);
  expect(f.instances.forSurface('main')).toBe(instance);
  expect(f.port.replaceInstance).not.toHaveBeenCalled();
  expect(f.controller.create).toHaveBeenCalledTimes(1);
  rs.mocked(f.controller.setVisible).mockRejectedValueOnce({
    contract_version: '0.3.0',
    code: 'not_ready',
    message: 'Current Session is not ready.',
  });
  await act(async () => {
    f.navigation.openPage(target, `${pluginId}.again`, { invocationId: 91, source: 'normal' });
  });
  await waitFor(() => expect(f.port.replaceInstance).toHaveBeenCalledWith(original.attemptId, renewed.owner));
  expect(instance.attempt.isCurrent()).toBe(false);
  view.unmount();
  await f.lifecycle.dispose();
  f.coordinator.dispose();
});

test('typed stale slot and focus replies before prepare ACK preserve the live Runtime and the next current-owner write', async () => {
  const f = fixture();
  const view = render(<f.Harness />);
  const instance = await f.open();
  const binding = need(instance.presentation);
  for (const code of ['stale_attempt', 'stale_revision']) {
    const writes = rs.mocked(f.controller.updateSlot).mock.calls.length;
    rs.mocked(f.controller.updateSlot).mockRejectedValueOnce({
      contract_version: '0.2.0',
      code,
      message: 'Superseded slot.',
    });
    await act(async () => {
      fireEvent(window, new Event('resize'));
      await flush();
    });
    expect(f.controller.updateSlot).toHaveBeenCalledTimes(writes + 1);
    expect(instance.attempt.isCurrent()).toBe(true);
  }
  rs.mocked(f.controller.setVisible).mockRejectedValueOnce({
    contract_version: '0.3.0',
    code: 'stale_attempt',
    message: 'Superseded visibility.',
  });
  await act(async () => {
    f.navigation.openPage(target, `${pluginId}.again`, { invocationId: 90, source: 'normal' });
    await flush();
  });
  expect(instance.attempt.isCurrent()).toBe(true);
  expect(f.port.replaceInstance).not.toHaveBeenCalled();
  rs.mocked(f.controller.updateSlot).mockRejectedValueOnce({
    contract_version: '0.2.0',
    code: 'native_update_failed',
    message: 'Current native bounds failed.',
  });
  await act(async () => {
    fireEvent(window, new Event('resize'));
    await flush();
  });
  await waitFor(() => expect(f.port.replaceInstance).toHaveBeenCalledWith(binding.attemptId, binding.owner));
  expect(instance.attempt.isCurrent()).toBe(false);
  view.unmount();
  await f.lifecycle.dispose();
  f.coordinator.dispose();
});
