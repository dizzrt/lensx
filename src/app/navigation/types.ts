export type PageLocale = 'en-US' | 'zh-CN';

export type LocalizedPageText = Readonly<
  Record<'en-US', string> & Partial<Record<Exclude<PageLocale, 'en-US'>, string>>
>;

export interface HostPageTarget {
  readonly owner_id: string;
  readonly page_id: string;
}

export interface ActivePage extends HostPageTarget {
  readonly opened_by_action_id: string;
}

export interface HostPageDefinition extends HostPageTarget {
  readonly enabled: boolean;
  readonly title?: LocalizedPageText;
  readonly route?: string;
}

export interface PageProviderDescriptor {
  readonly kind: 'host' | 'plugin';
  readonly owner_id: string;
  readonly display_name: LocalizedPageText;
}

export interface PluginPagePresentation {
  readonly initial_size: {
    readonly width: number;
    readonly height: number;
  };
  readonly resizable: boolean;
}

export interface PageDescriptor extends HostPageTarget {
  readonly available: boolean;
  readonly parent?: HostPageTarget;
  readonly route: string;
  readonly title: LocalizedPageText;
  readonly presentation?: PluginPagePresentation;
}

export interface PageProviderBatch {
  readonly provider: PageProviderDescriptor;
  readonly pages: readonly PageDescriptor[];
}

export interface PageResolution {
  readonly provider: PageProviderDescriptor;
  readonly page: PageDescriptor;
}

export type PageRegistryDiagnosticCode =
  | 'duplicate_page_identity'
  | 'invalid_descriptor'
  | 'invalid_owner'
  | 'invalid_parent'
  | 'protected_host_owner';

export interface PageRegistryDiagnostic {
  readonly code: PageRegistryDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export type PageRegistryReplacementResult =
  | {
      readonly ok: true;
      readonly pages: readonly PageResolution[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly PageRegistryDiagnostic[];
    };

export type AppNavigationErrorCode =
  | 'navigation_handler_already_registered'
  | 'navigation_handler_unavailable'
  | 'page_unavailable';

export class AppNavigationError extends Error {
  readonly code: AppNavigationErrorCode;

  constructor(code: AppNavigationErrorCode, message: string) {
    super(message);
    this.name = 'AppNavigationError';
    this.code = code;
  }
}
