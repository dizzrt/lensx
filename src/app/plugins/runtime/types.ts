import type { ActivePage, PageResolution } from '../../navigation';

export type PluginPageRuntimeErrorCode =
  | 'runtime_unavailable'
  | 'runtime_stale'
  | 'runtime_invalid'
  | 'runtime_activation_failed';

export class PluginPageRuntimeError extends Error {
  readonly code: PluginPageRuntimeErrorCode;

  constructor(code: PluginPageRuntimeErrorCode) {
    super(
      code === 'runtime_stale'
        ? 'Plugin Runtime facts changed during resolution.'
        : code === 'runtime_invalid'
          ? 'Plugin Runtime facts are invalid.'
          : code === 'runtime_activation_failed'
            ? 'Plugin Runtime navigation could not be activated.'
            : 'Plugin Runtime is unavailable.',
    );
    this.name = 'PluginPageRuntimeError';
    this.code = code;
  }
}

export interface PluginPageRuntimeRequest {
  readonly activePage: ActivePage;
  readonly pageResolution: PageResolution;
  readonly attempt: number;
}

/** Host-private facts consumed only by the iframe container. */
export interface PluginPageRuntimeDescriptor {
  readonly runtime_key: string;
  readonly iframe_src: string;
  readonly entry_url: string;
  readonly host_fragment: string;
  readonly plugin_id: string;
  readonly version: string;
}

export interface PluginPageRuntimeResolver {
  resolve: (request: PluginPageRuntimeRequest) => Promise<PluginPageRuntimeDescriptor>;
}

export interface PluginRuntimeNavigationLease {
  readonly lease_id: string;
}

export interface PluginRuntimeNavigationAdapter {
  activate: (target: {
    readonly entry_url: string;
    readonly host_fragment: string;
  }) => Promise<PluginRuntimeNavigationLease>;
  dispose: (lease: PluginRuntimeNavigationLease) => Promise<boolean>;
}
