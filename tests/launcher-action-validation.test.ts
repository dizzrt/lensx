import { describe, expect, test } from '@rstest/core';
import {
  isValidLauncherActionId,
  isValidLauncherActionOwnerId,
  resolveLauncherActionMetadata,
  validateLauncherActionDescriptor,
} from '../src/app/launcher/actions/validation';

const createDescriptor = () => ({
  action_id: 'lensx.core.hide_launcher',
  owner_id: 'lensx.core',
  title: {
    'en-US': ' Hide launcher ',
    'zh-CN': ' 隐藏启动器 ',
  },
  description: {
    'en-US': ' Hide the launcher window ',
    'zh-CN': ' 隐藏启动器窗口 ',
  },
  default_keywords: {
    'en-US': [' hide ', 'window'],
    'zh-CN': [' 隐藏 ', '窗口'],
  },
  enabled: true,
});

describe('launcher action descriptor validation', () => {
  test('accepts and normalizes minimal and complete plain-data descriptors', () => {
    const complete = validateLauncherActionDescriptor(createDescriptor());
    expect(complete).toMatchObject({
      ok: true,
      diagnostics: [],
      descriptor: {
        action_id: 'lensx.core.hide_launcher',
        owner_id: 'lensx.core',
        title: {
          'en-US': 'Hide launcher',
          'zh-CN': '隐藏启动器',
        },
        default_keywords: {
          'en-US': ['hide', 'window'],
          'zh-CN': ['隐藏', '窗口'],
        },
        enabled: true,
      },
    });

    expect(
      validateLauncherActionDescriptor({
        action_id: 'lensx.core.hide_launcher',
        owner_id: 'lensx.core',
        title: { 'en-US': 'Hide launcher' },
        default_keywords: {},
        enabled: false,
      }),
    ).toMatchObject({ ok: true, diagnostics: [] });
  });

  test('validates owner and action namespace shape and relationship', () => {
    expect(isValidLauncherActionOwnerId('lensx.core')).toBe(true);
    expect(isValidLauncherActionId('lensx.core.hide_launcher', 'lensx.core')).toBe(true);
    expect(isValidLauncherActionOwnerId('lensx')).toBe(false);
    expect(isValidLauncherActionOwnerId('Lensx.core')).toBe(false);
    expect(isValidLauncherActionId('other.core.hide_launcher', 'lensx.core')).toBe(false);
    expect(isValidLauncherActionId('lensx.core.group.hide_launcher', 'lensx.core')).toBe(false);
  });

  test('enforces segment and full ID length limits', () => {
    const maxSegment = `a${'b'.repeat(63)}`;
    expect(isValidLauncherActionOwnerId(`${maxSegment}.core`)).toBe(true);
    expect(isValidLauncherActionOwnerId(`a${'b'.repeat(64)}.core`)).toBe(false);

    const longOwner = Array.from({ length: 4 }, () => maxSegment).join('.');
    expect(longOwner.length).toBeGreaterThan(255);
    expect(isValidLauncherActionOwnerId(longOwner)).toBe(false);
  });

  test('rejects unknown fields and non-plain descriptor values', () => {
    const withUnknownField = validateLauncherActionDescriptor({
      ...createDescriptor(),
      executor: () => undefined,
    });
    expect(withUnknownField).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'unknown_field', path: '/executor' }],
    });

    class Descriptor {
      action_id = 'lensx.core.hide_launcher';
    }
    expect(validateLauncherActionDescriptor(new Descriptor())).toEqual({
      ok: false,
      diagnostics: [
        {
          code: 'invalid_type',
          path: '',
          message: 'Launcher action descriptor must be a plain object.',
        },
      ],
    });
  });

  test('uses canonical English fallback without mutating the caller input', () => {
    const input = {
      action_id: 'lensx.core.hide_launcher',
      owner_id: 'lensx.core',
      title: { 'en-US': ' Hide launcher ' },
      description: { 'en-US': ' Hide the launcher window ' },
      default_keywords: { 'en-US': [' hide '] },
      enabled: true,
    };
    const result = validateLauncherActionDescriptor(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(resolveLauncherActionMetadata(result.descriptor, 'zh-CN')).toEqual({
      title: 'Hide launcher',
      description: 'Hide the launcher window',
      default_keywords: ['hide'],
    });
    expect(input.title['en-US']).toBe(' Hide launcher ');
    expect(Object.isFrozen(result.descriptor)).toBe(true);
  });

  test('rejects missing English text, empty keywords, and locale-aware duplicates', () => {
    const result = validateLauncherActionDescriptor({
      ...createDescriptor(),
      title: { 'zh-CN': '隐藏启动器' },
      default_keywords: {
        'en-US': ['Hide', ' hide ', '   '],
      },
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        { code: 'duplicate_keyword', path: '/default_keywords/en-US/1' },
        { code: 'invalid_keyword', path: '/default_keywords/en-US/2' },
        { code: 'missing_localized_text', path: '/title/en-US' },
      ],
    });
  });

  test('returns multiple diagnostics in stable path and code order', () => {
    const result = validateLauncherActionDescriptor({
      action_id: 'other.action',
      owner_id: 'Lensx',
      title: { 'en-US': 42, fr: 'Masquer' },
      description: [],
      default_keywords: { 'en-US': [null, ' '] },
      enabled: 'yes',
      extra: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'invalid_id', path: '/action_id' },
      { code: 'invalid_keyword', path: '/default_keywords/en-US/0' },
      { code: 'invalid_keyword', path: '/default_keywords/en-US/1' },
      { code: 'invalid_type', path: '/description' },
      { code: 'invalid_type', path: '/enabled' },
      { code: 'unknown_field', path: '/extra' },
      { code: 'invalid_owner', path: '/owner_id' },
      { code: 'invalid_type', path: '/title/en-US' },
      { code: 'unknown_field', path: '/title/fr' },
    ]);
  });
});
