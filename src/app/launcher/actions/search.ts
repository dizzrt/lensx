import {
  LAUNCHER_ACTION_LOCALES,
  type LauncherActionDescriptor,
  type LauncherActionHostIcon,
  type LauncherActionLocale,
  type ResolvedLauncherActionMetadata,
} from './types';
import { resolveLauncherActionMetadata } from './validation';

export const LAUNCHER_ACTION_SEARCH_RESULT_LIMIT_V0 = 8;

export const LAUNCHER_ACTION_SEARCH_SCORES = Object.freeze({
  fullQueryTitleExact: 1200,
  fullQueryTitlePrefix: 800,
  tokenTitleExact: 600,
  tokenKeywordExact: 500,
  tokenTitlePrefix: 400,
  tokenKeywordPrefix: 350,
  tokenTitleSubstring: 250,
  tokenKeywordSubstring: 200,
});

export interface LauncherActionSearchInput {
  readonly query: string;
  readonly locale: LauncherActionLocale;
  readonly snapshot: readonly LauncherActionDescriptor[];
  readonly limit: number;
}

export interface LauncherActionSearchResult {
  readonly action_id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly description?: string;
  readonly icon?: LauncherActionHostIcon;
  readonly score: number;
}

interface SearchableLauncherActionMetadata {
  readonly titles: readonly string[];
  readonly defaultKeywords: readonly string[];
}

const normalizeSearchText = (value: string) => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');

export const normalizeLauncherActionSearchQuery = (query: string) => {
  const normalizedQuery = normalizeSearchText(query);

  return Object.freeze({
    query: normalizedQuery,
    tokens: Object.freeze(normalizedQuery.length > 0 ? normalizedQuery.split(' ') : []),
  });
};

const normalizeMetadata = (descriptor: LauncherActionDescriptor): SearchableLauncherActionMetadata => {
  const titles = new Set<string>();
  const defaultKeywords = new Set<string>();
  for (const locale of LAUNCHER_ACTION_LOCALES) {
    const title = descriptor.title[locale];
    if (title !== undefined) titles.add(normalizeSearchText(title));
    for (const keyword of descriptor.default_keywords[locale] ?? []) {
      defaultKeywords.add(normalizeSearchText(keyword));
    }
  }
  return Object.freeze({
    titles: Object.freeze([...titles]),
    defaultKeywords: Object.freeze([...defaultKeywords]),
  });
};

const bestTokenScore = (token: string, metadata: SearchableLauncherActionMetadata): number => {
  const { titles, defaultKeywords } = metadata;

  if (titles.some((title) => token === title)) {
    return LAUNCHER_ACTION_SEARCH_SCORES.tokenTitleExact;
  }
  if (defaultKeywords.some((keyword) => token === keyword)) {
    return LAUNCHER_ACTION_SEARCH_SCORES.tokenKeywordExact;
  }
  if (titles.some((title) => title.startsWith(token))) {
    return LAUNCHER_ACTION_SEARCH_SCORES.tokenTitlePrefix;
  }
  if (defaultKeywords.some((keyword) => keyword.startsWith(token))) {
    return LAUNCHER_ACTION_SEARCH_SCORES.tokenKeywordPrefix;
  }
  if (titles.some((title) => title.includes(token))) {
    return LAUNCHER_ACTION_SEARCH_SCORES.tokenTitleSubstring;
  }
  if (defaultKeywords.some((keyword) => keyword.includes(token))) {
    return LAUNCHER_ACTION_SEARCH_SCORES.tokenKeywordSubstring;
  }

  return 0;
};

const fullQueryTitleScore = (query: string, titles: readonly string[]): number => {
  if (titles.some((title) => query === title)) {
    return LAUNCHER_ACTION_SEARCH_SCORES.fullQueryTitleExact;
  }
  if (titles.some((title) => title.startsWith(query))) {
    return LAUNCHER_ACTION_SEARCH_SCORES.fullQueryTitlePrefix;
  }

  return 0;
};

const createSearchResult = (
  descriptor: LauncherActionDescriptor,
  metadata: ResolvedLauncherActionMetadata,
  score: number,
): LauncherActionSearchResult =>
  Object.freeze({
    action_id: descriptor.action_id,
    owner_id: descriptor.owner_id,
    title: metadata.title,
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(descriptor.icon ? { icon: Object.freeze({ kind: descriptor.icon.kind, token: descriptor.icon.token }) } : {}),
    score,
  });

export const searchLauncherActions = ({
  query,
  locale,
  snapshot,
  limit,
}: LauncherActionSearchInput): readonly LauncherActionSearchResult[] => {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError('Launcher action search limit must be a positive integer.');
  }

  const normalizedQuery = normalizeLauncherActionSearchQuery(query);
  if (normalizedQuery.tokens.length === 0) {
    return Object.freeze([]);
  }

  const matches: LauncherActionSearchResult[] = [];
  for (const descriptor of snapshot) {
    if (!descriptor.enabled) {
      continue;
    }

    const searchableMetadata = normalizeMetadata(descriptor);
    let score = fullQueryTitleScore(normalizedQuery.query, searchableMetadata.titles);
    let matchesEveryToken = true;

    for (const token of normalizedQuery.tokens) {
      const tokenScore = bestTokenScore(token, searchableMetadata);
      if (tokenScore === 0) {
        matchesEveryToken = false;
        break;
      }
      score += tokenScore;
    }

    if (matchesEveryToken) {
      matches.push(createSearchResult(descriptor, resolveLauncherActionMetadata(descriptor, locale), score));
    }
  }

  matches.sort((left, right) => right.score - left.score || left.action_id.localeCompare(right.action_id));
  return Object.freeze(matches.slice(0, limit));
};
