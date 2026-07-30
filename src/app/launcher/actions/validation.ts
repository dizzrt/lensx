import {
  LAUNCHER_ACTION_LOCALES,
  type LauncherActionDescriptor,
  type LauncherActionDiagnostic,
  type LauncherActionDiagnosticCode,
  type LauncherActionKeywordMap,
  type LauncherActionLocale,
  type LauncherActionValidationResult,
  type LocalizedActionText,
  type ResolvedLauncherActionMetadata,
} from './types';

const DESCRIPTOR_FIELDS = new Set(['action_id', 'owner_id', 'title', 'description', 'default_keywords', 'enabled']);
const LOCALIZED_TEXT_FIELDS = new Set<string>(LAUNCHER_ACTION_LOCALES);
const ID_SEGMENT_PATTERN = /^[a-z][a-z0-9_-]*$/;
const MAX_ID_SEGMENT_LENGTH = 64;
const MAX_NAMESPACED_ID_LENGTH = 255;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const escapeJsonPointerSegment = (segment: string) => segment.replaceAll('~', '~0').replaceAll('/', '~1');

const createDiagnostic = (
  code: LauncherActionDiagnosticCode,
  path: string,
  message: string,
): LauncherActionDiagnostic => ({
  code,
  path,
  message,
});

export const sortLauncherActionDiagnostics = (
  diagnostics: readonly LauncherActionDiagnostic[],
): LauncherActionDiagnostic[] =>
  [...diagnostics].sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    return pathOrder === 0 ? left.code.localeCompare(right.code) : pathOrder;
  });

const isValidIdSegment = (segment: string) =>
  segment.length > 0 && segment.length <= MAX_ID_SEGMENT_LENGTH && ID_SEGMENT_PATTERN.test(segment);

const isValidNamespacedId = (value: string, minimumSegments: number) => {
  if (value.length === 0 || value.length > MAX_NAMESPACED_ID_LENGTH) {
    return false;
  }

  const segments = value.split('.');
  return segments.length >= minimumSegments && segments.every(isValidIdSegment);
};

export const isValidLauncherActionOwnerId = (ownerId: string) => isValidNamespacedId(ownerId, 2);

export const isValidLauncherActionId = (actionId: string, ownerId: string) => {
  if (!isValidNamespacedId(actionId, 3)) {
    return false;
  }

  const ownerSegments = ownerId.split('.');
  const actionSegments = actionId.split('.');
  return (
    isValidLauncherActionOwnerId(ownerId) &&
    actionSegments.length === ownerSegments.length + 1 &&
    actionSegments.slice(0, -1).join('.') === ownerId
  );
};

const parseLocalizedText = (
  value: unknown,
  path: string,
  diagnostics: LauncherActionDiagnostic[],
): LocalizedActionText | undefined => {
  if (!isPlainObject(value)) {
    diagnostics.push(createDiagnostic('invalid_type', path, 'Localized text must be a plain object.'));
    return undefined;
  }

  for (const key of Object.keys(value)) {
    if (!LOCALIZED_TEXT_FIELDS.has(key)) {
      diagnostics.push(
        createDiagnostic('unknown_field', `${path}/${escapeJsonPointerSegment(key)}`, `Unknown locale field '${key}'.`),
      );
    }
  }

  const normalized: Partial<Record<LauncherActionLocale, string>> = {};
  for (const locale of LAUNCHER_ACTION_LOCALES) {
    const localizedValue = value[locale];
    if (localizedValue === undefined) {
      if (locale === 'en-US') {
        diagnostics.push(
          createDiagnostic('missing_localized_text', `${path}/en-US`, 'Canonical English text is required.'),
        );
      }
      continue;
    }

    if (typeof localizedValue !== 'string') {
      diagnostics.push(createDiagnostic('invalid_type', `${path}/${locale}`, 'Localized text must be a string.'));
      continue;
    }

    const trimmedValue = localizedValue.trim();
    if (trimmedValue.length === 0) {
      diagnostics.push(
        createDiagnostic('missing_localized_text', `${path}/${locale}`, 'Localized text must not be empty.'),
      );
      continue;
    }

    normalized[locale] = trimmedValue;
  }

  return normalized['en-US']
    ? Object.freeze({
        'en-US': normalized['en-US'],
        ...(normalized['zh-CN'] ? { 'zh-CN': normalized['zh-CN'] } : {}),
      })
    : undefined;
};

const parseKeywords = (
  value: unknown,
  diagnostics: LauncherActionDiagnostic[],
): LauncherActionKeywordMap | undefined => {
  const path = '/default_keywords';
  if (!isPlainObject(value)) {
    diagnostics.push(createDiagnostic('invalid_type', path, 'Default keywords must be a plain object.'));
    return undefined;
  }

  for (const key of Object.keys(value)) {
    if (!LOCALIZED_TEXT_FIELDS.has(key)) {
      diagnostics.push(
        createDiagnostic(
          'unknown_field',
          `${path}/${escapeJsonPointerSegment(key)}`,
          `Unknown keyword locale '${key}'.`,
        ),
      );
    }
  }

  const normalized: Partial<Record<LauncherActionLocale, readonly string[]>> = {};
  for (const locale of LAUNCHER_ACTION_LOCALES) {
    const keywords = value[locale];
    if (keywords === undefined) {
      continue;
    }
    if (!Array.isArray(keywords)) {
      diagnostics.push(createDiagnostic('invalid_type', `${path}/${locale}`, 'Locale keywords must be an array.'));
      continue;
    }

    const normalizedKeywords: string[] = [];
    const seen = new Set<string>();
    for (const [index, keyword] of keywords.entries()) {
      const keywordPath = `${path}/${locale}/${index}`;
      if (typeof keyword !== 'string') {
        diagnostics.push(createDiagnostic('invalid_keyword', keywordPath, 'Keyword must be a string.'));
        continue;
      }

      const trimmedKeyword = keyword.trim();
      if (trimmedKeyword.length === 0) {
        diagnostics.push(createDiagnostic('invalid_keyword', keywordPath, 'Keyword must not be empty.'));
        continue;
      }

      const comparisonKey = trimmedKeyword.toLocaleLowerCase(locale);
      if (seen.has(comparisonKey)) {
        diagnostics.push(
          createDiagnostic('duplicate_keyword', keywordPath, 'Keyword duplicates another value in this locale.'),
        );
        continue;
      }

      seen.add(comparisonKey);
      normalizedKeywords.push(trimmedKeyword);
    }

    normalized[locale] = Object.freeze(normalizedKeywords);
  }

  return Object.freeze(normalized);
};

export const cloneLauncherActionDescriptor = (descriptor: LauncherActionDescriptor): LauncherActionDescriptor => {
  const cloneLocalizedText = (text: LocalizedActionText): LocalizedActionText =>
    Object.freeze({
      'en-US': text['en-US'],
      ...(text['zh-CN'] ? { 'zh-CN': text['zh-CN'] } : {}),
    });

  const keywords: Partial<Record<LauncherActionLocale, readonly string[]>> = {};
  for (const locale of LAUNCHER_ACTION_LOCALES) {
    const localeKeywords = descriptor.default_keywords[locale];
    if (localeKeywords) {
      keywords[locale] = Object.freeze([...localeKeywords]);
    }
  }

  return Object.freeze({
    action_id: descriptor.action_id,
    owner_id: descriptor.owner_id,
    title: cloneLocalizedText(descriptor.title),
    ...(descriptor.description ? { description: cloneLocalizedText(descriptor.description) } : {}),
    default_keywords: Object.freeze(keywords),
    enabled: descriptor.enabled,
  });
};

export const validateLauncherActionDescriptor = (input: unknown): LauncherActionValidationResult => {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      diagnostics: [createDiagnostic('invalid_type', '', 'Launcher action descriptor must be a plain object.')],
    };
  }

  const diagnostics: LauncherActionDiagnostic[] = [];
  for (const key of Object.keys(input)) {
    if (!DESCRIPTOR_FIELDS.has(key)) {
      diagnostics.push(
        createDiagnostic('unknown_field', `/${escapeJsonPointerSegment(key)}`, `Unknown descriptor field '${key}'.`),
      );
    }
  }

  const ownerId = input.owner_id;
  if (typeof ownerId !== 'string') {
    diagnostics.push(createDiagnostic('invalid_type', '/owner_id', 'Owner ID must be a string.'));
  } else if (!isValidLauncherActionOwnerId(ownerId)) {
    diagnostics.push(createDiagnostic('invalid_owner', '/owner_id', 'Owner ID is not a valid namespace.'));
  }

  const actionId = input.action_id;
  if (typeof actionId !== 'string') {
    diagnostics.push(createDiagnostic('invalid_type', '/action_id', 'Action ID must be a string.'));
  } else if (!isValidNamespacedId(actionId, 3)) {
    diagnostics.push(createDiagnostic('invalid_id', '/action_id', 'Action ID is not a valid namespace.'));
  } else if (typeof ownerId === 'string' && !isValidLauncherActionId(actionId, ownerId)) {
    diagnostics.push(
      createDiagnostic(
        'invalid_owner',
        '/action_id',
        'Action ID must contain the complete owner and one local segment.',
      ),
    );
  }

  const title = parseLocalizedText(input.title, '/title', diagnostics);
  const description =
    input.description === undefined ? undefined : parseLocalizedText(input.description, '/description', diagnostics);
  const defaultKeywords = parseKeywords(input.default_keywords, diagnostics);

  if (typeof input.enabled !== 'boolean') {
    diagnostics.push(createDiagnostic('invalid_type', '/enabled', 'Enabled must be a boolean.'));
  }

  const sortedDiagnostics = sortLauncherActionDiagnostics(diagnostics);
  if (
    sortedDiagnostics.length > 0 ||
    typeof actionId !== 'string' ||
    typeof ownerId !== 'string' ||
    !title ||
    !defaultKeywords ||
    typeof input.enabled !== 'boolean'
  ) {
    return {
      ok: false,
      diagnostics: Object.freeze(sortedDiagnostics),
    };
  }

  return {
    ok: true,
    descriptor: cloneLauncherActionDescriptor({
      action_id: actionId,
      owner_id: ownerId,
      title,
      ...(description ? { description } : {}),
      default_keywords: defaultKeywords,
      enabled: input.enabled,
    }),
    diagnostics: [],
  };
};

export const resolveLocalizedActionText = (text: LocalizedActionText, locale: LauncherActionLocale): string =>
  text[locale] ?? text['en-US'];

export const resolveLauncherActionMetadata = (
  descriptor: LauncherActionDescriptor,
  locale: LauncherActionLocale,
): ResolvedLauncherActionMetadata => {
  const description = descriptor.description ? resolveLocalizedActionText(descriptor.description, locale) : undefined;

  return Object.freeze({
    title: resolveLocalizedActionText(descriptor.title, locale),
    ...(description ? { description } : {}),
    default_keywords: Object.freeze([
      ...(descriptor.default_keywords[locale] ?? descriptor.default_keywords['en-US'] ?? []),
    ]),
  });
};
