import type { PluginRegistrationDetailResponse, PluginRegistrationSummary } from '../registration';
import type { PluginResourceDesktopAdapter, PluginResourceEntry } from '../resource';
import { PluginResourceError } from '../resource';
import type { PluginSurfaceProjectionService } from '../surfaces';
import {
  isValidIsolatedPluginRuntimeEntryUrl,
  pluginRuntimeFragmentFromRoute,
  pluginRuntimeGenerationFromEntryUrl,
  pluginRuntimeIframeSrc,
  pluginRuntimeOriginFromEntryUrl,
} from './helpers';
import {
  type PluginPageRuntimeDescriptor,
  PluginPageRuntimeError,
  type PluginPageRuntimeRequest,
  type PluginPageRuntimeResolver,
} from './types';

export interface PluginPageRuntimeResolverDependencies {
  readonly resourceAdapter: PluginResourceDesktopAdapter;
  readonly surfaceProjectionService: Pick<
    PluginSurfaceProjectionService,
    'currentSnapshot' | 'readRegistrationDetail' | 'refresh' | 'subscribeSnapshot' | 'whenIdle'
  >;
}

const isEligible = (
  entry: PluginRegistrationSummary,
): entry is Extract<PluginRegistrationSummary, { readonly kind: 'registered' }> =>
  entry.kind === 'registered' && entry.enabled && entry.compatibility.lensx && entry.compatibility.host_api;

const resolveCurrentEntry = (
  entries: readonly PluginRegistrationSummary[],
  pluginId: string,
): Extract<PluginRegistrationSummary, { readonly kind: 'registered' }> => {
  const matches = entries.filter(isEligible).filter((entry) => entry.plugin_id === pluginId);
  if (matches.length !== 1) throw new PluginPageRuntimeError('runtime_unavailable');
  return matches[0];
};

const verifyRequest = ({ activePage, pageResolution, attempt }: PluginPageRuntimeRequest) => {
  if (
    !Number.isSafeInteger(attempt) ||
    attempt < 0 ||
    pageResolution.provider.kind !== 'plugin' ||
    !pageResolution.page.available ||
    activePage.owner_id !== pageResolution.provider.owner_id ||
    activePage.owner_id !== pageResolution.page.owner_id ||
    activePage.page_id !== pageResolution.page.page_id
  ) {
    throw new PluginPageRuntimeError('runtime_invalid');
  }
};

const sameStrings = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameRelevantDescriptor = (left: PluginPageRuntimeDescriptor, right: PluginPageRuntimeDescriptor): boolean =>
  left.entry_id === right.entry_id &&
  left.plugin_id === right.plugin_id &&
  left.version === right.version &&
  left.page_id === right.page_id &&
  left.entry_url === right.entry_url &&
  left.host_fragment === right.host_fragment &&
  left.expected_origin === right.expected_origin &&
  left.resource_generation === right.resource_generation &&
  left.runtime_attempt_key === right.runtime_attempt_key &&
  sameStrings(left.granted_permission_ids, right.granted_permission_ids);

export const createPluginPageRuntimeResolver = ({
  resourceAdapter,
  surfaceProjectionService,
}: PluginPageRuntimeResolverDependencies): PluginPageRuntimeResolver => {
  const resolveDescriptor = async (request: PluginPageRuntimeRequest, refreshRetry: boolean) => {
    verifyRequest(request);
    const hostFragment = pluginRuntimeFragmentFromRoute(request.pageResolution.page.route);
    if (!hostFragment) throw new PluginPageRuntimeError('runtime_invalid');
    if (refreshRetry && request.attempt > 0) {
      try {
        await surfaceProjectionService.refresh();
        await surfaceProjectionService.whenIdle();
      } catch {
        throw new PluginPageRuntimeError('runtime_unavailable');
      }
    }
    const snapshot = surfaceProjectionService.currentSnapshot();
    if (!snapshot || snapshot.availability.kind !== 'available') {
      throw new PluginPageRuntimeError('runtime_unavailable');
    }
    const entry = resolveCurrentEntry(snapshot.entries, request.activePage.owner_id);
    let resolved: PluginResourceEntry;
    try {
      resolved = await resourceAdapter.resolveEntry({
        contract_version: '0.1.0',
        entry_id: entry.entry_id,
        expected_revision: snapshot.revision,
      });
    } catch (error) {
      throw new PluginPageRuntimeError(
        error instanceof PluginResourceError && error.code === 'stale_revision'
          ? 'runtime_stale'
          : 'runtime_unavailable',
      );
    }

    let detailResponse: PluginRegistrationDetailResponse;
    try {
      detailResponse = await surfaceProjectionService.readRegistrationDetail(entry.entry_id);
    } catch {
      throw new PluginPageRuntimeError('runtime_unavailable');
    }

    const current = surfaceProjectionService.currentSnapshot();
    if (!current || current.availability.kind !== 'available' || current.revision !== snapshot.revision) {
      throw new PluginPageRuntimeError('runtime_stale');
    }
    let currentEntry: Extract<PluginRegistrationSummary, { readonly kind: 'registered' }>;
    try {
      currentEntry = resolveCurrentEntry(current.entries, request.activePage.owner_id);
    } catch {
      throw new PluginPageRuntimeError('runtime_stale');
    }
    if (
      currentEntry.entry_id !== entry.entry_id ||
      currentEntry.plugin_id !== entry.plugin_id ||
      currentEntry.version !== entry.version ||
      resolved.entry_id !== entry.entry_id ||
      resolved.revision !== snapshot.revision ||
      resolved.plugin_id !== entry.plugin_id ||
      resolved.version !== entry.version
    ) {
      throw new PluginPageRuntimeError('runtime_stale');
    }
    const detail = detailResponse.detail;
    if (
      detailResponse.revision !== snapshot.revision ||
      detail.kind !== 'registered' ||
      detail.entry_id !== entry.entry_id ||
      detail.manifest.plugin_id !== entry.plugin_id ||
      detail.manifest.version !== entry.version ||
      detail.enabled !== entry.enabled ||
      detail.compatibility.lensx !== entry.compatibility.lensx ||
      detail.compatibility.host_api !== entry.compatibility.host_api
    ) {
      throw new PluginPageRuntimeError('runtime_stale');
    }
    const manifestPage = detail.manifest.contributes.pages.find(({ id }) => id === request.activePage.page_id);
    const requiredPermissionIds = [...request.pageResolution.page.required_permission_ids];
    const manifestRequiredPermissionIds = manifestPage ? [...manifestPage.required_permissions] : [];
    if (
      !manifestPage ||
      manifestPage.route !== request.pageResolution.page.route ||
      !sameStrings(requiredPermissionIds, manifestRequiredPermissionIds) ||
      !requiredPermissionIds.every((permissionId) => detail.granted_permission_ids.includes(permissionId))
    ) {
      throw new PluginPageRuntimeError('runtime_stale');
    }
    if (!isValidIsolatedPluginRuntimeEntryUrl(resolved.entry_url)) {
      throw new PluginPageRuntimeError('runtime_invalid');
    }
    const expectedOrigin = pluginRuntimeOriginFromEntryUrl(resolved.entry_url);
    const resourceGeneration = pluginRuntimeGenerationFromEntryUrl(resolved.entry_url);
    if (!expectedOrigin || !resourceGeneration) {
      throw new PluginPageRuntimeError('runtime_invalid');
    }
    const grantedPermissionIds = Object.freeze([...detail.granted_permission_ids]);
    const runtimeAttemptKey = [entry.entry_id, resourceGeneration, request.attempt].join('\u0001');

    const descriptor: PluginPageRuntimeDescriptor = {
      runtime_key: [
        request.activePage.owner_id,
        request.activePage.page_id,
        entry.entry_id,
        resourceGeneration,
        request.attempt,
        ...grantedPermissionIds,
      ].join('\u0001'),
      iframe_src: pluginRuntimeIframeSrc(resolved.entry_url, hostFragment),
      entry_url: resolved.entry_url,
      host_fragment: hostFragment,
      entry_id: entry.entry_id,
      plugin_id: resolved.plugin_id,
      version: resolved.version,
      page_id: request.activePage.page_id,
      expected_origin: expectedOrigin,
      resource_generation: resourceGeneration,
      runtime_attempt_key: runtimeAttemptKey,
      registration_revision: snapshot.revision,
      granted_permission_ids: grantedPermissionIds,
    };
    return Object.freeze(descriptor);
  };

  return Object.freeze({
    resolve: (request: PluginPageRuntimeRequest) => resolveDescriptor(request, true),
    async isCurrent(request: PluginPageRuntimeRequest, descriptor: PluginPageRuntimeDescriptor) {
      try {
        const current = await resolveDescriptor(request, false);
        return sameRelevantDescriptor(current, descriptor);
      } catch {
        return false;
      }
    },
    subscribeInvalidation(listener: () => void) {
      return surfaceProjectionService.subscribeSnapshot(() => listener());
    },
  });
};
