import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import {
  LauncherActionDispatcher,
  LauncherActionRegistry,
  type LauncherActionService,
} from '../src/app/launcher/actions';
import { EMPTY_LAUNCHER_ACTION_COLLECTIONS } from '../src/app/launcher/collections';
import type { LauncherWindowDragController } from '../src/app/launcher/windowDrag';
import { AppNavigationService, HostPageCatalog } from '../src/app/navigation';

const inertActivationSource = {
  subscribe: async () => () => undefined,
};

const inertCollectionsClient = {
  read: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
  recordUse: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
  setPinned: async () => EMPTY_LAUNCHER_ACTION_COLLECTIONS,
};

const settingsTarget = Object.freeze({
  owner_id: 'lensx.core',
  page_id: 'settings',
});

const createShellDependencies = () => {
  const navigationService = new AppNavigationService(
    new HostPageCatalog([
      {
        ...settingsTarget,
        enabled: true,
      },
    ]),
  );
  const registry = new LauncherActionRegistry();
  const result = registry.registerBatch([
    {
      descriptor: {
        action_id: 'lensx.core.open_settings',
        owner_id: 'lensx.core',
        title: { 'en-US': 'Open settings', 'zh-CN': '打开设置' },
        description: { 'en-US': 'Open settings', 'zh-CN': '打开设置' },
        default_keywords: { 'en-US': ['settings'], 'zh-CN': ['设置'] },
        enabled: true,
      },
      executor: () => undefined,
    },
    {
      descriptor: {
        action_id: 'lensx.core.settings_details',
        owner_id: 'lensx.core',
        title: { 'en-US': 'Settings details', 'zh-CN': '设置详情' },
        description: { 'en-US': 'Inspect settings', 'zh-CN': '检查设置' },
        default_keywords: { 'en-US': ['settings'], 'zh-CN': ['设置'] },
        enabled: true,
      },
      executor: () => undefined,
    },
  ]);
  if (!result.ok) {
    throw new Error('Launcher drag test Action registration failed.');
  }

  const actionService: LauncherActionService = {
    registry,
    dispatcher: new LauncherActionDispatcher(registry),
  };
  return { actionService, navigationService };
};

const renderShell = (
  windowDragController: LauncherWindowDragController,
  {
    initialLocale = 'en-US',
    initialThemeMode = 'light',
  }: {
    initialLocale?: 'en-US' | 'zh-CN';
    initialThemeMode?: 'light' | 'dark';
  } = {},
) => {
  const dependencies = createShellDependencies();
  const rendered = render(
    <AppProviders initialLocale={initialLocale} initialThemeMode={initialThemeMode}>
      <App
        actionService={dependencies.actionService}
        activationSource={inertActivationSource}
        collectionsClient={inertCollectionsClient}
        navigationService={dependencies.navigationService}
        renderPage={() => <div>Trusted settings content</div>}
        windowDragController={windowDragController}
      />
    </AppProviders>,
  );
  return { ...dependencies, ...rendered };
};

const getDragRegion = () => {
  const region = document.querySelector<HTMLElement>('[data-launcher-drag-region="true"]');
  if (!region) {
    throw new Error('Launcher drag region was not rendered.');
  }
  return region;
};

describe('launcher unified top drag region', () => {
  test('routes primary mouse starts from top blank, input, page context, and avatar across all states', async () => {
    const startDragging = rs.fn(async () => undefined);
    const { navigationService } = renderShell({ startDragging });
    const dragRegion = getDragRegion();
    const homeInput = screen.getByRole('combobox', { name: 'Launcher query' });

    fireEvent.mouseDown(dragRegion, { button: 0 });
    fireEvent.mouseDown(homeInput, { button: 0 });
    fireEvent.mouseDown(document.querySelector('.launcher-avatar') as Element, { button: 0 });

    fireEvent.change(homeInput, { target: { value: 'settings' } });
    const searchInput = screen.getByRole('combobox', { name: 'Launcher query' });
    expect(screen.getByRole('option', { name: /Open settings/ })).toBeInTheDocument();
    fireEvent.mouseDown(searchInput, { button: 0 });

    act(() => navigationService.openPage(settingsTarget, 'lensx.core.open_settings'));
    const context = await screen.findByRole('region', { name: 'lensX / Open settings' });
    fireEvent.mouseDown(context.querySelector('.page-context-owner') as Element, { button: 0 });
    fireEvent.mouseDown(document.querySelector('.launcher-avatar') as Element, { button: 0 });

    expect(startDragging).toHaveBeenCalledTimes(6);
  });

  test('excludes the close control and ignores non-primary mouse buttons and keyboard events', async () => {
    const startDragging = rs.fn(async () => undefined);
    const { navigationService } = renderShell({ startDragging });
    act(() => navigationService.openPage(settingsTarget, 'lensx.core.open_settings'));

    const closeButton = await screen.findByRole('button', { name: 'Close settings and return home' });
    const closeIcon = closeButton.querySelector('svg');
    expect(closeButton).toHaveAttribute('data-launcher-drag-exclude', 'true');
    expect(closeIcon).not.toBeNull();
    fireEvent.mouseDown(closeButton, { button: 0 });
    fireEvent.mouseDown(closeIcon as SVGElement, { button: 0 });

    const dragRegion = getDragRegion();
    fireEvent.mouseDown(dragRegion, { button: 1 });
    fireEvent.mouseDown(dragRegion, { button: 2 });
    fireEvent.keyDown(dragRegion, { key: 'Enter' });
    expect(startDragging).not.toHaveBeenCalled();

    fireEvent.click(closeButton);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Launcher query' })).toHaveFocus());
  });

  test('contains rejected drag requests without clearing search, selection, page, or focus state', async () => {
    const nativeError = new Error('native drag rejected');
    const startDragging = rs.fn(async () => {
      throw nativeError;
    });
    const consoleError = rs.spyOn(console, 'error').mockImplementation(() => undefined);
    const { navigationService } = renderShell({ startDragging });
    const input = screen.getByRole('combobox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'settings' } });
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    const selectedOption = screen.getByRole('option', { name: /Open settings/ });
    expect(selectedOption).toHaveAttribute('aria-selected', 'true');
    input.focus();

    fireEvent.mouseDown(input, { button: 0 });
    await act(async () => Promise.resolve());
    expect(input).toHaveValue('settings');
    expect(input).toHaveFocus();
    expect(selectedOption).toHaveAttribute('aria-selected', 'true');

    act(() => navigationService.openPage(settingsTarget, 'lensx.core.open_settings'));
    const context = await screen.findByRole('region', { name: 'lensX / Open settings' });
    fireEvent.mouseDown(context, { button: 0 });
    await act(async () => Promise.resolve());
    expect(screen.getByText('Trusted settings content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close settings and return home' })).toBeInTheDocument();
    expect(startDragging).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  test('preserves input defaults, keyboard and composition behavior, theme, locale, and decorative semantics', async () => {
    const startDragging = rs.fn(async () => undefined);
    const { navigationService } = renderShell(
      { startDragging },
      {
        initialLocale: 'zh-CN',
        initialThemeMode: 'dark',
      },
    );
    const input = screen.getByRole('combobox', { name: '启动器查询' }) as HTMLInputElement;
    expect(input).toHaveFocus();
    input.setSelectionRange(0, 0);

    expect(fireEvent.mouseDown(input, { button: 0 })).toBe(true);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(0);
    fireEvent.change(input, { target: { value: '设置' } });
    expect(input).toHaveValue('设置');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { isComposing: true, key: 'ArrowRight' });
    fireEvent.compositionEnd(input);
    input.setSelectionRange(0, 1);
    fireEvent.keyDown(input, { key: 'ArrowLeft', shiftKey: true });
    expect(startDragging).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('设置');

    const avatar = document.querySelector('.launcher-avatar');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).not.toHaveAttribute('role');
    expect(avatar).not.toHaveAttribute('tabindex');
    expect(getDragRegion()).not.toHaveAttribute('role');
    expect(getDragRegion()).not.toHaveAttribute('tabindex');
    expect(getDragRegion().style.background).toBe('');
    expect(document.body).toHaveAttribute('theme-mode', 'dark');

    act(() => navigationService.openPage(settingsTarget, 'lensx.core.open_settings'));
    const closeButton = await screen.findByRole('button', { name: '关闭设置并返回主页' });
    expect(closeButton).toHaveAccessibleName('关闭设置并返回主页');
    expect(closeButton).toHaveAttribute('data-launcher-drag-exclude', 'true');
  });
});
