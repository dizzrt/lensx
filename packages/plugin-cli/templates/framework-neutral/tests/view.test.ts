import { createPluginRuntimeContextFixture } from '@lensx/plugin-testkit';
import { describe, expect, test } from '@rstest/core';
import { fireEvent, getByRole } from '@testing-library/dom';

import { renderFrameworkNeutralView } from '../src/view.js';

describe('framework-neutral accessible DOM view', () => {
  test('uses status semantics while loading', () => {
    const root = document.createElement('div');
    renderFrameworkNeutralView(root, { kind: 'loading' }, () => undefined);
    const status = getByRole(root, 'status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  test('provides keyboard-operable retry with default English fallback and visible focus styling', () => {
    const root = document.createElement('div');
    document.body.append(root);
    let retries = 0;
    renderFrameworkNeutralView(root, { kind: 'error' }, () => {
      retries += 1;
    });
    const alert = getByRole(root, 'alert');
    expect(alert).toHaveTextContent('Connection unavailable');
    const retry = getByRole(root, 'button', { name: 'Try again' });
    expect(retry).toHaveFocus();
    fireEvent.keyDown(retry, { key: 'Enter' });
    fireEvent.click(retry);
    expect(retries).toBe(1);
  });

  test('switches the complete ready document to Chinese and dark theme', () => {
    const root = document.createElement('div');
    renderFrameworkNeutralView(
      root,
      { kind: 'ready', context: createPluginRuntimeContextFixture({ locale: 'zh-CN', theme: 'dark' }) },
      () => undefined,
    );
    expect(getByRole(root, 'main')).toHaveTextContent('插件已就绪');
    expect(document.documentElement).toHaveAttribute('lang', 'zh-CN');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
