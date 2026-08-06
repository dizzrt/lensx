import { createPluginRuntimeContextFixture, FakePluginSdkTransport } from '@lensx/plugin-testkit';
import { describe, expect, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { App } from '../src/App.js';

describe('React and Semi template composition', () => {
  test('renders accessible loading then ready content with Plugin UI, Semi control, locale, and theme', async () => {
    const fake = new FakePluginSdkTransport();
    render(<App createTransport={() => fake} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('main')).toHaveAccessibleName('React and Semi starter');
    expect(screen.getByRole('button', { name: 'Local action' })).toBeVisible();

    fake.emit('runtime.context_changed', createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }));
    expect(await screen.findByRole('main', { name: 'React 与 Semi 起步模板' })).toBeVisible();
    expect(screen.getByRole('button', { name: '本地操作' })).toBeVisible();
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('lang', 'zh-CN');
      expect(document.body).toHaveAttribute('theme-mode', 'dark');
    });
  });

  test('uses an alert, restores focus, and retries with a fresh transport', async () => {
    const failed = new FakePluginSdkTransport({ connect: async () => Promise.reject(new Error('private')) });
    const recovered = new FakePluginSdkTransport();
    const transports = [failed, recovered];
    render(
      <App
        createTransport={() => {
          const next = transports.shift();
          if (next === undefined) throw new Error('Unexpected extra App Runtime attempt.');
          return next;
        }}
      />,
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    const retry = screen.getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toHaveFocus());
    fireEvent.keyDown(retry, { key: 'Enter' });
    fireEvent.click(retry);
    expect(await screen.findByRole('main')).toBeVisible();
    expect(failed.observation.disposeCalls).toBe(1);
    expect(recovered.observation.connectAttempts).toBe(1);
  });

  test('unmounts through one idempotent client cleanup path and ignores late events', async () => {
    const fake = new FakePluginSdkTransport();
    const rendered = render(<App createTransport={() => fake} />);
    expect(await screen.findByRole('main')).toBeVisible();
    rendered.unmount();
    await waitFor(() => expect(fake.observation.disposeCalls).toBe(1));
    fake.emit('runtime.context_changed', createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }));
    expect(document.body).not.toHaveAttribute('theme-mode', 'dark');
  });
});
