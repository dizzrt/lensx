import { describe, expect, rs, test } from '@rstest/core';
import { DEFAULT_ACTION_TILE_TITLE_FIT, fitActionTileTitle } from '../src/app/launcher/actionTileTitleFit';

describe('Action title font fitting', () => {
  test('keeps 14px for fitting titles, including the exact boundary', () => {
    for (const availableWidth of [140, 180]) {
      const measure = rs.fn((fontSize: number) => fontSize * 10);
      expect(fitActionTileTitle(availableWidth, measure)).toEqual({ fontSize: 14, isTruncated: false });
      expect(measure).toHaveBeenCalledTimes(1);
      expect(measure).toHaveBeenCalledWith(14);
    }
  });

  test.each(['Settings', '设置', 'Config配置'])('fits actual widths for %s at a continuous intermediate size', () => {
    const fit = fitActionTileTitle(132.7, (fontSize) => fontSize * 10);
    expect(fit.isTruncated).toBe(false);
    expect(fit.fontSize).toBeGreaterThan(13.22);
    expect(fit.fontSize).toBeLessThanOrEqual(13.27);
    expect(Number.isInteger(fit.fontSize)).toBe(false);
  });

  test('uses 12px and truncates only when even the complete minimum-size title overflows', () => {
    expect(fitActionTileTitle(119, (fontSize) => fontSize * 10)).toEqual({
      fontSize: 12,
      isTruncated: true,
    });
    expect(fitActionTileTitle(120, (fontSize) => fontSize * 10)).toEqual({
      fontSize: 12,
      isTruncated: false,
    });
  });

  test.each([18, -18])('corrects proportional estimation with a %spx non-scaling spacing contribution', (spacing) => {
    const measure = rs.fn((fontSize: number) => fontSize * 10 + spacing);
    const availableWidth = 132.7 + spacing;
    const fit = fitActionTileTitle(availableWidth, measure);

    expect(fit.isTruncated).toBe(false);
    expect(fit.fontSize).toBeGreaterThan(13.22);
    expect(fit.fontSize).toBeLessThanOrEqual(13.27);
    expect(measure(fit.fontSize)).toBeLessThanOrEqual(availableWidth);
    expect(measure.mock.calls.length).toBeLessThanOrEqual(10);
    expect(measure.mock.calls[0]).toEqual([14]);
    expect(measure.mock.calls[2]?.[0]).not.toBe(13);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('falls back for unavailable container width %s', (width) => {
    const measure = rs.fn(() => 100);
    expect(fitActionTileTitle(width, measure)).toEqual(DEFAULT_ACTION_TILE_TITLE_FIT);
    expect(measure).not.toHaveBeenCalled();
  });

  test.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('falls back for unavailable complete-text width %s', (width) => {
    expect(fitActionTileTitle(100, () => width)).toEqual(DEFAULT_ACTION_TILE_TITLE_FIT);
  });

  test('rejects invalid or failed correction measurements without retaining a partial result', () => {
    for (const failureAt of [1, 2, 3, 4]) {
      let calls = 0;
      expect(
        fitActionTileTitle(132.7, (fontSize) => {
          calls += 1;
          if (calls === failureAt) return Number.NaN;
          return fontSize * 10 + 1;
        }),
      ).toEqual(DEFAULT_ACTION_TILE_TITLE_FIT);
    }
    expect(
      fitActionTileTitle(100, () => {
        throw new Error('Text layout is temporarily unavailable.');
      }),
    ).toEqual(DEFAULT_ACTION_TILE_TITLE_FIT);
  });
});
