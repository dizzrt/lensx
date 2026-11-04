import type { LauncherActionExecutionContext, LauncherActionInvocation } from '../launcher/actions/types';
import { PageActivationAttempt, type PluginPageActivationSession } from './activations';
import type { PageRegistry } from './catalog';
import { type ActivePage, AppNavigationError, type HostPageTarget, type PageResolution } from './types';

export interface AppNavigationChange {
  readonly surfaceId: string;
  readonly reason: 'open' | 'close' | 'transfer' | 'restore' | 'metadata';
  readonly nativeAttemptId?: string;
}
export type AppNavigationHandler = (page: ActivePage | undefined, change?: AppNavigationChange) => void;
interface PageAttempt {
  page: ActivePage;
  surfaceId: string;
  activation?: PageActivationAttempt;
  nativeAttemptId?: string;
  readonly waiters: Set<(attemptId?: string) => void>;
}
interface Surface {
  handler?: AppNavigationHandler;
  current?: PageAttempt;
  transferToken?: string;
}
interface Transfer {
  readonly instance: PageAttempt;
  readonly source: string;
  readonly target: string;
}

/** Application-owned navigation. Presenters are leases, never Runtime owners. */
export class AppNavigationService {
  readonly #registry: PageRegistry;
  readonly #unsubscribeRegistry: () => void;
  readonly #surfaces = new Map<string, Surface>([['main', {}]]);
  readonly #instances = new Map<string, PageAttempt>();
  readonly #transfers = new Map<string, Transfer>();
  readonly #activationFailures = new Set<
    (code: 'expired' | 'unavailable', instance?: { surfaceId: string; attemptId?: string }) => void
  >();

  constructor(registry: PageRegistry) {
    this.#registry = registry;
    this.#unsubscribeRegistry = registry.subscribe(() => this.#invalidateUnavailablePages());
  }

  registerSurface(surfaceId: string) {
    if (surfaceId !== 'main' && !/^plugin-window-[0-9a-f]{16}$/u.test(surfaceId)) this.#unavailable();
    if (!this.#surfaces.has(surfaceId)) this.#surfaces.set(surfaceId, {});
  }

  registerHandler(handler: AppNavigationHandler, surfaceId = 'main') {
    const surface = this.#surface(surfaceId);
    if (surface.handler)
      throw new AppNavigationError(
        'navigation_handler_already_registered',
        'An App navigation handler is already registered.',
      );
    surface.handler = handler;
    if (surface.current)
      handler(surface.current.page, {
        surfaceId,
        reason: 'metadata',
        nativeAttemptId: surface.current.nativeAttemptId,
      });
    return () => {
      if (surface.handler === handler) surface.handler = undefined;
    };
  }

  openPage(
    target: HostPageTarget,
    openedByActionId: string,
    invocation?: LauncherActionInvocation,
    context?: LauncherActionExecutionContext,
  ): ActivePage {
    const surfaceId =
      context?.runtimeAttemptId === undefined ? 'main' : this.#instances.get(context.runtimeAttemptId)?.surfaceId;
    if (surfaceId === undefined) return this.#unavailable();
    const surface = this.#surface(surfaceId);
    const resolution = this.#registry.lookup(target);
    if (!resolution?.page.available || !surface.handler || surface.transferToken) return this.#unavailable();
    const samePage = this.isActivePage(target, surfaceId);
    const next: PageAttempt =
      samePage && surface.current
        ? surface.current
        : {
            page: Object.freeze({ ...target, opened_by_action_id: openedByActionId }),
            surfaceId,
            waiters: new Set(),
          };
    if (!samePage && resolution.provider.kind === 'plugin') {
      next.activation = new PageActivationAttempt((code) => {
        for (const listener of this.#activationFailures)
          listener(code, { surfaceId: next.surfaceId, attemptId: next.nativeAttemptId });
      });
    }
    if (invocation && next.activation) {
      const prefix = `${target.owner_id}.`;
      if (!openedByActionId.startsWith(prefix)) return this.#unavailable();
      next.activation.append(openedByActionId.slice(prefix.length), invocation);
    }
    if (!samePage) this.#clear(surface);
    next.page = Object.freeze({
      owner_id: target.owner_id,
      page_id: target.page_id,
      opened_by_action_id: openedByActionId,
    });
    surface.current = next;
    this.#notify(surfaceId, 'open');
    return next.page;
  }

  getActivePage(surfaceId = 'main'): ActivePage | undefined {
    return this.#surfaces.get(surfaceId)?.current?.page;
  }
  surfaceForAttempt(attemptId: string): string | undefined {
    return this.#instances.get(attemptId)?.surfaceId;
  }
  instanceIsFrozen(attemptId: string): boolean {
    const instance = this.#instances.get(attemptId);
    return instance !== undefined && this.#surfaces.get(instance.surfaceId)?.transferToken !== undefined;
  }
  closePage(surfaceId = 'main') {
    const surface = this.#surfaces.get(surfaceId);
    if (!surface?.current) return;
    this.#clear(surface);
    this.#notify(surfaceId, 'close');
  }
  isActivePage(target: HostPageTarget, surfaceId = 'main'): boolean {
    const page = this.getActivePage(surfaceId);
    return page?.owner_id === target.owner_id && page.page_id === target.page_id;
  }
  isActiveInstance(target: HostPageTarget, attemptId: string): boolean {
    const current = this.#instances.get(attemptId);
    return (
      current !== undefined &&
      this.#surfaces.get(current.surfaceId)?.current === current &&
      current.page.owner_id === target.owner_id &&
      current.page.page_id === target.page_id &&
      current.activation?.terminal === false
    );
  }
  closePageIfMatches(target: HostPageTarget): boolean {
    if (!this.isActivePage(target)) return false;
    this.closePage();
    return true;
  }
  closeInstanceIfMatches(target: HostPageTarget, attemptId: string): boolean {
    if (!this.isActiveInstance(target, attemptId)) return false;
    const instance = this.#instances.get(attemptId);
    if (!instance) return false;
    this.closePage(instance.surfaceId);
    return true;
  }
  resolvePage(target: HostPageTarget): PageResolution | undefined {
    return this.#registry.lookup(target);
  }

  bindActivations(target: HostPageTarget, surfaceId = 'main'): PluginPageActivationSession | undefined {
    const current = this.#surfaces.get(surfaceId)?.current;
    if (!this.isActivePage(target, surfaceId) || !current?.activation || current.activation.terminal) return undefined;
    try {
      return current.activation.bind();
    } catch {
      return undefined;
    }
  }
  restartActivationAttempt(target: HostPageTarget, surfaceId = 'main') {
    const surface = this.#surfaces.get(surfaceId);
    if (!surface?.current || !this.isActivePage(target, surfaceId)) return;
    const instance = surface.current;
    this.#clearActivation(instance);
    instance.activation = new PageActivationAttempt((code) => {
      for (const listener of this.#activationFailures)
        listener(code, { surfaceId: instance.surfaceId, attemptId: instance.nativeAttemptId });
    });
  }
  attachNativeActivationAttempt(target: HostPageTarget, attemptId: string, surfaceId = 'main') {
    const current = this.#surfaces.get(surfaceId)?.current;
    if (!current || !this.isActivePage(target, surfaceId) || !current.activation || current.activation.terminal) return;
    if (
      (current.nativeAttemptId !== undefined && current.nativeAttemptId !== attemptId) ||
      (this.#instances.has(attemptId) && this.#instances.get(attemptId) !== current)
    )
      return;
    current.nativeAttemptId = attemptId;
    this.#instances.set(attemptId, current);
    for (const waiter of [...current.waiters]) waiter(attemptId);
  }
  isNativeActivationAttemptCurrent(target: HostPageTarget, attemptId: string) {
    return this.isActiveInstance(target, attemptId);
  }
  bindNativeActivations(target: HostPageTarget, attemptId: string): Promise<PluginPageActivationSession | undefined> {
    const attached = this.#instances.get(attemptId);
    if (attached)
      return Promise.resolve(
        this.isActiveInstance(target, attemptId) ? this.bindActivations(target, attached.surfaceId) : undefined,
      );
    const candidates = [...this.#surfaces.values()].flatMap(({ current }) =>
      current &&
      current.nativeAttemptId === undefined &&
      current.page.owner_id === target.owner_id &&
      current.page.page_id === target.page_id &&
      current.activation?.terminal === false
        ? [current]
        : [],
    );
    // Native creation is serial within each surface; bind only after that exact
    // attempt is attached. The business Page never selects an instance.
    if (candidates.length === 0) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const finish = (currentId?: string) => {
        if (
          currentId !== undefined &&
          currentId !== attemptId &&
          candidates.some(
            (candidate) => candidate.activation?.terminal === false && candidate.nativeAttemptId === undefined,
          )
        )
          return;
        if (
          currentId === undefined &&
          candidates.some(
            (candidate) => candidate.activation?.terminal === false && candidate.nativeAttemptId === undefined,
          )
        )
          return;
        clearTimeout(timer);
        for (const candidate of candidates) candidate.waiters.delete(finish);
        const current = this.#instances.get(attemptId);
        resolve(
          current && this.isActiveInstance(target, attemptId)
            ? this.bindActivations(target, current.surfaceId)
            : undefined,
        );
      };
      const timer = setTimeout(() => {
        for (const candidate of candidates) candidate.waiters.delete(finish);
        resolve(undefined);
      }, 10_000);
      for (const candidate of candidates) candidate.waiters.add(finish);
    });
  }

  transferPending(token: string, attemptId: string): boolean {
    return this.#transfers.get(token)?.instance.nativeAttemptId === attemptId;
  }
  prepareTransfer(token: string, attemptId: string, sourceId: string, targetId: string): boolean {
    const instance = this.#instances.get(attemptId);
    if (!instance || instance.activation?.terminal !== false) return false;
    this.registerSurface(targetId);
    const source = this.#surface(sourceId);
    const target = this.#surface(targetId);
    const previous = this.#transfers.get(token);
    if (previous) return previous.instance === instance && previous.source === sourceId && previous.target === targetId;
    if (instance.surfaceId !== sourceId || source.transferToken || target.transferToken || target.current) return false;
    source.transferToken = token;
    target.transferToken = token;
    this.#transfers.set(token, { instance, source: sourceId, target: targetId });
    return true;
  }
  refreshSurface(surfaceId = 'main') {
    this.#notify(surfaceId, 'metadata');
  }
  closeNativeAttempt(attemptId: string): boolean {
    const instance = this.#instances.get(attemptId);
    if (!instance) return false;
    this.closePage(instance.surfaceId);
    return true;
  }

  stageTransfer(token: string, attemptId: string, sourceId: string, targetId: string, restore = false): boolean {
    const instance = this.#instances.get(attemptId);
    if (!instance || instance.activation?.terminal !== false) return false;
    this.registerSurface(targetId);
    const source = this.#surface(sourceId);
    const target = this.#surface(targetId);
    const existing = this.#transfers.get(token);
    if (existing && (existing.instance !== instance || existing.source !== sourceId || existing.target !== targetId))
      return false;
    if (
      (!existing && instance.surfaceId !== sourceId) ||
      (source.transferToken !== undefined && source.transferToken !== token) ||
      (target.transferToken !== undefined && target.transferToken !== token)
    )
      return false;
    const destinationId = restore ? sourceId : targetId;
    const destination = this.#surface(destinationId);
    if (destination.current !== undefined && destination.current !== instance) return false;
    source.transferToken = token;
    target.transferToken = token;
    this.#transfers.set(token, existing ?? { instance, source: sourceId, target: targetId });
    const previousId = instance.surfaceId;
    if (previousId !== destinationId) {
      this.#surface(previousId).current = undefined;
      destination.current = instance;
      instance.surfaceId = destinationId;
      this.#notify(previousId, restore ? 'restore' : 'transfer');
    }
    this.#notify(destinationId, restore ? 'restore' : 'transfer');
    return true;
  }
  settleTransfer(token: string, outcome: 'committed' | 'restored' | 'recovery_required' | 'terminated'): boolean {
    const transfer = this.#transfers.get(token);
    if (!transfer) return false;
    if (outcome === 'recovery_required') return true;
    if (outcome === 'terminated') {
      const current = transfer.instance;
      if (this.#surfaces.get(current.surfaceId)?.current === current) this.closePage(current.surfaceId);
    }
    for (const id of [transfer.source, transfer.target]) {
      const surface = this.#surfaces.get(id);
      if (surface?.transferToken === token) surface.transferToken = undefined;
    }
    this.#transfers.delete(token);
    return true;
  }
  removeSurface(surfaceId: string) {
    if (surfaceId === 'main') return;
    this.closePage(surfaceId);
    this.#surfaces.delete(surfaceId);
  }
  subscribeActivationFailures(
    listener: (code: 'expired' | 'unavailable', instance?: { surfaceId: string; attemptId?: string }) => void,
  ) {
    this.#activationFailures.add(listener);
    return () => {
      this.#activationFailures.delete(listener);
    };
  }
  subscribeToPages(listener: () => void) {
    return this.#registry.subscribe(listener);
  }
  clearAll() {
    for (const surface of this.#surfaces.values()) this.#clear(surface);
    this.#instances.clear();
    this.#transfers.clear();
    for (const surface of this.#surfaces.values()) surface.transferToken = undefined;
  }
  destroy() {
    this.#unsubscribeRegistry();
    this.clearAll();
    this.#activationFailures.clear();
    this.#surfaces.clear();
  }
  #surface(id: string): Surface {
    const surface = this.#surfaces.get(id);
    if (!surface) return this.#unavailable();
    return surface;
  }
  #unavailable(): never {
    throw new AppNavigationError('page_unavailable', 'The requested page is unavailable.');
  }
  #notify(surfaceId: string, reason: AppNavigationChange['reason']) {
    const surface = this.#surfaces.get(surfaceId);
    if (surfaceId === 'main' && (reason === 'open' || reason === 'close')) surface?.handler?.(surface.current?.page);
    else
      surface?.handler?.(surface.current?.page, {
        surfaceId,
        reason,
        nativeAttemptId: surface.current?.nativeAttemptId,
      });
  }
  #clearActivation(instance: PageAttempt) {
    instance.activation?.dispose();
    instance.activation = undefined;
    if (instance.nativeAttemptId) this.#instances.delete(instance.nativeAttemptId);
    instance.nativeAttemptId = undefined;
    for (const waiter of [...instance.waiters]) waiter();
    instance.waiters.clear();
  }
  #clear(surface: Surface) {
    if (surface.current) this.#clearActivation(surface.current);
    surface.current = undefined;
  }
  #invalidateUnavailablePages() {
    for (const [surfaceId, surface] of this.#surfaces) {
      if (surface.current && !this.#registry.lookup(surface.current.page)?.page.available) this.closePage(surfaceId);
    }
  }
}
