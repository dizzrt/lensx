import { describe, expect, test } from '@rstest/core';
import {
  createDefaultLauncherActionService,
  LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0,
  LAUNCHER_ACTION_SEARCH_SCORES,
  type LauncherActionDescriptor,
  type LauncherActionLocale,
  LauncherActionRegistry,
  normalizeLauncherActionSearchQuery,
  OPEN_SETTINGS_ACTION_ID,
  searchLauncherActions,
} from '../src/app/launcher/actions';

const createDescriptor = (
  actionId: string,
  {
    ownerId = actionId.split('.').slice(0, -1).join('.'),
    title = actionId,
    description,
    keywords = [],
    enabled = true,
    locale = 'en-US',
    icon,
  }: {
    ownerId?: string;
    title?: string;
    description?: string;
    keywords?: readonly string[];
    enabled?: boolean;
    locale?: LauncherActionLocale;
    icon?: LauncherActionDescriptor['icon'];
  } = {},
): LauncherActionDescriptor => ({
  action_id: actionId,
  owner_id: ownerId,
  title: {
    'en-US': locale === 'en-US' ? title : `English ${title}`,
    ...(locale === 'zh-CN' ? { 'zh-CN': title } : {}),
  },
  ...(description
    ? {
        description: {
          'en-US': locale === 'en-US' ? description : `English ${description}`,
          ...(locale === 'zh-CN' ? { 'zh-CN': description } : {}),
        },
      }
    : {}),
  default_keywords: {
    [locale]: [...keywords],
  },
  ...(icon ? { icon } : {}),
  enabled,
});

const search = (
  query: string,
  snapshot: readonly LauncherActionDescriptor[],
  locale: LauncherActionLocale = 'en-US',
  limit = LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0,
) => searchLauncherActions({ query, locale, snapshot, limit });

test.each(['en-US', 'zh-CN'] as const)('searches current Settings metadata without legacy aliases in %s', (locale) => {
  const service = createDefaultLauncherActionService({ hideLauncher: async () => undefined });
  const settings = service.registry.get(OPEN_SETTINGS_ACTION_ID);
  if (!settings) throw new Error('The default service must register Settings.');
  const snapshot = [settings];
  for (const query of ['Settings', '设置', 'preferences', 'configuration', '偏好', '配置']) {
    expect(search(query, snapshot, locale)).toEqual([
      expect.objectContaining({
        action_id: OPEN_SETTINGS_ACTION_ID,
        title: locale === 'en-US' ? 'Settings' : '设置',
      }),
    ]);
  }
  for (const query of ['Open settings', '打开设置', 'View and change', '查看和更改']) {
    expect(search(query, snapshot, locale)).toEqual([]);
  }
});

describe('launcher action query normalization', () => {
  test('normalizes NFKC, language-independent case, and Unicode whitespace into stable tokens', () => {
    expect(normalizeLauncherActionSearchQuery('  ＨＩＤＥ\u00a0\tLauncher  ')).toEqual({
      query: 'hide launcher',
      tokens: ['hide', 'launcher'],
    });
    expect(normalizeLauncherActionSearchQuery(' HIDE ')).toEqual(normalizeLauncherActionSearchQuery('ｈｉｄｅ'));
    const snapshot = [createDescriptor('lensx.core.hide_launcher', { title: 'ＨＩＤＥ\u2003LAUNCHER' })];
    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(search('  ＨＩＤＥ\u00a0\tLauncher  ', snapshot, locale)).toEqual(
        search('hide launcher', snapshot, locale),
      );
      expect(search('hide launcher', snapshot, locale)[0]?.score).toBe(1850);
    }
  });

  test('returns no results for empty or whitespace-only queries', () => {
    const snapshot = [createDescriptor('lensx.core.hide_launcher', { title: 'Hide launcher' })];

    expect(normalizeLauncherActionSearchQuery('\u3000 \n\t')).toEqual({ query: '', tokens: [] });
    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(search('', snapshot, locale)).toEqual([]);
      expect(search('\u3000 \n\t', snapshot, locale)).toEqual([]);
    }
  });
});

describe('launcher action matching and ranking', () => {
  test('searches both languages independently of display locale with canonical English fallback', () => {
    const localized = createDescriptor('lensx.core.localized', {
      title: '隐藏启动器',
      keywords: ['隐藏'],
      locale: 'zh-CN',
    });
    const fallback = createDescriptor('lensx.core.fallback', {
      title: 'Hide launcher',
      keywords: ['hide'],
    });

    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(search('隐藏', [localized, fallback], locale).map(({ action_id }) => action_id)).toEqual([
        'lensx.core.localized',
      ]);
      expect(search('hide', [localized, fallback], locale).map(({ action_id }) => action_id)).toEqual([
        'lensx.core.fallback',
      ]);
      expect(search('hide', [localized, fallback], locale)[0]?.title).toBe('Hide launcher');
    }
  });

  test('requires every token while allowing tokens to match across fields', () => {
    const crossField = createDescriptor('lensx.core.cross_field', {
      title: 'Open workspace',
      description: 'Manage local projects',
      keywords: ['notes'],
    });

    expect(search('workspace notes', [crossField])).toHaveLength(1);
    expect(search('workspace notes local', [crossField])).toEqual([]);
    expect(search('workspace missing', [crossField])).toEqual([]);
  });

  test('applies fixed field weights and full-query title bonuses', () => {
    const descriptors = [
      createDescriptor('lensx.core.description', { title: 'Other', description: 'hide' }),
      createDescriptor('lensx.core.keyword', { title: 'Other', keywords: ['hide'] }),
      createDescriptor('lensx.core.title', { title: 'Hide' }),
    ];
    const results = search('hide', descriptors);

    expect(results.map(({ action_id }) => action_id)).toEqual(['lensx.core.title', 'lensx.core.keyword']);
    expect(results.map(({ score }) => score)).toEqual([
      LAUNCHER_ACTION_SEARCH_SCORES.fullQueryTitleExact + LAUNCHER_ACTION_SEARCH_SCORES.tokenTitleExact,
      LAUNCHER_ACTION_SEARCH_SCORES.tokenKeywordExact,
    ]);
  });

  test('allows tokens to match across languages and fields without description fallback', () => {
    const descriptor: LauncherActionDescriptor = {
      ...createDescriptor('tools.owner.format'),
      title: { 'en-US': 'Format JSON', 'zh-CN': '格式化配置' },
      default_keywords: { 'en-US': ['beautify'], 'zh-CN': ['排版'] },
      description: { 'en-US': 'descriptiononly', 'zh-CN': '仅描述' },
    };
    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const query of ['format 排版', '格式化 beautify']) {
        expect(search(query, [descriptor], locale)).toMatchObject([{ action_id: descriptor.action_id, score: 900 }]);
      }
      expect(search('format 仅描述', [descriptor], locale)).toEqual([]);
      expect(search('格式化 missing', [descriptor], locale)).toEqual([]);
    }
  });

  test('keeps English keywords searchable with empty Chinese keywords or missing translations', () => {
    const descriptor: LauncherActionDescriptor = {
      ...createDescriptor('tools.owner.format', { title: 'Format JSON', keywords: ['beautify'] }),
      default_keywords: { 'en-US': ['beautify'], 'zh-CN': [] },
    };
    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(search('beautify', [descriptor], locale)).toMatchObject([{ title: 'Format JSON', score: 500 }]);
      expect(search('format', [{ ...descriptor, default_keywords: {} }], locale)).toMatchObject([{ score: 1200 }]);
    }
  });

  test('never joins titles or keywords into synthetic searchable text or title bonuses', () => {
    const descriptor: LauncherActionDescriptor = {
      ...createDescriptor('tools.owner.split'),
      title: { 'en-US': 'Format', 'zh-CN': 'JSON' },
      default_keywords: { 'en-US': ['alpha', 'beta'], 'zh-CN': ['gamma'] },
    };
    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(search('formatjson', [descriptor], locale)).toEqual([]);
      expect(search('hab', [descriptor], locale)).toEqual([]);
      expect(search('format json', [descriptor], locale)).toMatchObject([{ score: 1200 }]);
      expect(search('alpha beta gamma', [descriptor], locale)).toMatchObject([{ score: 1500 }]);
    }
  });

  test('breaks score ties by action_id instead of provider registration order', () => {
    const alpha = createDescriptor('tools.alpha.open', { title: 'Open' });
    const zulu = createDescriptor('tools.zulu.open', { title: 'Open' });

    expect(search('open', [zulu, alpha]).map(({ action_id }) => action_id)).toEqual([
      'tools.alpha.open',
      'tools.zulu.open',
    ]);
  });

  test.each([
    { title: 'JSON', keywords: [], score: 1800 },
    { title: 'JSON formatter', keywords: [], score: 1200 },
    { title: 'Format JSON', keywords: [], score: 250 },
    { title: 'Other', keywords: ['JSON'], score: 500 },
    { title: 'Other', keywords: ['JSON formatter'], score: 350 },
    { title: 'Other', keywords: ['Format JSON'], score: 200 },
  ])('keeps fixed title/keyword priority for $title / $keywords', ({ title, keywords, score }) => {
    expect(search('json', [createDescriptor('tools.owner.weight', { title, keywords })])[0]?.score).toBe(score);
  });

  test('equivalent translations and keyword copies contribute each token and title bonus once', () => {
    const descriptor = createDescriptor('tools.owner.json', { title: 'JSON', keywords: ['JSON'] });
    const copies: LauncherActionDescriptor = {
      ...descriptor,
      title: { 'zh-CN': 'ＪＳＯＮ', 'en-US': 'JSON' },
      default_keywords: { 'zh-CN': ['ｊｓｏｎ'], 'en-US': ['JSON'] },
    };
    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(search('json', [descriptor], locale)).toMatchObject([{ score: 1800 }]);
      expect(search('json', [copies], locale)).toMatchObject([{ score: 1800 }]);
      expect(search('json json', [copies], locale)).toMatchObject([{ score: 1200 }]);
      expect(
        search('json', [{ ...copies, title: { 'en-US': 'JSON formatter', 'zh-CN': 'JSON' } }], locale),
      ).toMatchObject([{ score: 1800 }]);
      const keywordsOnly = { ...copies, title: { 'en-US': 'Other' } };
      expect(search('json', [keywordsOnly], locale)).toMatchObject([{ score: 500 }]);
    }
  });

  test('uses the best match from any language or field without summing weaker hits', () => {
    const descriptor = createDescriptor('tools.owner.json', { title: 'Format JSON' });
    for (const locale of ['en-US', 'zh-CN'] as const) {
      expect(search('json', [descriptor], locale)).toMatchObject([{ score: 250 }]);
      expect(search('json', [{ ...descriptor, default_keywords: { 'zh-CN': ['JSON'] } }], locale)).toMatchObject([
        { score: 500 },
      ]);
      expect(
        search('json', [{ ...descriptor, title: { ...descriptor.title, 'zh-CN': 'JSON 格式化' } }], locale),
      ).toMatchObject([{ score: 1200 }]);
    }
  });

  test('adding, changing, or removing descriptions never changes matches, scores, or order', () => {
    const descriptor = createDescriptor('tools.owner.json', { title: 'Format JSON', keywords: ['format'] });
    const descriptions = [
      undefined,
      { 'en-US': 'json descriptiononly', 'zh-CN': '仅描述' },
      { 'en-US': 'Something else' },
    ];
    for (const locale of ['en-US', 'zh-CN'] as const) {
      for (const description of descriptions) {
        const snapshot = [{ ...descriptor, ...(description ? { description } : {}) }];
        expect(search('json', snapshot, locale).map(({ action_id, score }) => ({ action_id, score }))).toEqual([
          { action_id: descriptor.action_id, score: 250 },
        ]);
        expect(search('descriptiononly', snapshot, locale)).toEqual([]);
        expect(search('仅描述', snapshot, locale)).toEqual([]);
      }
    }
  });

  test('carries icon metadata without changing matching, scores, or order', () => {
    const alpha = createDescriptor('tools.alpha.open', {
      title: 'Open',
      icon: { kind: 'host', token: 'settings' },
    });
    const zulu = createDescriptor('tools.zulu.open', { title: 'Open' });
    const results = search('open', [zulu, alpha]);

    expect(results.map(({ action_id, score }) => ({ action_id, score }))).toEqual([
      { action_id: 'tools.alpha.open', score: results[0]?.score },
      { action_id: 'tools.zulu.open', score: results[1]?.score },
    ]);
    expect(results[0]?.icon).toEqual({ kind: 'host', token: 'settings' });
    expect(results[1]?.icon).toBeUndefined();
    expect(Object.isFrozen(results[0]?.icon)).toBe(true);
  });

  test('filters disabled actions and truncates only after deterministic sorting', () => {
    const descriptors = Array.from({ length: 10 }, (_, index) =>
      createDescriptor(`tools.owner.action_${String(index).padStart(2, '0')}`, {
        title: `Action ${index}`,
        keywords: ['run'],
        enabled: index !== 0,
      }),
    ).reverse();

    const results = search('run', descriptors);
    expect(results).toHaveLength(LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0);
    expect(results.map(({ action_id }) => action_id)).toEqual(
      Array.from(
        { length: LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0 },
        (_, index) => `tools.owner.action_${String(index + 1).padStart(2, '0')}`,
      ),
    );
  });

  test('rejects non-positive and fractional limits', () => {
    const snapshot = [createDescriptor('lensx.core.hide_launcher', { title: 'Hide launcher' })];

    expect(() => search('hide', snapshot, 'en-US', 0)).toThrow(RangeError);
    expect(() => search('hide', snapshot, 'en-US', 1.5)).toThrow(RangeError);
  });
});

describe('launcher action search trust boundary', () => {
  test('returns frozen serializable data without executors or source-specific state', () => {
    const registry = new LauncherActionRegistry();
    registry.register({
      descriptor: createDescriptor('workspace.tools.open_notes', {
        title: 'Open notes',
        description: 'Open the notes page',
        keywords: ['notes'],
      }),
      executor: () => undefined,
    });

    const result = search('notes', registry.snapshot())[0];
    expect(result).toEqual({
      action_id: 'workspace.tools.open_notes',
      owner_id: 'workspace.tools',
      title: 'Open notes',
      description: 'Open the notes page',
      score: expect.any(Number),
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect('executor' in (result ?? {})).toBe(false);
    expect('manifest' in (result ?? {})).toBe(false);
    expect('plugin' in (result ?? {})).toBe(false);
  });

  test('does not mutate caller input and isolates results from later caller mutations', () => {
    const descriptor = createDescriptor('lensx.core.mutable', {
      title: 'Mutable action',
      description: 'Original description',
      keywords: ['mutable'],
    });
    const snapshot = [descriptor];
    const results = search('mutable', snapshot);

    (descriptor.title as { 'en-US': string })['en-US'] = 'Changed title';
    (snapshot as LauncherActionDescriptor[]).length = 0;

    expect(results[0]?.title).toBe('Mutable action');
    expect(results[0]?.description).toBe('Original description');
    expect(Object.isFrozen(results)).toBe(true);
  });
});
