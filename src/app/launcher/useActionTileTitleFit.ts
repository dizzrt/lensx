import { useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_ACTION_TILE_TITLE_FIT, fitActionTileTitle } from './actionTileTitleFit';

const readAvailableWidth = (element: HTMLSpanElement) => {
  const style = getComputedStyle(element);
  const inset = [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth].reduce(
    (total, value) => total + (Number.parseFloat(value) || 0),
    0,
  );
  return element.getBoundingClientRect().width - inset;
};

export const useActionTileTitleFit = (title: string, locale?: string) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [measurement, setMeasurement] = useState({ title, locale, fit: DEFAULT_ACTION_TILE_TITLE_FIT });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    let disposed = false;
    let frame: number | undefined;
    let previousWidth = Number.NaN;
    let needsRecovery = false;

    const update = () => {
      frame = undefined;
      if (disposed || !container.isConnected || !measure.isConnected) return;

      let fit = DEFAULT_ACTION_TILE_TITLE_FIT;
      needsRecovery = false;
      try {
        previousWidth = readAvailableWidth(container);
        needsRecovery = !Number.isFinite(previousWidth) || previousWidth <= 0;
        fit = fitActionTileTitle(previousWidth, (fontSize) => {
          measure.style.fontSize = `${fontSize}px`;
          try {
            const width = measure.getBoundingClientRect().width;
            if (!Number.isFinite(width) || width <= 0) needsRecovery = true;
            return width;
          } catch (error) {
            needsRecovery = true;
            throw error;
          }
        });
      } catch {
        needsRecovery = true;
      } finally {
        measure.style.fontSize = `${DEFAULT_ACTION_TILE_TITLE_FIT.fontSize}px`;
      }

      if (disposed) return;
      setMeasurement((previous) =>
        previous.title === title &&
        previous.locale === locale &&
        previous.fit.fontSize === fit.fontSize &&
        previous.fit.isTruncated === fit.isTruncated
          ? previous
          : { title, locale, fit },
      );
    };

    const schedule = () => {
      if (!disposed && frame === undefined) frame = requestAnimationFrame(update);
    };

    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            let width = Number.NaN;
            try {
              width = readAvailableWidth(container);
            } catch {
              needsRecovery = true;
            }
            if (needsRecovery || !Object.is(previousWidth, width)) schedule();
          })
        : undefined;
    observer?.observe(container);

    const fonts = document.fonts;
    fonts?.addEventListener('loadingdone', schedule);
    fonts?.addEventListener('loadingerror', schedule);
    void fonts?.ready.then(schedule, schedule);

    update();

    return () => {
      disposed = true;
      observer?.disconnect();
      fonts?.removeEventListener('loadingdone', schedule);
      fonts?.removeEventListener('loadingerror', schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [title, locale]);

  const fit =
    measurement.title === title && measurement.locale === locale ? measurement.fit : DEFAULT_ACTION_TILE_TITLE_FIT;
  return { containerRef, measureRef, ...fit };
};
