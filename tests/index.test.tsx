import { describe, expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { AppProviders } from '../src/app/AppProviders';
import type {
  LauncherActivationErrorListener,
  LauncherActivationListener,
  LauncherActivationPayload,
  LauncherActivationSource,
} from '../src/app/launcher/activation';

class FakeActivationSource implements LauncherActivationSource {
  listeners = new Set<LauncherActivationListener>();
  errorListeners = new Set<LauncherActivationErrorListener>();
  subscribeCount = 0;
  unlistenCount = 0;

  subscribe = async (listener: LauncherActivationListener, onError: LauncherActivationErrorListener) => {
    this.subscribeCount += 1;
    this.listeners.add(listener);
    this.errorListeners.add(onError);

    return () => {
      this.unlistenCount += 1;
      this.listeners.delete(listener);
      this.errorListeners.delete(onError);
    };
  };

  emit(payload: LauncherActivationPayload) {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}

describe('lensX app shell', () => {
  test('renders the product-owned English root interface by default', () => {
    const activationSource = new FakeActivationSource();
    render(
      <AppProviders>
        <App activationSource={activationSource} />
      </AppProviders>,
    );

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'lensX' })).toBeInTheDocument();
    expect(screen.getByText('A lightweight, keyboard-first desktop productivity launcher.')).toBeInTheDocument();
    expect(screen.queryByText(/Rsbuild/i)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Launcher query' })).toHaveAttribute('placeholder', 'Type a query');
    expect(screen.queryByText('Hide launcher')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('renders the Simplified Chinese product message when requested', async () => {
    const activationSource = new FakeActivationSource();
    render(
      <AppProviders initialLocale="zh-CN">
        <App activationSource={activationSource} />
      </AppProviders>,
    );

    expect(await screen.findByText('一款轻量、键盘优先的桌面效率启动器。')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '启动器查询' })).toHaveAttribute('placeholder', '输入查询内容');
    expect(screen.queryByText(/Rsbuild/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('keeps launcher input controlled without rendering simulated results', () => {
    const activationSource = new FakeActivationSource();
    render(
      <AppProviders>
        <App activationSource={activationSource} />
      </AppProviders>,
    );

    const input = screen.getByRole('textbox', { name: 'Launcher query' });
    fireEvent.change(input, { target: { value: 'open notes' } });

    expect(input).toHaveValue('open notes');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('focuses on first mount and after every activation without accumulating listeners', async () => {
    const activationSource = new FakeActivationSource();
    const { unmount } = render(
      <AppProviders>
        <App activationSource={activationSource} />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Launcher query' });

    expect(input).toHaveFocus();
    await waitFor(() => expect(activationSource.listeners.size).toBe(1));

    input.blur();
    act(() => activationSource.emit({ reason: 'global_shortcut' }));
    expect(input).toHaveFocus();

    input.blur();
    act(() => activationSource.emit({ reason: 'programmatic' }));
    expect(input).toHaveFocus();
    expect(activationSource.subscribeCount).toBe(1);
    expect(activationSource.listeners.size).toBe(1);

    unmount();
    expect(activationSource.unlistenCount).toBe(1);
    expect(activationSource.listeners.size).toBe(0);
  });

  test('releases the old listener when the activation source is replaced', async () => {
    const firstSource = new FakeActivationSource();
    const secondSource = new FakeActivationSource();
    const { rerender } = render(
      <AppProviders>
        <App activationSource={firstSource} />
      </AppProviders>,
    );
    await waitFor(() => expect(firstSource.listeners.size).toBe(1));

    rerender(
      <AppProviders>
        <App activationSource={secondSource} />
      </AppProviders>,
    );

    await waitFor(() => expect(secondSource.listeners.size).toBe(1));
    expect(firstSource.listeners.size).toBe(0);
    expect(firstSource.unlistenCount).toBe(1);
  });

  test('diagnoses listener failures without breaking initial input focus', async () => {
    const error = new Error('desktop event bridge unavailable');
    const activationSource: LauncherActivationSource = {
      subscribe: async () => {
        throw error;
      },
    };
    const consoleError = rs.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppProviders>
        <App activationSource={activationSource} />
      </AppProviders>,
    );

    expect(screen.getByRole('textbox', { name: 'Launcher query' })).toHaveFocus();
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith('Failed to listen for launcher activation.', error));
    consoleError.mockRestore();
  });
});
