import type {
  HostPageDefinition,
  HostPageTarget,
  LocalizedPageText,
  PageDescriptor,
  PageProviderBatch,
  PageProviderDescriptor,
  PageRegistryDiagnostic,
  PageRegistryReplacementResult,
  PageResolution,
  PluginPagePresentation,
} from './types';

export const HOST_PAGE_OWNER_ID = 'lensx.core';

const OWNER_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u;
const PAGE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/u;

const pageKey = ({ owner_id: ownerId, page_id: pageId }: HostPageTarget) => `${ownerId}/${pageId}`;

const cloneLocalizedText = (text: LocalizedPageText): LocalizedPageText =>
  Object.freeze({
    'en-US': text['en-US'],
    ...(text['zh-CN'] ? { 'zh-CN': text['zh-CN'] } : {}),
  });

const cloneTarget = (target: HostPageTarget): HostPageTarget =>
  Object.freeze({ owner_id: target.owner_id, page_id: target.page_id });

const clonePresentation = (presentation: PluginPagePresentation): PluginPagePresentation =>
  Object.freeze({
    initial_size: Object.freeze({
      width: presentation.initial_size.width,
      height: presentation.initial_size.height,
    }),
    resizable: presentation.resizable,
  });

const cloneProvider = (provider: PageProviderDescriptor): PageProviderDescriptor =>
  Object.freeze({
    kind: provider.kind,
    owner_id: provider.owner_id,
    display_name: cloneLocalizedText(provider.display_name),
  });

const clonePage = (page: PageDescriptor): PageDescriptor =>
  Object.freeze({
    owner_id: page.owner_id,
    page_id: page.page_id,
    title: cloneLocalizedText(page.title),
    route: page.route,
    ...(page.parent ? { parent: cloneTarget(page.parent) } : {}),
    ...(page.presentation ? { presentation: clonePresentation(page.presentation) } : {}),
    available: page.available,
  });

const cloneResolution = ({ provider, page }: PageResolution): PageResolution =>
  Object.freeze({ provider: cloneProvider(provider), page: clonePage(page) });

const diagnostic = (code: PageRegistryDiagnostic['code'], path: string, message: string): PageRegistryDiagnostic => ({
  code,
  path,
  message,
});

const isLocalizedText = (value: LocalizedPageText) =>
  typeof value === 'object' &&
  value !== null &&
  typeof value['en-US'] === 'string' &&
  value['en-US'].trim().length > 0 &&
  (value['zh-CN'] === undefined || (typeof value['zh-CN'] === 'string' && value['zh-CN'].trim().length > 0));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validatePluginPresentation = (value: unknown, base: string): readonly PageRegistryDiagnostic[] => {
  const diagnostics: PageRegistryDiagnostic[] = [];
  if (!isRecord(value)) {
    return [diagnostic('invalid_descriptor', base, 'Plugin Page presentation is required.')];
  }

  for (const key of Object.keys(value)) {
    if (key !== 'initial_size' && key !== 'resizable') {
      diagnostics.push(diagnostic('invalid_descriptor', `${base}/${key}`, 'Presentation field is not supported.'));
    }
  }
  const initialSize = value.initial_size;
  if (!isRecord(initialSize)) {
    diagnostics.push(diagnostic('invalid_descriptor', `${base}/initial_size`, 'Initial size is invalid.'));
  } else {
    for (const key of Object.keys(initialSize)) {
      if (key !== 'width' && key !== 'height') {
        diagnostics.push(
          diagnostic('invalid_descriptor', `${base}/initial_size/${key}`, 'Initial size field is not supported.'),
        );
      }
    }
    for (const dimension of ['width', 'height'] as const) {
      const dimensionValue = initialSize[dimension];
      const minimum = dimension === 'width' ? 320 : 180;
      if (!Number.isInteger(dimensionValue) || Number(dimensionValue) < minimum || Number(dimensionValue) > 4096) {
        diagnostics.push(
          diagnostic(
            'invalid_descriptor',
            `${base}/initial_size/${dimension}`,
            `Initial ${dimension} is outside the supported logical range.`,
          ),
        );
      }
    }
  }
  if (typeof value.resizable !== 'boolean') {
    diagnostics.push(diagnostic('invalid_descriptor', `${base}/resizable`, 'Resizable must be boolean.'));
  }
  return diagnostics;
};

const validatePluginBatch = (providerOwner: string, batch: PageProviderBatch): readonly PageRegistryDiagnostic[] => {
  const diagnostics: PageRegistryDiagnostic[] = [];
  if (!OWNER_PATTERN.test(providerOwner) || batch.provider.owner_id !== providerOwner) {
    diagnostics.push(diagnostic('invalid_owner', '/provider/owner_id', 'Page provider owner is invalid.'));
  }
  if (providerOwner === HOST_PAGE_OWNER_ID || batch.provider.kind !== 'plugin') {
    diagnostics.push(
      diagnostic('protected_host_owner', '/provider', 'The protected Host Page provider cannot be replaced.'),
    );
  }
  if (!isLocalizedText(batch.provider.display_name)) {
    diagnostics.push(diagnostic('invalid_descriptor', '/provider/display_name', 'Page provider display is invalid.'));
  }

  const identities = new Set<string>();
  batch.pages.forEach((page, index) => {
    const base = `/pages/${index}`;
    const key = pageKey(page);
    if (page.owner_id !== providerOwner || !PAGE_ID_PATTERN.test(page.page_id)) {
      diagnostics.push(diagnostic('invalid_owner', `${base}/owner_id`, 'Page does not belong to its provider.'));
    }
    if (identities.has(key)) {
      diagnostics.push(
        diagnostic('duplicate_page_identity', `${base}/page_id`, 'Page identity is duplicated within the provider.'),
      );
    }
    identities.add(key);
    if (
      !isLocalizedText(page.title) ||
      typeof page.route !== 'string' ||
      !page.route.startsWith('/') ||
      typeof page.available !== 'boolean'
    ) {
      diagnostics.push(diagnostic('invalid_descriptor', base, 'Page descriptor is invalid.'));
    }
    diagnostics.push(...validatePluginPresentation(page.presentation, `${base}/presentation`));
    if (
      page.parent &&
      (page.parent.owner_id !== providerOwner ||
        !PAGE_ID_PATTERN.test(page.parent.page_id) ||
        pageKey(page.parent) === key)
    ) {
      diagnostics.push(diagnostic('invalid_parent', `${base}/parent`, 'Page parent must belong to the same provider.'));
    }
  });

  return Object.freeze(
    diagnostics.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)),
  );
};

const createHostResolution = (page: HostPageDefinition): PageResolution =>
  Object.freeze({
    provider: Object.freeze({
      kind: 'host' as const,
      owner_id: page.owner_id,
      display_name: Object.freeze({ 'en-US': 'lensX' }),
    }),
    page: Object.freeze({
      owner_id: page.owner_id,
      page_id: page.page_id,
      title: cloneLocalizedText(
        page.title ?? { 'en-US': `${page.page_id.slice(0, 1).toUpperCase()}${page.page_id.slice(1)}` },
      ),
      route: page.route ?? `/${page.page_id}`,
      available: page.enabled,
    }),
  });

export type PageRegistryListener = () => void;

const isPageProviderBatch = (batch: PageProviderBatch | readonly []): batch is PageProviderBatch =>
  !Array.isArray(batch);

export class PageRegistry {
  #pages: ReadonlyMap<string, PageResolution>;
  readonly #listeners = new Set<PageRegistryListener>();

  constructor(hostPages: readonly HostPageDefinition[]) {
    const pages = new Map<string, PageResolution>();
    for (const definition of hostPages) {
      const resolution = createHostResolution(definition);
      const key = pageKey(resolution.page);
      if (definition.owner_id !== HOST_PAGE_OWNER_ID || pages.has(key)) {
        throw new Error('Host Page definitions are invalid.');
      }
      pages.set(key, resolution);
    }
    this.#pages = pages;
  }

  lookup(target: HostPageTarget): PageResolution | undefined {
    const resolution = this.#pages.get(pageKey(target));
    return resolution ? cloneResolution(resolution) : undefined;
  }

  hasAvailablePage(target: HostPageTarget) {
    return this.#pages.get(pageKey(target))?.page.available === true;
  }

  snapshot(): readonly PageResolution[] {
    return Object.freeze(
      [...this.#pages.values()]
        .sort(
          (left, right) =>
            left.page.owner_id.localeCompare(right.page.owner_id) ||
            left.page.page_id.localeCompare(right.page.page_id),
        )
        .map(cloneResolution),
    );
  }

  replaceProviderBatch(providerOwner: string, batch: PageProviderBatch | readonly []): PageRegistryReplacementResult {
    if (providerOwner === HOST_PAGE_OWNER_ID) {
      return Object.freeze({
        ok: false,
        diagnostics: Object.freeze([
          diagnostic('protected_host_owner', '/provider_owner', 'The protected Host Page provider cannot be replaced.'),
        ]),
      });
    }
    if (!OWNER_PATTERN.test(providerOwner)) {
      return Object.freeze({
        ok: false,
        diagnostics: Object.freeze([diagnostic('invalid_owner', '/provider_owner', 'Page provider owner is invalid.')]),
      });
    }

    const pageBatch = isPageProviderBatch(batch) ? batch : undefined;
    const diagnostics = pageBatch ? validatePluginBatch(providerOwner, pageBatch) : Object.freeze([]);
    if (diagnostics.length > 0) {
      return Object.freeze({ ok: false, diagnostics });
    }

    const next = new Map([...this.#pages].filter(([, resolution]) => resolution.page.owner_id !== providerOwner));
    if (pageBatch) {
      const provider = cloneProvider(pageBatch.provider);
      for (const page of pageBatch.pages) {
        const clonedPage = clonePage(page);
        next.set(pageKey(clonedPage), Object.freeze({ provider, page: clonedPage }));
      }
    }
    this.#pages = next;
    for (const listener of this.#listeners) {
      listener();
    }

    const pages = pageBatch
      ? Object.freeze(pageBatch.pages.map((page) => cloneResolution({ provider: pageBatch.provider, page })))
      : Object.freeze([]);
    return Object.freeze({
      ok: true,
      pages,
      diagnostics: Object.freeze([]) as readonly [],
    });
  }

  subscribe(listener: PageRegistryListener) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

export class HostPageCatalog extends PageRegistry {}
