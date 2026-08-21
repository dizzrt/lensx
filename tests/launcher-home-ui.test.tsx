import { describe, expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import {
  LauncherActionDispatcher,
  LauncherActionRegistry,
  type LauncherActionService,
} from '../src/app/launcher/actions';
import type { LauncherActionCollections, LauncherActionCollectionsClient } from '../src/app/launcher/collections';

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
        createCollections(
          [actionId(2), 'tools.workspace.missing', actionId(1), actionId(0)],
          [actionId(2), actionId(0)],
        ),
      recordUse: async () => createCollections(),
      setPinned: async () => createCollections(),
    });

    const recent = screen.getByRole('region', { name: 'Recent' });
    const pinned = screen.getByRole('region', { name: 'Pinned' });
    await waitFor(() => expect(within(recent).getAllByRole('button')).toHaveLength(2));
    expect(
      within(recent)
        .getAllByText(/Action [02]/)
        .map((node) => node.textContent),
    ).toEqual(['Action 2', 'Action 0']);
    expect(within(recent).queryByText(/Action 1|missing/)).not.toBeInTheDocument();
    expect(
      within(pinned)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Action 2', 'Action 0']);
    expect(within(pinned).queryByRole('button', { name: /pin|unpin|menu/iu })).not.toBeInTheDocument();
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

  test('keeps persisted pins read-only while their primary Actions remain keyboard and pointer operable', async () => {
    const { executors, service } = createService(1);
    const confirmed = createCollections([actionId(0)], [actionId(0)]);
    const recordUse = rs.fn(async () => confirmed);
    const setPinned = rs.fn(async () => confirmed);
    renderHome(service, {
      read: async () => confirmed,
      recordUse,
      setPinned,
    });

    const recent = screen.getByRole('region', { name: 'Recent' });
    const pinned = screen.getByRole('region', { name: 'Pinned' });
    const recentAction = await within(recent).findByRole('button', { name: /^Action 0/ });
    const pinnedAction = within(pinned).getByRole('button', { name: /^Action 0/ });
    expect(within(recent).getAllByRole('button')).toEqual([recentAction]);
    expect(within(pinned).getAllByRole('button')).toEqual([pinnedAction]);
    expect(document.querySelector('.launcher-action-pin')).not.toBeInTheDocument();

    pinnedAction.focus();
    expect(pinnedAction).toHaveFocus();
    fireEvent.keyDown(pinnedAction, { key: 'Enter' });
    fireEvent.click(pinnedAction);

    await waitFor(() => expect(executors[0]).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(recordUse).toHaveBeenCalledWith(actionId(0)));
    expect(setPinned).not.toHaveBeenCalled();
    expect(within(pinned).getByText('Action 0')).toBeInTheDocument();
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
    expect(screen.getByRole('region', { name: '已固定' })).toHaveTextContent('已固定的操作会显示在这里。');
    expect(screen.queryByRole('button', { name: /固定|取消固定|菜单/u })).not.toBeInTheDocument();
    expect(screen.getByText('全部')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: '全部' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '全部' })).not.toBeInTheDocument();
    const avatar = document.querySelector('.launcher-avatar');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).not.toHaveAttribute('tabindex');
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
  });
});
