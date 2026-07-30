import { afterEach, expect } from '@rstest/core';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { appI18n } from '../src/app/i18n/i18n';
import { DEFAULT_APP_LOCALE } from '../src/app/i18n/types';

expect.extend(jestDomMatchers);

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => ({
    fillStyle: '',
    fillRect: () => undefined,
  }),
});

afterEach(() => {
  cleanup();
  document.body.removeAttribute('theme-mode');
  document.documentElement.lang = DEFAULT_APP_LOCALE;
  document.documentElement.style.removeProperty('color-scheme');
  void appI18n.changeLanguage(DEFAULT_APP_LOCALE);
});
