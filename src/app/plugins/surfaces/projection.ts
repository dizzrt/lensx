import type { DefaultLauncherActionService } from '../../launcher/actions';
import type { LauncherActionRegistrationInput, LauncherActionRegistrationResult } from '../../launcher/actions/types';
import type { AppNavigationService, PageProviderBatch, PageRegistryReplacementResult } from '../../navigation';
import { mapPluginActionsToLauncherRegistrations } from '../actions';
import { mapPluginRegistrationToPageProviderBatch } from '../pages';
import {
  createPluginRegistrationDesktopAdapter,
  type PluginRegistrationDesktopAdapter,
  type PluginRegistrationDetailResponse,
  type PluginRegistrationSnapshot,
  type PluginRegistrationSummary,
} from '../registration';

export type PluginSurfaceProjectionDiagnosticCode =
  | 'detail_read_failed'
  | 'detail_mismatch'
  | 'projection_failed'
  | 'page_registry_replacement_failed'
  | 'action_registry_replacement_failed';

export interface PluginSurfaceProjectionDiagnostic {
  readonly code: PluginSurfaceProjectionDiagnosticCode;
  readonly plugin_id?: string;
  readonly message: string;
}

export interface PluginSurfaceActionRegistry {
  replaceProviderBatch: (
    providerOwner: string,
    registrations: readonly LauncherActionRegistrationInput[],
  ) => LauncherActionRegistrationResult;
}

export interface PluginSurfacePageRegistry {
  replaceProviderBatch: (
    providerOwner: string,
    batch: PageProviderBatch | readonly [],
  ) => PageRegistryReplacementResult;
}

export interface PluginSurfaceProjectionDependencies {
  readonly actionRegistry: PluginSurfaceActionRegistry;
  readonly navigationService: Pick<AppNavigationService, 'openPage'>;
  readonly onDiagnostic?: (diagnostic: PluginSurfaceProjectionDiagnostic) => void;
  readonly pageRegistry: PluginSurfacePageRegistry;
  readonly registrationAdapter: PluginRegistrationDesktopAdapter;
}

export interface PluginSurfaceProjectionService {
  readonly currentSnapshot: () => PluginRegistrationSnapshot | undefined;
  readonly destroy: () => Promise<void>;
  readonly handleLauncherActivation: () => Promise<void>;
  readonly initialize: () => Promise<void>;
  readonly recoverListener: () => Promise<void>;
  readonly quiesceProvider: (pluginId: string) => Promise<void>;
  readonly reconcileRevision: (targetRevision: string, pluginId?: string) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly whenIdle: () => Promise<void>;
}

export class PluginSurfaceProjectionError extends Error {
  readonly code: PluginSurfaceProjectionDiagnosticCode | 'destroyed' | 'revision_not_observed';
  readonly plugin_id?: string;

  constructor(
    code: PluginSurfaceProjectionDiagnosticCode | 'destroyed' | 'revision_not_observed',
    message: string,
    pluginId?: string,
  ) {
    super(message);
    this.name = 'PluginSurfaceProjectionError';
    this.code = code;
    this.plugin_id = pluginId;
  }
}

const safeMessages: Readonly<Record<PluginSurfaceProjectionDiagnosticCode, string>> = Object.freeze({
  detail_read_failed: 'Plugin surface detail could not be read.',
  detail_mismatch: 'Plugin surface detail did not match the current registration.',
  projection_failed: 'Plugin surface metadata could not be projected.',
  page_registry_replacement_failed: 'Plugin Pages could not be published.',
  action_registry_replacement_failed: 'Plugin Actions could not be published.',
});

const isEligible = (
  entry: PluginRegistrationSummary,
): entry is Extract<PluginRegistrationSummary, { readonly kind: 'registered' }> =>
  entry.kind === 'registered' && entry.enabled && entry.compatibility.lensx && entry.compatibility.host_api;

export const createPluginSurfaceProjectionService = ({
  actionRegistry,
  navigationService,
  onDiagnostic,
  pageRegistry,
  registrationAdapter,
}: PluginSurfaceProjectionDependencies): PluginSurfaceProjectionService => {
  const knownProviders = new Set<string>();
  const providerFailures = new Map<string, PluginSurfaceProjectionDiagnosticCode>();
  let latestObservedSnapshot: PluginRegistrationSnapshot | undefined;
  let pendingSnapshot: PluginRegistrationSnapshot | undefined;
  let lastSettledRevision: string | undefined;
  let drainPromise: Promise<void> | undefined;
  let destroyed = false;
  let recoverFromListener = () => undefined;

  const report = (code: PluginSurfaceProjectionDiagnosticCode, pluginId?: string) => {
    try {
      onDiagnostic?.(
        Object.freeze({
          code,
          ...(pluginId ? { plugin_id: pluginId } : {}),
          message: safeMessages[code],
        }),
      );
    } catch {
      // Diagnostics are observational and cannot interrupt convergence.
    }
  };

  const replaceActions = (pluginId: string, registrations: readonly LauncherActionRegistrationInput[]) =>
    actionRegistry.replaceProviderBatch(pluginId, registrations);
  const replacePages = (pluginId: string, batch: PageProviderBatch | readonly []) =>
    pageRegistry.replaceProviderBatch(pluginId, batch);

  const unregister = (pluginId: string, reportFailures = true) => {
    let actionOk = false;
    let pageOk = false;
    try {
      actionOk = replaceActions(pluginId, []).ok;
    } catch {
      actionOk = false;
    }
    try {
      pageOk = replacePages(pluginId, []).ok;
    } catch {
      pageOk = false;
    }
    if (reportFailures && !destroyed) {
      if (!actionOk) {
        report('action_registry_replacement_failed', pluginId);
      }
      if (!pageOk) {
        report('page_registry_replacement_failed', pluginId);
      }
    }
    if (actionOk && pageOk) {
      providerFailures.delete(pluginId);
    }
    return actionOk && pageOk;
  };

  const failClosed = (pluginId: string, code: PluginSurfaceProjectionDiagnosticCode) => {
    providerFailures.set(pluginId, code);
    unregister(pluginId);
    providerFailures.set(pluginId, code);
    report(code, pluginId);
  };

  const isCurrent = (revision: string) => !destroyed && latestObservedSnapshot?.revision === revision;

  const reconcileProvider = async (
    snapshot: PluginRegistrationSnapshot,
    entry: Extract<PluginRegistrationSummary, { readonly kind: 'registered' }>,
  ) => {
    let response: PluginRegistrationDetailResponse;
    try {
      response = await registrationAdapter.readDetail(entry.entry_id);
    } catch {
      if (isCurrent(snapshot.revision)) {
        failClosed(entry.plugin_id, 'detail_read_failed');
      }
      return;
    }
    if (!isCurrent(snapshot.revision)) {
      return;
    }
    if (
      response.revision !== snapshot.revision ||
      response.detail.kind !== 'registered' ||
      response.detail.entry_id !== entry.entry_id ||
      response.detail.manifest.plugin_id !== entry.plugin_id ||
      response.detail.enabled !== entry.enabled ||
      response.detail.compatibility.lensx !== entry.compatibility.lensx ||
      response.detail.compatibility.host_api !== entry.compatibility.host_api
    ) {
      failClosed(entry.plugin_id, 'detail_mismatch');
      return;
    }

    let pageBatch: PageProviderBatch | undefined;
    let actions: readonly LauncherActionRegistrationInput[];
    try {
      pageBatch = mapPluginRegistrationToPageProviderBatch(response.detail);
      if (!pageBatch) {
        failClosed(entry.plugin_id, 'detail_mismatch');
        return;
      }
      const availablePageIds = new Set(
        pageBatch.pages.filter(({ available }) => available).map(({ page_id: pageId }) => pageId),
      );
      actions = mapPluginActionsToLauncherRegistrations(
        response.detail.manifest,
        {
          openPage: (target, actionId) => {
            navigationService.openPage(target, actionId);
          },
        },
        ({ owner_id: ownerId, page_id: pageId }) => ownerId === entry.plugin_id && availablePageIds.has(pageId),
      );
    } catch {
      failClosed(entry.plugin_id, 'projection_failed');
      return;
    }

    if (!isCurrent(snapshot.revision)) {
      return;
    }
    try {
      if (!replacePages(entry.plugin_id, pageBatch).ok) {
        failClosed(entry.plugin_id, 'page_registry_replacement_failed');
        return;
      }
    } catch {
      failClosed(entry.plugin_id, 'page_registry_replacement_failed');
      return;
    }

    if (!isCurrent(snapshot.revision)) {
      unregister(entry.plugin_id);
      return;
    }
    try {
      if (replaceActions(entry.plugin_id, actions).ok) {
        providerFailures.delete(entry.plugin_id);
        return;
      }
    } catch {
      // The shared rollback below contains both typed and thrown failures.
    }
    failClosed(entry.plugin_id, 'action_registry_replacement_failed');
  };

  const reconcile = async (snapshot: PluginRegistrationSnapshot) => {
    const currentProviderIds = new Set(
      snapshot.entries.flatMap((entry) => (entry.plugin_id === undefined ? [] : [entry.plugin_id])),
    );
    for (const pluginId of knownProviders) {
      if (!currentProviderIds.has(pluginId)) {
        unregister(pluginId);
        knownProviders.delete(pluginId);
      }
    }

    if (snapshot.availability.kind === 'degraded') {
      for (const pluginId of new Set([...knownProviders, ...currentProviderIds])) {
        knownProviders.add(pluginId);
        unregister(pluginId);
      }
      return;
    }

    for (const entry of snapshot.entries) {
      if (entry.plugin_id !== undefined) {
        knownProviders.add(entry.plugin_id);
      }
      if (!isEligible(entry)) {
        if (entry.plugin_id !== undefined) {
          unregister(entry.plugin_id);
        }
        continue;
      }
      await reconcileProvider(snapshot, entry);
      if (!isCurrent(snapshot.revision)) {
        return;
      }
    }
  };

  const drain = () => {
    if (drainPromise) {
      return drainPromise;
    }
    drainPromise = (async () => {
      while (!destroyed && pendingSnapshot) {
        const snapshot = pendingSnapshot;
        pendingSnapshot = undefined;
        if (snapshot.revision === lastSettledRevision) {
          continue;
        }
        await reconcile(snapshot);
        if (isCurrent(snapshot.revision)) {
          lastSettledRevision = snapshot.revision;
        }
      }
    })().finally(() => {
      drainPromise = undefined;
    });
    return drainPromise;
  };

  const observe = (snapshot: PluginRegistrationSnapshot) => {
    if (destroyed) {
      return;
    }
    if (latestObservedSnapshot && BigInt(snapshot.revision) < BigInt(latestObservedSnapshot.revision)) {
      return;
    }
    latestObservedSnapshot = snapshot;
    pendingSnapshot = snapshot;
    void drain();
  };

  const unsubscribe = registrationAdapter.subscribe(observe, () => recoverFromListener());

  const converge = async (operation: () => Promise<PluginRegistrationSnapshot>) => {
    if (destroyed) {
      return;
    }
    const snapshot = await operation();
    observe(snapshot);
    await drain();
  };

  const projectionError = (code: PluginSurfaceProjectionDiagnosticCode, pluginId: string) =>
    new PluginSurfaceProjectionError(code, safeMessages[code], pluginId);

  const quiesceProvider = async (pluginId: string) => {
    if (destroyed) {
      throw new PluginSurfaceProjectionError('destroyed', 'Plugin surface projection is unavailable.', pluginId);
    }
    let actionOk = false;
    try {
      actionOk = replaceActions(pluginId, []).ok;
    } catch {
      actionOk = false;
    }
    if (!actionOk) {
      providerFailures.set(pluginId, 'action_registry_replacement_failed');
      report('action_registry_replacement_failed', pluginId);
      throw projectionError('action_registry_replacement_failed', pluginId);
    }
    let pageOk = false;
    try {
      pageOk = replacePages(pluginId, []).ok;
    } catch {
      pageOk = false;
    }
    if (!pageOk) {
      providerFailures.set(pluginId, 'page_registry_replacement_failed');
      report('page_registry_replacement_failed', pluginId);
      throw projectionError('page_registry_replacement_failed', pluginId);
    }
    knownProviders.add(pluginId);
    providerFailures.delete(pluginId);
  };

  const service: PluginSurfaceProjectionService = Object.freeze({
    currentSnapshot: () => latestObservedSnapshot,
    initialize: () => converge(registrationAdapter.initialize),
    refresh: () => converge(registrationAdapter.refresh),
    handleLauncherActivation: () => converge(registrationAdapter.handleLauncherActivation),
    recoverListener: () => converge(registrationAdapter.recoverListener),
    quiesceProvider,
    async reconcileRevision(targetRevision: string, pluginId?: string) {
      if (destroyed) {
        throw new PluginSurfaceProjectionError('destroyed', 'Plugin surface projection is unavailable.', pluginId);
      }
      await converge(registrationAdapter.refresh);
      if (latestObservedSnapshot === undefined || BigInt(latestObservedSnapshot.revision) < BigInt(targetRevision)) {
        throw new PluginSurfaceProjectionError(
          'revision_not_observed',
          'Plugin surface revision was not observed.',
          pluginId,
        );
      }
      if (pluginId !== undefined) {
        const failure = providerFailures.get(pluginId);
        if (failure !== undefined) {
          throw projectionError(failure, pluginId);
        }
      }
    },
    whenIdle: async () => {
      while (drainPromise) {
        await drainPromise;
      }
    },
    async destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      pendingSnapshot = undefined;
      unsubscribe();
      await drainPromise;
      for (const pluginId of knownProviders) {
        unregister(pluginId, false);
      }
      knownProviders.clear();
      providerFailures.clear();
      await registrationAdapter.destroy();
    },
  });
  recoverFromListener = () => {
    void service.recoverListener().catch(() => undefined);
  };
  return service;
};

export const createPluginSurfaceProjectionForLauncher = (
  actionService: DefaultLauncherActionService,
  pageRegistry: PluginSurfacePageRegistry,
  navigationService: AppNavigationService,
  registrationAdapter: PluginRegistrationDesktopAdapter,
  onDiagnostic?: (diagnostic: PluginSurfaceProjectionDiagnostic) => void,
) =>
  createPluginSurfaceProjectionService({
    actionRegistry: actionService.registry,
    pageRegistry,
    navigationService,
    registrationAdapter,
    ...(onDiagnostic ? { onDiagnostic } : {}),
  });

export const createProductionPluginSurfaceProjection = (
  actionService: DefaultLauncherActionService,
  pageRegistry: PluginSurfacePageRegistry,
  navigationService: AppNavigationService,
) => {
  let current: PluginSurfaceProjectionService | undefined;
  const ensure = () => {
    current ??= createPluginSurfaceProjectionForLauncher(
      actionService,
      pageRegistry,
      navigationService,
      createPluginRegistrationDesktopAdapter(),
    );
    return current;
  };
  return Object.freeze({
    currentSnapshot: () => ensure().currentSnapshot(),
    initialize: () => ensure().initialize(),
    refresh: () => ensure().refresh(),
    handleLauncherActivation: () => ensure().handleLauncherActivation(),
    recoverListener: () => ensure().recoverListener(),
    quiesceProvider: (pluginId: string) => ensure().quiesceProvider(pluginId),
    reconcileRevision: (targetRevision: string, pluginId?: string) =>
      ensure().reconcileRevision(targetRevision, pluginId),
    whenIdle: () => ensure().whenIdle(),
    async destroy() {
      const service = current;
      current = undefined;
      await service?.destroy();
    },
  });
};
