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
  readonly activePage: Readonly<Pick<ActivePage, 'owner_id' | 'page_id'>>;
  readonly pageResolution: {
    readonly provider: Readonly<Pick<PageResolution['provider'], 'kind' | 'owner_id'>>;
    readonly page: Readonly<Pick<PageResolution['page'], 'owner_id' | 'page_id' | 'available' | 'route'>>;
  };
  readonly attempt: number;
}

/** Host-private facts consumed only by the Child WebView presentation path. */
export interface PluginPageRuntimeDescriptor {
  readonly runtime_key: string;
  readonly entry_url: string;
  readonly host_fragment: string;
  readonly entry_id: string;
  readonly plugin_id: string;
  readonly version: string;
  readonly page_id: string;
  readonly expected_origin: string;
  readonly resource_generation: string;
  readonly runtime_attempt_key: string;
  readonly registration_revision: string;
}

export interface PluginPageRuntimeResolver {
  resolve: (request: PluginPageRuntimeRequest) => Promise<PluginPageRuntimeDescriptor>;
  isCurrent?: (request: PluginPageRuntimeRequest, descriptor: PluginPageRuntimeDescriptor) => Promise<boolean>;
  subscribeInvalidation?: (listener: () => void) => () => void;
}
