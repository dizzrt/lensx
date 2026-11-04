import type { PluginRegistrationDetailResponse, PluginRegistrationSummary } from '../registration';
import type { PluginResourceDesktopAdapter, PluginResourceEntry } from '../resource';
import { PluginResourceError } from '../resource';
import type { PluginSurfaceProjectionService } from '../surfaces';
import {
  isValidIsolatedPluginRuntimeEntryUrl,
  pluginRuntimeFragmentFromRoute,
  pluginRuntimeOriginFromEntryUrl,
} from './helpers';
import {
  type PluginChildWebviewAdmission,
  type PluginChildWebviewPresentationIdentity,
  readPluginChildWebviewAdmission,
  validPluginResourceGeneration,
} from './pluginChildWebviewPresentation';
import {
  type PluginPageRuntimeDescriptor,
  PluginPageRuntimeError,
  type PluginPageRuntimeRequest,
  type PluginPageRuntimeResolver,
} from './types';

export interface PluginPageRuntimeResolverDependencies {
  readonly readAdmission?: typeof readPluginChildWebviewAdmission;
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

const sameRelevantDescriptor = (left: PluginPageRuntimeDescriptor, right: PluginPageRuntimeDescriptor): boolean =>
  left.entry_id === right.entry_id &&
  left.plugin_id === right.plugin_id &&
  left.version === right.version &&
  left.page_id === right.page_id &&
  left.entry_url === right.entry_url &&
  left.host_fragment === right.host_fragment &&
  left.expected_origin === right.expected_origin &&
  left.resource_generation === right.resource_generation &&
  left.runtime_attempt_key === right.runtime_attempt_key;

export const createPluginPageRuntimeResolver = ({
  resourceAdapter,
  surfaceProjectionService,
  readAdmission: readNativeAdmission = readPluginChildWebviewAdmission,
}: PluginPageRuntimeResolverDependencies): PluginPageRuntimeResolver => {
  const ensureActive = (signal?: AbortSignal) => {
    if (signal?.aborted) throw new PluginPageRuntimeError('runtime_unavailable');
  };
  const readAdmission = async (request: PluginPageRuntimeRequest, refreshRetry: boolean, signal?: AbortSignal) => {
    ensureActive(signal);
    verifyRequest(request);
    if (!pluginRuntimeFragmentFromRoute(request.pageResolution.page.route)) {
      throw new PluginPageRuntimeError('runtime_invalid');
    }
    if (refreshRetry && request.attempt > 0) {
      try {
        await surfaceProjectionService.refresh();
        ensureActive(signal);
        await surfaceProjectionService.whenIdle();
        ensureActive(signal);
      } catch {
        throw new PluginPageRuntimeError('runtime_unavailable');
      }
    }
    const snapshot = surfaceProjectionService.currentSnapshot();
    if (!snapshot || snapshot.availability.kind !== 'available')
      throw new PluginPageRuntimeError('runtime_unavailable');
    const entry = resolveCurrentEntry(snapshot.entries, request.activePage.owner_id);
    const identity: PluginChildWebviewPresentationIdentity = {
      entryId: entry.entry_id,
      pluginId: entry.plugin_id,
      version: entry.version,
      pageId: request.activePage.page_id,
      expectedRevision: snapshot.revision,
    };
    const admission = await readNativeAdmission(identity);
    ensureActive(signal);
    const current = surfaceProjectionService.currentSnapshot();
    if (
      admission.entryId !== identity.entryId ||
      admission.revision !== identity.expectedRevision ||
      !validPluginResourceGeneration(admission.generation) ||
      !current ||
      current.availability.kind !== 'available' ||
      current.revision !== snapshot.revision
    )
      throw new PluginPageRuntimeError('runtime_stale');
    return Object.freeze({ ...admission });
  };
  const admit = (request: PluginPageRuntimeRequest, signal?: AbortSignal) => readAdmission(request, true, signal);
  const resolveDescriptor = async (
    request: PluginPageRuntimeRequest,
    expectedAdmission?: PluginChildWebviewAdmission,
    retained?: PluginPageRuntimeDescriptor,
    signal?: AbortSignal,
  ) => {
    ensureActive(signal);
    verifyRequest(request);
    const hostFragment = pluginRuntimeFragmentFromRoute(request.pageResolution.page.route);
    if (!hostFragment) throw new PluginPageRuntimeError('runtime_invalid');
    const admission = expectedAdmission ?? (await admit(request, signal));
    const snapshot = surfaceProjectionService.currentSnapshot();
    if (!snapshot || snapshot.availability.kind !== 'available')
      throw new PluginPageRuntimeError('runtime_unavailable');
    const entry = resolveCurrentEntry(snapshot.entries, request.activePage.owner_id);
    if (
      admission.entryId !== entry.entry_id ||
      admission.revision !== snapshot.revision ||
      !validPluginResourceGeneration(admission.generation)
    )
      throw new PluginPageRuntimeError('runtime_stale');

    let detailResponse: PluginRegistrationDetailResponse;
    try {
      detailResponse = await surfaceProjectionService.readRegistrationDetail(entry.entry_id);
      ensureActive(signal);
    } catch {
      throw new PluginPageRuntimeError('runtime_unavailable');
    }
    const current = surfaceProjectionService.currentSnapshot();
    if (!current || current.availability.kind !== 'available' || current.revision !== snapshot.revision) {
      throw new PluginPageRuntimeError('runtime_stale');
    }
    const currentEntry = resolveCurrentEntry(current.entries, request.activePage.owner_id);
    const detail = detailResponse.detail;
    if (
      currentEntry.entry_id !== entry.entry_id ||
      currentEntry.plugin_id !== entry.plugin_id ||
      currentEntry.version !== entry.version ||
      detailResponse.revision !== snapshot.revision ||
      detail.kind !== 'registered' ||
      detail.entry_id !== entry.entry_id ||
      detail.manifest.plugin_id !== entry.plugin_id ||
      detail.manifest.version !== entry.version ||
      detail.enabled !== entry.enabled ||
      detail.compatibility.lensx !== entry.compatibility.lensx ||
      detail.compatibility.host_api !== entry.compatibility.host_api
    )
      throw new PluginPageRuntimeError('runtime_stale');
    const manifestPage = detail.manifest.contributes.pages.find(({ id }) => id === request.activePage.page_id);
    if (!manifestPage || manifestPage.route !== request.pageResolution.page.route)
      throw new PluginPageRuntimeError('runtime_stale');

    let entryUrl: string;
    if (retained) {
      // Metadata revalidation never acquires or replaces a scope. Native source/lease
      // validation independently revokes the retained instance when its authority ends.
      entryUrl = retained.entry_url;
    } else {
      let resolved: PluginResourceEntry;
      try {
        ensureActive(signal);
        resolved = await resourceAdapter.resolveEntry({
          contract_version: '0.1.0',
          entry_id: entry.entry_id,
          expected_revision: snapshot.revision,
        });
        ensureActive(signal);
      } catch (error) {
        throw new PluginPageRuntimeError(
          error instanceof PluginResourceError && error.code === 'stale_revision'
            ? 'runtime_stale'
            : 'runtime_unavailable',
        );
      }
      if (
        surfaceProjectionService.currentSnapshot()?.revision !== snapshot.revision ||
        resolved.entry_id !== entry.entry_id ||
        resolved.revision !== snapshot.revision ||
        resolved.plugin_id !== entry.plugin_id ||
        resolved.version !== entry.version
      ) {
        throw new PluginPageRuntimeError('runtime_stale');
      }
      entryUrl = resolved.entry_url;
    }
    if (!isValidIsolatedPluginRuntimeEntryUrl(entryUrl)) throw new PluginPageRuntimeError('runtime_invalid');
    const expectedOrigin = pluginRuntimeOriginFromEntryUrl(entryUrl);
    const resourceGeneration = admission.generation;
    if (!expectedOrigin) throw new PluginPageRuntimeError('runtime_invalid');
    const runtimeAttemptKey = [entry.entry_id, resourceGeneration, request.attempt].join(':');
    const descriptor: PluginPageRuntimeDescriptor = {
      runtime_key: [
        request.activePage.owner_id,
        request.activePage.page_id,
        entry.entry_id,
        resourceGeneration,
        request.attempt,
      ].join('\u0001'),
      entry_url: entryUrl,
      host_fragment: hostFragment,
      entry_id: entry.entry_id,
      plugin_id: entry.plugin_id,
      version: entry.version,
      page_id: request.activePage.page_id,
      expected_origin: expectedOrigin,
      resource_generation: resourceGeneration,
      runtime_attempt_key: runtimeAttemptKey,
      registration_revision: snapshot.revision,
    };
    return Object.freeze(descriptor);
  };

  return Object.freeze({
    admit,
    resolve: (request: PluginPageRuntimeRequest, admission?: PluginChildWebviewAdmission, signal?: AbortSignal) =>
      resolveDescriptor(request, admission, undefined, signal),
    async isCurrent(request: PluginPageRuntimeRequest, descriptor: PluginPageRuntimeDescriptor) {
      try {
        const current = await resolveDescriptor(request, await readAdmission(request, false), descriptor);
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
