import type { PluginRegistrationSummary } from '../registration';
import type { PluginResourceDesktopAdapter, PluginResourceEntry } from '../resource';
import { PluginResourceError } from '../resource';
import type { PluginSurfaceProjectionService } from '../surfaces';
import {
  isValidIsolatedPluginRuntimeEntryUrl,
  pluginRuntimeFragmentFromRoute,
  pluginRuntimeIframeSrc,
} from './helpers';
import {
  type PluginPageRuntimeDescriptor,
  PluginPageRuntimeError,
  type PluginPageRuntimeRequest,
  type PluginPageRuntimeResolver,
} from './types';

export interface PluginPageRuntimeResolverDependencies {
  readonly resourceAdapter: PluginResourceDesktopAdapter;
  readonly surfaceProjectionService: Pick<PluginSurfaceProjectionService, 'currentSnapshot' | 'refresh' | 'whenIdle'>;
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

export const createPluginPageRuntimeResolver = ({
  resourceAdapter,
  surfaceProjectionService,
}: PluginPageRuntimeResolverDependencies): PluginPageRuntimeResolver => ({
  async resolve(request) {
    verifyRequest(request);
    if (request.attempt > 0) {
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
    if (!isValidIsolatedPluginRuntimeEntryUrl(resolved.entry_url)) {
      throw new PluginPageRuntimeError('runtime_invalid');
    }
    const hostFragment = pluginRuntimeFragmentFromRoute(request.pageResolution.page.route);
    if (!hostFragment) throw new PluginPageRuntimeError('runtime_invalid');

    const descriptor: PluginPageRuntimeDescriptor = {
      runtime_key: [
        request.activePage.owner_id,
        request.activePage.page_id,
        entry.entry_id,
        snapshot.revision,
        resolved.entry_url,
        request.attempt,
      ].join('\u0001'),
      iframe_src: pluginRuntimeIframeSrc(resolved.entry_url, hostFragment),
      entry_url: resolved.entry_url,
      host_fragment: hostFragment,
      plugin_id: resolved.plugin_id,
      version: resolved.version,
    };
    return Object.freeze(descriptor);
  },
});
