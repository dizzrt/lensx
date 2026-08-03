import { describe, expect, rs, test } from '@rstest/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PageContextBar } from '../src/app/navigation';

const lensXContext = Object.freeze({
  action_name: 'Open settings with a deliberately long localized Action name',
  owner_icon: Object.freeze({ kind: 'host' as const, token: 'lensx-owner' }),
  owner_name: 'lensX desktop Host with a deliberately long provider name',
  page_title: 'Settings',
});

describe('PageContextBar', () => {
  test('orders non-interactive Owner and Action segments before the only focusable close action', () => {
    const onClose = rs.fn();
    const { container } = render(
      <PageContextBar closeLabel="Close settings and return home" context={lensXContext} onClose={onClose} />,
    );
    const region = screen.getByRole('region', {
      name: `${lensXContext.owner_name}: ${lensXContext.action_name}`,
    });
    const segments = region.querySelectorAll('[data-page-context-segment]');

    expect([...segments].map((segment) => segment.getAttribute('data-page-context-segment'))).toEqual([
      'owner',
      'action',
    ]);
    expect(region).not.toHaveTextContent('/');
    expect(within(region).getAllByRole('button')).toHaveLength(1);
    expect(within(region).queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);

    const closeButton = within(region).getByRole('button', { name: 'Close settings and return home' });
    expect(closeButton).toHaveAttribute('data-launcher-drag-exclude', 'true');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('exposes the Owner token and stable text constraint containers', () => {
    const { container } = render(
      <PageContextBar closeLabel="Close" context={lensXContext} onClose={() => undefined} />,
    );

    expect(container.querySelector('[data-owner-icon-token]')).toHaveAttribute('data-owner-icon-token', 'lensx-owner');
    expect(container.querySelector('.page-context-control')).toHaveClass('min-w-0');
    expect(container.querySelector('.page-context-owner-text')).toHaveTextContent(lensXContext.owner_name);
    expect(container.querySelector('.page-context-action-text')).toHaveTextContent(lensXContext.action_name);
  });

  test('renders the generic Owner fallback without adding another action', () => {
    const { container } = render(
      <PageContextBar
        closeLabel="Close"
        context={{ action_name: 'Open page', owner_name: 'Unknown provider', page_title: 'Page' }}
        onClose={() => undefined}
      />,
    );

    expect(container.querySelector('[data-owner-icon-token]')).toHaveAttribute(
      'data-owner-icon-token',
      'owner-fallback',
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
