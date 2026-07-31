import type { HostPageCatalog } from './catalog';
import { type ActivePage, AppNavigationError, type HostPageTarget } from './types';

export type AppNavigationHandler = (page: ActivePage) => void;

export class AppNavigationService {
  readonly #catalog: HostPageCatalog;
  #handler?: AppNavigationHandler;

  constructor(catalog: HostPageCatalog) {
    this.#catalog = catalog;
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
      }
      isRegistered = false;
    };
  }

  openPage(target: HostPageTarget, openedByActionId: string): ActivePage {
    if (!this.#catalog.hasAvailablePage(target)) {
      throw new AppNavigationError('page_unavailable', 'The requested page is unavailable.');
    }
    if (!this.#handler) {
      throw new AppNavigationError('navigation_handler_unavailable', 'The App navigation handler is unavailable.');
    }

    const activePage = Object.freeze({
      owner_id: target.owner_id,
      page_id: target.page_id,
      opened_by_action_id: openedByActionId,
    });
    this.#handler(activePage);
    return activePage;
  }
}
