import { isValidPluginRuntimeRoute, pluginRuntimeOriginFromEntryUrl } from './helpers';
import type {
  PluginRuntimeAttempt,
  PluginRuntimeFailureCode,
  PluginRuntimeLifecycleService,
  PluginRuntimeOwner,
  PluginRuntimeTerminalReason,
} from './lifecycle-controller';
import type { PluginChildWebviewOwner } from './pluginChildWebviewOwner';
import type {
  PluginChildWebviewPresentationBinding,
  PluginChildWebviewPresentationController,
} from './pluginChildWebviewPresentation';
import { validPluginResourceGeneration } from './pluginChildWebviewPresentation';
import type { PluginChildWebviewPhysicalBounds } from './pluginChildWebviewSlot';
import type { PluginPageRuntimeDescriptor, PluginPageRuntimeRequest, PluginPageRuntimeResolver } from './types';

export type ManagedRuntimeState =
  | { readonly status: 'loading'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly status: 'ready'; readonly descriptor: PluginPageRuntimeDescriptor }
  | { readonly status: 'failed'; readonly failureCode: PluginRuntimeFailureCode }
  | { readonly status: 'disposed' };

export interface PluginRuntimeInstanceBinding {
  readonly request: PluginPageRuntimeRequest;
  descriptor: PluginPageRuntimeDescriptor;
  readonly attempt: PluginRuntimeAttempt;
  owner: PluginRuntimeOwner;
  presentation?: PluginChildWebviewPresentationBinding;
  controller: PluginChildWebviewPresentationController;
  state: ManagedRuntimeState;
  phase: 'stable' | 'transferring' | 'recovery_required';
  shellEpoch?: string;
  slotRevision: bigint;
  revision: number;
}

/** One main-document owner for instances; React and detached shells only lease presentation. */
export class PluginRuntimeInstanceRegistry {
  readonly #records = new Map<number, PluginRuntimeInstanceBinding>();
  readonly #native = new Map<string, PluginRuntimeInstanceBinding>();
  readonly #openRequests = new Map<string, AbortController>();
  readonly #geometry = new Map<
    number,
    { owner: PluginRuntimeOwner; read: () => { scaleFactor: number; bounds: PluginChildWebviewPhysicalBounds } }
  >();
  readonly #listeners = new Set<(binding: PluginRuntimeInstanceBinding) => void>();
  constructor(
    readonly lifecycle: PluginRuntimeLifecycleService,
    private readonly closeNative?: (
      attemptId: string,
      reason: PluginRuntimeTerminalReason,
      owner: PluginChildWebviewOwner,
    ) => Promise<void>,
  ) {}

  register(
    request: PluginPageRuntimeRequest,
    descriptor: PluginPageRuntimeDescriptor,
    attempt: PluginRuntimeAttempt,
    controller: PluginChildWebviewPresentationController,
  ): PluginRuntimeInstanceBinding {
    const existing = this.#records.get(attempt.key);
    if (existing) return existing;
    const binding: PluginRuntimeInstanceBinding = {
      request,
      descriptor,
      attempt,
      controller,
      owner: attempt.currentOwner(),
      phase: 'stable',
      state: { status: 'loading', descriptor },
      revision: 0,
      slotRevision: 0n,
    };
    this.#records.set(attempt.key, binding);
    attempt.bindCancellable(() => {
      this.#records.delete(attempt.key);
      this.#geometry.delete(attempt.key);
      if (binding.presentation && this.#native.get(binding.presentation.attemptId) === binding)
        this.#native.delete(binding.presentation.attemptId);
    });
    attempt.bindRuntime((reason) => this.#releaseNative(binding, reason));
    return binding;
  }
  forSurface(
    surfaceId: string,
    target?: { owner_id: string; page_id: string },
  ): PluginRuntimeInstanceBinding | undefined {
    return [...this.#records.values()].find(
      (binding) =>
        binding.attempt.isCurrent() &&
        binding.attempt.currentOwner().surfaceId === surfaceId &&
        (!target ||
          (binding.descriptor.plugin_id === target.owner_id && binding.descriptor.page_id === target.page_id)),
    );
  }
  forAttempt(attemptId: string): PluginRuntimeInstanceBinding | undefined {
    return this.#native.get(attemptId);
  }
  all(): readonly PluginRuntimeInstanceBinding[] {
    return [...this.#records.values()];
  }
  subscribe(listener: (binding: PluginRuntimeInstanceBinding) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  subscribeBinding(binding: PluginRuntimeInstanceBinding, listener: () => void): () => void {
    return this.subscribe((current) => {
      if (current === binding) listener();
    });
  }
  attachNative(binding: PluginRuntimeInstanceBinding, presentation: PluginChildWebviewPresentationBinding) {
    if (!binding.attempt.isCurrent() || this.#native.has(presentation.attemptId))
      throw new Error('Runtime binding is unavailable.');
    binding.presentation = presentation;
    this.#native.set(presentation.attemptId, binding);
    this.changed(binding);
  }
  publish(binding: PluginRuntimeInstanceBinding, state: ManagedRuntimeState) {
    binding.state = state;
    this.changed(binding);
  }
  changed(binding: PluginRuntimeInstanceBinding) {
    binding.revision++;
    for (const listener of this.#listeners) listener(binding);
  }
  bindGeometry(
    binding: PluginRuntimeInstanceBinding,
    read: () => { scaleFactor: number; bounds: PluginChildWebviewPhysicalBounds },
  ): () => void {
    const geometry = { owner: binding.owner, read };
    this.#geometry.set(binding.attempt.key, geometry);
    return () => {
      if (this.#geometry.get(binding.attempt.key) === geometry) this.#geometry.delete(binding.attempt.key);
    };
  }
  measure(attemptId: string): { scaleFactor: number; bounds: PluginChildWebviewPhysicalBounds } | undefined {
    const binding = this.#native.get(attemptId);
    if (!binding?.attempt.isCurrent() || binding.owner.surfaceId !== 'main') return undefined;
    const geometry = this.#geometry.get(binding.attempt.key);
    if (!geometry || geometry.owner !== binding.owner) return undefined;
    try {
      return geometry.read();
    } catch {
      return undefined;
    }
  }
  async freeze(attemptId: string): Promise<boolean> {
    const binding = this.#native.get(attemptId);
    if (!binding?.attempt.isCurrent()) return false;
    binding.phase = 'transferring';
    await binding.attempt.releasePresentation();
    if (!binding.attempt.isCurrent()) return false;
    this.changed(binding);
    return true;
  }
  async changeOwner(
    attemptId: string,
    owner: PluginChildWebviewOwner,
    controller: PluginChildWebviewPresentationController,
    shellEpoch?: string,
  ): Promise<boolean> {
    const binding = this.#native.get(attemptId);
    if (!binding?.presentation || !binding.attempt.isCurrent()) return false;
    binding.phase = 'transferring';
    binding.controller = controller;
    binding.presentation = Object.freeze({ ...binding.presentation, owner });
    binding.shellEpoch = shellEpoch;
    binding.slotRevision = 0n;
    const next = await this.lifecycle.transfer(binding.attempt.key, binding.owner, owner.windowLabel, (reason) =>
      this.#releaseNative(binding, reason),
    );
    if (!next || !binding.attempt.isCurrent()) return false;
    binding.owner = next;
    this.changed(binding);
    return true;
  }
  settle(attemptId: string, recoveryRequired = false) {
    const binding = this.#native.get(attemptId);
    if (!binding) return;
    binding.phase = recoveryRequired ? 'recovery_required' : 'stable';
    this.changed(binding);
  }
  cancelPending(surfaceId?: string) {
    for (const [surface, cancellation] of this.#openRequests) {
      if (surfaceId === undefined || surfaceId === surface) {
        cancellation.abort();
        this.#openRequests.delete(surface);
      }
    }
  }
  async close(attemptId: string) {
    await this.#native.get(attemptId)?.attempt.terminate('manual_close');
  }
  async #releaseNative(binding: PluginRuntimeInstanceBinding, reason: PluginRuntimeTerminalReason) {
    const presentation = binding.presentation;
    if (!presentation) return;
    if (this.closeNative) await this.closeNative(presentation.attemptId, reason, presentation.owner);
    else {
      await binding.controller.setVisible(presentation, false).catch(() => undefined);
      await binding.controller.destroy(presentation);
    }
    if (binding.presentation === presentation) binding.presentation = undefined;
  }

  /** Detached Page replacement is started here by the central coordinator, never by its shell. */
  async openDetached(input: {
    surfaceId: string;
    shellEpoch: string;
    request: PluginPageRuntimeRequest;
    resolver: PluginPageRuntimeResolver;
    controller: PluginChildWebviewPresentationController;
    bounds: PluginChildWebviewPhysicalBounds;
    scaleFactor: number;
    onNativeAttempt: (attemptId: string) => void;
    onFailure: (failureCode: PluginRuntimeFailureCode) => void;
  }): Promise<PluginRuntimeInstanceBinding | undefined> {
    this.#openRequests.get(input.surfaceId)?.abort();
    const cancellation = new AbortController();
    this.#openRequests.set(input.surfaceId, cancellation);
    const currentRequest = () =>
      this.#openRequests.get(input.surfaceId) === cancellation && !cancellation.signal.aborted;
    let binding: PluginRuntimeInstanceBinding | undefined;
    let attempt: PluginRuntimeAttempt | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const admission = await Promise.race([
        input.resolver.admit?.(input.request, cancellation.signal),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            cancellation.abort();
            reject(new Error('Runtime admission unavailable.'));
          }, 10_000);
        }),
      ]);
      clearTimeout(timer);
      if (!currentRequest()) return undefined;
      attempt = await this.lifecycle.start({
        surfaceId: input.surfaceId,
        targetKey: `${input.request.activePage.owner_id}\0${input.request.activePage.page_id}`,
        trustedIdentity: admission && { entryId: admission.entryId, generation: admission.generation },
        onFailure: (failureCode) => {
          const latest = this.#openRequests.get(input.surfaceId);
          if (latest && latest !== cancellation) return;
          if (binding) this.publish(binding, { status: 'failed', failureCode });
          input.onFailure(failureCode);
        },
      });
      if (!attempt) return undefined;
      if (!currentRequest()) {
        await attempt.terminate('navigation');
        return undefined;
      }
      attempt.bindCancellable(() => {
        cancellation.abort();
        if (this.#openRequests.get(input.surfaceId) === cancellation) this.#openRequests.delete(input.surfaceId);
      });
      attempt.startResolutionDeadline();
      const descriptor = await input.resolver.resolve(input.request, admission, cancellation.signal);
      if (!attempt.isCurrent()) return undefined;
      const descriptorOrigin = pluginRuntimeOriginFromEntryUrl(descriptor.entry_url);
      if (
        !descriptorOrigin ||
        descriptor.plugin_id !== input.request.activePage.owner_id ||
        descriptor.page_id !== input.request.activePage.page_id ||
        !descriptor.runtime_key ||
        !isValidPluginRuntimeRoute(descriptor.host_fragment) ||
        !validPluginResourceGeneration(descriptor.resource_generation) ||
        descriptorOrigin !== descriptor.expected_origin
      )
        throw new Error('Runtime descriptor is unavailable.');
      if (!attempt.bindTrustedIdentity(descriptor.entry_id, descriptor.resource_generation)) {
        await attempt.fail('runtime_unavailable');
        return undefined;
      }
      attempt.completeResolution();
      binding = this.register(input.request, descriptor, attempt, input.controller);
      binding.shellEpoch = input.shellEpoch;
      const presentation = await input.controller.create({
        identity: {
          entryId: descriptor.entry_id,
          pluginId: descriptor.plugin_id,
          version: descriptor.version,
          pageId: descriptor.page_id,
          expectedRevision: descriptor.registration_revision,
        },
        owner: { windowLabel: input.surfaceId, ownershipRevision: 1n },
        scaleFactor: input.scaleFactor,
        physicalBounds: input.bounds,
        presentationRevision: 1n,
      });
      if (!attempt.isCurrent()) {
        if (this.closeNative) await this.closeNative(presentation.attemptId, 'navigation', presentation.owner);
        else await input.controller.destroy(presentation);
        return undefined;
      }
      this.attachNative(binding, presentation);
      if (presentation.resourceGeneration !== descriptor.resource_generation)
        throw new Error('Runtime generation is unavailable.');
      const expectedOrigin = pluginRuntimeOriginFromEntryUrl(presentation.entryUrl);
      if (!expectedOrigin) throw new Error('Runtime origin is unavailable.');
      binding.descriptor = Object.freeze({
        ...descriptor,
        entry_url: presentation.entryUrl,
        expected_origin: expectedOrigin,
      });
      input.onNativeAttempt(presentation.attemptId);
      const retained = binding;
      let checking = false;
      let again = false;
      const revalidate = async () => {
        again = true;
        if (checking || !input.resolver.isCurrent) return;
        checking = true;
        try {
          while (again && retained.attempt.isCurrent()) {
            again = false;
            if (!(await input.resolver.isCurrent(input.request, retained.descriptor)))
              await retained.attempt.fail('runtime_unavailable');
          }
        } finally {
          checking = false;
        }
      };
      const unsubscribe = input.resolver.subscribeInvalidation?.(() => {
        void revalidate();
      });
      if (unsubscribe) attempt.bindSubscription(unsubscribe);
      const readiness = await input.controller.waitReadiness(presentation);
      if (!attempt.isCurrent()) return undefined;
      if (readiness.status === 'failed') {
        await attempt.fail(readiness.failureCode);
        return binding;
      }
      await input.controller.setVisible(presentation, true);
      if (attempt.isCurrent()) {
        attempt.markReady();
        this.publish(binding, { status: 'ready', descriptor: binding.descriptor });
      }
      return binding;
    } catch {
      if (attempt?.isCurrent()) await attempt.fail('runtime_unavailable');
      else if (this.#openRequests.get(input.surfaceId) === cancellation) input.onFailure('runtime_unavailable');
      return undefined;
    } finally {
      clearTimeout(timer);
      if (!attempt?.isCurrent() && this.#openRequests.get(input.surfaceId) === cancellation)
        this.#openRequests.delete(input.surfaceId);
    }
  }
}
