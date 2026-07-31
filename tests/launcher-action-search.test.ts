import { describe, expect, test } from '@rstest/core';
import {
  LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0,
  LAUNCHER_ACTION_SEARCH_SCORES,
  type LauncherActionDescriptor,
  type LauncherActionLocale,
  LauncherActionRegistry,
  normalizeLauncherActionSearchQuery,
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
  }: {
    ownerId?: string;
    title?: string;
    description?: string;
    keywords?: readonly string[];
    enabled?: boolean;
    locale?: LauncherActionLocale;
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
  enabled,
});

const search = (
  query: string,
  snapshot: readonly LauncherActionDescriptor[],
  locale: LauncherActionLocale = 'en-US',
  limit = LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0,
) => searchLauncherActions({ query, locale, snapshot, limit });

describe('launcher action query normalization', () => {
  test('normalizes NFKC, locale-aware case, and Unicode whitespace into stable tokens', () => {
    expect(normalizeLauncherActionSearchQuery('  ＨＩＤＥ\u00a0\tLauncher  ', 'en-US')).toEqual({
      query: 'hide launcher',
      tokens: ['hide', 'launcher'],
    });
    expect(normalizeLauncherActionSearchQuery(' HIDE ', 'en-US')).toEqual(
      normalizeLauncherActionSearchQuery('ｈｉｄｅ', 'en-US'),
    );
  });

  test('returns no results for empty or whitespace-only queries', () => {
    const snapshot = [createDescriptor('lensx.core.hide_launcher', { title: 'Hide launcher' })];

    expect(search('', snapshot)).toEqual([]);
    expect(search('\u3000 \n\t', snapshot)).toEqual([]);
  });
});

describe('launcher action matching and ranking', () => {
  test('uses locale metadata with canonical English fallback', () => {
    const localized = createDescriptor('lensx.core.localized', {
      title: '隐藏启动器',
      keywords: ['隐藏'],
      locale: 'zh-CN',
    });
    const fallback = createDescriptor('lensx.core.fallback', {
      title: 'Hide launcher',
      keywords: ['hide'],
    });

    expect(search('隐藏', [localized, fallback], 'zh-CN').map(({ action_id }) => action_id)).toEqual([
      'lensx.core.localized',
    ]);
    expect(search('hide', [localized, fallback], 'zh-CN').map(({ action_id }) => action_id)).toEqual([
      'lensx.core.fallback',
    ]);
  });

  test('requires every token while allowing tokens to match across fields', () => {
    const crossField = createDescriptor('lensx.core.cross_field', {
      title: 'Open workspace',
      description: 'Manage local projects',
      keywords: ['notes'],
    });

    expect(search('workspace notes local', [crossField])).toHaveLength(1);
    expect(search('workspace missing', [crossField])).toEqual([]);
  });

  test('applies fixed field weights and full-query title bonuses', () => {
    const descriptors = [
      createDescriptor('lensx.core.description', { title: 'Other', description: 'hide' }),
      createDescriptor('lensx.core.keyword', { title: 'Other', keywords: ['hide'] }),
      createDescriptor('lensx.core.title', { title: 'Hide' }),
    ];
    const results = search('hide', descriptors);

    expect(results.map(({ action_id }) => action_id)).toEqual([
      'lensx.core.title',
      'lensx.core.keyword',
      'lensx.core.description',
    ]);
    expect(results.map(({ score }) => score)).toEqual([
      LAUNCHER_ACTION_SEARCH_SCORES.fullQueryTitleExact + LAUNCHER_ACTION_SEARCH_SCORES.tokenTitleExact,
      LAUNCHER_ACTION_SEARCH_SCORES.tokenKeywordExact,
      LAUNCHER_ACTION_SEARCH_SCORES.tokenDescriptionSubstring,
    ]);
  });

  test('breaks score ties by action_id instead of provider registration order', () => {
    const alpha = createDescriptor('tools.alpha.open', { title: 'Open' });
    const zulu = createDescriptor('tools.zulu.open', { title: 'Open' });

    expect(search('open', [zulu, alpha]).map(({ action_id }) => action_id)).toEqual([
      'tools.alpha.open',
      'tools.zulu.open',
    ]);
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
