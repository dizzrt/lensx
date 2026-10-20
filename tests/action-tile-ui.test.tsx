import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ActionTile } from '../src/app/launcher/ActionTile';
import { useActionTileTitleFit } from '../src/app/launcher/useActionTileTitleFit';
import { installActionTitleMeasurement } from './helpers/action-title-measurement';

let measurements: ReturnType<typeof installActionTitleMeasurement> | undefined;

afterEach(() => {
  cleanup();
  measurements?.restore();
  measurements = undefined;
});

const action = (title: string) => ({ action_id: 'tools.workspace.title', title });
const renderTile = (title = 'Complete Action title') =>
  render(<ActionTile action={action(title)} onActivate={() => undefined} />);

const getTitle = () => screen.getByRole('button').querySelector<HTMLElement>('.launcher-action-title');

const FitProbe = ({
  title,
  locale,
  onRender,
}: {
  readonly title: string;
  readonly locale?: string;
  readonly onRender?: (fit: { readonly fontSize: number; readonly isTruncated: boolean }) => void;
}) => {
  const { containerRef, measureRef, fontSize, isTruncated } = useActionTileTitleFit(title, locale);
  onRender?.({ fontSize, isTruncated });
  return (
    <>
      <span className="launcher-action-text" ref={containerRef} />
      <span aria-hidden="true" className="launcher-action-title-measure" ref={measureRef}>
        {title}
      </span>
      <output data-testid="fit-result">{JSON.stringify({ fontSize, isTruncated })}</output>
    </>
  );
};

const getFit = () => JSON.parse(screen.getByTestId('fit-result').textContent ?? '{}');

describe('Action title DOM fitting', () => {
  test('preserves complete content and accessible names while the hidden measurement stays outside the button', () => {
    measurements = installActionTitleMeasurement({ availableWidth: 140 });
    const { container } = renderTile('完整 ConfigLens 标题');
    const button = screen.getByRole('button', { name: '完整 ConfigLens 标题' });
    const measure = container.querySelector('.launcher-action-title-measure');

    expect(getTitle()).toHaveStyle({ fontSize: '14px' });
    expect(getTitle()?.textContent).toBe('完整 ConfigLens 标题');
    expect(button.textContent).toBe('完整 ConfigLens 标题');
    expect(button).not.toContainElement(measure as HTMLElement);
    expect(measure).toHaveAttribute('aria-hidden', 'true');
    expect(measure).not.toHaveAttribute('tabindex');
    expect(measure).not.toHaveAttribute('title');
    expect(measure?.textContent).toBe('完整 ConfigLens 标题');
    expect(getTitle()).not.toHaveClass('semi-typography-ellipsis');
  });

  test('commits a non-integer size and retains the complete minimum-size title data when truncated', () => {
    measurements = installActionTitleMeasurement({ availableWidth: 132.7 });
    renderTile();
    const fittedSize = Number.parseFloat(getTitle()?.style.fontSize ?? '');
    expect(fittedSize).toBeGreaterThan(13.22);
    expect(fittedSize).toBeLessThanOrEqual(13.27);

    measurements.setAvailableWidth(100);
    act(() => {
      measurements?.notifyResize();
      measurements?.flushFrame();
    });
    expect(getTitle()).toHaveStyle({ fontSize: '12px' });
    expect(screen.getByRole('button', { name: 'Complete Action title' })).toBeInTheDocument();
    expect(getTitle()?.textContent).toBe('Complete Action title');
  });

  test('uses the container content box and can grow back to 14px from an independently measured baseline', () => {
    measurements = installActionTitleMeasurement({ availableWidth: 140 });
    const { container } = renderTile();
    const titleBox = container.querySelector<HTMLElement>('.launcher-action-text');
    if (!titleBox) throw new Error('Action title requires a content box.');
    titleBox.style.paddingInline = '0';
    titleBox.style.paddingLeft = '3px';
    titleBox.style.paddingRight = '4px';
    titleBox.style.borderLeft = '1px solid transparent';
    titleBox.style.borderRight = '2px solid transparent';
    act(() => {
      measurements?.notifyResize();
      measurements?.flushFrame();
    });
    expect(Number.parseFloat(getTitle()?.style.fontSize ?? '')).toBeCloseTo(13, 1);

    measurements.measurements.length = 0;
    measurements.setAvailableWidth(200);
    act(() => {
      measurements?.notifyResize();
      measurements?.flushFrame();
    });
    expect(getTitle()).toHaveStyle({ fontSize: '14px' });
    expect(measurements.measurements[0]?.fontSize).toBe(14);
    expect(container.querySelector<HTMLElement>('.launcher-action-title-measure')?.style.fontSize).toBe('14px');
  });

  test('invalidates both title and language with a safe current-render fallback', () => {
    measurements = installActionTitleMeasurement({ availableWidth: 100 });
    const onRender = rs.fn();
    const view = render(<FitProbe locale="en-US" onRender={onRender} title="First title" />);
    expect(getFit()).toEqual({ fontSize: 12, isTruncated: true });

    measurements.setMeasureTextWidth(() => 60);
    onRender.mockClear();
    view.rerender(<FitProbe locale="zh-CN" onRender={onRender} title="中文新标题" />);
    expect(onRender.mock.calls[0]?.[0]).toEqual({ fontSize: 14, isTruncated: false });
    expect(getFit()).toEqual({ fontSize: 14, isTruncated: false });
    expect(measurements.measurements.at(-1)?.title).toBe('中文新标题');

    measurements.setMeasureTextWidth((_, fontSize) => fontSize * 10);
    view.rerender(<FitProbe locale="en-US" onRender={onRender} title="中文新标题" />);
    expect(getFit()).toEqual({ fontSize: 12, isTruncated: true });
  });

  test('recovers after zero-width, invalid, and throwing text measurements without inventing truncation', () => {
    measurements = installActionTitleMeasurement({ availableWidth: 0 });
    render(<FitProbe title="Recovery title" />);
    expect(getFit()).toEqual({ fontSize: 14, isTruncated: false });
    measurements.setAvailableWidth(100);
    act(() => {
      measurements?.notifyResize();
      measurements?.flushFrame();
    });
    expect(getFit()).toEqual({ fontSize: 12, isTruncated: true });

    for (const measure of [
      () => Number.NaN,
      () => {
        throw new Error('The layout is temporarily unavailable.');
      },
    ]) {
      measurements.setMeasureTextWidth(measure);
      act(() => {
        measurements?.notifyFonts();
        measurements?.flushFrame();
      });
      expect(getFit()).toEqual({ fontSize: 14, isTruncated: false });
      measurements.setMeasureTextWidth((_, fontSize) => fontSize * 10);
      act(() => {
        measurements?.notifyResize();
        measurements?.flushFrame();
      });
      expect(getFit()).toEqual({ fontSize: 12, isTruncated: true });
    }
  });

  test('coalesces resize and font notifications and leaves stable results free of further submissions', () => {
    measurements = installActionTitleMeasurement({ availableWidth: 100 });
    const onRender = rs.fn();
    render(<FitProbe onRender={onRender} title="Stable title" />);
    measurements.measurements.length = 0;
    measurements.setAvailableWidth(200);
    act(() => {
      measurements?.notifyResize();
      measurements?.notifyResize();
      measurements?.notifyFonts();
      measurements?.notifyFonts('loadingerror');
    });
    expect(measurements.pendingFrameCount).toBe(1);
    act(() => measurements?.flushFrame());
    expect(measurements.measurements).toEqual([{ title: 'Stable title', fontSize: 14 }]);
    expect(getFit()).toEqual({ fontSize: 14, isTruncated: false });

    onRender.mockClear();
    act(() => {
      measurements?.notifyResize();
      measurements?.flushFrame();
    });
    expect(onRender).not.toHaveBeenCalled();
    expect(measurements.pendingFrameCount).toBe(0);
    expect(measurements.measurements).toHaveLength(1);
  });

  test('reacts to initial font readiness and later font loads using the current text only', async () => {
    measurements = installActionTitleMeasurement({ availableWidth: 100 });
    const view = render(<FitProbe locale="en-US" title="Old title" />);
    view.rerender(<FitProbe locale="zh-CN" title="当前标题" />);
    measurements.measurements.length = 0;
    measurements.setMeasureTextWidth(() => 70);
    await act(async () => {
      measurements?.resolveFontsReady();
      await Promise.resolve();
      measurements?.flushFrame();
    });
    expect(getFit()).toEqual({ fontSize: 14, isTruncated: false });
    expect(measurements.measurements).toEqual([{ title: '当前标题', fontSize: 14 }]);
    expect(measurements.observers[0]?.disconnected).toBe(true);

    measurements.setMeasureTextWidth((_, fontSize) => fontSize * 10);
    act(() => {
      measurements?.notifyFonts();
      measurements?.flushFrame();
    });
    expect(getFit()).toEqual({ fontSize: 12, isTruncated: true });
  });

  test('disconnects observers, removes font listeners, cancels frames, and ignores late readiness on unmount', async () => {
    measurements = installActionTitleMeasurement();
    const view = render(<FitProbe title="Unmount title" />);
    act(() => measurements?.notifyFonts());
    expect(measurements.pendingFrameCount).toBe(1);
    view.unmount();
    expect(measurements.pendingFrameCount).toBe(0);
    expect(measurements.observers.every(({ disconnected }) => disconnected)).toBe(true);
    expect(measurements.removeFontListener.mock.calls).toEqual(measurements.addFontListener.mock.calls);

    const reads = measurements.measurements.length;
    await act(async () => {
      measurements?.resolveFontsReady();
      await Promise.resolve();
      measurements?.notifyFonts();
      measurements?.notifyResize();
      measurements?.flushFrame();
    });
    expect(measurements.pendingFrameCount).toBe(0);
    expect(measurements.measurements).toHaveLength(reads);
  });
});
