import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import manifestSchema from '../../../../schemas/plugin/manifest.schema.json';
import type { PluginManifestV0Input } from './generated/plugin-manifest-v0-input';
import type {
  NormalizedAsset,
  NormalizedLocalizedKeywords,
  NormalizedLocalizedText,
  NormalizedPluginAction,
  NormalizedPluginManifestV0,
  NormalizedPluginPage,
  PluginHostVersions,
  PluginManifestCompatibility,
  PluginManifestDiagnostic,
  PluginManifestValidationResult,
} from './types';

type ManifestLocale = 'en-US' | 'zh-CN';

interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (number | string)[];
}

const MANIFEST_LOCALES: readonly ManifestLocale[] = ['en-US', 'zh-CN'];
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});
const validateSchema = ajv.compile<PluginManifestV0Input>(manifestSchema);

const escapeJsonPointerSegment = (segment: string): string => segment.replaceAll('~', '~0').replaceAll('/', '~1');

const createDiagnostic = (code: string, path: string, message: string): PluginManifestDiagnostic => ({
  code,
  path,
  message,
});

export const sortPluginManifestDiagnostics = (
  diagnostics: readonly PluginManifestDiagnostic[],
): PluginManifestDiagnostic[] =>
  [...diagnostics].sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));

const schemaErrorPath = (error: ErrorObject): string => {
  if (error.keyword === 'additionalProperties') {
    const property = String(error.params.additionalProperty);
    return `${error.instancePath}/${escapeJsonPointerSegment(property)}`;
  }
  if (error.keyword === 'required') {
    const property = String(error.params.missingProperty);
    return `${error.instancePath}/${escapeJsonPointerSegment(property)}`;
  }
  return error.instancePath;
};

const schemaErrorCode = (error: ErrorObject): string => {
  switch (error.keyword) {
    case 'additionalProperties':
      return 'unknown_field';
    case 'type':
      return 'invalid_type';
    case 'const':
    case 'enum':
      return 'invalid_value';
    case 'pattern':
    case 'format':
      if (error.schemaPath.includes('/packagePath/') || error.schemaPath.includes('/packageHtmlPath/')) {
        return 'invalid_path';
      }
      if (error.schemaPath.includes('/internalRoute/')) {
        return 'invalid_route';
      }
      return 'invalid_format';
    case 'minLength':
    case 'minItems':
      return 'invalid_length';
    case 'required':
      return 'missing_field';
    default:
      return `schema_${error.keyword}`;
  }
};

const mapSchemaDiagnostics = (errors: readonly ErrorObject[]): PluginManifestDiagnostic[] =>
  sortPluginManifestDiagnostics(
    errors.map((error) =>
      createDiagnostic(schemaErrorCode(error), schemaErrorPath(error), error.message ?? 'Schema validation failed.'),
    ),
  );

const trimLocalizedText = (text: PluginManifestV0Input['display']['name']): NormalizedLocalizedText => ({
  'en-US': text['en-US'].trim(),
  ...(text['zh-CN'] === undefined ? {} : { 'zh-CN': text['zh-CN'].trim() }),
});

const trimAsset = (asset: NonNullable<PluginManifestV0Input['display']['icon']>): NormalizedAsset => ({
  kind: 'asset',
  path: asset.path.trim(),
});

const normalizeManifest = (input: PluginManifestV0Input): NormalizedPluginManifestV0 => {
  const pages = input.contributes.pages.map(
    (page): NormalizedPluginPage => ({
      id: page.id.trim(),
      title: trimLocalizedText(page.title),
      route: page.route.trim(),
      ...(page.parent_page_id === undefined ? {} : { parent_page_id: page.parent_page_id.trim() }),
      ...(page.icon === undefined ? {} : { icon: trimAsset(page.icon) }),
      required_permissions: (page.required_permissions ?? []).map((permissionId) => permissionId.trim()),
    }),
  ) as [NormalizedPluginPage, ...NormalizedPluginPage[]];

  const actions = (input.contributes.actions ?? []).map(
    (action): NormalizedPluginAction => ({
      id: action.id.trim(),
      title: trimLocalizedText(action.title),
      ...(action.description === undefined ? {} : { description: trimLocalizedText(action.description) }),
      default_keywords: Object.fromEntries(
        MANIFEST_LOCALES.flatMap((locale) => {
          const keywords = action.default_keywords?.[locale];
          return keywords === undefined ? [] : [[locale, keywords.map((keyword) => keyword.trim())]];
        }),
      ) as NormalizedLocalizedKeywords,
      ...(action.icon === undefined ? {} : { icon: trimAsset(action.icon) }),
      target: {
        kind: 'page',
        page_id: action.target.page_id.trim(),
      },
    }),
  );

  return {
    manifest_version: '1.0.0-dev',
    plugin_id: input.plugin_id.trim(),
    version: input.version.trim(),
    display: {
      name: trimLocalizedText(input.display.name),
      ...(input.display.description === undefined ? {} : { description: trimLocalizedText(input.display.description) }),
      ...(input.display.icon === undefined ? {} : { icon: trimAsset(input.display.icon) }),
    },
    publisher: {
      author: input.publisher.author.trim(),
      homepage: input.publisher.homepage.trim(),
      repository: input.publisher.repository.trim(),
    },
    compatibility: {
      lensx: {
        min_version: input.compatibility.lensx.min_version.trim(),
        max_version_exclusive: input.compatibility.lensx.max_version_exclusive.trim(),
      },
      host_api: {
        min_version: input.compatibility.host_api.min_version.trim(),
        max_version_exclusive: input.compatibility.host_api.max_version_exclusive.trim(),
      },
    },
    runtime: {
      kind: 'iframe',
      entry: input.runtime.entry.trim(),
    },
    requested_permissions: (input.requested_permissions ?? []).map((permission) => ({
      permission_id: permission.permission_id.trim(),
      reason: trimLocalizedText(permission.reason),
    })),
    contributes: {
      pages,
      actions,
      ...(input.contributes.launcher === undefined
        ? {}
        : {
            launcher: {
              default_action_id: input.contributes.launcher.default_action_id.trim(),
            },
          }),
    },
  };
};

const validateLocalizedText = (
  text: NormalizedLocalizedText,
  path: string,
  diagnostics: PluginManifestDiagnostic[],
) => {
  for (const locale of MANIFEST_LOCALES) {
    if (text[locale] !== undefined && text[locale].length === 0) {
      diagnostics.push(createDiagnostic('empty_value', `${path}/${locale}`, 'Localized text must not be empty.'));
    }
  }
};

const validateHttpsUrl = (value: string, path: string, diagnostics: PluginManifestDiagnostic[]) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0) {
      throw new TypeError('URL must use HTTPS without credentials.');
    }
  } catch {
    diagnostics.push(createDiagnostic('invalid_url', path, 'Publisher URL must be an absolute HTTPS URL.'));
  }
};

const isValidPackagePath = (value: string): boolean => {
  if (
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes(':')
  ) {
    return false;
  }
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
};

const validatePackagePath = (
  value: string,
  path: string,
  diagnostics: PluginManifestDiagnostic[],
  extension?: string,
) => {
  if (!isValidPackagePath(value) || (extension !== undefined && !value.toLowerCase().endsWith(extension))) {
    diagnostics.push(createDiagnostic('invalid_path', path, 'Path must stay inside the plugin package.'));
  }
};

const validateRoute = (value: string, path: string, diagnostics: PluginManifestDiagnostic[]) => {
  const segments = value.slice(1).split('/');
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('://') ||
    segments.some(
      (segment, index) => (segment === '' && index !== segments.length - 1) || segment === '.' || segment === '..',
    )
  ) {
    diagnostics.push(createDiagnostic('invalid_route', path, 'Route must be an internal plugin path.'));
  }
};

const parseSemver = (value: string): ParsedSemver | undefined => {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }
  const prerelease = (match[4] ?? '').split('.').filter(Boolean);
  if (
    prerelease.some((identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'))
  ) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: prerelease.map((identifier) => (/^\d+$/.test(identifier) ? Number(identifier) : identifier)),
  };
};

const compareSemver = (left: ParsedSemver, right: ParsedSemver): number => {
  for (const key of ['major', 'minor', 'patch'] as const) {
    const difference = left[key] - right[key];
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
    }
    if (leftIdentifier === rightIdentifier) {
      continue;
    }
    if (typeof leftIdentifier === 'number' && typeof rightIdentifier === 'number') {
      return Math.sign(leftIdentifier - rightIdentifier);
    }
    if (typeof leftIdentifier === 'number') {
      return -1;
    }
    if (typeof rightIdentifier === 'number') {
      return 1;
    }
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
};

const validateCompatibility = (
  manifest: NormalizedPluginManifestV0,
  currentVersions: PluginHostVersions,
  diagnostics: PluginManifestDiagnostic[],
): PluginManifestCompatibility => {
  const compatibility: Record<keyof PluginHostVersions, boolean> = {
    lensx: false,
    host_api: false,
  };

  for (const dimension of ['lensx', 'host_api'] as const) {
    const range = manifest.compatibility[dimension];
    const minimum = parseSemver(range.min_version);
    const maximum = parseSemver(range.max_version_exclusive);
    const current = parseSemver(currentVersions[dimension]);
    if (!minimum || !maximum) {
      diagnostics.push(
        createDiagnostic('invalid_semver', `/compatibility/${dimension}`, 'Compatibility range must use SemVer.'),
      );
      continue;
    }
    if (!current) {
      throw new TypeError(`Current ${dimension} version is not valid SemVer.`);
    }
    if (compareSemver(minimum, maximum) >= 0) {
      diagnostics.push(
        createDiagnostic('invalid_range', `/compatibility/${dimension}`, 'Compatibility range must not be empty.'),
      );
      continue;
    }
    compatibility[dimension] = compareSemver(minimum, current) <= 0 && compareSemver(current, maximum) < 0;
  }

  return compatibility;
};

const validateManifestSemantics = (
  manifest: NormalizedPluginManifestV0,
  currentVersions: PluginHostVersions,
): {
  diagnostics: PluginManifestDiagnostic[];
  compatibility: PluginManifestCompatibility;
} => {
  const diagnostics: PluginManifestDiagnostic[] = [];
  validateLocalizedText(manifest.display.name, '/display/name', diagnostics);
  if (manifest.display.description) {
    validateLocalizedText(manifest.display.description, '/display/description', diagnostics);
  }
  if (manifest.display.icon) {
    validatePackagePath(manifest.display.icon.path, '/display/icon/path', diagnostics);
  }

  if (manifest.publisher.author.length === 0) {
    diagnostics.push(createDiagnostic('empty_value', '/publisher/author', 'Publisher author must not be empty.'));
  }
  validateHttpsUrl(manifest.publisher.homepage, '/publisher/homepage', diagnostics);
  validateHttpsUrl(manifest.publisher.repository, '/publisher/repository', diagnostics);
  validatePackagePath(manifest.runtime.entry, '/runtime/entry', diagnostics, '.html');

  const permissionIds = new Set<string>();
  manifest.requested_permissions.forEach((permission, index) => {
    const idPath = `/requested_permissions/${index}/permission_id`;
    if (permissionIds.has(permission.permission_id)) {
      diagnostics.push(createDiagnostic('duplicate_id', idPath, 'Permission ID must be unique.'));
    }
    permissionIds.add(permission.permission_id);
    validateLocalizedText(permission.reason, `/requested_permissions/${index}/reason`, diagnostics);
  });

  const pageIds = new Set<string>();
  const pageIndexes = new Map<string, number>();
  manifest.contributes.pages.forEach((page, index) => {
    if (pageIds.has(page.id)) {
      diagnostics.push(createDiagnostic('duplicate_id', `/contributes/pages/${index}/id`, 'Page ID must be unique.'));
    } else {
      pageIds.add(page.id);
      pageIndexes.set(page.id, index);
    }
    validateLocalizedText(page.title, `/contributes/pages/${index}/title`, diagnostics);
    validateRoute(page.route, `/contributes/pages/${index}/route`, diagnostics);
    if (page.icon) {
      validatePackagePath(page.icon.path, `/contributes/pages/${index}/icon/path`, diagnostics);
    }

    const requiredPermissions = new Set<string>();
    page.required_permissions.forEach((permissionId, permissionIndex) => {
      const path = `/contributes/pages/${index}/required_permissions/${permissionIndex}`;
      if (requiredPermissions.has(permissionId)) {
        diagnostics.push(createDiagnostic('duplicate_value', path, 'Required permission must be unique.'));
      } else if (!permissionIds.has(permissionId)) {
        diagnostics.push(createDiagnostic('unknown_reference', path, 'Required permission was not requested.'));
      }
      requiredPermissions.add(permissionId);
    });
  });

  manifest.contributes.pages.forEach((page, index) => {
    if (page.parent_page_id !== undefined && !pageIds.has(page.parent_page_id)) {
      diagnostics.push(
        createDiagnostic(
          'unknown_reference',
          `/contributes/pages/${index}/parent_page_id`,
          'Parent Page does not exist.',
        ),
      );
    }
  });

  const cycleIndexes = new Set<number>();
  manifest.contributes.pages.forEach((page, startIndex) => {
    const path: number[] = [];
    const seen = new Map<string, number>();
    let current: NormalizedPluginPage | undefined = page;
    while (current?.parent_page_id !== undefined) {
      const currentIndex = pageIndexes.get(current.id);
      if (currentIndex === undefined) {
        break;
      }
      if (seen.has(current.id)) {
        for (const index of path.slice(seen.get(current.id))) {
          cycleIndexes.add(index);
        }
        break;
      }
      seen.set(current.id, path.length);
      path.push(currentIndex);
      const parentIndex = pageIndexes.get(current.parent_page_id);
      current = parentIndex === undefined ? undefined : manifest.contributes.pages[parentIndex];
    }
    if (page.parent_page_id === page.id) {
      cycleIndexes.add(startIndex);
    }
  });
  for (const index of cycleIndexes) {
    diagnostics.push(
      createDiagnostic(
        'reference_cycle',
        `/contributes/pages/${index}/parent_page_id`,
        'Page parent reference participates in a cycle.',
      ),
    );
  }

  const actionIds = new Set<string>();
  manifest.contributes.actions.forEach((action, index) => {
    if (actionIds.has(action.id)) {
      diagnostics.push(
        createDiagnostic('duplicate_id', `/contributes/actions/${index}/id`, 'Action ID must be unique.'),
      );
    }
    actionIds.add(action.id);
    validateLocalizedText(action.title, `/contributes/actions/${index}/title`, diagnostics);
    if (action.description) {
      validateLocalizedText(action.description, `/contributes/actions/${index}/description`, diagnostics);
    }
    if (action.icon) {
      validatePackagePath(action.icon.path, `/contributes/actions/${index}/icon/path`, diagnostics);
    }
    if (!pageIds.has(action.target.page_id)) {
      diagnostics.push(
        createDiagnostic(
          'unknown_reference',
          `/contributes/actions/${index}/target/page_id`,
          'Action target Page does not exist.',
        ),
      );
    }
    for (const locale of MANIFEST_LOCALES) {
      const keywords = action.default_keywords[locale] ?? [];
      const normalizedKeywords = new Set<string>();
      keywords.forEach((keyword, keywordIndex) => {
        const path = `/contributes/actions/${index}/default_keywords/${locale}/${keywordIndex}`;
        if (keyword.length === 0) {
          diagnostics.push(createDiagnostic('empty_value', path, 'Action keyword must not be empty.'));
          return;
        }
        const comparable = keyword.toLocaleLowerCase(locale);
        if (normalizedKeywords.has(comparable)) {
          diagnostics.push(createDiagnostic('duplicate_value', path, 'Action keyword must be unique.'));
        }
        normalizedKeywords.add(comparable);
      });
    }
  });

  const defaultActionId = manifest.contributes.launcher?.default_action_id;
  if (defaultActionId !== undefined && !actionIds.has(defaultActionId)) {
    diagnostics.push(
      createDiagnostic(
        'unknown_reference',
        '/contributes/launcher/default_action_id',
        'Launcher default Action does not exist.',
      ),
    );
  }

  const compatibility = validateCompatibility(manifest, currentVersions, diagnostics);
  return {
    diagnostics: sortPluginManifestDiagnostics(diagnostics),
    compatibility,
  };
};

export const validatePluginManifestV0 = (
  input: unknown,
  currentVersions: PluginHostVersions,
): PluginManifestValidationResult => {
  if (!validateSchema(input)) {
    return {
      status: 'invalid',
      diagnostics: mapSchemaDiagnostics(validateSchema.errors ?? []),
    };
  }

  const manifest = normalizeManifest(input);
  const { diagnostics, compatibility } = validateManifestSemantics(manifest, currentVersions);
  if (diagnostics.length > 0) {
    return {
      status: 'invalid',
      diagnostics,
    };
  }

  return {
    status: compatibility.lensx && compatibility.host_api ? 'compatible' : 'incompatible',
    manifest,
    compatibility,
    diagnostics: [],
  };
};

export const resolvePluginManifestText = (text: NormalizedLocalizedText, locale: ManifestLocale): string =>
  text[locale] ?? text['en-US'];
