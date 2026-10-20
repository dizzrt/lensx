import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import { useAppLocale } from '../src/app/i18n';
import {
  createDefaultLauncherActionService,
  LauncherActionDispatcher,
  type LauncherActionDispatchResult,
  LauncherActionRegistry,
  type LauncherActionService,
} from '../src/app/launcher/actions';
import type {
  LauncherActivationErrorListener,
  LauncherActivationListener,
  LauncherActivationPayload,
  LauncherActivationSource,
} from '../src/app/launcher/activation';
import {
  EMPTY_LAUNCHER_ACTION_COLLECTIONS,
  type LauncherActionCollectionsClient,
} from '../src/app/launcher/collections';
import type { LauncherSurfaceController } from '../src/app/launcher/surface';
import { useAppTheme } from '../src/app/theme';
import { installActionTitleMeasurement } from './helpers/action-title-measurement';

class FakeActivationSource implements LauncherActivationSource {
  readonly listeners = new Set<LauncherActivationListener>();

  subscribe = async (listener: LauncherActivationListener, _onError: LauncherActivationErrorListener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  emit(payload: LauncherActivationPayload) {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}

const inertActivationSource: LauncherActivationSource = {
  subscribe: async () => () => undefined,
};

const createRegistration = (
  localId: string,
  {
    ownerId = 'tools.workspace',
    title = localId,
    description = `${title} description`,
    keywords = ['run'],
    zhTitle,
    zhDescription,
    zhKeywords,
    enabled = true,
    executor = () => undefined,
    icon,
  }: {
    ownerId?: string;
    title?: string;
    description?: string;
    keywords?: readonly string[];
    zhTitle?: string;
    zhDescription?: string;
    zhKeywords?: readonly string[];
    enabled?: boolean;
    executor?: () => Promise<void> | void;
    icon?: { readonly kind: 'host'; readonly token: string };
  } = {},
) => ({
  descriptor: {
    action_id: `${ownerId}.${localId}`,
    owner_id: ownerId,
    title: { 'en-US': title, ...(zhTitle !== undefined ? { 'zh-CN': zhTitle } : {}) },
    description: { 'en-US': description, ...(zhDescription !== undefined ? { 'zh-CN': zhDescription } : {}) },
    default_keywords: { 'en-US': [...keywords], ...(zhKeywords !== undefined ? { 'zh-CN': [...zhKeywords] } : {}) },
    ...(icon ? { icon } : {}),
    enabled,
  },
  executor,
});

const createService = (
  registrations: readonly ReturnType<typeof createRegistration>[],
  dispatch?: (actionId: string) => Promise<LauncherActionDispatchResult>,
) => {
  const registry = new LauncherActionRegistry();
  const registrationResult = registry.registerBatch(registrations);
  if (!registrationResult.ok) {
    throw new Error(`Test action registration failed: ${JSON.stringify(registrationResult.diagnostics)}`);
  }

  const service: LauncherActionService = {
    registry,
    dispatcher: dispatch ? { dispatch } : new LauncherActionDispatcher(registry),
  };
  return { registry, service };
};

const TestLocaleControls = () => {
  const { setLocale } = useAppLocale();
  const { setThemeMode } = useAppTheme();
  return (
    <aside aria-label="test locale controls">
      <button onClick={() => setLocale('zh-CN')} type="button">
        Use Chinese
      </button>
      <button onClick={() => setLocale('en-US')} type="button">
        Use English
      </button>
      <button onClick={() => setThemeMode('dark')} type="button">
        Use dark theme
      </button>
      <button onClick={() => setThemeMode('light')} type="button">
        Use light theme
      </button>
    </aside>
  );
};

const renderLauncher = (
  service: LauncherActionService,
  {
    activationSource = inertActivationSource,
    initialLocale = 'en-US',
    initialThemeMode = 'light',
    surfaceController,
    withLocaleControls = false,
    collectionsClient = {
      read: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
      recordUse: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
      setPinned: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
    },
  }: {
    activationSource?: LauncherActivationSource;
    initialLocale?: 'en-US' | 'zh-CN';
    initialThemeMode?: 'light' | 'dark';
    surfaceController?: LauncherSurfaceController;
    withLocaleControls?: boolean;
    collectionsClient?: LauncherActionCollectionsClient;
  } = {},
) =>
  render(
    <AppProviders initialLocale={initialLocale} initialThemeMode={initialThemeMode}>
      {withLocaleControls ? <TestLocaleControls /> : null}
      <App
        actionService={service}
        activationSource={activationSource}
        collectionsClient={collectionsClient}
        surfaceController={surfaceController}
      />
    </AppProviders>,
  );

describe('launcher action search interface', () => {
  test('shows selected names without moving input focus and preserves pointer, keyboard, IME, and pending behavior', async () => {
    const firstTitle = 'Inspect the complete workspace configuration history';
    const lastTitle = 'Review every saved workspace configuration change';
    const measurement = installActionTitleMeasurement({
      availableWidth: 70,
      measureTextWidth: (title, fontSize) => title.length * fontSize * 0.5,
    });
    let resolveDispatch: (result: LauncherActionDispatchResult) => void = () => undefined;
    const pendingDispatch = new Promise<LauncherActionDispatchResult>((resolve) => {
      resolveDispatch = resolve;
    });
    const dispatch = rs.fn(async () => pendingDispatch);
    const { service } = createService(
      [
        createRegistration('alpha', { title: firstTitle }),
        createRegistration('beta', { title: 'Short' }),
        createRegistration('gamma', { title: lastTitle }),
      ],
      dispatch,
    );
    const view = renderLauncher(service);
    try {
      const input = screen.getByRole('combobox', { name: 'Launcher query' });
      fireEvent.change(input, { target: { value: 'run' } });
      const options = screen.getAllByRole('option');
      expect(await screen.findByRole('tooltip')).toHaveTextContent(firstTitle);
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-describedby', 'launcher-status');
      expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
      expect(options.every((option) => option.tabIndex === -1)).toBe(true);
      expect(
        [...view.container.querySelectorAll<HTMLElement>('button,input,[tabindex]')].filter(
          (element) => element.tabIndex >= 0,
        ),
      ).toEqual([input]);

      fireEvent.keyDown(input, { key: 'ArrowRight' });
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
      fireEvent.keyDown(input, { key: 'ArrowRight' });
      expect(await screen.findByRole('tooltip')).toHaveTextContent(lastTitle);
      fireEvent.mouseEnter(options[0].closest('.launcher-action-tile') as HTMLElement);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(firstTitle);
      expect(options[2]).toHaveAttribute('aria-selected', 'true');
      fireEvent.mouseEnter(options[1].closest('.launcher-action-tile') as HTMLElement);
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
      fireEvent.mouseLeave(options[1].closest('.launcher-action-tile') as HTMLElement);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(lastTitle);
      act(() => input.blur());
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
      act(() => input.focus());
      expect(await screen.findByRole('tooltip')).toHaveTextContent(lastTitle);

      fireEvent.compositionStart(input);
      for (const key of ['ArrowLeft', 'Enter', 'Escape']) {
        fireEvent.keyDown(input, { key, isComposing: true });
      }
      expect(input).toHaveValue('run');
      expect(input).toHaveAttribute('aria-activedescendant', options[2].id);
      expect(screen.getByRole('tooltip')).toHaveTextContent(lastTitle);
      expect(dispatch).not.toHaveBeenCalled();
      fireEvent.compositionEnd(input, { data: 'run', target: { value: 'run' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.click(options[2]);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith('tools.workspace.gamma');
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('aria-describedby', 'launcher-status');

      await act(async () => {
        resolveDispatch({ ok: true, action_id: 'tools.workspace.gamma' });
        await pendingDispatch;
      });
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(input).not.toHaveAttribute('aria-activedescendant');
    } finally {
      view.unmount();
      measurement.restore();
    }
  });

  test('refreshes localized names and English fallback in the body overlay across theme and measurement updates', async () => {
    const englishTitle = 'Inspect the complete workspace configuration history';
    const chineseTitle = '查看工作区的完整配置修改历史记录';
    const fallbackTitle = 'Review every saved workspace configuration change';
    const measurement = installActionTitleMeasurement({
      availableWidth: 70,
      measureTextWidth: (title, fontSize) => title.length * fontSize * 0.5,
    });
    const { service } = createService([
      createRegistration('alpha', { title: englishTitle, zhTitle: chineseTitle }),
      createRegistration('beta', { title: fallbackTitle }),
    ]);
    const view = renderLauncher(service, { withLocaleControls: true });
    try {
      const input = screen.getByRole('combobox', { name: 'Launcher query' });
      fireEvent.change(input, { target: { value: 'run' } });
      const firstOptionId = screen.getAllByRole('option')[0].id;
      expect(await screen.findByRole('tooltip')).toHaveTextContent(englishTitle);
      fireEvent.click(screen.getByRole('button', { name: 'Use Chinese' }));
      act(() => input.focus());
      expect(await screen.findByRole('tooltip')).toHaveTextContent(chineseTitle);
      expect(screen.getByRole('option', { name: chineseTitle })).toHaveAttribute('id', firstOptionId);
      expect(input).toHaveAttribute('aria-activedescendant', firstOptionId);
      expect(input).toHaveAttribute('aria-describedby', 'launcher-status');

      fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }));
      const darkTooltip = await screen.findByRole('tooltip');
      expect(document.body).toHaveAttribute('theme-mode', 'dark');
      expect(document.body).toContainElement(darkTooltip);
      expect(view.container).not.toContainElement(darkTooltip);
      expect(darkTooltip).toHaveTextContent(chineseTitle);
      fireEvent.keyDown(input, { key: 'ArrowRight' });
      expect(await screen.findByRole('tooltip')).toHaveTextContent(fallbackTitle);
      expect(screen.getByRole('option', { name: fallbackTitle })).toHaveAttribute('aria-selected', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }));
      expect(document.body).not.toHaveAttribute('theme-mode');
      expect(screen.getByRole('tooltip')).toHaveTextContent(fallbackTitle);

      act(() => {
        measurement.setAvailableWidth(1000);
        measurement.notifyResize();
        measurement.flushFrame();
      });
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
      act(() => {
        measurement.setAvailableWidth(70);
        measurement.notifyResize();
        measurement.flushFrame();
      });
      expect(await screen.findByRole('tooltip')).toHaveTextContent(fallbackTitle);
      act(() => {
        measurement.setMeasureTextWidth(() => 20);
        measurement.notifyFonts();
        measurement.flushFrame();
      });
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
      act(() => {
        measurement.setMeasureTextWidth((title, fontSize) => title.length * fontSize * 0.5);
        measurement.notifyFonts();
        measurement.flushFrame();
      });
      await screen.findByRole('tooltip');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input).toHaveValue('');
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      fireEvent.change(input, { target: { value: 'run' } });
      expect(await screen.findByRole('tooltip')).toHaveTextContent(chineseTitle);
    } finally {
      view.unmount();
      measurement.restore();
    }
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  test('removes stale full names when the current Action title changes or its provider removes the Action', async () => {
    const longTitle = 'Inspect the complete workspace configuration history';
    const hoveredTitle = 'Review every saved workspace configuration change';
    const hoveredRegistration = createRegistration('beta', { title: hoveredTitle });
    const measurement = installActionTitleMeasurement({
      availableWidth: 70,
      measureTextWidth: (title, fontSize) => title.length * fontSize * 0.5,
    });
    const { registry, service } = createService([
      createRegistration('alpha', { title: longTitle }),
      hoveredRegistration,
    ]);
    const view = renderLauncher(service);
    try {
      const input = screen.getByRole('combobox', { name: 'Launcher query' });
      fireEvent.change(input, { target: { value: 'run' } });
      const optionId = screen.getByRole('option', { name: longTitle }).id;
      expect(await screen.findByRole('tooltip')).toHaveTextContent(longTitle);
      act(() => {
        expect(
          registry.replaceProviderBatch('tools.workspace', [
            createRegistration('alpha', { title: 'Short' }),
            hoveredRegistration,
          ]).ok,
        ).toBe(true);
      });
      expect(screen.getByRole('option', { name: 'Short' })).toHaveAttribute('id', optionId);
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
      expect(input).toHaveFocus();
      expect(input).toHaveValue('run');
      expect(input).toHaveAttribute('aria-activedescendant', optionId);

      act(() => {
        expect(
          registry.replaceProviderBatch('tools.workspace', [
            createRegistration('alpha', { title: longTitle }),
            hoveredRegistration,
          ]).ok,
        ).toBe(true);
      });
      expect(await screen.findByRole('tooltip')).toHaveTextContent(longTitle);
      fireEvent.mouseEnter(
        screen.getByRole('option', { name: hoveredTitle }).closest('.launcher-action-tile') as HTMLElement,
      );
      expect(await screen.findByRole('tooltip')).toHaveTextContent(hoveredTitle);
      act(() => {
        expect(
          registry.replaceProviderBatch('tools.workspace', [createRegistration('alpha', { title: longTitle })]).ok,
        ).toBe(true);
      });
      expect(await screen.findByRole('tooltip')).toHaveTextContent(longTitle);
      expect(screen.getAllByRole('tooltip')).toHaveLength(1);
      expect(input).toHaveAttribute('aria-activedescendant', optionId);
      expect(input).toHaveFocus();
      act(() => {
        expect(registry.replaceProviderBatch('tools.workspace', []).ok).toBe(true);
      });
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
      expect(input).not.toHaveAttribute('aria-activedescendant');
      expect(input).toHaveValue('run');
      expect(input).toHaveFocus();
      expect(screen.getByRole('status')).toHaveTextContent('No matching actions.');
    } finally {
      view.unmount();
      measurement.restore();
    }
  });

  test('preserves Action identities and order while locale changes result titles and English fallback', async () => {
    const { service } = createService([
      createRegistration('zulu_view', {
        title: 'View data',
        zhTitle: '查看数据',
        keywords: ['format'],
        zhKeywords: ['查看'],
      }),
      createRegistration('alpha_open', { title: 'Open notes', keywords: ['format'] }),
      createRegistration('format_json', {
        title: 'Format JSON',
        zhTitle: '格式化 JSON',
        keywords: ['json'],
        zhKeywords: ['格式化'],
      }),
    ]);
    renderLauncher(service, { withLocaleControls: true });
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'format' } });

    const expectedOptionIds = [
      'launcher-action-option-tools.workspace.format_json',
      'launcher-action-option-tools.workspace.alpha_open',
      'launcher-action-option-tools.workspace.zulu_view',
    ];
    expect(screen.getAllByRole('option').map(({ id }) => id)).toEqual(expectedOptionIds);
    expect(screen.getByRole('option', { name: 'Format JSON' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'View data' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Open notes' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Results: 3.');

    fireEvent.click(screen.getByRole('button', { name: 'Use Chinese' }));

    await screen.findByRole('combobox', { name: '启动器查询' });
    expect(screen.getAllByRole('option').map(({ id }) => id)).toEqual(expectedOptionIds);
    expect(screen.getByRole('option', { name: '格式化 JSON' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '查看数据' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Open notes' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Format JSON' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'View data' })).not.toBeInTheDocument();
    expect(input).toHaveValue('format');
    expect(screen.getByRole('status')).toHaveTextContent('结果：3 项。');

    fireEvent.click(screen.getByRole('button', { name: 'Use English' }));

    await screen.findByRole('combobox', { name: 'Launcher query' });
    expect(screen.getAllByRole('option').map(({ id }) => id)).toEqual(expectedOptionIds);
    expect(screen.getByRole('option', { name: 'Format JSON' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'View data' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Open notes' })).toBeInTheDocument();
    expect(input).toHaveValue('format');
  });

  test.each([
    ['en-US', 'local-only', 'Launcher query', 'Search results', 'No matching actions.'],
    ['en-US', '仅限描述', 'Launcher query', 'Search results', 'No matching actions.'],
    ['zh-CN', 'local-only', '启动器查询', '搜索结果', '没有匹配的操作。'],
    ['zh-CN', '仅限描述', '启动器查询', '搜索结果', '没有匹配的操作。'],
  ] as const)('shows localized empty results in %s when %s appears only in descriptions', async (initialLocale, query, inputLabel, resultsLabel, noResultsMessage) => {
    const { service } = createService([
      createRegistration('format_json', {
        title: 'Format JSON',
        zhTitle: '格式化 JSON',
        description: 'A local-only configuration utility',
        zhDescription: '仅限描述的配置说明',
        keywords: ['format'],
        zhKeywords: ['格式化'],
      }),
    ]);
    renderLauncher(service, { initialLocale });
    const input = await screen.findByRole('combobox', { name: inputLabel });
    fireEvent.change(input, { target: { value: query } });

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: resultsLabel })).toBeInTheDocument();
    expect(screen.getAllByText(noResultsMessage)).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent(noResultsMessage);
    expect(input).toHaveValue(query);
    expect(input).toBeEnabled();

    fireEvent.change(input, { target: { value: 'format' } });
    expect(
      screen.getByRole('option', { name: initialLocale === 'zh-CN' ? '格式化 JSON' : 'Format JSON' }),
    ).toBeInTheDocument();
    expect(input).toHaveValue('format');
  });

  test('matches and executes the real Hide Launcher action through the injected service', async () => {
    const hideLauncher = rs.fn(async () => undefined);
    const service = createDefaultLauncherActionService({ hideLauncher });
    renderLauncher(service);
    const input = screen.getByRole('combobox', { name: 'Launcher query' });

    fireEvent.change(input, { target: { value: 'hide' } });

    const listbox = screen.getByRole('listbox', { name: 'Search results' });
    const option = screen.getByRole('option', { name: /Hide launcher/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Results: 1.');
    expect(document.body).not.toHaveTextContent('executor');

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(hideLauncher).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(input).toHaveValue(''));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Action completed.');
    expect(input).toHaveFocus();
  });

  test('uses one four-column result section, reports no results, and caps real results at eight', () => {
    const { service } = createService(
      Array.from({ length: 10 }, (_, index) =>
        createRegistration(`action_${String(index).padStart(2, '0')}`, {
          title: `Action ${index}`,
        }),
      ),
    );
    const setPresentationState = rs.fn(async () => undefined);
    renderLauncher(service, { surfaceController: { setPresentationState } });
    const input = screen.getByRole('combobox', { name: 'Launcher query' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(setPresentationState.mock.calls).toEqual([[{ kind: 'home' }]]);

    fireEvent.change(input, { target: { value: 'run' } });
    expect(screen.getAllByRole('option')).toHaveLength(8);
    expect(screen.getByRole('listbox', { name: 'Search results' })).toHaveClass('grid-cols-4');
    expect(screen.getAllByRole('heading', { level: 2, name: 'Search results' })).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Results: 8.');
    expect(screen.getAllByRole('option')).toEqual(
      Array.from({ length: 8 }, (_, index) => screen.getByRole('option', { name: `Action ${index}` })),
    );
    expect(setPresentationState.mock.calls).toEqual([[{ kind: 'home' }], [{ kind: 'search' }]]);

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.change(input, { target: { value: '\u3000 \t' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.change(input, { target: { value: 'missing' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Search results' })).toBeInTheDocument();
    expect(screen.getAllByText('No matching actions.')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('No matching actions.');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(setPresentationState.mock.calls).toEqual([
      [{ kind: 'home' }],
      [{ kind: 'search' }],
      [{ kind: 'home' }],
      [{ kind: 'search' }],
    ]);
  });

  test('preserves the eight-result four-column order and fixed Search target through pending and failure', async () => {
    let resolveDispatch: (result: LauncherActionDispatchResult) => void = () => undefined;
    const pendingDispatch = new Promise<LauncherActionDispatchResult>((resolve) => {
      resolveDispatch = resolve;
    });
    const dispatch = rs.fn(async () => pendingDispatch);
    const { service } = createService(
      Array.from({ length: 8 }, (_, index) => createRegistration(`action_${index}`, { title: `Action ${index}` })),
      dispatch,
    );
    const setPresentationState = rs.fn(async () => undefined);
    renderLauncher(service, { surfaceController: { setPresentationState } });
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'run' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(8);
    expect(screen.getByRole('listbox', { name: 'Search results' })).toHaveClass('grid-cols-4');

    for (let column = 0; column < 3; column += 1) {
      fireEvent.keyDown(input, { key: 'ArrowRight' });
    }
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[7]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[7].id);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[7]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(options[7]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('tools.workspace.action_7');
    expect(options[7]).toBeDisabled();
    expect(options[7]).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Running Action 7…');
    expect(screen.getAllByRole('option')).toEqual(options);

    await act(async () => {
      resolveDispatch({
        ok: false,
        action_id: 'tools.workspace.action_7',
        error: { code: 'action_execution_failed', message: 'private execution detail' },
      });
      await pendingDispatch;
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('The action could not be completed.');
    expect(screen.getAllByRole('option')).toEqual(options);
    expect(options[7]).toBeEnabled();
    expect(options[7]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[7].id);
    expect(input).toHaveValue('run');
    expect(input).toHaveFocus();
    expect(screen.queryByText('private execution detail')).not.toBeInTheDocument();
    expect(setPresentationState.mock.calls).toEqual([[{ kind: 'home' }], [{ kind: 'search' }]]);
  });

  test('keeps input focus while navigating fixed-grid boundaries and clears on Escape', () => {
    const { service } = createService(
      Array.from({ length: 6 }, (_, index) => createRegistration(`action_${index}`, { title: `Action ${index}` })),
    );
    renderLauncher(service);
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'run' } });
    const options = screen.getAllByRole('option');

    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[5]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[5]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  test('routes Enter and pointer activation through the same Dispatcher method', async () => {
    const dispatch = rs.fn(
      async (actionId: string): Promise<LauncherActionDispatchResult> => ({
        ok: false,
        action_id: actionId,
        error: {
          code: 'action_unavailable',
          message: 'internal message',
        },
      }),
    );
    const { service } = createService(
      [createRegistration('alpha', { title: 'Alpha' }), createRegistration('beta', { title: 'Beta' })],
      dispatch,
    );
    renderLauncher(service);
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'run' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('tools.workspace.alpha'));

    fireEvent.click(screen.getByRole('option', { name: /Beta/ }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('tools.workspace.beta'));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('internal message')).not.toBeInTheDocument();
  });

  test('prevents duplicate dispatch while pending and clears state after success', async () => {
    let resolveDispatch: (result: LauncherActionDispatchResult) => void = () => undefined;
    const pendingDispatch = new Promise<LauncherActionDispatchResult>((resolve) => {
      resolveDispatch = resolve;
    });
    const dispatch = rs.fn(async () => pendingDispatch);
    const { service } = createService([createRegistration('alpha', { title: 'Alpha' })], dispatch);
    renderLauncher(service);
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'run' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Running Alpha…');
    expect(screen.getByRole('option')).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      resolveDispatch({
        ok: true,
        action_id: 'tools.workspace.alpha',
      });
      await pendingDispatch;
    });

    expect(input).toHaveValue('');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Action completed.');
  });

  test.each([
    ['action_not_found', 'This action no longer exists.'],
    ['action_unavailable', 'This action is currently unavailable.'],
    ['action_execution_failed', 'The action could not be completed.'],
  ] as const)('preserves query and selection after %s', async (code, expectedMessage) => {
    const dispatch = async (actionId: string): Promise<LauncherActionDispatchResult> => ({
      ok: false,
      action_id: actionId,
      error: {
        code,
        message: 'sensitive dispatcher detail',
      },
    });
    const { service } = createService([createRegistration('alpha', { title: 'Alpha' })], dispatch);
    renderLauncher(service);
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
    expect(input).toHaveValue('run');
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('sensitive dispatcher detail')).not.toBeInTheDocument();
  });

  test('refreshes the latest Registry snapshot on activation without changing or executing the query', async () => {
    const activationSource = new FakeActivationSource();
    const { registry, service } = createService([]);
    renderLauncher(service, { activationSource });
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'notes' } });
    expect(screen.getByRole('status')).toHaveTextContent('No matching actions.');
    await waitFor(() => expect(activationSource.listeners.size).toBe(1));

    const executor = rs.fn(() => undefined);
    expect(
      registry.register(
        createRegistration('open_notes', {
          title: 'Open notes',
          keywords: ['notes'],
          executor,
        }),
      ).ok,
    ).toBe(true);
    input.blur();
    act(() => activationSource.emit({ reason: 'global_shortcut' }));

    expect(input).toHaveValue('notes');
    expect(input).toHaveFocus();
    expect(screen.getByRole('option', { name: /Open notes/ })).toBeInTheDocument();
    expect(executor).not.toHaveBeenCalled();
  });

  test('uses English metadata fallback with Chinese feedback and dark theme tokens', async () => {
    const dispatch = async (actionId: string): Promise<LauncherActionDispatchResult> => ({
      ok: false,
      action_id: actionId,
      error: {
        code: 'action_execution_failed',
        message: 'internal',
      },
    });
    const { service } = createService([createRegistration('open_notes', { title: 'Open notes' })], dispatch);
    renderLauncher(service, {
      initialLocale: 'zh-CN',
      initialThemeMode: 'dark',
    });
    const input = screen.getByRole('combobox', { name: '启动器查询' });
    fireEvent.change(input, { target: { value: 'run' } });

    const option = await screen.findByRole('option', { name: /Open notes/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
    expect(screen.getByRole('status')).toHaveTextContent('结果：1 项。');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('无法完成该操作。')).toBeInTheDocument();
  });

  test('renders supported Host icons and the stable fallback without changing option names', () => {
    const { service } = createService([
      createRegistration('with_icon', { title: 'With icon', icon: { kind: 'host', token: 'settings' } }),
      createRegistration('without_icon', { title: 'Without icon' }),
    ]);
    renderLauncher(service);
    fireEvent.change(screen.getByRole('combobox', { name: 'Launcher query' }), { target: { value: 'run' } });

    expect(screen.getByRole('option', { name: /With icon/ }).querySelector('[data-icon-token]')).toHaveAttribute(
      'data-icon-token',
      'settings',
    );
    expect(screen.getByRole('option', { name: /Without icon/ }).querySelector('[data-icon-token]')).toHaveAttribute(
      'data-icon-token',
      'action-fallback',
    );
  });
});
