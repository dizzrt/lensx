import type { LauncherActionInvocation } from '../launcher/actions/types';
import { PageActivationAttempt, type PluginPageActivationSession } from './activations';
import type { PageRegistry } from './catalog';
import { type ActivePage, AppNavigationError, type HostPageTarget, type PageResolution } from './types';

export type AppNavigationHandler = (page: ActivePage | undefined) => void;

export class AppNavigationService {
  readonly #registry: PageRegistry;
  readonly #unsubscribeRegistry: () => void;
  #activePage?: ActivePage;
  #handler?: AppNavigationHandler;
  #activationAttempt?: PageActivationAttempt;
  #nativeAttemptId?: string;
  readonly #nativeAttemptWaiters = new Set<(attemptId?: string) => void>();
  readonly #activationFailures = new Set<(code: 'expired' | 'unavailable') => void>();

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
        this.#clearActivationAttempt();
      }
      isRegistered = false;
    };
  }

  openPage(target: HostPageTarget, openedByActionId: string, invocation?: LauncherActionInvocation): ActivePage {
    const resolution = this.#registry.lookup(target);
    if (!resolution?.page.available) {
      throw new AppNavigationError('page_unavailable', 'The requested page is unavailable.');
    }
    if (!this.#handler) {
      throw new AppNavigationError('page_unavailable', 'The requested page is unavailable.');
    }

    const samePage = this.isActivePage(target);
    const nextAttempt = samePage
      ? this.#activationAttempt
      : resolution.provider.kind === 'plugin'
        ? this.#newActivationAttempt()
        : undefined;
    if (invocation && nextAttempt) {
      const prefix = `${target.owner_id}.`;
      if (!openedByActionId.startsWith(prefix))
        throw new AppNavigationError('page_unavailable', 'The requested page is unavailable.');
      nextAttempt.append(openedByActionId.slice(prefix.length), invocation);
    }
    if (!samePage) {
      this.#clearActivationAttempt();
      this.#activationAttempt = nextAttempt;
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
    this.#clearActivationAttempt();
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

  bindActivations(target: HostPageTarget): PluginPageActivationSession | undefined {
    if (!this.isActivePage(target) || !this.#activationAttempt || this.#activationAttempt.terminal) return undefined;
    try {
      return this.#activationAttempt.bind();
    } catch {
      return undefined;
    }
  }

  restartActivationAttempt(target: HostPageTarget) {
    if (!this.isActivePage(target)) return;
    this.#clearActivationAttempt();
    this.#activationAttempt = this.#newActivationAttempt();
  }

  attachNativeActivationAttempt(target: HostPageTarget, attemptId: string) {
    if (!this.isActivePage(target) || !this.#activationAttempt || this.#activationAttempt.terminal) return;
    this.#nativeAttemptId = attemptId;
    for (const waiter of [...this.#nativeAttemptWaiters]) waiter(attemptId);
  }

  isNativeActivationAttemptCurrent(target: HostPageTarget, attemptId: string) {
    return (
      this.isActivePage(target) && this.#nativeAttemptId === attemptId && this.#activationAttempt?.terminal === false
    );
  }

  bindNativeActivations(target: HostPageTarget, attemptId: string): Promise<PluginPageActivationSession | undefined> {
    if (!this.isActivePage(target) || !this.#activationAttempt || this.#activationAttempt.terminal)
      return Promise.resolve(undefined);
    if (this.#nativeAttemptId !== undefined)
      return Promise.resolve(this.#nativeAttemptId === attemptId ? this.bindActivations(target) : undefined);
    return new Promise((resolve) => {
      const attempt = this.#activationAttempt;
      const finish = (currentId?: string) => {
        clearTimeout(timer);
        this.#nativeAttemptWaiters.delete(finish);
        resolve(
          attempt === this.#activationAttempt && currentId === attemptId ? this.bindActivations(target) : undefined,
        );
      };
      const timer = setTimeout(() => finish(), 10_000);
      this.#nativeAttemptWaiters.add(finish);
    });
  }

  #clearActivationAttempt() {
    this.#activationAttempt?.dispose();
    this.#activationAttempt = undefined;
    this.#nativeAttemptId = undefined;
    for (const waiter of [...this.#nativeAttemptWaiters]) waiter();
  }

  subscribeActivationFailures(listener: (code: 'expired' | 'unavailable') => void) {
    this.#activationFailures.add(listener);
    return () => {
      this.#activationFailures.delete(listener);
    };
  }

  #newActivationAttempt() {
    return new PageActivationAttempt((code) => {
      for (const listener of this.#activationFailures) listener(code);
    });
  }

  subscribeToPages(listener: () => void) {
    return this.#registry.subscribe(listener);
  }

  destroy() {
    this.#unsubscribeRegistry();
    this.#clearActivationAttempt();
    this.#activationFailures.clear();
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
