import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
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
    enabled = true,
    executor = () => undefined,
  }: {
    ownerId?: string;
    title?: string;
    description?: string;
    keywords?: readonly string[];
    enabled?: boolean;
    executor?: () => Promise<void> | void;
  } = {},
) => ({
  descriptor: {
    action_id: `${ownerId}.${localId}`,
    owner_id: ownerId,
    title: { 'en-US': title },
    description: { 'en-US': description },
    default_keywords: { 'en-US': [...keywords] },
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

const renderLauncher = (
  service: LauncherActionService,
  {
    activationSource = inertActivationSource,
    initialLocale = 'en-US',
    initialThemeMode = 'light',
  }: {
    activationSource?: LauncherActivationSource;
    initialLocale?: 'en-US' | 'zh-CN';
    initialThemeMode?: 'light' | 'dark';
  } = {},
) =>
  render(
    <AppProviders initialLocale={initialLocale} initialThemeMode={initialThemeMode}>
      <App actionService={service} activationSource={activationSource} />
    </AppProviders>,
  );

describe('launcher action search interface', () => {
  test('matches and executes the real Hide Launcher action through the injected service', async () => {
    const hideLauncher = rs.fn(async () => undefined);
    const service = createDefaultLauncherActionService({ hideLauncher });
    renderLauncher(service);
    const input = screen.getByRole('combobox', { name: 'Launcher query' });

    fireEvent.change(input, { target: { value: 'hide' } });

    const listbox = screen.getByRole('listbox', { name: 'Launcher actions' });
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

  test('hides empty-query state, reports no results, and caps real results at eight', () => {
    const { service } = createService(
      Array.from({ length: 10 }, (_, index) =>
        createRegistration(`action_${String(index).padStart(2, '0')}`, {
          title: `Action ${index}`,
        }),
      ),
    );
    renderLauncher(service);
    const input = screen.getByRole('combobox', { name: 'Launcher query' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.change(input, { target: { value: 'run' } });
    expect(screen.getAllByRole('option')).toHaveLength(8);
    expect(screen.getByRole('status')).toHaveTextContent('Results: 8.');

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.change(input, { target: { value: '\u3000 \t' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.change(input, { target: { value: 'missing' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No matching actions.');
  });

  test('keeps input focus while moving selection within boundaries and clears on Escape', () => {
    const { service } = createService([
      createRegistration('alpha', { title: 'Alpha' }),
      createRegistration('beta', { title: 'Beta' }),
      createRegistration('gamma', { title: 'Gamma' }),
    ]);
    renderLauncher(service);
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'run' } });
    const options = screen.getAllByRole('option');

    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
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
    expect(option).toHaveAttribute('data-selected', 'true');
    expect(document.body).toHaveAttribute('theme-mode', 'dark');
    expect(screen.getByRole('status')).toHaveTextContent('结果：1 项。');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('无法完成该操作。')).toBeInTheDocument();
  });
});
