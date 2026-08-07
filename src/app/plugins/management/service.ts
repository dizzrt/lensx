import type { HostApiPermission } from '@lensx/plugin-contract';
import {
  deriveCurrentPermissionPrompt,
  deriveInstallationPermissionPrompt,
  deriveReplacementPermissionPrompt,
  type EffectivePluginPermission,
  type PluginPermissionPromptItem,
} from '../permission';
import type {
  PluginRegistrationDetail,
  PluginRegistrationSnapshot,
  PluginRegistrationSummary,
  RegisteredPluginRegistrationDetail,
} from '../registration';
import type {
  PluginManagementDetailView,
  PluginManagementEntry,
  PluginManagementFeedback,
  PluginManagementFeedbackCode,
  PluginManagementMutation,
  PluginManagementOperationAvailability,
  PluginManagementPermissionView,
  PluginManagementService,
  PluginManagementServiceDependencies,
  PluginManagementViewModel,
  PluginPermissionConfirmationView,
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

const mapPermission = (
  permission: EffectivePluginPermission,
  prompt: PluginPermissionPromptItem,
): PluginManagementPermissionView =>
  Object.freeze({
    permission_id: permission.permission_id,
    requested: permission.state !== 'not_requested',
    supported: permission.supported,
    granted: permission.state === 'granted',
    effective: permission.state,
    methods: freezeArray(permission.methods),
    ...(permission.reason ? { reason: permission.reason } : {}),
    prompt,
  });

const mapDetail = (
  detail: PluginRegistrationDetail,
  permissionView: (detail: RegisteredPluginRegistrationDetail) => readonly EffectivePluginPermission[],
  permissionCatalog: PluginManagementServiceDependencies['permissionService']['catalog'],
): PluginManagementDetailView =>
  detail.kind === 'quarantined'
    ? Object.freeze({
        kind: detail.kind,
        entry_id: detail.entry_id,
        ...(detail.plugin_id ? { plugin_id: detail.plugin_id } : {}),
        diagnostic: detail.diagnostic,
      })
    : (() => {
        const permissions = permissionView(detail);
        const prompts = deriveCurrentPermissionPrompt(permissions, permissionCatalog);
        return Object.freeze({
          kind: detail.kind,
          entry_id: detail.entry_id,
          manifest: detail.manifest,
          source: detail.source,
          enabled: detail.enabled,
          compatibility: detail.compatibility,
          runtime: detail.runtime,
          permissions: freezeArray(
            permissions.map((permission) => {
              const prompt = prompts.find((item) => item.permission_id === permission.permission_id);
              if (!prompt) throw new TypeError('Permission prompt projection is incomplete.');
              return mapPermission(permission, prompt);
            }),
          ),
          diagnostics: freezeArray(detail.diagnostics),
        });
      })();

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
  permissionService,
  dataManagementService,
  developmentService,
}: PluginManagementServiceDependencies): PluginManagementService => {
  const listeners = new Set<(view: PluginManagementViewModel) => void>();
  let snapshot: PluginRegistrationSnapshot | undefined;
  let selectedEntryId: string | undefined;
  let detail: PluginManagementDetailView = Object.freeze({ kind: 'none' });
  let mutation: PluginManagementMutation | undefined;
  let confirmation: PluginManagementViewModel['confirmation'];
  let permissionConfirmation: PluginPermissionConfirmationView | undefined;
  const selectedPermissionIds = new Set<string>();
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
    const idle =
      mutation === undefined && confirmation === undefined && permissionConfirmation === undefined && available;
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
      ...(permissionConfirmation ? { permission_confirmation: permissionConfirmation } : {}),
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
      detail = mapDetail(response.detail, permissionService.view, permissionService.catalog);
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
      permissionConfirmation = undefined;
      selectedPermissionIds.clear();
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
        permissionConfirmation = undefined;
        selectedPermissionIds.clear();
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

  const replaceSelectedPermissions = () => {
    if (!confirmation) return;
    confirmation = Object.freeze({
      ...confirmation,
      selected_permission_ids: freezeArray([...selectedPermissionIds].sort()),
    });
  };

  const applyConfirmedGrants = async (
    pluginId: string,
    initialRevision: string,
    permissionIds: readonly string[],
    partialCode: 'install_permissions_partial' | 'replacement_permissions_partial',
    failedCode?: 'install_permissions_failed',
  ) => {
    let expectedRevision = initialRevision;
    let applied = 0;
    for (const permissionId of [...permissionIds].sort()) {
      const current = snapshot?.entries.find((entry) => entry.kind === 'registered' && entry.plugin_id === pluginId);
      if (current?.kind !== 'registered') {
        currentFeedback = feedback('error', applied === 0 && failedCode ? failedCode : partialCode, {
          plugin_id: pluginId,
        });
        await surfaceProjection.refresh().catch(() => undefined);
        return false;
      }
      try {
        const result = await permissionService.setGrant({
          entry_id: current.entry_id,
          expected_revision: expectedRevision,
          permission_id: permissionId as HostApiPermission,
          granted: true,
        });
        expectedRevision = result.revision;
        await surfaceProjection.reconcileRevision(result.revision, pluginId);
        await surfaceProjection.whenIdle();
        const converged = surfaceProjection.currentSnapshot();
        const convergedEntry = converged?.entries.find(
          (entry) => entry.kind === 'registered' && entry.plugin_id === pluginId,
        );
        if (!converged || converged.revision !== result.revision || convergedEntry?.kind !== 'registered') {
          throw Object.freeze({ code: 'surface_convergence_failed' });
        }
        await loadDetail(converged, convergedEntry.entry_id);
        if (
          detail.kind !== 'registered' ||
          detail.permissions.find((permission) => permission.permission_id === permissionId)?.granted !== true
        ) {
          throw Object.freeze({ code: 'surface_convergence_failed' });
        }
        applied += 1;
      } catch {
        currentFeedback = feedback('error', applied === 0 && failedCode ? failedCode : partialCode, {
          plugin_id: pluginId,
        });
        await surfaceProjection.refresh().catch(() => undefined);
        return false;
      }
    }
    return applied === permissionIds.length;
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
        selectedPermissionIds.clear();
        confirmation = Object.freeze({
          kind: 'installation',
          candidate: deriveInstallationPermissionPrompt(result.candidate, permissionService.catalog),
          selected_permission_ids: Object.freeze([]),
        });
      });
    },
    async commitInstallation() {
      if (confirmation?.kind !== 'installation') return;
      const selected = freezeArray([...selectedPermissionIds].sort());
      await runMutation('commit_installation', async () => {
        const result = await installationService.commitPrepared();
        confirmation = undefined;
        permissionConfirmation = undefined;
        selectedPermissionIds.clear();
        selectionTarget = Object.freeze({ plugin_id: result.plugin_id, version: result.version });
        try {
          await surfaceProjection.reconcileRevision(result.revision, result.plugin_id);
          await surfaceProjection.whenIdle();
          const grantsApplied = await applyConfirmedGrants(
            result.plugin_id,
            result.revision,
            selected,
            'install_permissions_partial',
            'install_permissions_failed',
          );
          if (grantsApplied)
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
      permissionConfirmation = undefined;
      selectedPermissionIds.clear();
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
          selectedPermissionIds.clear();
          const currentPermissions =
            detail.kind === 'registered' ? detail.permissions.map(({ prompt }) => prompt) : Object.freeze([]);
          const prompt = deriveReplacementPermissionPrompt(
            currentPermissions,
            result.added_permission_ids,
            result.removed_permission_ids,
            permissionService.catalog,
          );
          confirmation = Object.freeze({
            kind: 'replacement',
            entry_id: result.entry_id,
            expected_revision: input.expected_revision,
            current_version: result.current_version,
            candidate_version: result.candidate_version,
            classification: result.classification,
            added_permission_ids: freezeArray(result.added_permission_ids),
            removed_permission_ids: freezeArray(result.removed_permission_ids),
            retained_permissions: prompt.retained,
            added_permissions: prompt.added,
            removed_permissions: prompt.removed,
            selected_permission_ids: Object.freeze([]),
            publisher_unverified: true,
          });
        }
      });
    },
    async commitReplacement() {
      if (confirmation?.kind !== 'replacement') return;
      const selected = freezeArray([...selectedPermissionIds].sort());
      await runMutation('commit_replacement', async () => {
        const result = await replacementService.commitPrepared();
        confirmation = undefined;
        permissionConfirmation = undefined;
        selectedPermissionIds.clear();
        if (result.status === 'committed') {
          try {
            await surfaceProjection.reconcileRevision(result.revision, result.plugin_id);
            await surfaceProjection.whenIdle();
            const grantsApplied = await applyConfirmedGrants(
              result.plugin_id,
              result.revision,
              selected,
              'replacement_permissions_partial',
            );
            if (grantsApplied)
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
      permissionConfirmation = undefined;
      selectedPermissionIds.clear();
      await replacementService.cancelPrepared();
      currentFeedback = feedback('status', 'cancelled');
      publish();
    },
    openPermissionConfirmation(permissionId: string, granted: boolean) {
      if (mutation || permissionConfirmation) return;
      const context = confirmation?.kind ?? 'settings';
      const permission =
        confirmation?.kind === 'installation'
          ? confirmation.candidate.permissions.find((item) => item.permission_id === permissionId)
          : confirmation?.kind === 'replacement'
            ? confirmation.added_permissions.find((item) => item.permission_id === permissionId)
            : detail.kind === 'registered'
              ? detail.permissions.find((item) => item.permission_id === permissionId)?.prompt
              : undefined;
      if (!permission) return;
      if (granted && !permission.grant_available) return;
      if (!granted && context !== 'settings') {
        selectedPermissionIds.delete(permissionId);
        replaceSelectedPermissions();
        publish();
        return;
      }
      if (!granted && !permission.revoke_available) return;
      permissionConfirmation = Object.freeze({
        context,
        action: granted ? 'grant' : 'revoke',
        permission,
      });
      publish();
    },
    async confirmPermissionDecision() {
      const pendingConfirmation = permissionConfirmation;
      if (!pendingConfirmation) return;
      if (pendingConfirmation.context !== 'settings') {
        if (pendingConfirmation.action === 'grant') {
          selectedPermissionIds.add(pendingConfirmation.permission.permission_id);
          replaceSelectedPermissions();
        }
        permissionConfirmation = undefined;
        publish();
        return;
      }
      const input = currentInput();
      if (!input || input.entry.kind !== 'registered') return;
      permissionConfirmation = undefined;
      await runMutation('set_permission', async () => {
        const result = await permissionService.setGrant({
          entry_id: input.entry_id,
          expected_revision: input.expected_revision,
          permission_id: pendingConfirmation.permission.permission_id as HostApiPermission,
          granted: pendingConfirmation.action === 'grant',
        });
        await surfaceProjection.reconcileRevision(result.revision, input.entry.plugin_id);
        await surfaceProjection.whenIdle();
        const converged = surfaceProjection.currentSnapshot();
        if (!converged || converged.revision !== result.revision) {
          throw Object.freeze({ code: 'surface_convergence_failed' });
        }
        await loadDetail(converged, input.entry_id);
        const expectedGranted = pendingConfirmation.action === 'grant';
        if (
          detail.kind !== 'registered' ||
          detail.permissions.find(
            (permission) => permission.permission_id === pendingConfirmation.permission.permission_id,
          )?.granted !== expectedGranted
        ) {
          throw Object.freeze({ code: 'surface_convergence_failed' });
        }
        currentFeedback = feedback(
          'status',
          result.status === 'unchanged'
            ? 'permission_unchanged'
            : pendingConfirmation.action === 'grant'
              ? 'permission_granted'
              : 'permission_revoked',
          { plugin_id: input.entry.plugin_id },
        );
      });
    },
    cancelPermissionDecision() {
      permissionConfirmation = undefined;
      publish();
    },
    deferPreparedPermissions() {
      selectedPermissionIds.clear();
      permissionConfirmation = undefined;
      replaceSelectedPermissions();
      currentFeedback = feedback('status', 'permissions_deferred');
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
  openPermissionConfirmation: () => undefined,
  confirmPermissionDecision: async () => undefined,
  cancelPermissionDecision: () => undefined,
  deferPreparedPermissions: () => undefined,
  uninstall: async () => undefined,
  clearData: async () => undefined,
  setDevelopmentMode: async () => undefined,
  registerDevelopmentDirectory: async () => undefined,
  reloadDevelopmentEntry: async () => undefined,
  removeDevelopmentEntry: async () => undefined,
  destroy: async () => undefined,
});
