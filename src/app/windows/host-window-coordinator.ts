import type { AppLocale } from '../i18n/types';
import type { LauncherActionService } from '../launcher/actions/service';
import { resolveLauncherActionMetadata } from '../launcher/actions/validation';
import { resolveLocalizedPageText } from '../navigation/pageContext';
import type { AppNavigationService } from '../navigation/service';
import type { ActivePage } from '../navigation/types';
import type { PluginRuntimeInstanceBinding, PluginRuntimeInstanceRegistry } from '../plugins/runtime/instance-registry';
import type { PluginChildWebviewPresentationController } from '../plugins/runtime/pluginChildWebviewPresentation';
import type { PluginChildWebviewPhysicalBounds } from '../plugins/runtime/pluginChildWebviewSlot';
import type { PluginPageRuntimeResolver } from '../plugins/runtime/types';
import type { ThemeMode } from '../theme/theme';
import type { HostWindowOperation, HostWindowPage, HostWindowPort, HostWindowSnapshot } from './host-window-protocol';

export interface HostWindowCoordinatorDependencies {
  readonly port: HostWindowPort;
  readonly navigation: AppNavigationService;
  readonly instances: PluginRuntimeInstanceRegistry;
  readonly actions?: LauncherActionService['registry'];
  readonly resolver: PluginPageRuntimeResolver;
  readonly mainPresentation: PluginChildWebviewPresentationController;
  readonly awaitMainRender?: () => Promise<void>;
  readonly suspendMainPresentation?: () => void;
  readonly resumeMainPresentation?: () => void;
  readonly onOperationSettled?: (operation: HostWindowOperation, accepted: boolean) => void;
}

/** Runs only in the trusted main document. Shells never instantiate this class. */
export class HostWindowCoordinator {
  readonly #snapshots = new Map<string, HostWindowSnapshot>();
  readonly #surfaceHandlers = new Map<string, () => void>();
  readonly #operations = new Map<string, { fingerprint: string; result: Promise<boolean> }>();
  readonly #openVersions = new Map<string, number>();
  readonly #ackGeometry = new Map<string, { scaleFactor: number; bounds: PluginChildWebviewPhysicalBounds }>();
  readonly #publicationJobs = new Map<PluginRuntimeInstanceBinding, Promise<void>>();
  readonly #publicationDirty = new Set<PluginRuntimeInstanceBinding>();
  readonly #cleanup: Array<() => void> = [];
  #chain: Promise<unknown> = Promise.resolve();
  #disposed = false;
  #started = false;
  #locale: AppLocale = 'en-US';
  #desiredPreferences?: { locale: AppLocale; theme: ThemeMode };
  #preferenceJob?: Promise<void>;
  constructor(private readonly dependencies: HostWindowCoordinatorDependencies) {}

  async start() {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    const { port, instances, navigation } = this.dependencies;
    let buffering = true;
    const buffered: HostWindowOperation[] = [];
    const unlisten = await port.listenOperations((operation) => {
      if (buffering) buffered.push(operation);
      else void this.receive(operation);
    });
    if (this.#disposed) {
      unlisten();
      return;
    }
    this.#cleanup.push(unlisten);
    const replay = await port.readOperations();
    for (const operation of replay) await this.receive(operation);
    while (buffered.length) for (const operation of buffered.splice(0)) await this.receive(operation);
    buffering = false;
    this.#cleanup.push(
      instances.subscribe((binding) => {
        void this.#publish(binding);
      }),
    );
    this.#cleanup.push(
      navigation.subscribeToPages(() => {
        for (const binding of instances.all()) void this.#publish(binding);
      }),
    );
    const unsubscribeActions = this.dependencies.actions?.subscribe?.(() => {
      for (const binding of instances.all()) void this.#publish(binding);
    });
    if (unsubscribeActions) this.#cleanup.push(unsubscribeActions);
    for (const binding of instances.all()) void this.#publish(binding);
  }
  async reconcile() {
    if (this.#disposed) return;
    for (const operation of await this.dependencies.port.readOperations()) await this.receive(operation);
  }
  receive(operation: HostWindowOperation): Promise<boolean> {
    if (this.#disposed) return Promise.resolve(false);
    const fingerprint = [
      operation.transfer_token,
      operation.attempt_id,
      operation.kind,
      operation.from_owner.windowLabel,
      operation.from_owner.ownershipRevision.toString(),
      operation.to_owner.windowLabel,
      operation.to_owner.ownershipRevision.toString(),
      operation.shell_epoch,
      operation.outcome,
    ].join('\0');
    const old = this.#operations.get(operation.operation_id);
    if (old && old.fingerprint !== fingerprint) return Promise.resolve(false);
    let result = old?.result;
    if (!result) {
      result = this.#chain.then(() => (this.#disposed ? false : this.#apply(operation))).catch(() => false);
      this.#chain = result;
      this.#operations.set(operation.operation_id, { fingerprint, result });
      // The native broker retains at most 128 operations; keep a larger replay window.
      if (this.#operations.size > 256) {
        const oldest = this.#operations.keys().next().value as string;
        this.#operations.delete(oldest);
        this.#ackGeometry.delete(oldest);
      }
    }
    return result.then(async (success) => {
      if (!this.#disposed)
        await this.dependencies.port
          .acknowledge(operation, success, success ? this.#ackGeometry.get(operation.operation_id) : undefined)
          .catch(() => false);
      if (!this.#disposed && !old) this.dependencies.onOperationSettled?.(operation, success);
      return success;
    });
  }
  async awaitInstanceStable(attemptId: string, signal: AbortSignal): Promise<boolean> {
    if (this.#disposed || signal.aborted) return false;
    const owner = await this.dependencies.port.waitOwner(attemptId);
    if (signal.aborted || this.#disposed) return false;
    await this.reconcile();
    if (!owner) return false;
    const binding = this.dependencies.instances.forAttempt(attemptId);
    return (
      !signal.aborted &&
      binding?.attempt.isCurrent() === true &&
      binding.phase === 'stable' &&
      binding.presentation?.owner.windowLabel === owner.windowLabel &&
      binding.presentation.owner.ownershipRevision === owner.ownershipRevision
    );
  }
  updatePreferences(locale: AppLocale, theme: ThemeMode) {
    if (this.#disposed) return;
    this.#desiredPreferences = { locale, theme };
    if (this.#preferenceJob) return;
    this.#preferenceJob = (async () => {
      while (this.#desiredPreferences && !this.#disposed) {
        const next = this.#desiredPreferences;
        this.#desiredPreferences = undefined;
        try {
          if (!(await this.dependencies.port.preferences(next.locale, next.theme))) continue;
          if (this.#disposed) return;
          this.#locale = next.locale;
          for (const binding of this.dependencies.instances.all()) void this.#publish(binding);
        } catch {
          /* Keep the last confirmed shell preferences and metadata. */
        }
      }
    })().finally(() => {
      this.#preferenceJob = undefined;
      const pending = this.#desiredPreferences;
      if (pending && !this.#disposed) this.updatePreferences(pending.locale, pending.theme);
    });
  }
  async #apply(operation: HostWindowOperation): Promise<boolean> {
    const { navigation, instances, port, mainPresentation } = this.dependencies;
    const { attempt_id: attemptId, transfer_token: token } = operation;
    if (operation.kind === 'close_instance') {
      const surfaceId = navigation.surfaceForAttempt(attemptId);
      if (surfaceId) instances.cancelPending(surfaceId);
      navigation.closeNativeAttempt(attemptId);
      await instances.close(attemptId);
      if (navigation.settleTransfer(token, 'terminated')) {
        this.dependencies.resumeMainPresentation?.();
        navigation.refreshSurface('main');
      }
      const closedSurface = operation.to_owner.windowLabel;
      const snapshot = this.#snapshots.get(closedSurface);
      const pending = instances.forSurface(closedSurface);
      if (
        closedSurface !== 'main' &&
        snapshot?.shell_epoch === operation.shell_epoch &&
        (!pending?.presentation || pending.presentation.attemptId === attemptId)
      ) {
        this.#openVersions.set(closedSurface, (this.#openVersions.get(closedSurface) ?? 0) + 1);
        instances.cancelPending(closedSurface);
        await pending?.attempt.terminate('manual_close');
        navigation.removeSurface(closedSurface);
        this.#surfaceHandlers.get(closedSurface)?.();
        this.#surfaceHandlers.delete(closedSurface);
        this.#snapshots.delete(closedSurface);
      }
      return true;
    }
    if (operation.kind === 'prepare_transfer') {
      const current = instances.forAttempt(attemptId)?.presentation?.owner;
      if (navigation.transferPending(token, attemptId)) return true;
      if (
        !current ||
        current.windowLabel !== operation.from_owner.windowLabel ||
        current.ownershipRevision !== operation.from_owner.ownershipRevision
      )
        return false;
      if (
        !navigation.prepareTransfer(token, attemptId, operation.from_owner.windowLabel, operation.to_owner.windowLabel)
      )
        return false;
      this.dependencies.suspendMainPresentation?.();
      if (!(await instances.freeze(attemptId))) return false;
      await this.dependencies.awaitMainRender?.();
      return true;
    }
    if (operation.kind === 'transfer_navigation') {
      const current = instances.forAttempt(attemptId)?.presentation?.owner;
      if (!navigation.transferPending(token, attemptId) || !current) return false;
      if (
        current.windowLabel === operation.to_owner.windowLabel &&
        current.ownershipRevision === operation.to_owner.ownershipRevision
      )
        return true;
      if (
        current.windowLabel !== operation.from_owner.windowLabel ||
        current.ownershipRevision !== operation.from_owner.ownershipRevision
      )
        return false;
      const snapshot = await port.readSnapshot(operation.to_owner.windowLabel);
      if (snapshot.shell_epoch !== operation.shell_epoch) return false;
      this.#registerShell(snapshot);
      if (
        !(await instances.changeOwner(
          attemptId,
          operation.to_owner,
          port.presentation(operation.shell_epoch),
          operation.shell_epoch,
        ))
      )
        return false;
      if (!navigation.stageTransfer(token, attemptId, operation.from_owner.windowLabel, operation.to_owner.windowLabel))
        return false;
      await this.dependencies.awaitMainRender?.();
      return true;
    }
    if (operation.kind === 'restore_navigation') {
      const current = instances.forAttempt(attemptId)?.presentation?.owner;
      if (!current) return false;
      const pending = navigation.transferPending(token, attemptId);
      const sourceBeforeMove =
        current.windowLabel === operation.to_owner.windowLabel &&
        current.ownershipRevision + 1n === operation.to_owner.ownershipRevision;
      const previouslyStaged =
        pending &&
        ((current.windowLabel === operation.from_owner.windowLabel &&
          current.ownershipRevision === operation.from_owner.ownershipRevision) ||
          (current.windowLabel === operation.to_owner.windowLabel &&
            current.ownershipRevision === operation.to_owner.ownershipRevision));
      if (!sourceBeforeMove && !previouslyStaged) return false;
      if (
        !pending &&
        !navigation.prepareTransfer(token, attemptId, operation.to_owner.windowLabel, operation.from_owner.windowLabel)
      )
        return false;
      if (!(await instances.changeOwner(attemptId, operation.to_owner, mainPresentation))) return false;
      if (
        !navigation.stageTransfer(
          token,
          attemptId,
          operation.to_owner.windowLabel,
          operation.from_owner.windowLabel,
          true,
        )
      )
        return false;
      await this.dependencies.awaitMainRender?.();
      const geometry = instances.measure(attemptId);
      if (!geometry) return false;
      this.#ackGeometry.set(operation.operation_id, geometry);
      return true;
    }
    if (operation.kind === 'set_main_home') {
      if (!navigation.transferPending(token, attemptId) || navigation.getActivePage('main') !== undefined) return false;
      await this.dependencies.awaitMainRender?.();
      return true;
    }
    if (operation.kind === 'settle_transfer' && operation.outcome) {
      if (operation.outcome === 'recovery_required' && !navigation.transferPending(token, attemptId)) {
        const binding = instances.forAttempt(attemptId);
        const current = binding?.presentation?.owner;
        if (
          !binding ||
          !current ||
          current.windowLabel !== operation.from_owner.windowLabel ||
          current.ownershipRevision !== operation.from_owner.ownershipRevision
        )
          return false;
        const snapshot = await port.readSnapshotByEpoch(operation.shell_epoch);
        if (
          snapshot.shell_epoch !== operation.shell_epoch ||
          snapshot.page.owner_id !== binding.descriptor.plugin_id ||
          snapshot.page.page_id !== binding.descriptor.page_id
        )
          return false;
        this.#registerShell(snapshot);
        if (!navigation.prepareTransfer(token, attemptId, operation.from_owner.windowLabel, snapshot.owner.windowLabel))
          return false;
        this.dependencies.suspendMainPresentation?.();
        if (!(await instances.freeze(attemptId))) return false;
      }
      if (operation.outcome !== 'terminated' && !navigation.transferPending(token, attemptId)) return false;
      if (operation.outcome === 'terminated') {
        navigation.closeNativeAttempt(attemptId);
        await instances.close(attemptId);
      } else {
        const binding = instances.forAttempt(attemptId);
        if (
          operation.outcome !== 'recovery_required' &&
          binding?.presentation &&
          (binding.presentation.owner.windowLabel !== operation.to_owner.windowLabel ||
            binding.presentation.owner.ownershipRevision !== operation.to_owner.ownershipRevision)
        ) {
          const controller =
            operation.to_owner.windowLabel === 'main' ? mainPresentation : port.presentation(operation.shell_epoch);
          if (
            !(await instances.changeOwner(
              attemptId,
              operation.to_owner,
              controller,
              operation.to_owner.windowLabel === 'main' ? undefined : operation.shell_epoch,
            ))
          )
            return false;
        }
        instances.settle(attemptId, operation.outcome === 'recovery_required');
      }
      const settled = navigation.settleTransfer(token, operation.outcome);
      if (settled && operation.outcome !== 'recovery_required') {
        this.dependencies.resumeMainPresentation?.();
        navigation.refreshSurface('main');
      }
      return true;
    }
    return false;
  }
  #registerShell(snapshot: HostWindowSnapshot) {
    const surface = snapshot.owner.windowLabel;
    this.#snapshots.set(surface, snapshot);
    this.dependencies.navigation.registerSurface(surface);
    if (this.#surfaceHandlers.has(surface)) return;
    const unsubscribe = this.dependencies.navigation.registerHandler((page, change) => {
      if (change?.reason === 'transfer' || change?.reason === 'restore') return;
      if (!page) {
        const instance = this.dependencies.instances.forSurface(surface);
        if (instance?.presentation) void this.dependencies.instances.close(instance.presentation.attemptId);
        return;
      }
      if (change?.reason === 'open') void this.#openPage(surface, page);
    }, surface);
    this.#surfaceHandlers.set(surface, unsubscribe);
  }
  #pageMetadata(page: ActivePage): HostWindowPage | undefined {
    const resolution = this.dependencies.navigation.resolvePage(page);
    if (!resolution) return undefined;
    const action = this.dependencies.actions
      ?.snapshot()
      .find((candidate) => candidate.action_id === page.opened_by_action_id);
    return {
      owner_id: page.owner_id,
      page_id: page.page_id,
      action_name: action
        ? resolveLauncherActionMetadata(action, this.#locale).title
        : resolveLocalizedPageText(resolution.page.title, this.#locale),
      title: resolveLocalizedPageText(resolution.page.title, this.#locale),
      plugin_name: resolveLocalizedPageText(resolution.provider.display_name, this.#locale),
    };
  }
  #publish(binding: PluginRuntimeInstanceBinding): Promise<void> {
    this.#publicationDirty.add(binding);
    const active = this.#publicationJobs.get(binding);
    if (active) return active;
    const job = (async () => {
      while (this.#publicationDirty.delete(binding) && !this.#disposed) await this.#publishCurrent(binding);
    })().finally(() => {
      this.#publicationJobs.delete(binding);
    });
    this.#publicationJobs.set(binding, job);
    return job;
  }
  async #publishCurrent(binding: PluginRuntimeInstanceBinding) {
    await this.#preferenceJob;
    if (this.#disposed || !binding.presentation || binding.phase !== 'stable') return;
    const { navigation, port } = this.dependencies;
    const page = navigation.getActivePage(binding.owner.surfaceId);
    if (!page || page.owner_id !== binding.descriptor.plugin_id || page.page_id !== binding.descriptor.page_id) return;
    const metadata = this.#pageMetadata(page);
    if (!metadata) return;
    try {
      if (binding.owner.surfaceId === 'main') await port.publishMain(binding.presentation, metadata);
      else if (binding.shellEpoch) {
        const snapshot = await port.publishShell(
          {
            shell_epoch: binding.shellEpoch,
            phase: binding.state.status === 'ready' ? 'active' : 'preparing',
            error_code: binding.state.status === 'failed' ? 'runtime_unavailable' : null,
          },
          binding.presentation.owner,
          metadata,
          binding.presentation,
        );
        if (!this.#disposed) this.#snapshots.set(binding.owner.surfaceId, snapshot);
      }
    } catch {
      /* Native currentness rejects obsolete metadata without changing Runtime authority. */
    }
  }
  async #openPage(surface: string, page: ActivePage) {
    const { navigation, instances, port, resolver } = this.dependencies;
    const version = (this.#openVersions.get(surface) ?? 0) + 1;
    this.#openVersions.set(surface, version);
    const current = () =>
      !this.#disposed && this.#openVersions.get(surface) === version && navigation.getActivePage(surface) === page;
    const previous = instances.forSurface(surface);
    if (
      previous?.descriptor.plugin_id === page.owner_id &&
      previous.descriptor.page_id === page.page_id &&
      previous.presentation &&
      previous.phase === 'stable'
    ) {
      await previous.controller.setVisible(previous.presentation, true).catch(() => undefined);
      await this.#publish(previous);
      return;
    }
    try {
      if (previous) await previous.attempt.terminate('navigation');
      if (!current()) return;
      const prior = this.#snapshots.get(surface);
      const metadata = this.#pageMetadata(page);
      const resolution = navigation.resolvePage(page);
      if (!prior || !metadata || !resolution) return;
      const owner = { windowLabel: surface, ownershipRevision: 1n };
      const pending = await port.publishShell(
        { shell_epoch: prior.shell_epoch, phase: 'preparing', error_code: null },
        owner,
        metadata,
        null,
      );
      if (!current()) return;
      this.#snapshots.set(surface, pending);
      const geometry = await port.geometry(prior.shell_epoch);
      if (!current()) return;
      await instances.openDetached({
        surfaceId: surface,
        shellEpoch: prior.shell_epoch,
        request: { activePage: page, pageResolution: resolution, attempt: 0 },
        resolver,
        controller: port.presentation(prior.shell_epoch),
        ...geometry,
        onNativeAttempt: (attemptId) => {
          if (current()) navigation.attachNativeActivationAttempt(page, attemptId, surface);
        },
        onFailure: () => {
          if (current())
            void port
              .publishShell(
                { shell_epoch: prior.shell_epoch, phase: 'preparing', error_code: 'runtime_unavailable' },
                owner,
                metadata,
                null,
              )
              .catch(() => undefined);
        },
      });
    } catch {
      /* A stale or unavailable native shell cannot redirect navigation to another surface. */
    }
  }
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.dependencies.instances.cancelPending();
    for (const cleanup of this.#cleanup.splice(0)) cleanup();
    for (const cleanup of this.#surfaceHandlers.values()) cleanup();
    this.#surfaceHandlers.clear();
    this.#snapshots.clear();
    this.#operations.clear();
    this.#ackGeometry.clear();
    this.#publicationDirty.clear();
    this.#publicationJobs.clear();
  }
}
