import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppProviders } from '../src/app/AppProviders';
import {
  HIDE_LAUNCHER_ACTION_ID,
  type LauncherActionDescriptor,
  OPEN_SETTINGS_ACTION_ID,
} from '../src/app/launcher/actions';
import { SettingsPage } from '../src/app/pages/SettingsPage';
import { inertPluginManagementService } from '../src/app/plugins/management';
import {
  defaultShortcutConfiguration,
  ShortcutError,
  type ShortcutRecordingEvent,
  type ShortcutService,
  type ShortcutSnapshot,
} from '../src/app/shortcuts';

const action: LauncherActionDescriptor = {
  action_id: 'dev.example.open',
  owner_id: 'dev.example',
  title: { 'en-US': 'Example', 'zh-CN': '示例' },
  enabled: true,
  default_keywords: {},
};
const makeService = (initial?: ShortcutSnapshot) => {
  let snapshot: ShortcutSnapshot = initial ?? {
    configuration: defaultShortcutConfiguration(),
    bindings: [{ target: 'launcher', status: 'active' }],
    recovery_degraded: false,
    diagnostics: [],
  };
  let recordingListener: ((event: ShortcutRecordingEvent) => void) | undefined;
  let snapshotListener: ((value: ShortcutSnapshot) => void) | undefined;
  const endRecording = rs.fn(async () => undefined);
  const write = rs.fn<ShortcutService['write']>(async (_revision, configuration, options) => {
    const confirmed = { ...configuration, revision: snapshot.configuration.revision + 1 };
    snapshot = {
      configuration: confirmed,
      bindings: ['launcher', ...Object.keys(confirmed.actions)].map((target) => ({
        target,
        status: 'active' as const,
      })),
      recovery_degraded: false,
      diagnostics: [],
      ...(snapshot.key_labels ? { key_labels: snapshot.key_labels } : {}),
      ...(!options?.resolveLauncherMigration && snapshot.launcher_migration
        ? { launcher_migration: snapshot.launcher_migration }
        : {}),
    };
    return snapshot;
  });
  const service: ShortcutService = {
    read: rs.fn(async () => snapshot),
    write,
    subscribe: async (listener) => {
      snapshotListener = listener;
      return () => {
        snapshotListener = undefined;
      };
    },
    beginRecording: rs.fn(async () => ({ lease_id: 'lease_1', expires_at: 30000 })),
    renewRecording: rs.fn(async () => ({ lease_id: 'lease_1', expires_at: 30000 })),
    endRecording,
    subscribeRecording: async (listener) => {
      recordingListener = listener;
      return () => {
        recordingListener = undefined;
      };
    },
    requestMonitorPermission: rs.fn(async () => snapshot),
    updateTargets: rs.fn(async () => snapshot),
  };
  return {
    service,
    write,
    endRecording,
    emit: (event: ShortcutRecordingEvent) => recordingListener?.(event),
    publish: (value: ShortcutSnapshot) => {
      snapshot = value;
      snapshotListener?.(value);
    },
  };
};
const setup = async ({
  locale = 'en-US',
  theme = 'light',
  initial,
  actions = [action],
  recordingEventsAvailable = true,
}: {
  locale?: 'en-US' | 'zh-CN';
  theme?: 'light' | 'dark';
  initial?: ShortcutSnapshot;
  actions?: readonly LauncherActionDescriptor[];
  recordingEventsAvailable?: boolean;
} = {}) => {
  const controlled = makeService(initial);
  if (!recordingEventsAvailable) {
    controlled.service.subscribeRecording = async () => {
      throw new ShortcutError('unavailable');
    };
  }
  const result = render(
    <AppProviders initialLocale={locale} initialThemeMode={theme}>
      <SettingsPage
        managementService={inertPluginManagementService}
        preferencesClient={{ read: async () => ({ locale, theme_mode: theme }), write: async (value) => value }}
        shortcutsService={controlled.service}
        actions={actions}
      />
    </AppProviders>,
  );
  expect(screen.getByRole('menuitem', { name: /Preferences|偏好/ })).toHaveAttribute('aria-current', 'page');
  const shortcuts = screen.getByRole('menuitem', { name: /Shortcuts|快捷键/ });
  shortcuts.focus();
  fireEvent.keyDown(shortcuts, { key: 'Enter' });
  await screen.findByRole('listitem', { name: /Shortcut for Open lensX$|“唤出 lensX”的快捷键/ });
  expect(shortcuts).toHaveAttribute('aria-current', 'page');
  expect(shortcuts).toHaveFocus();
  return { ...controlled, ...result };
};
const chooseOption = async (control: HTMLElement, label: string | RegExp) => {
  fireEvent.click(control);
  fireEvent.click(await screen.findByRole('option', { name: label }));
};
const launcherType = () => screen.getByRole('combobox', { name: 'Shortcut type for Open lensX' });
const modifierFor = (name = 'Open lensX') =>
  within(screen.getByRole('listitem', { name: `Shortcut for ${name}` })).getByRole('combobox', {
    name: /Modifier key/,
  });
const saveButton = () => screen.getByRole('button', { name: /Save shortcut|保存快捷键/ });
const addButton = () => screen.getByRole('button', { name: /^(Add feature shortcut|添加功能快捷键)$/ });
const otherAction: LauncherActionDescriptor = {
  ...action,
  action_id: 'dev.other.open',
  owner_id: 'dev.other',
  title: { 'en-US': 'Other tool', 'zh-CN': '其它工具' },
};
const waitForRecording = async () => {
  const input = await screen.findByRole('textbox', { name: /Shortcut candidate|快捷键候选/ });
  await waitFor(() => {
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute('aria-busy', 'false');
    expect(input).toHaveAttribute('data-recording', 'true');
  });
  return input;
};
const editRecovery = async () => {
  const trigger = screen.getByRole('button', { name: 'Edit shortcut for Open lensX' });
  fireEvent.click(trigger);
  const input = await waitForRecording();
  return { input, trigger };
};
const recordChord = (input: HTMLElement) =>
  fireEvent.keyDown(input, { key: 'k', code: 'KeyK', metaKey: true, shiftKey: true });

describe('shortcut settings with real Semi controls', () => {
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const theme of ['light', 'dark'] as const) {
      test(`renders peer system and feature headings without instructional copy in ${locale}/${theme}`, async () => {
        const { service } = await setup({ locale, theme });
        expect(addButton()).toBeEnabled();
        expect(Object.keys((await service.read()).configuration.actions)).toHaveLength(0);
        expect(
          screen.getByText(locale === 'en-US' ? 'Ctrl + Shift + Space' : 'Ctrl + Shift + 空格'),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('button', {
            name: locale === 'en-US' ? 'Delete shortcut for Open lensX' : '删除“唤出 lensX”的快捷键',
          }),
        ).not.toBeInTheDocument();
        expect(service.requestMonitorPermission).not.toHaveBeenCalled();
        expect(document.body.getAttribute('theme-mode')).toBe(theme === 'dark' ? 'dark' : null);
        const region = screen.getByRole('region', { name: locale === 'en-US' ? 'Shortcuts' : '快捷键' });
        const expectedHeadings =
          locale === 'en-US' ? ['System shortcuts', 'Feature shortcuts'] : ['系统快捷键', '功能快捷键'];
        expect(
          within(region)
            .getAllByRole('heading', { level: 3 })
            .map((heading) => heading.textContent),
        ).toEqual(expectedHeadings);
        expect(within(region).getAllByRole('heading')).toHaveLength(2);
        const systemGroup = within(region).getByRole('region', { name: expectedHeadings[0] });
        const featureGroup = within(region).getByRole('region', { name: expectedHeadings[1] });
        const reset = within(systemGroup).getByRole('button', {
          name: locale === 'en-US' ? 'Restore default shortcuts' : '恢复默认快捷键',
        });
        const add = within(featureGroup).getByRole('button', {
          name: locale === 'en-US' ? 'Add feature shortcut' : '添加功能快捷键',
        });
        expect(reset.closest('section')).toBe(systemGroup);
        expect(add.closest('section')).toBe(featureGroup);
        expect(systemGroup.lastElementChild).toContainElement(reset);
        expect(featureGroup.lastElementChild).toContainElement(add);
        expect(reset).toHaveClass('self-end');
        expect(add).toHaveClass('self-end');
        expect(screen.getByRole('menuitem', { name: locale === 'en-US' ? 'Shortcuts' : '快捷键' })).toHaveAttribute(
          'aria-current',
          'page',
        );
        const expectNoInstructions = () => {
          expect(within(region).queryByRole('paragraph')).not.toBeInTheDocument();
          expect(
            within(region).queryByText(/Choose how to open lensX|设置唤出 lensX 和执行操作/),
          ).not.toBeInTheDocument();
          expect(
            within(region).queryByText(
              /Recording\. Press|Starting recording|正在录制|正在开始录制|Not saved\.|尚未保存/,
            ),
          ).not.toBeInTheDocument();
          expect(
            within(region).queryByText(
              /Tap the same modifier twice|连续点击同一个修饰键|200 ms|300 ms|200 毫秒|300 毫秒/,
            ),
          ).not.toBeInTheDocument();
        };
        expectNoInstructions();
        const key = screen.getByRole('button', {
          name: locale === 'en-US' ? 'Edit shortcut for Open lensX' : '修改“唤出 lensX”的快捷键',
        });
        await waitFor(() => expect(key).toBeEnabled());
        fireEvent.click(key);
        const input = await waitForRecording();
        expect(input).not.toHaveAttribute('aria-describedby');
        expect(saveButton()).toBeDisabled();
        expectNoInstructions();
        fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
        await chooseOption(
          screen.getByRole('combobox', {
            name: locale === 'en-US' ? 'Shortcut type for Open lensX' : '唤出 lensX的快捷键类型',
          }),
          locale === 'en-US' ? 'Modifier double tap' : '双击修饰键',
        );
        expect(
          screen.getByRole('combobox', {
            name: locale === 'en-US' ? 'Modifier key for Open lensX' : '唤出 lensX的修饰键',
          }),
        ).toBeInTheDocument();
        expectNoInstructions();
      });
    }
  test('records a combination, ignores IME, saves only confirmed data and releases lease', async () => {
    const { write, endRecording } = await setup();
    const { input } = await editRecovery();
    fireEvent.keyDown(input, { key: 'k', code: 'KeyK', metaKey: true, isComposing: true });
    expect(input).toHaveValue('Not set');
    recordChord(input);
    expect(input).toHaveValue('Cmd + Shift + K');
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save shortcut' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].launcher).toEqual({
      kind: 'chord',
      modifiers: ['cmd', 'shift'],
      key: 'KeyK',
    });
    expect(endRecording).toHaveBeenCalledWith('lease_1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' })).toHaveFocus());
    expect(screen.getByText('Cmd + Shift + K')).toBeInTheDocument();
  });
  test('displays current layout labels without changing physical stored identity', async () => {
    await setup({
      initial: {
        configuration: {
          ...defaultShortcutConfiguration(),
          launcher: { kind: 'chord', modifiers: ['cmd', 'shift'], key: 'KeyK' },
          actions: { 'dev.example.open': { kind: 'chord', modifiers: ['ctrl'], key: 'KeyQ' } },
        },
        bindings: [
          { target: 'launcher', status: 'active' },
          { target: 'dev.example.open', status: 'active' },
        ],
        recovery_degraded: false,
        diagnostics: [],
        key_labels: { KeyQ: 'A', KeyK: 'T', 'cmd:KeyK': 'K' },
      },
    });
    expect(screen.getByText('Ctrl + A')).toBeInTheDocument();
    expect(screen.getByText('Cmd + Shift + K')).toBeInTheDocument();
    expect(screen.queryByText('Ctrl + Q')).not.toBeInTheDocument();
  });
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const theme of ['light', 'dark'] as const) {
      test(`retains candidate through failure and keyboard/native recording in ${locale}/${theme}`, async () => {
        const { write, emit } = await setup({ locale, theme });
        const trigger = screen.getByRole('button', { name: /Edit shortcut for Open lensX$|修改“唤出 lensX”的快捷键/ });
        fireEvent.click(trigger);
        await waitForRecording();
        act(() =>
          emit({ lease_id: 'lease_1', trigger: { kind: 'chord', modifiers: ['ctrl'], key: 'KeyJ' }, cancelled: false }),
        );
        const candidate = screen.getByRole('textbox', { name: /Shortcut candidate|快捷键候选/ });
        expect(candidate).toHaveValue('Ctrl + J');
        write.mockRejectedValueOnce(new ShortcutError('registration_failed'));
        fireEvent.click(screen.getByRole('button', { name: /Save shortcut|保存快捷键/ }));
        await screen.findByText(/The shortcut could not be registered|快捷键无法注册/);
        expect(candidate).toHaveValue('Ctrl + J');
        fireEvent.click(screen.getByRole('button', { name: /Save shortcut|保存快捷键/ }));
        await screen.findByText(/Shortcuts saved|快捷键已保存/);
        await waitFor(() =>
          expect(
            screen.getByRole('button', { name: /Edit shortcut for Open lensX$|修改“唤出 lensX”的快捷键/ }),
          ).toHaveFocus(),
        );
        expect(write).toHaveBeenCalledTimes(2);
      });
    }
  test('native registered-key candidates and bare Escape cancellation restore original focus', async () => {
    const { emit, write, endRecording } = await setup();
    const { input } = await editRecovery();
    act(() =>
      emit({ lease_id: 'old', trigger: { kind: 'chord', modifiers: ['ctrl'], key: 'KeyJ' }, cancelled: false }),
    );
    expect(input).toHaveValue('Not set');
    act(() =>
      emit({ lease_id: 'lease_1', trigger: { kind: 'chord', modifiers: ['ctrl'], key: 'KeyJ' }, cancelled: false }),
    );
    expect(input).toHaveValue('Ctrl + J');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', ctrlKey: true });
    expect(input).toHaveValue('Ctrl + Escape');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    expect(write).not.toHaveBeenCalled();
    expect(endRecording).toHaveBeenCalledWith('lease_1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' })).toHaveFocus());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  test('keeps trigger conflicts editable and changes the launcher to exactly one selected type', async () => {
    const initial: ShortcutSnapshot = {
      configuration: {
        ...defaultShortcutConfiguration(),
        actions: { 'dev.example.open': { kind: 'chord', modifiers: ['cmd', 'shift'], key: 'KeyK' } },
      },
      bindings: [
        { target: 'launcher', status: 'active' },
        { target: action.action_id, status: 'active' },
      ],
      recovery_degraded: false,
      diagnostics: [],
    };
    const { write, service } = await setup({ initial });
    const { input } = await editRecovery();
    recordChord(input);
    fireEvent.click(saveButton());
    await screen.findByText('This shortcut is already used by Example.');
    expect(write).not.toHaveBeenCalled();
    expect(input).toHaveValue('Cmd + Shift + K');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    await chooseOption(launcherType(), 'Modifier double tap');
    await chooseOption(modifierFor(), 'Option');
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].launcher).toEqual({ kind: 'modifier_double_tap', modifier: 'option' });
    expect(write.mock.calls[0]?.[1].actions).toEqual(initial.configuration.actions);
    expect((await service.read()).configuration.launcher).not.toHaveProperty('chord');
  });
  test('renews only an active visible recording lease and cancels native revocation', async () => {
    const { service, emit, endRecording } = await setup();
    const interval = rs.spyOn(globalThis, 'setInterval');
    try {
      await editRecovery();
      rs.mocked(service.renewRecording).mockClear();
      const renew = interval.mock.calls.find(([, delay]) => delay === 10_000)?.[0];
      expect(typeof renew).toBe('function');
      await act(async () => {
        if (typeof renew === 'function') renew();
      });
      expect(service.renewRecording).toHaveBeenCalledWith('lease_1');
      act(() => emit({ lease_id: 'lease_1', trigger: null, cancelled: true }));
      expect(endRecording).toHaveBeenCalledWith('lease_1');
      await act(async () => {
        if (typeof renew === 'function') renew();
      });
      expect(service.renewRecording).toHaveBeenCalledTimes(1);
    } finally {
      interval.mockRestore();
    }
  });
  test('returns focus to the Action section when clearing removes the focused row', async () => {
    await setup({
      initial: {
        configuration: {
          ...defaultShortcutConfiguration(),
          actions: { 'dev.example.open': { kind: 'chord', modifiers: ['ctrl'], key: 'KeyJ' } },
        },
        bindings: [
          { target: 'launcher', status: 'active' },
          { target: 'dev.example.open', status: 'active' },
        ],
        recovery_degraded: false,
        diagnostics: [],
      },
    });
    const clear = screen.getByRole('button', { name: 'Delete shortcut for Example' });
    clear.focus();
    fireEvent.click(clear);
    await waitFor(() => expect(addButton()).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Delete shortcut for Example' })).not.toBeInTheDocument();
  });
  test('preserves candidate and last confirmed binding on registration or revision failure', async () => {
    const { write } = await setup();
    const { input } = await editRecovery();
    recordChord(input);
    write.mockRejectedValueOnce(new ShortcutError('registration_failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Save shortcut' }));
    await screen.findByText('The shortcut could not be registered. Choose another combination or try again.');
    expect(input).toHaveValue('Cmd + Shift + K');
    expect(write.mock.calls[0]?.[0]).toBe(0);
    write.mockRejectedValueOnce(new ShortcutError('revision_conflict'));
    fireEvent.click(screen.getByRole('button', { name: 'Save shortcut' }));
    await screen.findByText(/Shortcuts changed elsewhere/);
    expect(input).toHaveValue('Cmd + Shift + K');
    fireEvent.click(screen.getByRole('button', { name: 'Save shortcut' }));
    await screen.findByText('Shortcuts saved. Check each binding’s availability.');
  });
  for (const interruption of ['blur', 'native-cancel'] as const) {
    test(`rejects a late recording lease after ${interruption} during acquisition`, async () => {
      const { service, emit, endRecording } = await setup();
      let resolveLease: ((value: { lease_id: string; expires_at: number }) => void) | undefined;
      rs.mocked(service.beginRecording).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLease = resolve;
          }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' }));
      if (interruption === 'blur') fireEvent(window, new Event('blur'));
      else act(() => emit({ lease_id: 'late_lease', cancelled: true, trigger: null }));
      await act(async () => {
        resolveLease?.({ lease_id: 'late_lease', expires_at: 30000 });
      });
      expect(endRecording).toHaveBeenCalledWith('late_lease');
      const candidate = screen.queryByRole('textbox', { name: /Shortcut candidate|快捷键候选/ });
      if (candidate) {
        expect(candidate).toHaveAttribute('data-recording', 'false');
        expect(candidate).toHaveAttribute('aria-busy', 'false');
      }
    });
  }
  test('does not replace newer configuration or runtime status with a late permission response', async () => {
    const initial: ShortcutSnapshot = {
      configuration: {
        ...defaultShortcutConfiguration(),
        launcher: { kind: 'modifier_double_tap', modifier: 'cmd' },
      },
      bindings: [{ target: 'launcher', status: 'permission_required' }],
      recovery_degraded: true,
      diagnostics: [],
    };
    const { service, publish } = await setup({ initial });
    let resolvePermission: ((value: ShortcutSnapshot) => void) | undefined;
    rs.mocked(service.requestMonitorPermission).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Allow input monitoring' }));
    const newer: ShortcutSnapshot = {
      ...initial,
      configuration: {
        ...initial.configuration,
        revision: 2,
        actions: { 'dev.example.open': { kind: 'chord', modifiers: ['ctrl'], key: 'KeyJ' } },
      },
      bindings: [...initial.bindings, { target: action.action_id, status: 'active' }],
    };
    act(() => publish(newer));
    await act(async () => resolvePermission?.(initial));
    expect(screen.getByText('Ctrl + J')).toBeInTheDocument();
    expect(screen.queryByText('Ctrl + Shift + Space')).not.toBeInTheDocument();
    rs.mocked(service.requestMonitorPermission).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Allow input monitoring' }));
    act(() =>
      publish({
        ...newer,
        recovery_degraded: false,
        bindings: newer.bindings.map((entry) => ({ ...entry, status: 'active' })),
      }),
    );
    await act(async () => resolvePermission?.(newer));
    expect(screen.queryByText('Saved · permission required')).not.toBeInTheDocument();
  });
  test('can begin another recording after cancelling an unresolved acquisition', async () => {
    const { service, endRecording } = await setup();
    let resolveOld: ((value: { lease_id: string; expires_at: number }) => void) | undefined;
    rs.mocked(service.beginRecording).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' }));
    fireEvent(window, new Event('blur'));
    await editRecovery();
    await act(async () => resolveOld?.({ lease_id: 'old_lease', expires_at: 30000 }));
    expect(endRecording).toHaveBeenCalledWith('old_lease');
    expect(screen.getByRole('textbox', { name: /Shortcut candidate|快捷键候选/ })).toHaveAttribute(
      'data-recording',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Shortcut candidate' })).toBeInTheDocument();
  });
  test('reserved command stays a native command and blur or unmount ends recording', async () => {
    const { endRecording, unmount } = await setup();
    let { input } = await editRecovery();
    const defaultAllowed = fireEvent.keyDown(input, { key: 'q', code: 'KeyQ', metaKey: true });
    expect(defaultAllowed).toBe(true);
    expect(endRecording).toHaveBeenCalledTimes(1);
    ({ input } = await editRecovery());
    fireEvent(window, new Event('blur'));
    expect(endRecording).toHaveBeenCalledTimes(2);
    await editRecovery();
    unmount();
    expect(endRecording).toHaveBeenCalledTimes(3);
  });
  test('requires confirmation for system-only reset and preserves feature bindings through failure and retry', async () => {
    const configuration = {
      ...defaultShortcutConfiguration(5),
      launcher: { kind: 'modifier_double_tap' as const, modifier: 'ctrl' as const },
      actions: {
        'dev.example.open': { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' },
        'dev.other.open': { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyL' },
      },
    };
    const { write, service } = await setup({
      initial: {
        configuration,
        bindings: [
          { target: 'launcher', status: 'permission_required' },
          { target: action.action_id, status: 'active' },
          { target: otherAction.action_id, status: 'active' },
        ],
        recovery_degraded: true,
        diagnostics: [],
      },
      actions: [action, otherAction],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore default shortcuts' }));
    const modal = screen.getByRole('dialog');
    expect(write).not.toHaveBeenCalled();
    write.mockRejectedValueOnce(new ShortcutError('storage_failed'));
    fireEvent.click(within(modal).getByRole('button', { name: 'Restore defaults' }));
    await within(modal).findByText('Shortcuts could not be saved. Review the confirmed bindings and try again.');
    expect((await service.read()).configuration).toEqual(configuration);
    expect(modifierFor()).toHaveTextContent('Ctrl');
    const retry = await screen.findByRole('button', { name: 'Restore defaults' });
    await waitFor(() => expect(retry).not.toBeDisabled());
    fireEvent.click(retry);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write.mock.calls[1]?.slice(0, 2)).toEqual([
      5,
      { ...configuration, launcher: defaultShortcutConfiguration().launcher },
    ]);
    expect((await service.read()).configuration.actions).toEqual(configuration.actions);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveClass('semi-modal-content-animate-hide'));
    fireEvent.animationEnd(screen.getByRole('dialog'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const theme of ['light', 'dark'] as const) {
      test(`keeps long unavailable targets editable and permission/degraded errors safe in ${locale}/${theme}`, async () => {
        const id = `dev.removed.${'a'.repeat(60)}`;
        const initial: ShortcutSnapshot = {
          configuration: {
            ...defaultShortcutConfiguration(),
            actions: { [id]: { kind: 'modifier_double_tap', modifier: 'shift' } },
            launcher: { kind: 'modifier_double_tap', modifier: 'cmd' },
          },
          bindings: [
            { target: 'launcher', status: 'permission_required' },
            { target: id, status: 'target_unavailable' },
          ],
          recovery_degraded: true,
          diagnostics: ['compensation_failed'],
        };
        const { service } = await setup({ locale, theme, initial, actions: [] });
        expect(screen.getAllByText(new RegExp(id)).length).toBeGreaterThan(0);
        expect(screen.getByText(/Saved · action unavailable|已保存 · 操作不可用/)).toBeInTheDocument();
        expect(screen.getByText(/The launcher shortcut is unavailable|唤出快捷键暂不可用/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Allow input monitoring|允许输入监听/ }));
        await waitFor(() => expect(service.requestMonitorPermission).toHaveBeenCalledTimes(1));
        expect(document.body.textContent).not.toContain('compensation_failed');
        expect(screen.getAllByRole('combobox', { name: /Modifier key|修饰键/ })).toHaveLength(2);
      });
    }
});

describe('shortcut editor Escape cancellation', () => {
  test('cancels before recording from an ordinary editor control without changing saved bindings', async () => {
    const { service, write, endRecording } = await setup();
    await chooseOption(launcherType(), 'Modifier double tap');
    const modifier = modifierFor();
    fireEvent.click(modifier);
    fireEvent.click(await screen.findByRole('option', { name: 'Option' }));
    const save = screen.getByRole('button', { name: 'Save shortcut' });
    save.focus();
    fireEvent.keyDown(save, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' })).toHaveFocus());
    expect(screen.getByRole('menuitem', { name: 'Shortcuts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Ctrl + Shift + Space')).toBeInTheDocument();
    expect((await service.read()).configuration).toEqual(defaultShortcutConfiguration());
    expect(write).not.toHaveBeenCalled();
    expect(service.beginRecording).not.toHaveBeenCalled();
    expect(endRecording).not.toHaveBeenCalled();
  });

  test('cancels a pending lease acquisition and releases its late result without reopening the editor', async () => {
    const { service, write, endRecording } = await setup();
    let resolveLease: ((value: { lease_id: string; expires_at: number }) => void) | undefined;
    rs.mocked(service.beginRecording).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLease = resolve;
        }),
    );
    const trigger = screen.getByRole('button', { name: 'Edit shortcut for Open lensX' });
    fireEvent.click(trigger);
    expect(service.beginRecording).toHaveBeenCalledTimes(1);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' })).toHaveFocus());

    await act(async () => resolveLease?.({ lease_id: 'escape_late_lease', expires_at: 30000 }));
    expect(endRecording).toHaveBeenCalledWith('escape_late_lease');
    expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Shortcut candidate|快捷键候选/ })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Shortcuts' })).toHaveAttribute('aria-current', 'page');
    expect(write).not.toHaveBeenCalled();
  });

  test('cancels recording while focus is on an editor button without a native cancellation event', async () => {
    const { write, endRecording } = await setup();
    const { input } = await editRecovery();
    recordChord(input);
    const save = screen.getByRole('button', { name: 'Save shortcut' });
    save.focus();
    expect(save).toHaveFocus();
    fireEvent.keyDown(save, { key: 'Escape', code: 'Escape' });

    expect(endRecording).toHaveBeenCalledWith('lease_1');
    expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
    expect(screen.getByText('Ctrl + Shift + Space')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Shortcuts' })).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' })).toHaveFocus());
    expect(write).not.toHaveBeenCalled();
  });

  test('does not cancel for modified Escape or an Escape handled by IME', async () => {
    const { write, endRecording } = await setup();
    const { input } = await editRecovery();
    const save = screen.getByRole('button', { name: 'Save shortcut' });
    save.focus();
    for (const flags of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { isComposing: true },
      { keyCode: 229 },
    ]) {
      fireEvent.keyDown(save, { key: 'Escape', code: 'Escape', ...flags });
      expect(screen.getByRole('textbox', { name: 'Shortcut candidate' })).toBe(input);
      expect(screen.getByRole('textbox', { name: /Shortcut candidate|快捷键候选/ })).toHaveAttribute(
        'data-recording',
        'true',
      );
    }
    expect(endRecording).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    fireEvent.keyDown(save, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
    expect(endRecording).toHaveBeenCalledWith('lease_1');
  });

  test('cancels after a failed save and preserves the last confirmed binding', async () => {
    const { write, service } = await setup();
    const { input } = await editRecovery();
    recordChord(input);
    write.mockRejectedValueOnce(new ShortcutError('registration_failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Save shortcut' }));
    await screen.findByText('The shortcut could not be registered. Choose another combination or try again.');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel).not.toBeDisabled());
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
    expect(screen.getByText('Ctrl + Shift + Space')).toBeInTheDocument();
    expect((await service.read()).configuration).toEqual(defaultShortcutConfiguration());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' })).toHaveFocus());
    expect(write).toHaveBeenCalledTimes(1);
  });

  test('does not cancel an already submitted save while its cancel control is disabled', async () => {
    const { write } = await setup();
    const { input } = await editRecovery();
    recordChord(input);
    let resolveSave: ((value: ShortcutSnapshot) => void) | undefined;
    write.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save shortcut' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    expect(screen.getByRole('textbox', { name: 'Shortcut candidate' })).toBe(input);
    expect(write).toHaveBeenCalledTimes(1);
    const submitted = write.mock.calls[0]?.[1];
    if (!submitted) throw new Error('Expected the shortcut save request.');
    await act(async () =>
      resolveSave?.({
        configuration: { ...submitted, revision: 1 },
        bindings: [{ target: 'launcher', status: 'active' }],
        recovery_degraded: false,
        diagnostics: [],
      }),
    );
    expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
    expect(screen.getByText('Cmd + Shift + K')).toBeInTheDocument();
  });
});

test('Escape exits shortcut editing from an expanded Semi modifier popup', async () => {
  const { write } = await setup();
  await chooseOption(launcherType(), 'Modifier double tap');
  fireEvent.click(modifierFor());
  const option = await screen.findByRole('option', { name: 'Option' });
  expect(screen.getByRole('listitem', { name: 'Shortcut for Open lensX' })).not.toContainElement(option);
  fireEvent.keyDown(option, { key: 'Escape', code: 'Escape' });
  expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' })).toHaveFocus());
  expect(screen.getByRole('menuitem', { name: 'Shortcuts' })).toHaveAttribute('aria-current', 'page');
  expect(write).not.toHaveBeenCalled();
});

test('shortcut editor releases Escape capture after cancellation and unmount', async () => {
  const { unmount } = await setup();
  const pressEscape = () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(document, event);
    return event;
  };
  expect(pressEscape().defaultPrevented).toBe(false);
  const trigger = screen.getByRole('button', { name: 'Edit shortcut for Open lensX' });
  fireEvent.click(trigger);
  expect(pressEscape().defaultPrevented).toBe(true);
  expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
  expect(pressEscape().defaultPrevented).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' }));
  expect(screen.getByRole('textbox', { name: 'Shortcut candidate' })).toBeInTheDocument();
  unmount();
  expect(pressEscape().defaultPrevented).toBe(false);
});

describe('inline shortcut rows', () => {
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const theme of ['light', 'dark'] as const) {
      test(`adds and deletes an unsaved row without persistence in ${locale}/${theme}`, async () => {
        const { write, service } = await setup({ locale, theme });
        const add = addButton();
        fireEvent.click(add);
        const draft = screen.getByRole('listitem', {
          name: locale === 'en-US' ? 'Shortcut for New shortcut' : '“新快捷键”的快捷键',
        });
        expect(within(draft).getAllByRole('combobox')).toHaveLength(2);
        expect(within(draft).getByRole('textbox', { name: /Shortcut candidate|快捷键候选/ })).toHaveValue(
          locale === 'en-US' ? 'Not set' : '未设置',
        );
        expect(saveButton()).toBeDisabled();
        fireEvent.click(
          within(draft).getByRole('button', { name: /Delete shortcut for New shortcut|删除新快捷键的快捷键/ }),
        );
        expect(screen.queryByRole('textbox', { name: /Shortcut candidate|快捷键候选/ })).not.toBeInTheDocument();
        await waitFor(() => expect(add).toHaveFocus());
        expect(write).not.toHaveBeenCalled();
        expect((await service.read()).configuration).toEqual(defaultShortcutConfiguration());
      });
    }

  test('requires both an Action and key before saving a new row, then deletes the confirmed binding', async () => {
    const { write, service } = await setup();
    fireEvent.click(addButton());
    expect(saveButton()).toBeDisabled();
    await chooseOption(screen.getByRole('combobox', { name: 'Action for shortcut 1' }), 'Example');
    expect(saveButton()).toBeDisabled();
    const input = screen.getByRole('textbox', { name: 'Shortcut candidate' });
    fireEvent.click(input);
    await waitForRecording();
    recordChord(input);
    expect(saveButton()).toBeEnabled();
    expect(write).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].actions).toEqual({
      'dev.example.open': { kind: 'chord', modifiers: ['cmd', 'shift'], key: 'KeyK' },
    });
    const confirmedRow = screen.getByRole('listitem', { name: 'Shortcut for Example' });
    expect(within(confirmedRow).getByRole('button', { name: 'Edit shortcut for Example' })).toHaveTextContent(
      'Cmd + Shift + K',
    );
    fireEvent.click(within(confirmedRow).getByRole('button', { name: 'Delete shortcut for Example' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect((await service.read()).configuration.actions).toEqual({});
    await waitFor(() => expect(addButton()).toHaveFocus());
    expect(screen.queryByRole('listitem', { name: 'Shortcut for Example' })).not.toBeInTheDocument();
  });

  test('retains a saved row if deletion fails and keeps unrelated bindings unchanged on retry', async () => {
    const configuration = {
      ...defaultShortcutConfiguration(),
      actions: {
        'dev.example.open': { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' },
        'dev.other.open': { kind: 'modifier_double_tap' as const, modifier: 'option' as const },
      },
    };
    const { write, service } = await setup({
      initial: {
        configuration,
        bindings: [
          { target: 'launcher', status: 'active' },
          { target: action.action_id, status: 'active' },
          { target: otherAction.action_id, status: 'active' },
        ],
        recovery_degraded: false,
        diagnostics: [],
      },
      actions: [action, otherAction],
    });
    write.mockRejectedValueOnce(new ShortcutError('storage_failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete shortcut for Example' }));
    await screen.findByText('Shortcuts could not be saved. Review the confirmed bindings and try again.');
    expect((await service.read()).configuration).toEqual(configuration);
    const retry = screen.getByRole('button', { name: 'Delete shortcut for Example' });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect((await service.read()).configuration.actions).toEqual({
      'dev.other.open': configuration.actions['dev.other.open'],
    });
  });

  test('changing a row Action moves its binding atomically and Escape discards an unsubmitted move', async () => {
    const original = { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' };
    const { write, service } = await setup({
      initial: {
        configuration: { ...defaultShortcutConfiguration(), actions: { 'dev.example.open': original } },
        bindings: [
          { target: 'launcher', status: 'active' },
          { target: action.action_id, status: 'active' },
        ],
        recovery_degraded: false,
        diagnostics: [],
      },
      actions: [action, otherAction],
    });
    await chooseOption(screen.getByRole('combobox', { name: 'Action for shortcut 1' }), 'Other tool');
    expect(write).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Action for shortcut 1' }), {
      key: 'Escape',
      code: 'Escape',
    });
    expect(screen.getByRole('listitem', { name: 'Shortcut for Example' })).toBeInTheDocument();
    expect((await service.read()).configuration.actions).toEqual({ 'dev.example.open': original });
    await chooseOption(screen.getByRole('combobox', { name: 'Action for shortcut 1' }), 'Other tool');
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].actions).toEqual({ 'dev.other.open': original });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit shortcut for Other tool' })).toHaveFocus());
  });

  test('an Action already assigned to another row cannot be selected or overwritten', async () => {
    const configuration = {
      ...defaultShortcutConfiguration(),
      actions: {
        'dev.example.open': { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' },
        'dev.other.open': { kind: 'modifier_double_tap' as const, modifier: 'option' as const },
      },
    };
    const { write, service } = await setup({
      initial: {
        configuration,
        bindings: [
          { target: 'launcher', status: 'active' },
          { target: action.action_id, status: 'active' },
          { target: otherAction.action_id, status: 'active' },
        ],
        recovery_degraded: false,
        diagnostics: [],
      },
      actions: [action, otherAction],
    });
    const target = screen.getByRole('combobox', { name: 'Action for shortcut 1' });
    fireEvent.click(target);
    const occupied = await screen.findByRole('option', { name: 'Other tool' });
    expect(occupied).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(occupied);
    expect(target).toHaveTextContent('Example');
    expect(write).not.toHaveBeenCalled();
    expect((await service.read()).configuration).toEqual(configuration);
  });

  test('switching row trigger kind clears an incompatible candidate and persists only the chosen kind', async () => {
    const { write, service } = await setup({
      initial: {
        configuration: {
          ...defaultShortcutConfiguration(),
          actions: { 'dev.example.open': { kind: 'chord', modifiers: ['ctrl'], key: 'KeyJ' } },
        },
        bindings: [
          { target: 'launcher', status: 'active' },
          { target: action.action_id, status: 'active' },
        ],
        recovery_degraded: false,
        diagnostics: [],
      },
    });
    await chooseOption(screen.getByRole('combobox', { name: 'Shortcut type for Example' }), 'Modifier double tap');
    expect(saveButton()).toBeDisabled();
    expect(modifierFor('Example')).toHaveTextContent('Modifier key');
    expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
    await chooseOption(modifierFor('Example'), 'Shift');
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect((await service.read()).configuration.actions).toEqual({
      'dev.example.open': { kind: 'modifier_double_tap', modifier: 'shift' },
    });
    await chooseOption(screen.getByRole('combobox', { name: 'Shortcut type for Example' }), 'Key combination');
    expect(saveButton()).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Shortcut candidate' }), { key: 'Escape', code: 'Escape' });
    expect(modifierFor('Example')).toHaveTextContent('Shift');
    expect(write).toHaveBeenCalledTimes(1);
  });
});

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`requires an explicit choice for migrated launcher bindings in ${locale}/${theme}`, async () => {
      const oldChord = { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' };
      const oldDoubleTap = { kind: 'modifier_double_tap' as const, modifier: 'option' as const };
      const { write, service } = await setup({
        locale,
        theme,
        initial: {
          configuration: {
            ...defaultShortcutConfiguration(7),
            launcher: oldChord,
            actions: { 'dev.example.open': { kind: 'chord', modifiers: ['cmd', 'shift'], key: 'KeyK' } },
          },
          launcher_migration: { chord: oldChord, double_tap: oldDoubleTap },
          bindings: [
            { target: 'launcher', status: 'degraded' },
            { target: action.action_id, status: 'target_unavailable' },
          ],
          recovery_degraded: true,
          diagnostics: ['launcher_migration_required'],
        },
      });
      expect(screen.getByText(/Two launcher shortcuts were found|发现了两种唤出快捷键/)).toBeInTheDocument();
      expect(addButton()).toBeDisabled();
      const actionRow = screen.getByRole('listitem', {
        name: locale === 'en-US' ? 'Shortcut for Example' : '“示例”的快捷键',
      });
      expect(within(actionRow).getByRole('button', { name: /Delete shortcut|删除/ })).toBeDisabled();
      for (const control of within(actionRow).getAllByRole('combobox'))
        expect(control).toHaveAttribute('aria-disabled', 'true');
      const launcher = screen.getByRole('listitem', {
        name: locale === 'en-US' ? 'Shortcut for Open lensX' : '“唤出 lensX”的快捷键',
      });
      const type = within(launcher).getByRole('combobox');
      expect(type).toHaveTextContent(locale === 'en-US' ? 'Choose a type' : '选择类型');
      expect(within(launcher).getByRole('button', { name: /Edit shortcut|修改/ })).toBeDisabled();
      await chooseOption(type, locale === 'en-US' ? 'Key combination' : '组合键');
      expect(screen.getByRole('textbox', { name: /Shortcut candidate|快捷键候选/ })).toHaveValue('Ctrl + J');
      expect(write).not.toHaveBeenCalled();
      fireEvent.keyDown(type, { key: 'Escape', code: 'Escape' });
      expect(type).toHaveTextContent(locale === 'en-US' ? 'Choose a type' : '选择类型');
      await chooseOption(type, locale === 'en-US' ? 'Modifier double tap' : '双击修饰键');
      expect(within(launcher).getByRole('combobox', { name: /Modifier key|修饰键/ })).toHaveTextContent('Option');
      expect(screen.queryByRole('textbox', { name: /Shortcut candidate|快捷键候选/ })).not.toBeInTheDocument();
      fireEvent.click(saveButton());
      await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
      expect(write.mock.calls[0]?.[0]).toBe(7);
      expect(write.mock.calls[0]?.[1].launcher).toEqual(oldDoubleTap);
      expect(write.mock.calls[0]?.[2]).toEqual({ resolveLauncherMigration: true });
      expect((await service.read()).launcher_migration).toBeUndefined();
      expect(screen.queryByText(/Two launcher shortcuts were found|发现了两种唤出快捷键/)).not.toBeInTheDocument();
      expect(addButton()).toBeEnabled();
    });
  }

test('Escape discards a recorded draft and releases its lease without saving an Action binding', async () => {
  const { emit, write, endRecording } = await setup();
  fireEvent.click(addButton());
  await chooseOption(screen.getByRole('combobox', { name: 'Action for shortcut 1' }), 'Example');
  const input = screen.getByRole('textbox', { name: 'Shortcut candidate' });
  fireEvent.click(input);
  await waitForRecording();
  act(() =>
    emit({ lease_id: 'lease_1', trigger: { kind: 'chord', modifiers: ['ctrl'], key: 'KeyJ' }, cancelled: false }),
  );
  fireEvent.keyDown(saveButton(), { key: 'Escape', code: 'Escape' });
  expect(screen.queryByRole('listitem', { name: 'Shortcut for Example' })).not.toBeInTheDocument();
  expect(endRecording).toHaveBeenCalledWith('lease_1');
  expect(write).not.toHaveBeenCalled();
  await waitFor(() => expect(addButton()).toHaveFocus());
});

test('a failed migration choice remains unresolved until its explicit retry succeeds', async () => {
  const oldChord = { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' };
  const oldDoubleTap = { kind: 'modifier_double_tap' as const, modifier: 'option' as const };
  const { write } = await setup({
    initial: {
      configuration: { ...defaultShortcutConfiguration(4), launcher: oldChord },
      launcher_migration: { chord: oldChord, double_tap: oldDoubleTap },
      bindings: [{ target: 'launcher', status: 'degraded' }],
      recovery_degraded: true,
      diagnostics: [],
    },
  });
  await chooseOption(launcherType(), 'Key combination');
  write.mockRejectedValueOnce(new ShortcutError('registration_failed'));
  fireEvent.click(saveButton());
  await screen.findByText('The shortcut could not be registered. Choose another combination or try again.');
  expect(screen.getByText(/Two launcher shortcuts were found/)).toBeInTheDocument();
  expect(addButton()).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Shortcut candidate' })).toHaveValue('Ctrl + J');
  await waitFor(() => expect(saveButton()).toBeEnabled());
  fireEvent.click(saveButton());
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  expect(write.mock.calls.map((call) => call[2])).toEqual([
    { resolveLauncherMigration: true },
    { resolveLauncherMigration: true },
  ]);
  expect(write.mock.calls[1]?.[1].launcher).toEqual(oldChord);
  expect(screen.queryByText(/Two launcher shortcuts were found/)).not.toBeInTheDocument();
});

test('system-only reset resolves a legacy launcher choice while preserving every feature binding', async () => {
  const oldChord = { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' };
  const oldDoubleTap = { kind: 'modifier_double_tap' as const, modifier: 'option' as const };
  const { write, service } = await setup({
    initial: {
      configuration: {
        ...defaultShortcutConfiguration(4),
        launcher: oldChord,
        actions: { 'dev.example.open': { kind: 'modifier_double_tap', modifier: 'shift' } },
      },
      launcher_migration: { chord: oldChord, double_tap: oldDoubleTap },
      bindings: [
        { target: 'launcher', status: 'degraded' },
        { target: action.action_id, status: 'active' },
      ],
      recovery_degraded: true,
      diagnostics: [],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Restore default shortcuts' }));
  expect(write).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore defaults' }));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  const expected = {
    ...defaultShortcutConfiguration(4),
    actions: { 'dev.example.open': { kind: 'modifier_double_tap', modifier: 'shift' } },
  };
  expect(write.mock.calls[0]).toEqual([4, expected, { resolveLauncherMigration: true }]);
  expect((await service.read()).configuration.actions).toEqual(expected.actions);
  expect((await service.read()).launcher_migration).toBeUndefined();
});

test('a concurrent removal keeps the local Action candidate editable until Escape discards it', async () => {
  const { publish, service, write, endRecording } = await setup({
    initial: {
      configuration: {
        ...defaultShortcutConfiguration(),
        actions: { 'dev.example.open': { kind: 'chord', modifiers: ['ctrl'], key: 'KeyJ' } },
      },
      bindings: [
        { target: 'launcher', status: 'active' },
        { target: action.action_id, status: 'active' },
      ],
      recovery_degraded: false,
      diagnostics: [],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Edit shortcut for Example' }));
  await waitForRecording();
  const candidate = screen.getByRole('textbox', { name: 'Shortcut candidate' });
  recordChord(candidate);
  act(() =>
    publish({
      configuration: defaultShortcutConfiguration(1),
      bindings: [{ target: 'launcher', status: 'active' }],
      recovery_degraded: false,
      diagnostics: [],
    }),
  );
  expect(screen.getByRole('textbox', { name: 'Shortcut candidate' })).toBe(candidate);
  expect(candidate).toHaveValue('Cmd + Shift + K');
  expect((await service.read()).configuration.actions).toEqual({});
  fireEvent.keyDown(candidate, { key: 'Escape', code: 'Escape' });
  expect(screen.queryByRole('listitem', { name: 'Shortcut for Example' })).not.toBeInTheDocument();
  expect(addButton()).toBeEnabled();
  expect(endRecording).toHaveBeenCalledWith('lease_1');
  expect(write).not.toHaveBeenCalled();
});

describe('direct modifier selection', () => {
  for (const locale of ['en-US', 'zh-CN'] as const)
    for (const theme of ['light', 'dark'] as const) {
      test(`keeps launcher and Action modifier selectors visible without recording in ${locale}/${theme}`, async () => {
        const initial: ShortcutSnapshot = {
          configuration: {
            ...defaultShortcutConfiguration(),
            launcher: { kind: 'modifier_double_tap', modifier: 'cmd' },
            actions: { 'dev.example.open': { kind: 'modifier_double_tap', modifier: 'shift' } },
          },
          bindings: [
            { target: 'launcher', status: 'active' },
            { target: action.action_id, status: 'active' },
          ],
          recovery_degraded: false,
          diagnostics: [],
        };
        const { service, write } = await setup({ initial, locale, theme });
        const launcherModifier = () =>
          screen.getByRole('combobox', {
            name: locale === 'en-US' ? 'Modifier key for Open lensX' : '唤出 lensX的修饰键',
          });
        const actionModifier = () =>
          screen.getByRole('combobox', { name: locale === 'en-US' ? 'Modifier key for Example' : '示例的修饰键' });
        expect(launcherModifier()).toHaveTextContent('Cmd');
        expect(actionModifier()).toHaveTextContent('Shift');
        expect(screen.queryByRole('textbox', { name: /Shortcut candidate|快捷键候选/ })).not.toBeInTheDocument();
        await chooseOption(launcherModifier(), 'Option');
        expect(launcherModifier()).toHaveTextContent('Option');
        expect(write).not.toHaveBeenCalled();
        expect((await service.read()).configuration.launcher).toEqual(initial.configuration.launcher);
        fireEvent.keyDown(launcherModifier(), { key: 'Escape', code: 'Escape' });
        expect(launcherModifier()).toHaveTextContent('Cmd');
        await waitFor(() => expect(launcherModifier()).toHaveFocus());
        await chooseOption(launcherModifier(), 'Option');
        fireEvent.click(saveButton());
        await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
        await chooseOption(actionModifier(), 'Ctrl');
        expect(write).toHaveBeenCalledTimes(1);
        fireEvent.click(saveButton());
        await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
        expect((await service.read()).configuration.actions[action.action_id]).toEqual({
          kind: 'modifier_double_tap',
          modifier: 'ctrl',
        });
        expect(service.beginRecording).not.toHaveBeenCalled();
        expect(service.renewRecording).not.toHaveBeenCalled();
      });
    }

  test('duplicate modifier double taps still report the occupying Action without recording', async () => {
    const { service, write } = await setup({
      initial: {
        configuration: {
          ...defaultShortcutConfiguration(),
          launcher: { kind: 'modifier_double_tap', modifier: 'cmd' },
          actions: { 'dev.example.open': { kind: 'modifier_double_tap', modifier: 'shift' } },
        },
        bindings: [
          { target: 'launcher', status: 'active' },
          { target: action.action_id, status: 'active' },
        ],
        recovery_degraded: false,
        diagnostics: [],
      },
    });
    await chooseOption(modifierFor(), 'Shift');
    fireEvent.click(saveButton());
    await screen.findByText('This shortcut is already used by Example.');
    expect(modifierFor()).toHaveTextContent('Shift');
    expect(write).not.toHaveBeenCalled();
    expect(service.beginRecording).not.toHaveBeenCalled();
    expect(service.renewRecording).not.toHaveBeenCalled();
    fireEvent.keyDown(modifierFor(), { key: 'Escape', code: 'Escape' });
    expect(modifierFor()).toHaveTextContent('Cmd');
  });

  test('modifier selection remains available when the native recording event channel is unavailable', async () => {
    const { service, write } = await setup({
      recordingEventsAvailable: false,
      initial: {
        configuration: {
          ...defaultShortcutConfiguration(),
          launcher: { kind: 'modifier_double_tap', modifier: 'cmd' },
        },
        bindings: [{ target: 'launcher', status: 'permission_required' }],
        recovery_degraded: true,
        diagnostics: [],
      },
    });
    expect(modifierFor()).toHaveAttribute('aria-disabled', 'false');
    await chooseOption(modifierFor(), 'Option');
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].launcher).toEqual({ kind: 'modifier_double_tap', modifier: 'option' });
    expect(service.beginRecording).not.toHaveBeenCalled();
    expect(service.renewRecording).not.toHaveBeenCalled();
  });

  test('switching away from a pending chord recording releases the late lease and never starts modifier recording', async () => {
    const { service, endRecording, write } = await setup();
    let resolveLease: ((value: { lease_id: string; expires_at: number }) => void) | undefined;
    rs.mocked(service.beginRecording).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLease = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit shortcut for Open lensX' }));
    await chooseOption(launcherType(), 'Modifier double tap');
    await chooseOption(modifierFor(), 'Option');
    await act(async () => resolveLease?.({ lease_id: 'late_chord_lease', expires_at: 30000 }));
    expect(endRecording).toHaveBeenCalledWith('late_chord_lease');
    expect(service.beginRecording).toHaveBeenCalledTimes(1);
    expect(service.renewRecording).not.toHaveBeenCalled();
    expect(modifierFor()).toHaveTextContent('Option');
    expect(screen.queryByRole('textbox', { name: 'Shortcut candidate' })).not.toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  });

  test('switching an active chord lease to a modifier releases it and uses only the selector', async () => {
    const { service, endRecording, write } = await setup();
    await editRecovery();
    expect(service.beginRecording).toHaveBeenCalledTimes(1);
    expect(service.renewRecording).toHaveBeenCalledTimes(1);
    await chooseOption(launcherType(), 'Modifier double tap');
    expect(endRecording).toHaveBeenCalledWith('lease_1');
    await chooseOption(modifierFor(), 'Ctrl');
    expect(service.beginRecording).toHaveBeenCalledTimes(1);
    expect(service.renewRecording).toHaveBeenCalledTimes(1);
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].launcher).toEqual({ kind: 'modifier_double_tap', modifier: 'ctrl' });
  });
});

describe('live chord recording preview', () => {
  test('shows held modifiers and the complete chord immediately, then retains the last complete candidate on release', async () => {
    const { write } = await setup();
    const { input } = await editRecovery();
    expect(input).toHaveValue('Not set');
    expect(saveButton()).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Control', code: 'ControlLeft', ctrlKey: true });
    expect(input).toHaveValue('Ctrl');
    expect(saveButton()).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Shift', code: 'ShiftLeft', ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue('Ctrl + Shift');
    expect(saveButton()).toBeDisabled();
    fireEvent.keyDown(input, { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue('Ctrl + Shift + K');
    expect(saveButton()).toBeEnabled();
    fireEvent.keyUp(input, { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(input).toHaveValue('Ctrl + Shift');
    fireEvent.keyUp(input, { key: 'Shift', code: 'ShiftLeft', ctrlKey: true });
    expect(input).toHaveValue('Ctrl');
    fireEvent.keyUp(input, { key: 'Control', code: 'ControlLeft' });
    expect(input).toHaveValue('Ctrl + Shift + K');
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].launcher).toEqual({ kind: 'chord', modifiers: ['ctrl', 'shift'], key: 'KeyK' });
  });

  test('shows a native registered-key candidate immediately and retains it when keyup arrives', async () => {
    const { emit, write } = await setup();
    const { input } = await editRecovery();
    fireEvent.keyDown(input, { key: 'Control', code: 'ControlLeft', ctrlKey: true });
    expect(input).toHaveValue('Ctrl');
    act(() =>
      emit({ lease_id: 'lease_1', trigger: { kind: 'chord', modifiers: ['ctrl'], key: 'KeyJ' }, cancelled: false }),
    );
    expect(input).toHaveValue('Ctrl + J');
    fireEvent.keyUp(input, { key: 'Control', code: 'ControlLeft' });
    expect(input).toHaveValue('Ctrl + J');
    expect(saveButton()).toBeEnabled();
    expect(write).not.toHaveBeenCalled();
  });

  test('ignores IME and keeps incomplete or reserved new recordings unsavable', async () => {
    const { write } = await setup();
    const { input } = await editRecovery();
    fireEvent.keyDown(input, { key: 'Control', code: 'ControlLeft', ctrlKey: true, isComposing: true });
    fireEvent.keyDown(input, { key: 'Process', code: 'KeyK', ctrlKey: true, keyCode: 229 });
    fireEvent.keyUp(input, { key: 'Process', code: 'KeyK', isComposing: true });
    expect(input).toHaveValue('Not set');
    expect(saveButton()).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Control', code: 'ControlLeft', ctrlKey: true });
    fireEvent.keyUp(input, { key: 'Control', code: 'ControlLeft' });
    expect(saveButton()).toBeDisabled();
    recordChord(input);
    fireEvent.keyUp(input, { key: 'k', code: 'KeyK', metaKey: true, shiftKey: true });
    fireEvent.keyUp(input, { key: 'Shift', code: 'ShiftLeft', metaKey: true });
    fireEvent.keyUp(input, { key: 'Meta', code: 'MetaLeft' });
    expect(input).toHaveValue('Cmd + Shift + K');
    expect(saveButton()).toBeEnabled();
    fireEvent.keyDown(input, { key: 'Meta', code: 'MetaLeft', metaKey: true });
    fireEvent.keyDown(input, { key: 'c', code: 'KeyC', metaKey: true });
    expect(input).toHaveValue('Cmd + C');
    expect(saveButton()).toBeDisabled();
    await screen.findByText('This combination is reserved for system or editing commands.');
    fireEvent.keyUp(input, { key: 'c', code: 'KeyC', metaKey: true });
    fireEvent.keyUp(input, { key: 'Meta', code: 'MetaLeft' });
    expect(saveButton()).toBeDisabled();
    expect(write).not.toHaveBeenCalled();
  });
});

test('leaving the recording input clears held-key preview without discarding the complete candidate', async () => {
  const { write } = await setup();
  const { input } = await editRecovery();
  fireEvent.keyDown(input, { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true });
  expect(input).toHaveValue('Ctrl + Shift + K');
  fireEvent.keyUp(input, { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true });
  expect(input).toHaveValue('Ctrl + Shift');
  fireEvent.blur(input);
  expect(input).toHaveValue('Ctrl + Shift + K');
  expect(saveButton()).toBeEnabled();
  fireEvent.click(saveButton());
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect(write.mock.calls[0]?.[1].launcher).toEqual({ kind: 'chord', modifiers: ['ctrl', 'shift'], key: 'KeyK' });
});

test('system reset reports a feature occupying the default key without writing or removing its row', async () => {
  const configuration = {
    ...defaultShortcutConfiguration(5),
    launcher: { kind: 'modifier_double_tap' as const, modifier: 'ctrl' as const },
    actions: { 'dev.example.open': defaultShortcutConfiguration().launcher },
  };
  const { write, service } = await setup({
    initial: {
      configuration,
      bindings: [
        { target: 'launcher', status: 'active' },
        { target: action.action_id, status: 'active' },
      ],
      recovery_degraded: false,
      diagnostics: [],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Restore default shortcuts' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Restore defaults' }));
  await within(dialog).findByText('This shortcut is already used by Example.');
  expect(write).not.toHaveBeenCalled();
  expect((await service.read()).configuration).toEqual(configuration);
  expect(screen.getByRole('listitem', { name: 'Shortcut for Example' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit shortcut for Example' })).toHaveTextContent('Ctrl + Shift + Space');
  expect(modifierFor()).toHaveTextContent('Ctrl');
  expect(dialog).toBeInTheDocument();
});

test('system reset uses the latest revision and retains features added while confirmation is open', async () => {
  const configuration = {
    ...defaultShortcutConfiguration(2),
    launcher: { kind: 'modifier_double_tap' as const, modifier: 'ctrl' as const },
    actions: { 'dev.example.open': { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' } },
  };
  const { publish, service, write } = await setup({
    initial: {
      configuration,
      bindings: [
        { target: 'launcher', status: 'active' },
        { target: action.action_id, status: 'active' },
      ],
      recovery_degraded: false,
      diagnostics: [],
    },
    actions: [action, otherAction],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Restore default shortcuts' }));
  const dialog = screen.getByRole('dialog');
  const latest = {
    ...configuration,
    revision: 3,
    actions: {
      ...configuration.actions,
      'dev.other.open': { kind: 'modifier_double_tap' as const, modifier: 'shift' as const },
    },
  };
  act(() =>
    publish({
      configuration: latest,
      bindings: [
        { target: 'launcher', status: 'active' },
        { target: action.action_id, status: 'active' },
        { target: otherAction.action_id, status: 'active' },
      ],
      recovery_degraded: false,
      diagnostics: [],
    }),
  );
  expect(write).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Restore defaults' }));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect(write.mock.calls[0]?.slice(0, 2)).toEqual([
    3,
    { ...latest, launcher: defaultShortcutConfiguration().launcher },
  ]);
  expect((await service.read()).configuration.actions).toEqual(latest.actions);
});

const builtinHide: LauncherActionDescriptor = {
  action_id: HIDE_LAUNCHER_ACTION_ID,
  owner_id: 'lensx.core',
  title: { 'en-US': 'Hide launcher', 'zh-CN': '隐藏启动器' },
  enabled: true,
  default_keywords: {},
};
const builtinSettings: LauncherActionDescriptor = {
  ...builtinHide,
  action_id: OPEN_SETTINGS_ACTION_ID,
  title: { 'en-US': 'Settings', 'zh-CN': '设置' },
};

for (const locale of ['en-US', 'zh-CN'] as const) {
  const label = (descriptor: LauncherActionDescriptor) => descriptor.title[locale] ?? descriptor.title['en-US'];
  const featureRowName = (name: string) => (locale === 'en-US' ? `Shortcut for ${name}` : `“${name}”的快捷键`);
  const rowAction = (row: HTMLElement) =>
    within(row).getByRole('combobox', { name: /Action for shortcut|个快捷键的 Action/ });
  const expectPluginChoices = async () => {
    await screen.findByRole('option', { name: label(action) });
    expect(screen.getByRole('option', { name: label(otherAction) })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: label(builtinHide) })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: label(builtinSettings) })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  };

  test(`feature menus omit builtins in existing and new rows while plugin Actions remain selectable in ${locale}`, async () => {
    const savedKey = { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' };
    const { write, service } = await setup({
      locale,
      actions: [builtinHide, builtinSettings, action, otherAction],
      initial: {
        configuration: { ...defaultShortcutConfiguration(), actions: { [action.action_id]: savedKey } },
        bindings: [
          { target: 'launcher', status: 'active' },
          { target: action.action_id, status: 'active' },
        ],
        recovery_degraded: false,
        diagnostics: [],
      },
    });
    const existing = screen.getByRole('listitem', { name: featureRowName(label(action)) });
    const existingAction = rowAction(existing);
    fireEvent.click(existingAction);
    await expectPluginChoices();
    fireEvent.click(screen.getByRole('option', { name: label(otherAction) }));
    expect(existingAction).toHaveTextContent(label(otherAction));
    expect(write).not.toHaveBeenCalled();
    fireEvent.keyDown(existingAction, { key: 'Escape', code: 'Escape' });
    expect((await service.read()).configuration.actions).toEqual({ [action.action_id]: savedKey });

    fireEvent.click(addButton());
    const draft = screen.getByRole('listitem', {
      name: featureRowName(locale === 'en-US' ? 'New shortcut' : '新快捷键'),
    });
    fireEvent.click(rowAction(draft));
    await expectPluginChoices();
    expect(screen.getByRole('option', { name: label(action) })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('option', { name: label(otherAction) }));
    const candidate = screen.getByRole('textbox', { name: /Shortcut candidate|快捷键候选/ });
    fireEvent.click(candidate);
    await waitForRecording();
    recordChord(candidate);
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].actions).toEqual({
      [action.action_id]: savedKey,
      [otherAction.action_id]: { kind: 'chord', modifiers: ['cmd', 'shift'], key: 'KeyK' },
    });
  });

  test(`legacy builtin bindings keep their collapsed titles without returning to menus and can be reassigned or deleted in ${locale}`, async () => {
    const hideKey = { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyJ' };
    const settingsKey = { kind: 'chord' as const, modifiers: ['ctrl' as const], key: 'KeyK' };
    const pluginKey = { kind: 'modifier_double_tap' as const, modifier: 'shift' as const };
    const configuration = {
      ...defaultShortcutConfiguration(),
      actions: {
        [HIDE_LAUNCHER_ACTION_ID]: hideKey,
        [OPEN_SETTINGS_ACTION_ID]: settingsKey,
        [otherAction.action_id]: pluginKey,
      },
    };
    const { write, service } = await setup({
      locale,
      actions: [builtinHide, builtinSettings, action, otherAction],
      initial: {
        configuration,
        bindings: ['launcher', HIDE_LAUNCHER_ACTION_ID, OPEN_SETTINGS_ACTION_ID, otherAction.action_id].map(
          (target) => ({ target, status: 'active' as const }),
        ),
        recovery_degraded: false,
        diagnostics: [],
      },
    });
    const legacyHide = screen.getByRole('listitem', { name: featureRowName(label(builtinHide)) });
    const hideSelector = rowAction(legacyHide);
    expect(hideSelector).toHaveTextContent(label(builtinHide));
    const legacySettings = screen.getByRole('listitem', { name: featureRowName(label(builtinSettings)) });
    expect(rowAction(legacySettings)).toHaveTextContent(label(builtinSettings));
    expect(write).not.toHaveBeenCalled();
    expect((await service.read()).configuration).toEqual(configuration);

    fireEvent.click(hideSelector);
    await expectPluginChoices();
    fireEvent.click(screen.getByRole('option', { name: label(action) }));
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect((await service.read()).configuration.actions).toEqual({
      [OPEN_SETTINGS_ACTION_ID]: settingsKey,
      [otherAction.action_id]: pluginKey,
      [action.action_id]: hideKey,
    });

    const remainingBuiltin = screen.getByRole('listitem', { name: featureRowName(label(builtinSettings)) });
    const settingsSelector = rowAction(remainingBuiltin);
    fireEvent.click(settingsSelector);
    await expectPluginChoices();
    fireEvent.keyDown(settingsSelector, { key: 'Escape', code: 'Escape' });
    expect(write).toHaveBeenCalledTimes(1);
    fireEvent.click(within(remainingBuiltin).getByRole('button', { name: /Delete shortcut|删除/ }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect((await service.read()).configuration.actions).toEqual({
      [otherAction.action_id]: pluginKey,
      [action.action_id]: hideKey,
    });
    expect(screen.queryByRole('listitem', { name: featureRowName(label(builtinSettings)) })).not.toBeInTheDocument();
  });

  test(`a plugin named like Settings remains selectable because filtering uses builtin identity in ${locale}`, async () => {
    const sameTitlePlugin = { ...action, title: builtinSettings.title };
    const { write } = await setup({ locale, actions: [builtinHide, builtinSettings, sameTitlePlugin, otherAction] });
    fireEvent.click(addButton());
    const draft = screen.getByRole('listitem', {
      name: featureRowName(locale === 'en-US' ? 'New shortcut' : '新快捷键'),
    });
    fireEvent.click(rowAction(draft));
    const plugin = await screen.findByRole('option', { name: label(builtinSettings) });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('option', { name: label(builtinHide) })).not.toBeInTheDocument();
    fireEvent.click(plugin);
    const candidate = screen.getByRole('textbox', { name: /Shortcut candidate|快捷键候选/ });
    fireEvent.click(candidate);
    await waitForRecording();
    recordChord(candidate);
    fireEvent.click(saveButton());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].actions).toEqual({
      [sameTitlePlugin.action_id]: { kind: 'chord', modifiers: ['cmd', 'shift'], key: 'KeyK' },
    });
    expect(Object.hasOwn(write.mock.calls[0]?.[1].actions ?? {}, OPEN_SETTINGS_ACTION_ID)).toBe(false);
  });
}
