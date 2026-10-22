import { afterEach, expect } from '@rstest/core';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);
// Semi initializes text measurement on import; Happy DOM has no canvas renderer.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => ({
    fillStyle: '',
    fillRect: () => undefined,
    clearRect: () => undefined,
    beginPath: () => undefined,
    rect: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    measureText: (value: string) => ({ width: value.length * 8 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }),
});
afterEach(() => {
  cleanup();
  document.documentElement.lang = 'en-US';
  document.documentElement.style.removeProperty('color-scheme');
  document.body.removeAttribute('theme-mode');
});
