export const ACTION_TILE_TITLE_MAX_FONT_SIZE = 14;
export const ACTION_TILE_TITLE_MIN_FONT_SIZE = 12;

const FONT_SIZE_PRECISION = 0.05;
const MAX_CORRECTION_PASSES = 6;

export interface ActionTileTitleFit {
  readonly fontSize: number;
  readonly isTruncated: boolean;
}

export const DEFAULT_ACTION_TILE_TITLE_FIT: ActionTileTitleFit = Object.freeze({
  fontSize: ACTION_TILE_TITLE_MAX_FONT_SIZE,
  isTruncated: false,
});

const isValidWidth = (width: number) => Number.isFinite(width) && width > 0;

/** Measures the complete title at independent font sizes, never the already fitted text. */
export const fitActionTileTitle = (
  availableWidth: number,
  measureWidth: (fontSize: number) => number,
): ActionTileTitleFit => {
  if (!isValidWidth(availableWidth)) return DEFAULT_ACTION_TILE_TITLE_FIT;

  try {
    const maximumWidth = measureWidth(ACTION_TILE_TITLE_MAX_FONT_SIZE);
    if (!isValidWidth(maximumWidth)) return DEFAULT_ACTION_TILE_TITLE_FIT;
    if (maximumWidth <= availableWidth) return DEFAULT_ACTION_TILE_TITLE_FIT;

    const minimumWidth = measureWidth(ACTION_TILE_TITLE_MIN_FONT_SIZE);
    if (!isValidWidth(minimumWidth)) return DEFAULT_ACTION_TILE_TITLE_FIT;
    if (minimumWidth > availableWidth) {
      return { fontSize: ACTION_TILE_TITLE_MIN_FONT_SIZE, isTruncated: true };
    }

    let lower = ACTION_TILE_TITLE_MIN_FONT_SIZE;
    let upper = ACTION_TILE_TITLE_MAX_FONT_SIZE;
    const candidate = Math.max(lower, Math.min(upper, (upper * availableWidth) / maximumWidth));
    if (candidate > lower && candidate < upper) {
      const candidateWidth = measureWidth(candidate);
      if (!isValidWidth(candidateWidth)) return DEFAULT_ACTION_TILE_TITLE_FIT;
      if (candidateWidth <= availableWidth) lower = candidate;
      else upper = candidate;
    }

    for (let pass = 0; pass < MAX_CORRECTION_PASSES && upper - lower > FONT_SIZE_PRECISION; pass += 1) {
      const midpoint = (lower + upper) / 2;
      const midpointWidth = measureWidth(midpoint);
      if (!isValidWidth(midpointWidth)) return DEFAULT_ACTION_TILE_TITLE_FIT;
      if (midpointWidth <= availableWidth) lower = midpoint;
      else upper = midpoint;
    }

    return { fontSize: lower, isTruncated: false };
  } catch {
    return DEFAULT_ACTION_TILE_TITLE_FIT;
  }
};
