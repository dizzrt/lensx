import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProviders } from '../src/app/AppProviders';
import { PageContextBar } from '../src/app/navigation';
import {
  createPluginRuntimeLifecycleService,
  type PluginChildWebviewPresentationController,
  type PluginPageRuntimeDescriptor,
  PluginRuntimeInstanceRegistry,
} from '../src/app/plugins/runtime';
import { MAIN_PLUGIN_CHILD_WEBVIEW_OWNER } from '../src/app/plugins/runtime/pluginChildWebviewOwner';
import {
  createHostWindowPort,
  type HostWindowPort,
  type PluginWindowNativeState,
  type PluginWindowOperationResult,
  parsePluginWindowNativeState,
  parsePluginWindowResult,
} from '../src/app/windows/host-window-protocol';
import { PluginWindowRecoveryControls } from '../src/app/windows/PluginWindowControls';
import { type PluginWindowControls, usePluginWindowControls } from '../src/app/windows/usePluginWindowControls';

const entryUrl =
  'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost/v1/0123456789abcdef0123456789abcdef/v1-636f6d2e61636d652e776f726b7370616365/1.2.3/index.html';
const page = { owner_id: 'com.acme.workspace', page_id: 'home', opened_by_action_id: 'com.acme.workspace.open' };
const ticket = { attemptId: 'attempt_0000000000000001' as const, transferToken: 'transfer_0000000000000001' };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture() {
  const lifecycle = createPluginRuntimeLifecycleService();
  cleanups.push(() => lifecycle.dispose());
  const instances = new PluginRuntimeInstanceRegistry(lifecycle);
  const descriptor: PluginPageRuntimeDescriptor = {
    runtime_key: 'runtime',
    entry_url: entryUrl,
    expected_origin: 'lensx-plugin://0123456789abcdef0123456789abcdef.runtime.localhost',
    host_fragment: '/home',
    entry_id: 'entry_0123456789abcdef',
    plugin_id: page.owner_id,
    version: '1.2.3',
    page_id: page.page_id,
    resource_generation: '1',
    runtime_attempt_key: 'runtime_1',
    registration_revision: '1',
  };
  const controller: PluginChildWebviewPresentationController = {
    create: rs.fn(async () => ({
      attemptId: ticket.attemptId,
      owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      entryUrl,
      resourceGeneration: '1',
    })),
    destroy: rs.fn(async () => true),
    updateSlot: rs.fn(async () => undefined),
    setVisible: rs.fn(async () => undefined),
    readReadiness: rs.fn<PluginChildWebviewPresentationController['readReadiness']>(async () => ({ status: 'ready' })),
    waitReadiness: rs.fn<PluginChildWebviewPresentationController['waitReadiness']>(async () => ({ status: 'ready' })),
  };
  const attempt = await lifecycle.start({ targetKey: 'workspace/home', onFailure: rs.fn() });
  if (!attempt) throw new Error('Fixture admission failed');
  const binding = instances.register(
    {
      activePage: page,
      pageResolution: {
        provider: { kind: 'plugin', owner_id: page.owner_id },
        page: { ...page, available: true, route: '/home' },
      },
      attempt: 0,
    },
    descriptor,
    attempt,
    controller,
  );
  instances.attachNative(binding, {
    attemptId: ticket.attemptId,
    owner: MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
    entryUrl,
    resourceGeneration: '1',
  });
  let state: PluginWindowNativeState = {
    admissionFailure: null,
    pendingAttempts: [],
    recovery: [],
  };
  const port = {
    ...createHostWindowPort(
      async () => {
        throw new Error('Unexpected native command');
      },
      async () => ({ channelId: '__CHANNEL__:1', release: () => undefined }),
    ),
    readPluginWindowState: rs.fn(async () => state),
    retryRecovery: rs.fn<HostWindowPort['retryRecovery']>(async () => ({ status: 'recovery_required', ticket })),
    closeRecovery: rs.fn<HostWindowPort['closeRecovery']>(async () => ({ status: 'closing', ticket })),
    quitPluginWindows: rs.fn(async () => true),
    listenPluginWindowState: rs.fn<HostWindowPort['listenPluginWindowState']>(async () => rs.fn()),
  } satisfies HostWindowPort;
  const reconcile = rs.fn(async () => undefined);
  let controls: PluginWindowControls | undefined;
  const Harness = ({ mainPage = true }: { mainPage?: boolean }) => {
    controls = usePluginWindowControls({ enabled: true, port, instances, transferPending: false, reconcile });
    return (
      <>
        {mainPage ? (
          <PageContextBar
            context={{ owner_name: 'Workspace', action_name: 'Open workspace', page_title: 'Home' }}
            closeLabel="Close plugin"
            onClose={() => undefined}
          />
        ) : null}
        <PluginWindowRecoveryControls controls={controls} />
        <div inert={controls.interactionFrozen}>
          <input aria-label="main-search" />
        </div>
      </>
    );
  };
  const current = () => {
    if (!controls) throw new Error('No mounted controls');
    return controls;
  };
  return {
    lifecycle,
    instances,
    binding,
    controller,
    port,
    Harness,
    current,
    reconcile,
    ready: () => {
      attempt.markReady();
      instances.publish(binding, { status: 'ready', descriptor });
    },
    setNative: async (next: PluginWindowNativeState) => {
      state = next;
      await current().refresh();
    },
  };
}

describe('trusted plugin window recovery', () => {
  test('native keyboard detachment freezes main interaction without adding a Page control or shortcut hint', async () => {
    const f = await fixture();
    f.ready();
    render(
      <AppProviders>
        <f.Harness />
      </AppProviders>,
    );
    expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: 'Close plugin' })]);
    expect(document.body).not.toHaveTextContent(/Detach window|Cmd \+ D/u);
    await act(async () => f.setNative({ admissionFailure: null, pendingAttempts: [ticket.attemptId], recovery: [] }));
    expect(screen.getByRole('textbox', { name: 'main-search' }).closest('[inert]')).not.toBeNull();
    await act(async () => f.setNative({ admissionFailure: ticket.attemptId, pendingAttempts: [], recovery: [] }));
    expect(screen.getByRole('textbox', { name: 'main-search' }).closest('[inert]')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Detach window|Check window state/ })).not.toBeInTheDocument();
  });
  for (const staged of [false, true])
    test(`retains accessible recovery before/after navigation (staged=${staged}) and close/quit bypass retry`, async () => {
      const f = await fixture();
      f.ready();
      if (staged)
        await f.instances.changeOwner(
          ticket.attemptId,
          { windowLabel: 'plugin-window-0000000000000001', ownershipRevision: 2n },
          f.controller,
          'shell_1',
        );
      f.instances.settle(ticket.attemptId, true);
      render(
        <AppProviders>
          <f.Harness mainPage={!staged} />
        </AppProviders>,
      );
      await act(async () =>
        f.setNative({
          admissionFailure: null,
          pendingAttempts: [],
          recovery: [{ status: 'recovery_required', ticket }],
        }),
      );
      const retry = screen.getByRole('button', { name: 'Retry restoration' });
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Restore plugin window' })).toHaveFocus());
      expect(retry.closest('[inert]')).toBeNull();
      let finish!: (value: PluginWindowOperationResult) => void;
      f.port.retryRecovery.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      fireEvent.click(retry);
      expect(f.port.retryRecovery).toHaveBeenCalledWith(ticket);
      expect(retry).toBeDisabled();
      expect(screen.getByText('Restoring the original window…')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close instance' }));
      fireEvent.click(screen.getByRole('button', { name: 'Quit lensX' }));
      expect(f.port.closeRecovery).toHaveBeenCalledWith(ticket);
      expect(f.port.quitPluginWindows).toHaveBeenCalledTimes(1);
      await act(async () =>
        f.setNative({
          admissionFailure: null,
          pendingAttempts: [],
          recovery: [],
        }),
      );
      await act(async () => finish({ status: 'restored', owner: { windowLabel: 'main', ownershipRevision: 3n } }));
      expect(screen.queryByRole('button', { name: 'Retry restoration' })).not.toBeInTheDocument();
      expect(f.controller.create).not.toHaveBeenCalled();
      expect(f.controller.waitReadiness).not.toHaveBeenCalled();
      expect(f.instances.forAttempt(ticket.attemptId)?.attempt).toBe(f.binding.attempt);
    });
  test('repeated recovery failure preserves controls and a failed read does not erase the retained ticket', async () => {
    const f = await fixture();
    render(
      <AppProviders>
        <f.Harness />
      </AppProviders>,
    );
    await act(async () =>
      f.setNative({
        admissionFailure: null,
        pendingAttempts: [],
        recovery: [{ status: 'recovery_required', ticket }],
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry restoration' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry restoration' })).toBeEnabled());
    expect(f.port.retryRecovery).toHaveBeenCalledTimes(1);
    f.port.readPluginWindowState.mockRejectedValueOnce(new Error('/private/opaque/native-handle'));
    await act(async () => f.current().refresh());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check window state' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close instance' })).toBeEnabled();
    expect(document.body).not.toHaveTextContent('native-handle');
    expect(f.controller.create).not.toHaveBeenCalled();
  });
});

const rawResult = (status = 'recovery_required') => ({
  contract_version: '0.1.0',
  status,
  owner: null,
  attempt_id: ticket.attemptId,
  transfer_token: ticket.transferToken,
});
test('native window DTOs preserve exact identity and reject forged recovery/status shapes', async () => {
  for (const status of ['recovery_required', 'recovering', 'closing'])
    expect(parsePluginWindowResult(rawResult(status))).toEqual({ status, ticket });
  for (const value of [
    { ...rawResult(), extra: true },
    { ...rawResult(), attempt_id: 'attempt_0000000000000000' },
    { ...rawResult(), owner: { window_label: 'main', ownership_revision: '1' } },
    rawResult('committed'),
    rawResult('busy'),
  ])
    expect(() => parsePluginWindowResult(value)).toThrow();
  const raw = {
    contract_version: '0.1.0',
    admission_failure: null,
    pending_attempts: [],
    recovery: [rawResult()],
  };
  expect(parsePluginWindowNativeState(raw).recovery[0]?.ticket).toEqual(ticket);
  expect(
    parsePluginWindowNativeState({ ...raw, admission_failure: { attempt_id: ticket.attemptId } }).admissionFailure,
  ).toBe(ticket.attemptId);
  expect(() =>
    parsePluginWindowNativeState({ ...raw, admission_failure: { attempt_id: ticket.attemptId, window_label: 'main' } }),
  ).toThrow();
  expect(() => parsePluginWindowNativeState({ ...raw, detachable: true })).toThrow();
  expect(() =>
    parsePluginWindowNativeState({ ...raw, pending_attempts: [ticket.attemptId, ticket.attemptId] }),
  ).toThrow();
  const call = rs.fn(async (command: string) =>
    command === 'quit_plugin_windows' ? { contract_version: '0.1.0', accepted: true } : rawResult(),
  );
  const port = createHostWindowPort(call);
  await port.retryRecovery(ticket);
  await port.closeRecovery(ticket);
  await port.quitPluginWindows();
  expect(call).toHaveBeenCalledWith('retry_detached_window_recovery', {
    request: { contract_version: '0.1.0', attempt_id: ticket.attemptId, transfer_token: ticket.transferToken },
  });
  expect(call).toHaveBeenCalledWith('close_detached_window_recovery', {
    request: { contract_version: '0.1.0', attempt_id: ticket.attemptId, transfer_token: ticket.transferToken },
  });
  expect(call).toHaveBeenCalledWith('quit_plugin_windows', { request: { contract_version: '0.1.0' } });
});

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`recovery controls keep their original instance through explicit successful restoration in ${locale}/${theme}`, async () => {
      const f = await fixture();
      f.ready();
      render(
        <AppProviders initialLocale={locale} initialThemeMode={theme}>
          <f.Harness mainPage={false} />
        </AppProviders>,
      );
      await act(async () =>
        f.setNative({
          admissionFailure: null,
          pendingAttempts: [],
          recovery: [{ status: 'recovery_required', ticket }],
        }),
      );
      const retryName = locale === 'en-US' ? 'Retry restoration' : '重试恢复';
      expect(screen.getByRole('button', { name: locale === 'en-US' ? 'Close instance' : '关闭实例' })).toBeEnabled();
      expect(screen.getByRole('button', { name: locale === 'en-US' ? 'Quit lensX' : '退出 lensX' })).toBeEnabled();
      f.port.retryRecovery.mockImplementationOnce(async () => {
        await f.setNative({
          admissionFailure: null,
          pendingAttempts: [],
          recovery: [],
        });
        return { status: 'restored', owner: { windowLabel: 'main', ownershipRevision: 2n } };
      });
      fireEvent.click(screen.getByRole('button', { name: retryName }));
      await waitFor(() => expect(screen.queryByRole('button', { name: retryName })).not.toBeInTheDocument());
      expect(f.port.retryRecovery).toHaveBeenCalledWith(ticket);
      expect(f.binding.attempt.isCurrent()).toBe(true);
      expect(f.controller.create).not.toHaveBeenCalled();
      expect(f.controller.waitReadiness).not.toHaveBeenCalled();
      expect(document.body.getAttribute('theme-mode')).toBe(theme === 'dark' ? 'dark' : null);
    });
  }
