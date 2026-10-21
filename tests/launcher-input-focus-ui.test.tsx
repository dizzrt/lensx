import { describe, expect, rs, test } from '@rstest/core';
import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import {
  LauncherActionDispatcher,
  type LauncherActionDispatchResult,
  LauncherActionRegistry,
  type LauncherActionService,
} from '../src/app/launcher/actions';
import { EMPTY_LAUNCHER_ACTION_COLLECTIONS } from '../src/app/launcher/collections';
import type { LauncherSurfaceTarget } from '../src/app/launcher/surface';
import { AppNavigationService, HostPageCatalog } from '../src/app/navigation';
import {
  clipboardText,
  editSelection,
  modelPlainTextEditing,
  pressModeledEdit,
  selectEditText,
} from './helpers/modeled-web-editing';

const inertActivationSource = { subscribe: async () => () => undefined };
const settingsTarget = { owner_id: 'lensx.core', page_id: 'settings' };

const renderLauncher = ({
  dispatch,
  initialLocale = 'en-US',
  initialThemeMode = 'light',
  pinned = false,
}: {
  dispatch?: (actionId: string) => Promise<LauncherActionDispatchResult>;
  initialLocale?: 'en-US' | 'zh-CN';
  initialThemeMode?: 'light' | 'dark';
  pinned?: boolean;
} = {}) => {
  const registry = new LauncherActionRegistry();
  const result = registry.registerBatch(
    Array.from({ length: 6 }, (_, index) => ({
      descriptor: {
        action_id: `tools.workspace.action_${index}`,
        owner_id: 'tools.workspace',
        title: { 'en-US': `Action ${index}`, 'zh-CN': `操作 ${index}` },
        default_keywords: { 'en-US': ['run', '运行'], 'zh-CN': ['run', '运行'] },
        enabled: true,
      },
      executor: () => undefined,
    })),
  );
  if (!result.ok) throw new Error('Launcher input test Action registration failed.');
  const actionService: LauncherActionService = {
    registry,
    dispatcher: dispatch ? { dispatch } : new LauncherActionDispatcher(registry),
  };
  const navigationService = new AppNavigationService(new HostPageCatalog([{ ...settingsTarget, enabled: true }]));
  const setPresentationState = rs.fn(async (_target: LauncherSurfaceTarget) => undefined);
  const rendered = render(
    <AppProviders initialLocale={initialLocale} initialThemeMode={initialThemeMode}>
      <App
        actionService={actionService}
        activationSource={inertActivationSource}
        collectionsClient={{
          read: async () => ({
            ...EMPTY_LAUNCHER_ACTION_COLLECTIONS,
            pinned_action_ids: pinned ? ['tools.workspace.action_0'] : [],
          }),
          recordUse: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
          setPinned: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
        }}
        navigationService={navigationService}
        renderPage={() => <div>Trusted page content</div>}
        surfaceController={{ setPresentationState }}
      />
    </AppProviders>,
  );
  const input = screen.getByRole('combobox') as HTMLInputElement;
  return { ...rendered, input, navigationService, registry, setPresentationState };
};

const startComposition = (input: HTMLInputElement, draft: string) => {
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: draft } });
};

const endComposition = (input: HTMLInputElement, value: string) => {
  fireEvent.compositionEnd(input, { target: { value }, data: 'candidate fragment is not the full value' });
};

const failureCases = (['en-US', 'zh-CN'] as const).flatMap((initialLocale) =>
  (['light', 'dark'] as const).flatMap((initialThemeMode) =>
    (['action_not_found', 'action_unavailable', 'action_execution_failed'] as const).map((code) => ({
      initialLocale,
      initialThemeMode,
      code,
    })),
  ),
);

const localizedFeedback = {
  'en-US': {
    inputLabel: 'Launcher query',
    resultsLabel: 'Search results',
    count: 'Results: 6.',
    noResults: 'No matching actions.',
    action_not_found: 'This action no longer exists.',
    action_unavailable: 'This action is currently unavailable.',
    action_execution_failed: 'The action could not be completed.',
  },
  'zh-CN': {
    inputLabel: '启动器查询',
    resultsLabel: '搜索结果',
    count: '结果：6 项。',
    noResults: '没有匹配的操作。',
    action_not_found: '该操作已不存在。',
    action_unavailable: '该操作当前不可用。',
    action_execution_failed: '无法完成该操作。',
  },
};

describe('launcher committed input and IME focus', () => {
  test.each(
    (['en-US', 'zh-CN'] as const).flatMap((initialLocale) =>
      (['light', 'dark'] as const).map((initialThemeMode) => ({ initialLocale, initialThemeMode })),
    ),
  )('real Semi input accepts modeled standard edits in $initialLocale/$initialThemeMode', (options) => {
    const { input } = renderLauncher(options);
    fireEvent.change(input, { target: { value: 'run' } });
    const defaults = modelPlainTextEditing(input);
    const inputTypes: string[] = [];
    const clipboardEvents: string[] = [];
    input.addEventListener('input', (event) => inputTypes.push((event as InputEvent).inputType));
    for (const type of ['copy', 'cut', 'paste']) input.addEventListener(type, () => clipboardEvents.push(type));

    expect(pressModeledEdit(input, 'a', defaults.selectAll).defaultPrevented).toBe(false);
    expect(editSelection(input)).toEqual([0, 3]);
    const output = clipboardText('old clipboard');
    expect(pressModeledEdit(input, 'c', () => defaults.copy(output)).defaultPrevented).toBe(false);
    expect(output.getData('text/plain')).toBe('run');
    expect(input).toHaveValue('run');
    expect(pressModeledEdit(input, 'x', () => defaults.cut(output)).defaultPrevented).toBe(false);
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    const incoming = clipboardText('运行');
    expect(pressModeledEdit(input, 'v', () => defaults.paste(incoming)).defaultPrevented).toBe(false);
    expect(input).toHaveValue('运行');
    expect(editSelection(input)).toEqual([2, 2]);
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(pressModeledEdit(input, 'z', defaults.undo).defaultPrevented).toBe(false);
    expect(input).toHaveValue('');
    expect(pressModeledEdit(input, 'z', defaults.redo, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(input).toHaveValue('运行');
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(inputTypes).toEqual(['deleteByCut', 'insertFromPaste', 'historyUndo', 'historyRedo']);
    expect(clipboardEvents).toEqual(['copy', 'cut', 'paste']);
    expect(output.getData('text/plain')).toBe('run');
    expect(input).toHaveFocus();
  });

  test('Host and an ordinary external editor keep separate selections, clipboard targets and history', () => {
    const { input } = renderLauncher();
    fireEvent.change(input, { target: { value: 'run' } });
    const host = modelPlainTextEditing(input);
    selectEditText(input, 0, 3);
    render(<textarea aria-label="ordinary external test editor" defaultValue="external" />);
    const externalInput = screen.getByLabelText('ordinary external test editor') as HTMLTextAreaElement;
    const external = modelPlainTextEditing(externalInput);
    externalInput.focus();
    selectEditText(externalInput, 0, 8);
    const output = clipboardText('previous');
    pressModeledEdit(externalInput, 'c', () => external.copy(output));
    expect(output.getData('text/plain')).toBe('external');
    pressModeledEdit(externalInput, 'v', () => external.paste(clipboardText('new external')));
    expect(externalInput).toHaveValue('new external');
    host.paste(clipboardText('stale Host delivery'));
    expect(input).toHaveValue('run');
    input.focus();
    expect(host.undo()).toBe(false);
    pressModeledEdit(input, 'v', () => host.paste(clipboardText('运行')));
    expect(input).toHaveValue('运行');
    expect(externalInput).toHaveValue('new external');
    externalInput.focus();
    pressModeledEdit(externalInput, 'z', external.undo);
    expect(externalInput).toHaveValue('external');
    expect(input).toHaveValue('运行');
  });

  test('real Semi input leaves composing standard keys untouched and resumes with one paste edit', () => {
    const { input } = renderLauncher({ initialLocale: 'zh-CN', initialThemeMode: 'dark' });
    startComposition(input, 'yunxing');
    const defaults = modelPlainTextEditing(input);
    const defaultPrimitive = rs.fn();
    for (const sample of [
      { key: 'a' },
      { key: 'c' },
      { key: 'x' },
      { key: 'v' },
      { key: 'z' },
      { key: 'z', shiftKey: true },
    ]) {
      const event = pressModeledEdit(input, sample.key, defaultPrimitive, { ...sample, isComposing: true });
      expect(event.defaultPrevented).toBe(false);
    }
    expect(defaultPrimitive).not.toHaveBeenCalled();
    expect(input).toHaveValue('yunxing');
    endComposition(input, '运行');
    selectEditText(input, 0, 2);
    const edits = rs.fn();
    input.addEventListener('input', edits);
    const event = pressModeledEdit(input, 'v', () => defaults.paste(clipboardText('run')));
    expect(event.defaultPrevented).toBe(false);
    expect(input).toHaveValue('run');
    expect(edits).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(input).toHaveFocus();
  });

  test('displays the first and continuous phonetic draft without leaving home', () => {
    const { input, setPresentationState } = renderLauncher();
    startComposition(input, 'n');
    expect(input).toHaveValue('n');
    fireEvent.change(input, { target: { value: 'nihao' } });

    expect(input).toHaveValue('nihao');
    expect(input).toHaveFocus();
    expect(screen.getByRole('combobox')).toBe(input);
    expect(document.querySelector('[data-presentation-state]')).toHaveAttribute('data-presentation-state', 'home');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByText('No matching actions.')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home']);
  });

  test('retains existing results, selection and announcements throughout a new draft', () => {
    const { input, setPresentationState } = renderLauncher();
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    const selected = screen.getAllByRole('option')[1];
    const listbox = screen.getByRole('listbox');
    const previousStatus = screen.getByRole('status').textContent;
    startComposition(input, 'run yun');
    fireEvent.change(input, { target: { value: 'run yunxing' } });

    expect(input).toHaveValue('run yunxing');
    expect(input).toHaveFocus();
    expect(screen.getByRole('listbox')).toBe(listbox);
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', selected?.id);
    expect(screen.getByRole('status')).toHaveTextContent(previousStatus ?? '');
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home', 'search']);
  });

  test('commits the full Chinese value once and deduplicates the trailing equal change', () => {
    const { input, setPresentationState } = renderLauncher();
    startComposition(input, 'yunxing');
    endComposition(input, '运行');

    expect(input).toHaveValue('运行');
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(input).toHaveFocus();
    expect(screen.getByRole('combobox')).toBe(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    const selected = screen.getAllByRole('option')[1];
    fireEvent.change(input, { target: { value: '运行' } });

    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home', 'search']);
  });

  test('cancels to the prior full value without resetting selection or retaining a draft', () => {
    const { input, setPresentationState } = renderLauncher();
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    const selected = screen.getAllByRole('option')[1];
    startComposition(input, 'run yunxing');
    endComposition(input, 'run');

    expect(input).toHaveValue('run');
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', selected?.id);
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home', 'search']);
  });

  test('applies empty and unmatched composition values and ordinary paste/delete without delay', () => {
    const { input, setPresentationState } = renderLauncher();
    startComposition(input, 'yun');
    endComposition(input, '不存在的操作');
    expect(screen.getByRole('status')).toHaveTextContent('No matching actions.');
    expect(input).toHaveValue('不存在的操作');
    startComposition(input, 'delete draft');
    endComposition(input, '');
    expect(input).toHaveValue('');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(document.querySelector('[data-presentation-state]')).toHaveAttribute('data-presentation-state', 'home');

    const defaults = modelPlainTextEditing(input);
    pressModeledEdit(input, 'v', () => defaults.paste(clipboardText('run')));
    expect(screen.getAllByRole('option')).toHaveLength(6);
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual([
      'home',
      'search',
      'home',
      'search',
      'home',
    ]);
  });

  test.each(['session', 'native', '229'] as const)('gives all search keys to IME when marked by %s', (marker) => {
    const dispatch = rs.fn(
      async (actionId: string): Promise<LauncherActionDispatchResult> => ({
        ok: true,
        action_id: actionId,
      }),
    );
    const { input } = renderLauncher({ dispatch });
    fireEvent.change(input, { target: { value: 'run' } });
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    const selected = screen.getAllByRole('option')[1];
    if (marker === 'session') startComposition(input, 'run yun');

    for (const key of ['Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const event = createEvent.keyDown(input, {
        key,
        isComposing: marker === 'native',
        keyCode: marker === '229' ? 229 : 0,
      });
      fireEvent(input, event);
      expect(event.defaultPrevented).toBe(false);
      expect(selected).toHaveAttribute('aria-selected', 'true');
      expect(input).toHaveValue(marker === 'session' ? 'run yun' : 'run');
      expect(input).toHaveFocus();
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('protects marked confirmation keys after composition end and immediately restores ordinary keys', async () => {
    const dispatch = rs.fn(
      async (actionId: string): Promise<LauncherActionDispatchResult> => ({
        ok: false,
        action_id: actionId,
        error: { code: 'action_execution_failed', message: 'private detail' },
      }),
    );
    const { input } = renderLauncher({ dispatch });
    startComposition(input, 'yunxing');
    endComposition(input, '运行');
    const options = screen.getAllByRole('option');
    for (const key of ['Enter', 'Escape', 'ArrowRight']) {
      const event = createEvent.keyDown(input, { key, isComposing: true });
      fireEvent(input, event);
      expect(event.defaultPrevented).toBe(false);
    }
    const legacyConfirmation = createEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent(input, legacyConfirmation);
    expect(legacyConfirmation.defaultPrevented).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(input).toHaveValue('运行');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('tools.workspace.action_1'));
    await screen.findByRole('alert');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  test('a successful home pointer Action retires an uncommitted draft without replacing the input', async () => {
    const { input, setPresentationState } = renderLauncher({ pinned: true });
    const action = await screen.findByRole('button', { name: /^Action 0/ });
    startComposition(input, 'yunxing');
    fireEvent.click(action);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Action completed.'));
    expect(input).toHaveValue('');
    expect(screen.getByRole('combobox')).toBe(input);
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'yunxing' } });
    expect(input).toHaveValue('');

    // A fresh ordinary edit is accepted before the retired session's late end.
    fireEvent.change(input, { target: { value: 'run' } });
    expect(screen.getAllByRole('option')).toHaveLength(6);
    endComposition(input, '运行');
    fireEvent.change(input, { target: { value: '运行' } });
    fireEvent.change(input, { target: { value: '运行' } });
    expect(input).toHaveValue('run');
    expect(screen.getByRole('status')).toHaveTextContent('Results: 6.');

    startComposition(input, 'yunxing');
    endComposition(input, '运行');
    expect(input).toHaveValue('运行');
    expect(input).toHaveFocus();
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home', 'search']);
  });

  test('a successful search pointer Action converges query and draft and rejects late end/change', async () => {
    const { input, setPresentationState } = renderLauncher();
    fireEvent.change(input, { target: { value: 'run' } });
    startComposition(input, 'run yunxing');
    fireEvent.click(screen.getAllByRole('option')[0] as HTMLElement);
    await waitFor(() => expect(input).toHaveValue(''));
    endComposition(input, 'run 运行');
    fireEvent.change(input, { target: { value: 'run 运行' } });

    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(screen.getByRole('combobox')).toBe(input);
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home', 'search', 'home']);
    startComposition(input, 'yunxing');
    endComposition(input, '运行');
    expect(screen.getAllByRole('option')).toHaveLength(6);
  });

  test.each([
    { isComposing: true, inputType: 'insertCompositionText' },
    { isComposing: false, inputType: 'insertFromComposition' },
    { isComposing: true, inputType: 'deleteCompositionText' },
  ])('rejects a retired $inputType event before the late end', async ({ isComposing, inputType }) => {
    const { input, setPresentationState } = renderLauncher({ pinned: true });
    const action = await screen.findByRole('button', { name: /^Action 0/ });
    startComposition(input, 'yunxing');
    fireEvent.click(action);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Action completed.'));
    fireEvent.input(input, { target: { value: '运行' }, isComposing, inputType });
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home']);

    fireEvent.input(input, { target: { value: 'run' }, isComposing: false, inputType: 'insertText' });
    expect(input).toHaveValue('run');
    expect(screen.getAllByRole('option')).toHaveLength(6);
    endComposition(input, '运行');
    fireEvent.input(input, { target: { value: '运行' }, isComposing: false, inputType: 'insertFromComposition' });
    expect(input).toHaveValue('run');
    startComposition(input, 'yunxing');
    endComposition(input, '运行');
    expect(input).toHaveValue('运行');
    expect(input).toHaveFocus();
  });

  test('ordinary Escape resets committed input and late duplicate notifications do not resurrect it', () => {
    const { input, setPresentationState } = renderLauncher();
    startComposition(input, 'yunxing');
    endComposition(input, '运行');
    fireEvent.keyDown(input, { key: 'Escape' });
    endComposition(input, '运行');
    fireEvent.change(input, { target: { value: '运行' } });
    expect(input).toHaveValue('');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home', 'search', 'home']);

    const defaults = modelPlainTextEditing(input);
    pressModeledEdit(input, 'v', () => defaults.paste(clipboardText('运行')));
    expect(screen.getAllByRole('option')).toHaveLength(6);
  });

  test('page transitions reject old input events during the page and after a new input session starts', async () => {
    const { input: oldInput, navigationService, setPresentationState } = renderLauncher();
    startComposition(oldInput, 'yunxing');
    act(() => navigationService.openPage(settingsTarget, 'tools.workspace.action_0'));
    expect(screen.getByText('Trusted page content')).toBeInTheDocument();
    endComposition(oldInput, '运行');
    fireEvent.change(oldInput, { target: { value: '运行' } });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Trusted page content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close settings and return home' }));
    const input = (await screen.findByRole('combobox')) as HTMLInputElement;
    expect(input).not.toBe(oldInput);
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    startComposition(input, 'new draft');
    endComposition(oldInput, '运行');
    fireEvent.change(oldInput, { target: { value: '运行' } });
    expect(input).toHaveValue('new draft');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    endComposition(input, '运行');
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual([
      'home',
      'host_page',
      'home',
      'search',
    ]);
  });

  test('unmount retires a draft and detached events cannot affect the next mounted launcher', () => {
    const previous = renderLauncher();
    startComposition(previous.input, 'yunxing');
    previous.unmount();
    const { input, setPresentationState } = renderLauncher();
    startComposition(input, 'new draft');
    endComposition(previous.input, '运行');
    fireEvent.change(previous.input, { target: { value: '运行' } });
    expect(input).toHaveValue('new draft');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home']);
    endComposition(input, '运行');
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(input).toHaveFocus();
  });

  test.each(failureCases)('preserves accessible Chinese input after $code in $initialLocale/$initialThemeMode', async ({
    initialLocale,
    initialThemeMode,
    code,
  }) => {
    const dispatch = rs.fn(
      async (actionId: string): Promise<LauncherActionDispatchResult> => ({
        ok: false,
        action_id: actionId,
        error: { code, message: 'sensitive native dispatcher detail' },
      }),
    );
    const { input, setPresentationState } = renderLauncher({ dispatch, initialLocale, initialThemeMode });
    const messages = localizedFeedback[initialLocale];
    expect(screen.getByRole('combobox', { name: messages.inputLabel })).toBe(input);
    startComposition(input, 'yunxing');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    endComposition(input, '运行');
    const listbox = screen.getByRole('listbox', { name: messages.resultsLabel });
    const options = screen.getAllByRole('option');
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    const selected = options[1];
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(input).toHaveAttribute('aria-activedescendant', selected?.id);
    expect(input).toHaveAttribute('aria-describedby', screen.getByRole('status').id);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(messages.count);
    expect(listbox).toHaveClass('grid-cols-4');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent(messages[code]);
    expect(dispatch).toHaveBeenCalledWith('tools.workspace.action_1');
    expect(input).toHaveValue('运行');
    expect(input).toHaveFocus();
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox')).toBe(input);
    expect(document.body).not.toHaveTextContent('sensitive native dispatcher detail');
    if (initialThemeMode === 'dark') expect(document.body).toHaveAttribute('theme-mode', 'dark');
    else expect(document.body).not.toHaveAttribute('theme-mode');

    startComposition(input, '运行 yun');
    expect(screen.getByRole('status')).toHaveTextContent(messages.count);
    expect(selected).toHaveAttribute('aria-selected', 'true');
    endComposition(input, '运行 ');
    expect(input).toHaveValue('运行 ');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
    await screen.findByRole('alert');

    fireEvent.change(input, { target: { value: 'ordinary unmatched text' } });
    expect(screen.getByRole('status')).toHaveTextContent(messages.noResults);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(input).toHaveFocus();
    expect(setPresentationState.mock.calls.map(([target]) => target.kind)).toEqual(['home', 'search']);
  });
});
