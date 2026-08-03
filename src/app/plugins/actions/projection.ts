import type { DefaultLauncherActionService } from '../../launcher/actions/service';
import type { LauncherActionRegistrationInput, LauncherActionRegistrationResult } from '../../launcher/actions/types';
import type {
  PluginRegistrationDesktopAdapter,
  PluginRegistrationDetailResponse,
  PluginRegistrationSnapshot,
  PluginRegistrationSummary,
} from '../registration';
import { mapPluginActionsToLauncherRegistrations, type PluginActionPageOpener } from './mapper';

export type PluginActionProjectionDiagnosticCode =
  | 'detail_read_failed'
  | 'detail_mismatch'
  | 'projection_failed'
  | 'registry_replacement_failed';

export interface PluginActionProjectionDiagnostic {
  readonly code: PluginActionProjectionDiagnosticCode;
  readonly plugin_id?: string;
  readonly message: string;
}

export interface PluginActionProjectionRegistry {
  replaceProviderBatch: (
    providerOwner: string,
    registrations: readonly LauncherActionRegistrationInput[],
  ) => LauncherActionRegistrationResult;
}

export interface PluginActionProjectionDependencies {
  readonly registrationAdapter: PluginRegistrationDesktopAdapter;
  readonly registry: PluginActionProjectionRegistry;
  readonly pageOpener: PluginActionPageOpener;
  readonly onDiagnostic?: (diagnostic: PluginActionProjectionDiagnostic) => void;
}

export interface PluginActionProjectionService {
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  handleLauncherActivation: () => Promise<void>;
  recoverListener: () => Promise<void>;
  whenIdle: () => Promise<void>;
  destroy: () => Promise<void>;
}

const safeDiagnosticMessage: Readonly<Record<PluginActionProjectionDiagnosticCode, string>> = Object.freeze({
  detail_read_failed: 'Plugin Action detail could not be read.',
  detail_mismatch: 'Plugin Action detail did not match the current registration.',
  projection_failed: 'Plugin Actions could not be projected.',
  registry_replacement_failed: 'Plugin Actions could not be published.',
});

const isEligible = (
  entry: PluginRegistrationSummary,
): entry is Extract<PluginRegistrationSummary, { readonly kind: 'registered' }> =>
  entry.kind === 'registered' && entry.enabled && entry.compatibility.lensx && entry.compatibility.host_api;

export const createPluginActionProjectionService = ({
  registrationAdapter,
  registry,
  pageOpener,
  onDiagnostic,
}: PluginActionProjectionDependencies): PluginActionProjectionService => {
  const knownProviders = new Set<string>();
  let latestObservedSnapshot: PluginRegistrationSnapshot | undefined;
  let pendingSnapshot: PluginRegistrationSnapshot | undefined;
  let lastSettledRevision: string | undefined;
  let drainPromise: Promise<void> | undefined;
  let destroyed = false;

  const report = (code: PluginActionProjectionDiagnosticCode, pluginId?: string) => {
    try {
      onDiagnostic?.(
        Object.freeze({
          code,
          ...(pluginId ? { plugin_id: pluginId } : {}),
          message: safeDiagnosticMessage[code],
        }),
      );
    } catch {
      // Diagnostics are observational and must not interrupt projection convergence.
    }
  };

  const replace = (
    pluginId: string,
    registrations: readonly LauncherActionRegistrationInput[],
  ): LauncherActionRegistrationResult => registry.replaceProviderBatch(pluginId, registrations);

  const unregister = (pluginId: string) => {
    if (destroyed) {
      return;
    }
    try {
      const result = replace(pluginId, []);
      if (result.ok) {
        return;
      }
    } catch {
      // Registry implementation details are contained by the projection boundary.
    }
    if (!destroyed) {
      report('registry_replacement_failed', pluginId);
    }
  };

  const failClosed = (pluginId: string, code: PluginActionProjectionDiagnosticCode) => {
    unregister(pluginId);
    report(code, pluginId);
  };

  const isCurrent = (revision: string) => !destroyed && latestObservedSnapshot?.revision === revision;

  const reconcile = async (snapshot: PluginRegistrationSnapshot) => {
    const currentProviderIds = new Set<string>();
    for (const entry of snapshot.entries) {
      if (entry.kind === 'registered') {
        currentProviderIds.add(entry.plugin_id);
      } else if (entry.plugin_id !== undefined) {
        currentProviderIds.add(entry.plugin_id);
      }
    }

    for (const pluginId of knownProviders) {
      if (!currentProviderIds.has(pluginId)) {
        unregister(pluginId);
        knownProviders.delete(pluginId);
      }
    }

    if (snapshot.availability.kind === 'degraded') {
      for (const pluginId of currentProviderIds) {
        knownProviders.add(pluginId);
        unregister(pluginId);
      }
      return;
    }

    for (const entry of snapshot.entries) {
      const pluginId = entry.plugin_id;
      if (pluginId !== undefined) {
        knownProviders.add(pluginId);
      }
      if (!isEligible(entry)) {
        if (pluginId !== undefined) {
          unregister(pluginId);
        }
        continue;
      }

      let response: PluginRegistrationDetailResponse;
      try {
        response = await registrationAdapter.readDetail(entry.entry_id);
      } catch {
        if (!isCurrent(snapshot.revision)) {
          return;
        }
        failClosed(entry.plugin_id, 'detail_read_failed');
        continue;
      }

      if (!isCurrent(snapshot.revision)) {
        return;
      }
      if (
        response.revision !== snapshot.revision ||
        response.detail.kind !== 'registered' ||
        response.detail.entry_id !== entry.entry_id ||
        response.detail.manifest.plugin_id !== entry.plugin_id
      ) {
        failClosed(entry.plugin_id, 'detail_mismatch');
        continue;
      }

      let registrations: readonly LauncherActionRegistrationInput[];
      try {
        registrations = mapPluginActionsToLauncherRegistrations(response.detail.manifest, pageOpener);
      } catch {
        failClosed(entry.plugin_id, 'projection_failed');
        continue;
      }

      if (!isCurrent(snapshot.revision)) {
        return;
      }
      try {
        const result = replace(entry.plugin_id, registrations);
        if (result.ok) {
          continue;
        }
      } catch {
        // The same fail-closed path handles typed and thrown replacement failures.
      }
      if (isCurrent(snapshot.revision)) {
        failClosed(entry.plugin_id, 'registry_replacement_failed');
      }
    }
  };

  const drain = () => {
    if (drainPromise !== undefined) {
      return drainPromise;
    }
    drainPromise = (async () => {
      while (!destroyed && pendingSnapshot !== undefined) {
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
    if (latestObservedSnapshot !== undefined && BigInt(snapshot.revision) < BigInt(latestObservedSnapshot.revision)) {
      return;
    }
    latestObservedSnapshot = snapshot;
    pendingSnapshot = snapshot;
    void drain();
  };

  const unsubscribe = registrationAdapter.subscribe(observe, () => {
    // The adapter already maps errors to safe values and recovers through a full snapshot.
  });

  const converge = async (operation: () => Promise<PluginRegistrationSnapshot>) => {
    const snapshot = await operation();
    observe(snapshot);
    await drain();
  };

  return Object.freeze({
    initialize: () => converge(registrationAdapter.initialize),
    refresh: () => converge(registrationAdapter.refresh),
    handleLauncherActivation: () => converge(registrationAdapter.handleLauncherActivation),
    recoverListener: () => converge(registrationAdapter.recoverListener),
    whenIdle: async () => {
      while (drainPromise !== undefined) {
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
      await registrationAdapter.destroy();
    },
  });
};

export const createPluginActionProjectionForLauncherService = (
  actionService: DefaultLauncherActionService,
  registrationAdapter: PluginRegistrationDesktopAdapter,
  pageOpener: PluginActionPageOpener,
  onDiagnostic?: (diagnostic: PluginActionProjectionDiagnostic) => void,
) =>
  createPluginActionProjectionService({
    registrationAdapter,
    registry: actionService.registry,
    pageOpener,
    ...(onDiagnostic ? { onDiagnostic } : {}),
  });
