import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import {
  LauncherActionDispatcher,
  LauncherActionRegistry,
  type LauncherActionService,
} from '../src/app/launcher/actions';
import {
  type LauncherActionCollections,
  type LauncherActionCollectionsClient,
  LauncherActionCollectionsError,
} from '../src/app/launcher/collections';

const inertActivationSource = { subscribe: async () => () => undefined };

const createCollections = (
  recentActionIds: readonly string[] = [],
  pinnedActionIds: readonly string[] = [],
): LauncherActionCollections => ({
  version: 1,
  recent_action_ids: recentActionIds,
  pinned_action_ids: pinnedActionIds,
});

const actionId = (index: number) => `tools.workspace.action_${index}`;

const createService = (count: number, disabledIndex?: number) => {
  const registry = new LauncherActionRegistry();
  const executors = Array.from({ length: count }, () => rs.fn(() => undefined));
  const result = registry.registerBatch(
    executors.map((executor, index) => ({
      descriptor: {
        action_id: actionId(index),
        owner_id: 'tools.workspace',
        title: { 'en-US': `Action ${index}`, 'zh-CN': `操作 ${index}` },
        description: { 'en-US': `Description ${index}`, 'zh-CN': `描述 ${index}` },
        default_keywords: { 'en-US': ['run'], 'zh-CN': ['运行'] },
        icon: index === 0 ? { kind: 'host', token: 'settings' } : undefined,
        enabled: index !== disabledIndex,
      },
      executor,
    })),
  );
  if (!result.ok) {
    throw new Error(`Test action registration failed: ${JSON.stringify(result.diagnostics)}`);
  }
  const service: LauncherActionService = { registry, dispatcher: new LauncherActionDispatcher(registry) };
  return { executors, service };
};

const renderHome = (
  service: LauncherActionService,
  collectionsClient: LauncherActionCollectionsClient,
  initialLocale: 'en-US' | 'zh-CN' = 'en-US',
  initialThemeMode: 'light' | 'dark' = 'light',
) =>
  render(
    <AppProviders initialLocale={initialLocale} initialThemeMode={initialThemeMode}>
      <App actionService={service} activationSource={inertActivationSource} collectionsClient={collectionsClient} />
    </AppProviders>,
  );

describe('launcher home action collections', () => {
  test('renders persisted order, filters missing and disabled IDs, and never fills gaps', async () => {
    const { service } = createService(3, 1);
    renderHome(service, {
      read: async () =>
        createCollections([actionId(2), 'tools.workspace.missing', actionId(1), actionId(0)], [actionId(0)]),
      recordUse: async () => createCollections(),
      setPinned: async () => createCollections(),
    });

    const recent = screen.getByRole('region', { name: 'Recent' });
    const pinned = screen.getByRole('region', { name: 'Pinned' });
    await waitFor(() => expect(within(recent).getAllByRole('button')).toHaveLength(4));
    expect(
      within(recent)
        .getAllByText(/Action [02]/)
        .map((node) => node.textContent),
    ).toEqual(['Action 2', 'Action 0']);
    expect(within(recent).queryByText(/Action 1|missing/)).not.toBeInTheDocument();
    expect(within(pinned).getByText('Action 0')).toBeInTheDocument();
    expect(screen.queryByText(/recommend/i)).not.toBeInTheDocument();
  });

  test('records only successful dispatches and keeps collection failure separate from Action success', async () => {
    const { executors, service } = createService(1);
    const recordUse = rs.fn(async () => createCollections([actionId(0)]));
    const firstRender = renderHome(service, {
      read: async () => createCollections(),
      recordUse,
      setPinned: async () => createCollections(),
    });
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(executors[0]).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(recordUse).toHaveBeenCalledWith(actionId(0)));
    expect(await screen.findByText('Action 0')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Action completed.');
    firstRender.unmount();

    const failedRecordUse = rs.fn(async () => {
      throw new Error('/private/collections.json');
    });
    renderHome(service, {
      read: async () => createCollections(),
      recordUse: failedRecordUse,
      setPinned: async () => createCollections(),
    });
    const secondInput = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(secondInput, { target: { value: 'run' } });
    fireEvent.keyDown(secondInput, { key: 'Enter' });
    await waitFor(() => expect(executors[0]).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(failedRecordUse).toHaveBeenCalledWith(actionId(0)));
    expect(secondInput).toHaveValue('');
    expect(
      await screen.findByText('The action completed, but its collection could not be updated.'),
    ).toBeInTheDocument();
  });

  test('does not write recent use after a failed dispatch', async () => {
    const base = createService(1);
    const recordUse = rs.fn(async () => createCollections([actionId(0)]));
    const failedService: LauncherActionService = {
      registry: base.service.registry,
      dispatcher: {
        dispatch: async (id) => ({
          ok: false,
          action_id: id,
          error: { code: 'action_execution_failed', message: 'safe' },
        }),
      },
    };
    renderHome(failedService, {
      read: async () => createCollections(),
      recordUse,
      setPinned: async () => createCollections(),
    });
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('The action could not be completed.');
    expect(recordUse).not.toHaveBeenCalled();
    expect(input).toHaveValue('run');
  });

  test('keeps main activation separate from optimistic pin and unpin operations', async () => {
    const { executors, service } = createService(1);
    let confirmed = createCollections([actionId(0)]);
    const setPinned = rs.fn(async (_id: string, pinned: boolean) => {
      confirmed = createCollections([actionId(0)], pinned ? [actionId(0)] : []);
      return confirmed;
    });
    renderHome(service, {
      read: async () => confirmed,
      recordUse: async () => confirmed,
      setPinned,
    });

    const recent = screen.getByRole('region', { name: 'Recent' });
    const pinned = screen.getByRole('region', { name: 'Pinned' });
    const pinButton = await within(recent).findByRole('button', { name: 'Pin Action 0' });
    const mainButton = within(recent).getByRole('button', { name: /^Action 0/ });
    mainButton.focus();
    expect(mainButton).toHaveFocus();
    pinButton.focus();
    expect(pinButton).toHaveFocus();
    fireEvent.click(pinButton);
    expect(executors[0]).not.toHaveBeenCalled();
    await waitFor(() => expect(setPinned).toHaveBeenCalledWith(actionId(0), true));
    expect(await within(pinned).findByText('Action 0')).toBeInTheDocument();

    fireEvent.click(within(pinned).getByRole('button', { name: 'Unpin Action 0' }));
    await waitFor(() => expect(setPinned).toHaveBeenLastCalledWith(actionId(0), false));
    await waitFor(() => expect(within(pinned).queryByText('Action 0')).not.toBeInTheDocument());
    expect(executors[0]).not.toHaveBeenCalled();
  });

  test('restores confirmed pins after write failure and reports the eight-item capacity', async () => {
    const { service } = createService(9);
    const confirmed = createCollections(
      [actionId(8)],
      Array.from({ length: 8 }, (_, index) => actionId(index)),
    );
    const setPinned = rs.fn(async () => {
      throw new LauncherActionCollectionsError({
        code: 'launcher_action_collections_write_failed',
        operation: 'set_pinned',
        message: 'safe',
      });
    });
    const capacityRender = renderHome(service, {
      read: async () => confirmed,
      recordUse: async () => confirmed,
      setPinned,
    });

    const pinButton = await screen.findByRole('button', { name: 'Pin Action 8' });
    fireEvent.click(pinButton);
    expect(await screen.findByText('You can pin up to eight actions.')).toBeInTheDocument();
    expect(setPinned).not.toHaveBeenCalled();
    expect(within(screen.getByRole('region', { name: 'Pinned' })).getAllByRole('button')).toHaveLength(16);
    capacityRender.unmount();

    const oneAction = createService(1);
    let rejectWrite: (error: Error) => void = () => undefined;
    const pendingWrite = new Promise<LauncherActionCollections>((_resolve, reject) => {
      rejectWrite = reject;
    });
    renderHome(oneAction.service, {
      read: async () => createCollections([actionId(0)]),
      recordUse: async () => createCollections([actionId(0)]),
      setPinned: async () => pendingWrite,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pin Action 0' }));
    expect(await within(screen.getByRole('region', { name: 'Pinned' })).findByText('Action 0')).toBeInTheDocument();
    await act(async () => {
      rejectWrite(
        new LauncherActionCollectionsError({
          code: 'launcher_action_collections_write_failed',
          operation: 'set_pinned',
          message: 'safe',
        }),
      );
      await pendingWrite.catch(() => undefined);
    });
    expect(
      await screen.findByText('Pinned actions could not be updated. Your previous pins are still active.'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Pinned' })).queryByText('Action 0')).not.toBeInTheDocument();
  });

  test('uses localized empty states and keeps avatar and All outside the interaction flow', async () => {
    const { service } = createService(0);
    renderHome(
      service,
      {
        read: async () => {
          throw new Error('/private/collections.json');
        },
        recordUse: async () => createCollections(),
        setPinned: async () => createCollections(),
      },
      'zh-CN',
      'dark',
    );

    expect(await screen.findByText('无法恢复最近使用和已固定操作。')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '最近使用' })).toHaveTextContent('使用过的操作会显示在这里。');
    expect(screen.getByRole('region', { name: '已固定' })).toHaveTextContent('固定操作以便快速访问。');
    expect(screen.getByText('全部')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: '全部' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '全部' })).not.toBeInTheDocument();
    const avatar = document.querySelector('.launcher-avatar');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).not.toHaveAttribute('tabindex');
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
  });
});
