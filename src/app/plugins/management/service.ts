import type { PluginRegistrationDetail, PluginRegistrationSnapshot, PluginRegistrationSummary } from '../registration';
import type {
  PluginManagementDetailView,
  PluginManagementEntry,
  PluginManagementFeedback,
  PluginManagementFeedbackCode,
  PluginManagementMutation,
  PluginManagementOperationAvailability,
  PluginManagementService,
  PluginManagementServiceDependencies,
  PluginManagementViewModel,
} from './types';

const EMPTY_OPERATIONS: PluginManagementOperationAvailability = Object.freeze({
  install: false,
  enable: false,
  disable: false,
  replace: false,
  uninstall: false,
  clear_data: false,
  retry: false,
});

const freezeArray = <T>(items: readonly T[]): readonly T[] => Object.freeze([...items]);
const feedback = (
  kind: PluginManagementFeedback['kind'],
  code: PluginManagementFeedbackCode,
  facts: Pick<PluginManagementFeedback, 'plugin_id' | 'version'> = {},
): PluginManagementFeedback => Object.freeze({ kind, code, ...facts });

const mapEntry = (entry: PluginRegistrationSummary): PluginManagementEntry =>
  entry.kind === 'registered'
    ? Object.freeze({
        kind: entry.kind,
        entry_id: entry.entry_id,
        plugin_id: entry.plugin_id,
        version: entry.version,
        display: entry.display,
        source: entry.source,
        enabled: entry.enabled,
        compatibility: entry.compatibility,
        runtime: entry.runtime,
      })
    : Object.freeze({
        kind: entry.kind,
        entry_id: entry.entry_id,
        ...(entry.plugin_id ? { plugin_id: entry.plugin_id } : {}),
        diagnostic: entry.diagnostic,
      });

const mapDetail = (detail: PluginRegistrationDetail): PluginManagementDetailView =>
  detail.kind === 'quarantined'
    ? Object.freeze({
        kind: detail.kind,
        entry_id: detail.entry_id,
        ...(detail.plugin_id ? { plugin_id: detail.plugin_id } : {}),
        diagnostic: detail.diagnostic,
      })
    : Object.freeze({
        kind: detail.kind,
        entry_id: detail.entry_id,
        manifest: detail.manifest,
        source: detail.source,
        enabled: detail.enabled,
        compatibility: detail.compatibility,
        runtime: detail.runtime,
        diagnostics: freezeArray(detail.diagnostics),
      });

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

const mapMutationFailure = (error: unknown): PluginManagementFeedbackCode => {
  const code = errorCode(error);
  if (code === 'conflict' || code === 'stale_revision' || code === 'invalid_current_state') return 'conflict';
  if (code === 'plugin_enabled') return 'plugin_enabled';
  if (code === 'not_found') return 'not_found';
  if (code === 'busy') return 'busy';
  if (code === 'unsafe_storage' || code === 'unsafe_state' || code === 'unsafe_cleanup') return 'unsafe_storage';
  if (code === 'unavailable' || code === 'destroyed') return 'unavailable';
  if (code === 'surface_convergence_failed') return 'convergence_failed';
  return 'mutation_failed';
};

const isCommittedFailure = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'committed_revision' in error &&
  typeof error.committed_revision === 'string';

export const createPluginManagementService = ({
  surfaceProjection,
  installationService,
  lifecycleService,
  replacementService,
  dataManagementService,
  developmentService,
}: PluginManagementServiceDependencies): PluginManagementService => {
  const listeners = new Set<(view: PluginManagementViewModel) => void>();
  let snapshot: PluginRegistrationSnapshot | undefined;
  let selectedEntryId: string | undefined;
  let detail: PluginManagementDetailView = Object.freeze({ kind: 'none' });
  let mutation: PluginManagementMutation | undefined;
  let confirmation: PluginManagementViewModel['confirmation'];
  let currentFeedback: PluginManagementFeedback | undefined;
  let loadFailed = false;
  let detailRequest = 0;
  let destroyed = false;
  let selectionTarget: { readonly plugin_id: string; readonly version: string } | undefined;
  let development = developmentService?.current();

  const selectedSummary = () => snapshot?.entries.find((entry) => entry.entry_id === selectedEntryId);

  const operations = (): PluginManagementOperationAvailability => {
    if (snapshot === undefined) {
      return Object.freeze({ ...EMPTY_OPERATIONS, retry: loadFailed });
    }
    const available = snapshot.availability.kind === 'available';
    const idle = mutation === undefined && confirmation === undefined && available;
    const selected = selectedSummary();
    return Object.freeze({
      install: idle,
      enable: idle && selected?.kind === 'registered' && !selected.enabled,
      disable: idle && selected?.kind === 'registered' && selected.enabled,
      replace: idle && selected?.kind === 'registered' && selected.source === 'external',
      uninstall:
        idle && selected !== undefined && (selected.kind === 'quarantined' || selected.source !== 'development'),
      clear_data: idle && selected?.kind === 'registered' && !selected.enabled,
      retry: mutation === undefined,
    });
  };

  const buildView = (): PluginManagementViewModel => {
    const entries = freezeArray((snapshot?.entries ?? []).map(mapEntry));
    const state =
      snapshot === undefined
        ? loadFailed
          ? 'error'
          : 'loading'
        : snapshot.availability.kind === 'degraded'
          ? 'degraded'
          : entries.length === 0
            ? 'empty'
            : 'ready';
    return Object.freeze({
      state,
      ...(snapshot ? { revision: snapshot.revision } : {}),
      entries,
      ...(selectedEntryId ? { selected_entry_id: selectedEntryId } : {}),
      detail,
      operations: operations(),
      ...(mutation ? { mutation } : {}),
      ...(confirmation ? { confirmation } : {}),
      ...(currentFeedback ? { feedback: currentFeedback } : {}),
      ...(snapshot?.availability.kind === 'degraded' ? { diagnostic: snapshot.availability.diagnostic } : {}),
      ...(development?.visible ? { development } : {}),
    });
  };

  let currentView = buildView();
  const publish = () => {
    currentView = buildView();
    for (const listener of listeners) listener(currentView);
  };
  const unsubscribeDevelopment = developmentService?.subscribe((next) => {
    development = next;
    publish();
  });

  const loadDetail = async (source: PluginRegistrationSnapshot, entryId: string) => {
    const request = ++detailRequest;
    detail = Object.freeze({ kind: 'loading', entry_id: entryId });
    publish();
    try {
      const response = await surfaceProjection.readRegistrationDetail(entryId);
      if (
        destroyed ||
        request !== detailRequest ||
        snapshot?.revision !== source.revision ||
        selectedEntryId !== entryId
      ) {
        return;
      }
      if (response.revision !== source.revision || response.detail.entry_id !== entryId) {
        detail = Object.freeze({ kind: 'error', entry_id: entryId, code: 'detail_failed' });
        currentFeedback = feedback('error', 'conflict');
        publish();
        await surfaceProjection.refresh();
        return;
      }
      detail = mapDetail(response.detail);
      if (currentFeedback?.code === 'detail_failed') currentFeedback = undefined;
      publish();
    } catch {
      if (destroyed || request !== detailRequest || selectedEntryId !== entryId) return;
      detail = Object.freeze({ kind: 'error', entry_id: entryId, code: 'detail_failed' });
      currentFeedback = feedback('error', 'detail_failed');
      publish();
    }
  };

  const observe = (next: PluginRegistrationSnapshot) => {
    if (destroyed) return;
    const previous = snapshot;
    const previousIndex = previous?.entries.findIndex((entry) => entry.entry_id === selectedEntryId) ?? -1;
    snapshot = next;
    loadFailed = false;
    if (confirmation?.kind === 'replacement' && confirmation.expected_revision !== next.revision) {
      confirmation = undefined;
      currentFeedback = feedback('error', 'conflict');
      void replacementService.cancelPrepared().catch(() => undefined);
    }
    const targeted = selectionTarget
      ? next.entries.find(
          (entry) =>
            entry.kind === 'registered' &&
            entry.plugin_id === selectionTarget?.plugin_id &&
            entry.version === selectionTarget.version,
        )
      : undefined;
    if (targeted) {
      selectedEntryId = targeted.entry_id;
      selectionTarget = undefined;
    } else if (!next.entries.some((entry) => entry.entry_id === selectedEntryId)) {
      const fallbackIndex = Math.max(0, Math.min(previousIndex, next.entries.length - 1));
      selectedEntryId = next.entries[fallbackIndex]?.entry_id;
    }
    if (next.availability.kind === 'degraded' || selectedEntryId === undefined) {
      detailRequest += 1;
      detail = Object.freeze({ kind: 'none' });
      publish();
      return;
    }
    publish();
    void loadDetail(next, selectedEntryId);
  };

  const unsubscribe = surfaceProjection.subscribeSnapshot(observe);
  const initialSnapshot = surfaceProjection.currentSnapshot();
  if (initialSnapshot) observe(initialSnapshot);

  const runMutation = async (kind: PluginManagementMutation, operation: () => Promise<void>) => {
    if (destroyed) return;
    if (mutation !== undefined) {
      currentFeedback = feedback('error', 'busy');
      publish();
      return;
    }
    mutation = kind;
    currentFeedback = undefined;
    publish();
    try {
      await operation();
    } catch (error) {
      currentFeedback = feedback('error', isCommittedFailure(error) ? 'convergence_failed' : mapMutationFailure(error));
      if (mapMutationFailure(error) === 'conflict') {
        confirmation = undefined;
        await surfaceProjection.refresh().catch(() => undefined);
      }
    } finally {
      mutation = undefined;
      publish();
    }
  };

  const currentInput = () => {
    const entry = selectedSummary();
    if (!snapshot || !entry || snapshot.availability.kind !== 'available') return undefined;
    return { entry, entry_id: entry.entry_id, expected_revision: snapshot.revision } as const;
  };

  const service: PluginManagementService = Object.freeze({
    current: () => currentView,
    subscribe(listener: Parameters<PluginManagementService['subscribe']>[0]) {
      listeners.add(listener);
      listener(currentView);
      return () => listeners.delete(listener);
    },
    async initialize() {
      if (destroyed) return;
      loadFailed = false;
      publish();
      try {
        await Promise.all([surfaceProjection.initialize(), developmentService?.initialize()]);
        const current = surfaceProjection.currentSnapshot();
        if (current && current !== snapshot) observe(current);
      } catch {
        loadFailed = true;
        currentFeedback = feedback('error', 'load_failed');
        publish();
      }
    },
    async refresh() {
      if (destroyed) return;
      try {
        await surfaceProjection.refresh();
        const current = surfaceProjection.currentSnapshot();
        if (current && current !== snapshot) observe(current);
      } catch {
        loadFailed = snapshot === undefined;
        currentFeedback = feedback('error', 'load_failed');
        publish();
      }
    },
    async select(entryId: string) {
      if (!snapshot?.entries.some((entry) => entry.entry_id === entryId)) return;
      selectedEntryId = entryId;
      currentFeedback = undefined;
      await loadDetail(snapshot, entryId);
    },
    async prepareInstallation() {
      await runMutation('prepare_installation', async () => {
        const result = await installationService.prepare();
        if (result.status === 'cancelled') {
          currentFeedback = feedback('status', 'cancelled');
          return;
        }
        confirmation = Object.freeze({
          kind: 'installation',
          candidate: result.candidate,
        });
      });
    },
    async commitInstallation() {
      if (confirmation?.kind !== 'installation') return;
      await runMutation('commit_installation', async () => {
        const result = await installationService.commitPrepared();
        confirmation = undefined;
        selectionTarget = Object.freeze({ plugin_id: result.plugin_id, version: result.version });
        try {
          await surfaceProjection.reconcileRevision(result.revision, result.plugin_id);
          await surfaceProjection.whenIdle();
          currentFeedback = feedback('status', 'install_succeeded', {
            plugin_id: result.plugin_id,
            version: result.version,
          });
        } catch {
          currentFeedback = feedback('error', 'convergence_failed', {
            plugin_id: result.plugin_id,
            version: result.version,
          });
          await surfaceProjection.refresh().catch(() => undefined);
        }
      });
    },
    async cancelInstallation() {
      confirmation = undefined;
      await installationService.cancelPrepared().catch(() => undefined);
      currentFeedback = feedback('status', 'cancelled');
      publish();
    },
    async setEnabled(enabled: boolean) {
      const input = currentInput();
      if (!input || input.entry.kind !== 'registered') return;
      await runMutation('set_enabled', async () => {
        await lifecycleService.setEnabled({
          entry_id: input.entry_id,
          expected_revision: input.expected_revision,
          enabled,
        });
        currentFeedback = feedback('status', 'set_enabled_succeeded');
      });
    },
    async prepareReplacement() {
      const input = currentInput();
      if (!input || input.entry.kind !== 'registered' || input.entry.source !== 'external') return;
      await runMutation('prepare_replacement', async () => {
        const result = await replacementService.prepare({
          entry_id: input.entry_id,
          expected_revision: input.expected_revision,
        });
        if (result.status === 'cancelled') {
          currentFeedback = feedback('status', 'cancelled');
        } else if (result.status === 'duplicate') {
          currentFeedback = feedback('status', 'duplicate');
        } else if (result.status === 'prepared') {
          confirmation = Object.freeze({
            kind: 'replacement',
            entry_id: result.entry_id,
            expected_revision: input.expected_revision,
            current_version: result.current_version,
            candidate_version: result.candidate_version,
            classification: result.classification,
            publisher_unverified: true,
          });
        }
      });
    },
    async commitReplacement() {
      if (confirmation?.kind !== 'replacement') return;
      await runMutation('commit_replacement', async () => {
        const result = await replacementService.commitPrepared();
        confirmation = undefined;
        if (result.status === 'committed') {
          try {
            await surfaceProjection.reconcileRevision(result.revision, result.plugin_id);
            await surfaceProjection.whenIdle();
            currentFeedback = feedback(
              'status',
              result.cleanup === 'pending' ? 'cleanup_pending' : 'replacement_succeeded',
              { plugin_id: result.plugin_id, version: result.version },
            );
          } catch {
            currentFeedback = feedback('error', 'convergence_failed', {
              plugin_id: result.plugin_id,
              version: result.version,
            });
            await surfaceProjection.refresh().catch(() => undefined);
          }
        }
      });
    },
    async cancelReplacement() {
      confirmation = undefined;
      await replacementService.cancelPrepared();
      currentFeedback = feedback('status', 'cancelled');
      publish();
    },
    async uninstall(dataPolicy: Parameters<PluginManagementService['uninstall']>[0]) {
      const input = currentInput();
      if (!input) return;
      await runMutation('uninstall', async () => {
        const result = await lifecycleService.uninstall({
          entry_id: input.entry_id,
          expected_revision: input.expected_revision,
          data_policy: dataPolicy,
        });
        currentFeedback = feedback(
          'status',
          result.cleanup === 'pending' ? 'cleanup_pending' : 'uninstall_succeeded',
          result.plugin_id ? { plugin_id: result.plugin_id } : {},
        );
      });
    },
    async clearData() {
      const input = currentInput();
      if (!input || input.entry.kind !== 'registered' || input.entry.enabled) return;
      await runMutation('clear_data', async () => {
        const result = await dataManagementService.clear({
          entry_id: input.entry_id,
          expected_revision: input.expected_revision,
        });
        currentFeedback = feedback('status', result.changed ? 'clear_changed' : 'clear_unchanged');
      });
    },
    async setDevelopmentMode(enabled: boolean) {
      await developmentService?.setEnabled(enabled);
    },
    async registerDevelopmentDirectory() {
      await developmentService?.register();
    },
    async reloadDevelopmentEntry() {
      const input = currentInput();
      if (input?.entry.kind !== 'registered' || input.entry.source !== 'development') return;
      await developmentService?.reload(input.entry_id, input.expected_revision);
    },
    async removeDevelopmentEntry() {
      const input = currentInput();
      if (input?.entry.kind !== 'registered' || input.entry.source !== 'development') return;
      await developmentService?.remove(input.entry_id, input.expected_revision);
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      detailRequest += 1;
      unsubscribe();
      unsubscribeDevelopment?.();
      developmentService?.destroy();
      listeners.clear();
      lifecycleService.destroy();
      await installationService.destroy();
      await replacementService.destroy();
    },
  });

  return service;
};

const INERT_VIEW: PluginManagementViewModel = Object.freeze({
  state: 'empty',
  entries: Object.freeze([]),
  detail: Object.freeze({ kind: 'none' }),
  operations: EMPTY_OPERATIONS,
});

export const inertPluginManagementService: PluginManagementService = Object.freeze({
  current: () => INERT_VIEW,
  subscribe(listener: Parameters<PluginManagementService['subscribe']>[0]) {
    listener(INERT_VIEW);
    return () => undefined;
  },
  initialize: async () => undefined,
  refresh: async () => undefined,
  select: async () => undefined,
  prepareInstallation: async () => undefined,
  commitInstallation: async () => undefined,
  cancelInstallation: async () => undefined,
  setEnabled: async () => undefined,
  prepareReplacement: async () => undefined,
  commitReplacement: async () => undefined,
  cancelReplacement: async () => undefined,
  uninstall: async () => undefined,
  clearData: async () => undefined,
  setDevelopmentMode: async () => undefined,
  registerDevelopmentDirectory: async () => undefined,
  reloadDevelopmentEntry: async () => undefined,
  removeDevelopmentEntry: async () => undefined,
  destroy: async () => undefined,
});
