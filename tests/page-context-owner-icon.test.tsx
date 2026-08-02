import { describe, expect, test } from '@rstest/core';
import { render } from '@testing-library/react';
import { PageContextOwnerIcon } from '../src/app/navigation/PageContextOwnerIcon';

describe('PageContextOwnerIcon', () => {
  test('renders the lensX Owner token without reusing the settings Action gear token', () => {
    const { container } = render(<PageContextOwnerIcon icon={{ kind: 'host', token: 'lensx-owner' }} />);
    const icon = container.querySelector('[data-owner-icon-token]');

    expect(icon).toHaveAttribute('data-owner-icon-token', 'lensx-owner');
    expect(icon).not.toHaveAttribute('data-icon-token', 'settings');
  });

  test('uses the generic provider fallback for missing and unknown tokens', () => {
    const missing = render(<PageContextOwnerIcon />);
    expect(missing.container.querySelector('[data-owner-icon-token]')).toHaveAttribute(
      'data-owner-icon-token',
      'owner-fallback',
    );
    missing.unmount();

    const unknown = render(<PageContextOwnerIcon icon={{ kind: 'host', token: 'unknown-owner' }} />);
    expect(unknown.container.querySelector('[data-owner-icon-token]')).toHaveAttribute(
      'data-owner-icon-token',
      'owner-fallback',
    );
  });
});
