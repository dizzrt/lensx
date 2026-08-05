import type { PageRegistry } from './catalog';
import { type ActivePage, AppNavigationError, type HostPageTarget, type PageResolution } from './types';

export type AppNavigationHandler = (page: ActivePage | undefined) => void;

export class AppNavigationService {
  readonly #registry: PageRegistry;
  readonly #unsubscribeRegistry: () => void;
  #activePage?: ActivePage;
  #handler?: AppNavigationHandler;

  constructor(registry: PageRegistry) {
    this.#registry = registry;
    this.#unsubscribeRegistry = registry.subscribe(() => this.#invalidateUnavailablePage());
  }

  registerHandler(handler: AppNavigationHandler) {
    if (this.#handler) {
      throw new AppNavigationError(
        'navigation_handler_already_registered',
        'An App navigation handler is already registered.',
      );
    }

    this.#handler = handler;
    let isRegistered = true;
    return () => {
      if (isRegistered && this.#handler === handler) {
        this.#handler = undefined;
        this.#activePage = undefined;
      }
      isRegistered = false;
    };
  }

  openPage(target: HostPageTarget, openedByActionId: string): ActivePage {
    const resolution = this.#registry.lookup(target);
    if (!resolution?.page.available) {
      throw new AppNavigationError('page_unavailable', 'The requested page is unavailable.');
    }
    if (!this.#handler) {
      throw new AppNavigationError('page_unavailable', 'The requested page is unavailable.');
    }

    const activePage = Object.freeze({
      owner_id: target.owner_id,
      page_id: target.page_id,
      opened_by_action_id: openedByActionId,
    });
    this.#activePage = activePage;
    this.#handler(activePage);
    return activePage;
  }

  closePage() {
    if (!this.#activePage) {
      return;
    }
    this.#activePage = undefined;
    this.#handler?.(undefined);
  }

  isActivePage(target: HostPageTarget): boolean {
    return this.#activePage?.owner_id === target.owner_id && this.#activePage.page_id === target.page_id;
  }

  closePageIfMatches(target: HostPageTarget): boolean {
    if (!this.isActivePage(target)) return false;
    this.closePage();
    return true;
  }

  resolvePage(target: HostPageTarget): PageResolution | undefined {
    return this.#registry.lookup(target);
  }

  subscribeToPages(listener: () => void) {
    return this.#registry.subscribe(listener);
  }

  destroy() {
    this.#unsubscribeRegistry();
    this.#activePage = undefined;
    this.#handler = undefined;
  }

  #invalidateUnavailablePage() {
    if (!this.#activePage) {
      return;
    }
    const resolution = this.#registry.lookup(this.#activePage);
    if (!resolution?.page.available) {
      this.closePage();
    }
  }
}
