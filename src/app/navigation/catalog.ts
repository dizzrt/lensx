import type { HostPageDefinition, HostPageTarget } from './types';

const pageKey = ({ owner_id: ownerId, page_id: pageId }: HostPageTarget) => `${ownerId}/${pageId}`;

export class HostPageCatalog {
  readonly #pages: ReadonlyMap<string, HostPageDefinition>;

  constructor(pages: readonly HostPageDefinition[]) {
    const entries = new Map<string, HostPageDefinition>();
    for (const page of pages) {
      const key = pageKey(page);
      if (entries.has(key)) {
        throw new Error(`Duplicate Host page identity: ${key}`);
      }
      entries.set(key, Object.freeze({ ...page }));
    }
    this.#pages = entries;
  }

  hasAvailablePage(target: HostPageTarget) {
    return this.#pages.get(pageKey(target))?.enabled === true;
  }
}
