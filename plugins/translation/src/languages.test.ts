import { describe, expect, test } from '@rstest/core';

import {
  defaultTargetLanguage,
  isSourceLanguage,
  isSupportedDirection,
  isTargetLanguage,
  LANGUAGE_CATALOG,
  languageLabel,
} from './languages.js';

describe('reviewed Volcengine text-translation language snapshot', () => {
  test('has the 129 unique official codes and both labels, separate from Auto', () => {
    expect(LANGUAGE_CATALOG).toHaveLength(129);
    expect(new Set(LANGUAGE_CATALOG.map(({ code }) => code)).size).toBe(129);
    expect(LANGUAGE_CATALOG.filter(({ source }) => source)).toHaveLength(128);
    expect(LANGUAGE_CATALOG.filter(({ target }) => target)).toHaveLength(123);
    for (const language of LANGUAGE_CATALOG) {
      expect(language.en.length).toBeGreaterThan(0);
      expect(language.zh.length).toBeGreaterThan(0);
      expect(languageLabel(language.code, 'en-US')).toBe(language.en);
      expect(languageLabel(language.code, 'zh-CN')).toBe(language.zh);
    }
    expect(isSourceLanguage('auto')).toBe(false);
    expect(isTargetLanguage('auto')).toBe(false);
    expect(isSupportedDirection('auto', 'en')).toBe(true);
    expect(isSupportedDirection('auto', 'auto')).toBe(false);
  });

  test.each(['zh', 'zh-Hant', 'zh-Hant-hk', 'zh-Hant-tw'])('preserves exact Chinese code %s', (code) => {
    expect(isSourceLanguage(code)).toBe(true);
    expect(isTargetLanguage(code)).toBe(true);
  });

  test.each(['bo', 'nan', 'wuu', 'yue', 'cmn', 'ug'])('restricts %s to a source targeting zh', (code) => {
    expect(isSourceLanguage(code)).toBe(true);
    expect(isTargetLanguage(code)).toBe(false);
    expect(isSupportedDirection(code, 'zh')).toBe(true);
    for (const target of LANGUAGE_CATALOG.filter(({ target }) => target)) {
      expect(isSupportedDirection(code, target.code)).toBe(target.code === 'zh');
    }
  });

  test('rejects unknown values and source sk, maps supported Host defaults', () => {
    expect(isSourceLanguage('sk')).toBe(false);
    expect(isTargetLanguage('sk')).toBe(true);
    expect(isSupportedDirection('sk', 'en')).toBe(false);
    expect(isSupportedDirection('en', 'sk')).toBe(true);
    expect(isSupportedDirection('en', 'zh-HK')).toBe(false);
    expect(isSupportedDirection('unknown', 'en')).toBe(false);
    expect(defaultTargetLanguage('en-US')).toBe('en');
    expect(defaultTargetLanguage('zh-CN')).toBe('zh');
  });
});
