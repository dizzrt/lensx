import { rs } from '@rstest/core';

type AvailableWidth = number | ((element: Element) => number);
type MeasureTextWidth = (title: string, fontSize: number, element: Element) => number;

interface MeasurementOptions {
  readonly availableWidth?: AvailableWidth;
  readonly measureTextWidth?: MeasureTextWidth;
}

/** Deterministic DOM facts only; this does not simulate platform text rendering. */
export const installActionTitleMeasurement = ({
  availableWidth = 100,
  measureTextWidth = (_title, fontSize) => fontSize * 10,
}: MeasurementOptions = {}) => {
  let currentWidth = availableWidth;
  let currentMeasure = measureTextWidth;
  let nextFrame = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const measurements: { readonly title: string; readonly fontSize: number }[] = [];
  const originalRect = Element.prototype.getBoundingClientRect;
  const resizeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  const frameDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const cancelDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
  const widthOf = (element: Element) => (typeof currentWidth === 'number' ? currentWidth : currentWidth(element));
  const rect = (width: number) => ({
    x: 0,
    y: 0,
    width,
    height: 20,
    top: 0,
    right: width,
    bottom: 20,
    left: 0,
    toJSON() {},
  });
  const rectSpy = rs.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('launcher-action-title-measure')) {
      const fontSize = Number.parseFloat((this as HTMLElement).style.fontSize) || 14;
      const title = this.textContent ?? '';
      measurements.push({ title, fontSize });
      return rect(currentMeasure(title, fontSize, this));
    }
    if (this.classList.contains('launcher-action-text')) return rect(widthOf(this));
    return originalRect.call(this);
  });

  const observers: TestResizeObserver[] = [];
  class TestResizeObserver {
    readonly observed = new Set<Element>();
    disconnected = false;

    constructor(readonly callback: ResizeObserverCallback) {
      observers.push(this);
    }

    observe(element: Element) {
      this.observed.add(element);
    }

    unobserve(element: Element) {
      this.observed.delete(element);
    }

    disconnect() {
      this.disconnected = true;
      this.observed.clear();
    }
  }

  const fontEvents = new EventTarget();
  let resolveFonts: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveFonts = resolve;
  });
  const addFontListener = rs.fn(fontEvents.addEventListener.bind(fontEvents));
  const removeFontListener = rs.fn(fontEvents.removeEventListener.bind(fontEvents));
  const fonts = { ready, addEventListener: addFontListener, removeEventListener: removeFontListener };

  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: TestResizeObserver });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (id: number) => frames.delete(id),
  });
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });

  const restore = (target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined) => {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  };

  return {
    measurements,
    observers,
    addFontListener,
    removeFontListener,
    get pendingFrameCount() {
      return frames.size;
    },
    setAvailableWidth(width: AvailableWidth) {
      currentWidth = width;
    },
    setMeasureTextWidth(measure: MeasureTextWidth) {
      currentMeasure = measure;
    },
    notifyResize() {
      for (const observer of observers) {
        if (observer.disconnected) continue;
        observer.callback(
          [...observer.observed].map(
            (target) => ({ target, contentRect: rect(widthOf(target)) }) as ResizeObserverEntry,
          ),
          observer as unknown as ResizeObserver,
        );
      }
    },
    notifyFonts(type = 'loadingdone') {
      fontEvents.dispatchEvent(new Event(type));
    },
    resolveFontsReady() {
      resolveFonts?.();
    },
    flushFrame() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    },
    restore() {
      rectSpy.mockRestore();
      restore(globalThis, 'ResizeObserver', resizeDescriptor);
      restore(globalThis, 'requestAnimationFrame', frameDescriptor);
      restore(globalThis, 'cancelAnimationFrame', cancelDescriptor);
      restore(document, 'fonts', fontsDescriptor);
    },
  };
};
