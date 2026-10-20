import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import {
  LauncherActionDispatcher,
  type LauncherActionDispatchResult,
  LauncherActionRegistry,
  type LauncherActionService,
} from '../src/app/launcher/actions';
import type { LauncherActionCollections, LauncherActionCollectionsClient } from '../src/app/launcher/collections';
import type { LauncherSurfaceController } from '../src/app/launcher/surface';
import { installActionTitleMeasurement } from './helpers/action-title-measurement';

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

const createService = (count: number, disabledIndex?: number, titles: readonly string[] = []) => {
  const registry = new LauncherActionRegistry();
  const executors = Array.from({ length: count }, () => rs.fn(() => undefined));
  const result = registry.registerBatch(
    executors.map((executor, index) => ({
      descriptor: {
        action_id: actionId(index),
        owner_id: 'tools.workspace',
        title: { 'en-US': titles[index] ?? `Action ${index}`, 'zh-CN': `操作 ${index}` },
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
  surfaceController?: LauncherSurfaceController,
) =>
  render(
    <AppProviders initialLocale={initialLocale} initialThemeMode={initialThemeMode}>
      <App
        actionService={service}
        activationSource={inertActivationSource}
        collectionsClient={collectionsClient}
        surfaceController={surfaceController}
      />
    </AppProviders>,
  );

describe('launcher home action collections', () => {
  test('arbitrates one readable tooltip across duplicate collection entries without changing focus or controls', async () => {
    const longTitle = 'Inspect the complete workspace configuration history';
    const measurement = installActionTitleMeasurement({
      availableWidth: 64,
      measureTextWidth: (title, fontSize) => title.length * fontSize * 0.5,
    });
    const { executors, service } = createService(2, undefined, [longTitle, 'Short']);
    const confirmed = createCollections([actionId(0), actionId(1)], [actionId(0), actionId(1)]);
    const view = renderHome(service, {
      read: async () => confirmed,
      recordUse: async () => confirmed,
      setPinned: async () => confirmed,
    });
    try {
      const recent = screen.getByRole('region', { name: 'Recent' });
      const pinned = screen.getByRole('region', { name: 'Pinned' });
      const recentLong = await within(recent).findByRole('button', { name: longTitle });
      const pinnedLong = within(pinned).getByRole('button', { name: longTitle });
      const pinnedShort = within(pinned).getByRole('button', { name: 'Short' });
      const mainButtons = screen.getAllByRole('button');

      act(() => recentLong.focus());
      const firstTooltip = await screen.findByRole('tooltip');
      expect(firstTooltip).toHaveTextContent(longTitle);
      expect(recentLong).toHaveFocus();
      expect(recentLong).toHaveAccessibleName(longTitle);
      expect(view.container).not.toContainElement(firstTooltip);
      expect(within(firstTooltip).queryByRole('button')).not.toBeInTheDocument();
      const recentTooltipId = recentLong.getAttribute('aria-describedby');

      fireEvent.mouseEnter(pinnedLong.closest('.launcher-action-tile') as HTMLElement);
      await waitFor(() => expect(pinnedLong).toHaveAttribute('aria-describedby'));
      expect(screen.getAllByRole('tooltip')).toHaveLength(1);
      expect(pinnedLong.getAttribute('aria-describedby')).not.toBe(recentTooltipId);
      expect(recentLong).not.toHaveAttribute('aria-describedby');
      expect(recentLong).toHaveFocus();

      const popupContent = screen.getByRole('tooltip').querySelector('.launcher-action-tooltip-content') as HTMLElement;
      fireEvent.mouseLeave(pinnedLong.closest('.launcher-action-tile') as HTMLElement);
      fireEvent.mouseEnter(popupContent);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
      });
      expect(screen.getByRole('tooltip')).toHaveTextContent(longTitle);
      fireEvent.scroll(popupContent, { target: { scrollTop: 40 } });
      expect(screen.getByRole('tooltip')).toHaveTextContent(longTitle);
      fireEvent.mouseLeave(popupContent);
      await waitFor(() => expect(recentLong).toHaveAttribute('aria-describedby', recentTooltipId));

      fireEvent.mouseEnter(pinnedShort.closest('.launcher-action-tile') as HTMLElement);
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
      fireEvent.mouseLeave(pinnedShort.closest('.launcher-action-tile') as HTMLElement);
      await screen.findByRole('tooltip');
      expect(recentLong).toHaveFocus();

      fireEvent.keyDown(recentLong, { key: 'Escape', isComposing: true });
      expect(screen.getByRole('tooltip')).toHaveTextContent(longTitle);
      fireEvent.keyDown(recentLong, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
      act(() => {
        measurement.notifyResize();
        measurement.flushFrame();
      });
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(executors[0]).not.toHaveBeenCalled();
      expect(recentLong).toHaveFocus();
      act(() => {
        recentLong.blur();
        recentLong.focus();
      });
      await screen.findByRole('tooltip');
      expect(screen.getAllByRole('button')).toEqual(mainButtons);
      expect(mainButtons.every((button) => button.tabIndex === 0)).toBe(true);
      expect(
        [...view.container.querySelectorAll<HTMLElement>('button,input,[tabindex]')].filter(
          (element) => element.tabIndex >= 0,
        ),
      ).toEqual([screen.getByRole('combobox', { name: 'Launcher query' }), ...mainButtons]);

      const input = screen.getByRole('combobox', { name: 'Launcher query' });
      act(() => input.focus());
      fireEvent.mouseEnter(pinnedLong.closest('.launcher-action-tile') as HTMLElement);
      await screen.findByRole('tooltip');
      fireEvent.keyDown(input, { key: 'Escape', keyCode: 229 });
      expect(screen.getByRole('tooltip')).toHaveTextContent(longTitle);
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(input).toHaveFocus();

      act(() => recentLong.focus());
      fireEvent.keyDown(recentLong, { key: 'Enter' });
      fireEvent.click(recentLong);
      await waitFor(() => expect(executors[0]).toHaveBeenCalledTimes(1));
      act(() => pinnedLong.focus());
      fireEvent.keyDown(pinnedLong, { key: ' ' });
      fireEvent.click(pinnedLong);
      await waitFor(() => expect(executors[0]).toHaveBeenCalledTimes(2));
    } finally {
      view.unmount();
      measurement.restore();
    }
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('keeps eight primary Actions in each collection ordered through pending and collection failure without resizing Home', async () => {
    const base = createService(8);
    const recentOrder = [7, 0, 6, 1, 5, 2, 4, 3];
    const pinnedOrder = [3, 4, 2, 5, 1, 6, 0, 7];
    const confirmed = createCollections(recentOrder.map(actionId), pinnedOrder.map(actionId));
    let resolveDispatch: (result: LauncherActionDispatchResult) => void = () => undefined;
    const pendingDispatch = new Promise<LauncherActionDispatchResult>((resolve) => {
      resolveDispatch = resolve;
    });
    const dispatch = rs.fn(async () => pendingDispatch);
    const recordUse = rs.fn(async () => {
      throw new Error('private collection detail');
    });
    const setPinned = rs.fn(async () => confirmed);
    const setPresentationState = rs.fn(async () => undefined);
    renderHome(
      { registry: base.service.registry, dispatcher: { dispatch } },
      { read: async () => confirmed, recordUse, setPinned },
      'en-US',
      'light',
      { setPresentationState },
    );

    const recent = screen.getByRole('region', { name: 'Recent' });
    const pinned = screen.getByRole('region', { name: 'Pinned' });
    await waitFor(() => expect(within(recent).getAllByRole('button')).toHaveLength(8));
    const recentButtons = within(recent).getAllByRole('button');
    const pinnedButtons = within(pinned).getAllByRole('button');
    expect(recentButtons).toEqual(
      recentOrder.map((index) => within(recent).getByRole('button', { name: `Action ${index}` })),
    );
    expect(pinnedButtons).toEqual(
      pinnedOrder.map((index) => within(pinned).getByRole('button', { name: `Action ${index}` })),
    );
    expect(screen.getAllByRole('button')).toHaveLength(16);
    expect(setPresentationState.mock.calls).toEqual([[{ kind: 'home' }]]);

    fireEvent.click(pinnedButtons[0]);
    fireEvent.click(pinnedButtons[0]);
    fireEvent.click(within(recent).getByRole('button', { name: 'Action 3' }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(actionId(3));
    expect(screen.getByRole('status')).toHaveTextContent('Running Action 3…');
    for (const collection of [recent, pinned]) {
      expect(within(collection).getByRole('button', { name: 'Action 3' })).toBeDisabled();
      expect(within(collection).getByRole('button', { name: 'Action 3' })).toHaveAttribute('aria-busy', 'true');
      expect(within(collection).getAllByRole('button')).toHaveLength(8);
    }

    await act(async () => {
      resolveDispatch({
        ok: true,
        action_id: actionId(3),
      });
      await pendingDispatch;
    });

    expect(
      await screen.findByText('The action completed, but its collection could not be updated.'),
    ).toBeInTheDocument();
    expect(within(recent).getAllByRole('button')).toEqual(recentButtons);
    expect(within(pinned).getAllByRole('button')).toEqual(pinnedButtons);
    expect(within(pinned).getByRole('button', { name: 'Action 3' })).toBeEnabled();
    expect(recordUse).toHaveBeenCalledTimes(1);
    expect(recordUse).toHaveBeenCalledWith(actionId(3));
    expect(setPinned).not.toHaveBeenCalled();
    expect(screen.queryByText('private collection detail')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Launcher query' })).toHaveValue('');
    expect(setPresentationState.mock.calls).toEqual([[{ kind: 'home' }]]);
  });

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
        .getAllByRole('button')
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
    expect(await screen.findByRole('button', { name: 'Action 0' })).toBeInTheDocument();
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
    expect(within(pinned).getByRole('button', { name: 'Action 0' })).toBeInTheDocument();
  });

  test('uses localized empty states and keeps avatar and All outside the interaction flow', async () => {
    const { service } = createService(0);
    const setPresentationState = rs.fn(async () => undefined);
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
      { setPresentationState },
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
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(setPresentationState.mock.calls).toEqual([[{ kind: 'home' }]]);
  });
});
