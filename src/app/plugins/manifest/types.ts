import type {
  Action,
  Asset,
  Compatibility,
  Contributes,
  Display,
  Launcher,
  LocalizedKeywords,
  LocalizedText,
  Page,
  PermissionRequest,
  PluginManifestV0Input,
  Publisher,
  Runtime,
  VersionRange,
} from './generated/plugin-manifest-v0-input';

export type PluginManifestCompatibilityStatus = 'compatible' | 'incompatible';
export type PluginManifestValidationStatus = 'invalid' | PluginManifestCompatibilityStatus;

export interface PluginManifestDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface PluginHostVersions {
  readonly lensx: string;
  readonly host_api: string;
}

export interface PluginManifestCompatibility {
  readonly lensx: boolean;
  readonly host_api: boolean;
}

export interface NormalizedLocalizedText extends LocalizedText {
  readonly 'en-US': string;
  readonly 'zh-CN'?: string;
}

export interface NormalizedAsset extends Asset {
  readonly kind: 'asset';
  readonly path: string;
}

export interface NormalizedPluginDisplay extends Omit<Display, 'name' | 'description' | 'icon'> {
  readonly name: NormalizedLocalizedText;
  readonly description?: NormalizedLocalizedText;
  readonly icon?: NormalizedAsset;
}

export interface NormalizedPublisher extends Publisher {
  readonly author: string;
  readonly homepage: string;
  readonly repository: string;
}

export interface NormalizedVersionRange extends VersionRange {
  readonly min_version: string;
  readonly max_version_exclusive: string;
}

export interface NormalizedCompatibility extends Omit<Compatibility, 'lensx' | 'host_api'> {
  readonly lensx: NormalizedVersionRange;
  readonly host_api: NormalizedVersionRange;
}

export interface NormalizedRuntime extends Runtime {
  readonly kind: 'iframe';
  readonly entry: string;
}

export interface NormalizedPermissionRequest extends Omit<PermissionRequest, 'reason'> {
  readonly permission_id: string;
  readonly reason: NormalizedLocalizedText;
}

export interface NormalizedPluginPage extends Omit<Page, 'title' | 'icon' | 'required_permissions'> {
  readonly id: string;
  readonly title: NormalizedLocalizedText;
  readonly route: string;
  readonly parent_page_id?: string;
  readonly icon?: NormalizedAsset;
  readonly required_permissions: readonly string[];
}

export interface NormalizedLocalizedKeywords extends Omit<LocalizedKeywords, 'en-US' | 'zh-CN'> {
  readonly 'en-US'?: readonly string[];
  readonly 'zh-CN'?: readonly string[];
}

export interface NormalizedPluginAction
  extends Omit<Action, 'title' | 'description' | 'default_keywords' | 'icon' | 'target'> {
  readonly id: string;
  readonly title: NormalizedLocalizedText;
  readonly description?: NormalizedLocalizedText;
  readonly default_keywords: NormalizedLocalizedKeywords;
  readonly icon?: NormalizedAsset;
  readonly target: {
    readonly kind: 'page';
    readonly page_id: string;
  };
}

export interface NormalizedLauncher extends Launcher {
  readonly default_action_id: string;
}

export interface NormalizedContributes extends Omit<Contributes, 'pages' | 'actions' | 'launcher'> {
  readonly pages: readonly [NormalizedPluginPage, ...NormalizedPluginPage[]];
  readonly actions: readonly NormalizedPluginAction[];
  readonly launcher?: NormalizedLauncher;
}

export interface NormalizedPluginManifestV0
  extends Omit<
    PluginManifestV0Input,
    'display' | 'publisher' | 'compatibility' | 'runtime' | 'requested_permissions' | 'contributes'
  > {
  readonly manifest_version: '1.0.0-dev';
  readonly plugin_id: string;
  readonly version: string;
  readonly display: NormalizedPluginDisplay;
  readonly publisher: NormalizedPublisher;
  readonly compatibility: NormalizedCompatibility;
  readonly runtime: NormalizedRuntime;
  readonly requested_permissions: readonly NormalizedPermissionRequest[];
  readonly contributes: NormalizedContributes;
}

export interface InvalidPluginManifestResult {
  readonly status: 'invalid';
  readonly diagnostics: readonly PluginManifestDiagnostic[];
}

export interface ValidPluginManifestResult {
  readonly status: PluginManifestCompatibilityStatus;
  readonly manifest: NormalizedPluginManifestV0;
  readonly compatibility: PluginManifestCompatibility;
  readonly diagnostics: readonly [];
}

export type PluginManifestValidationResult = InvalidPluginManifestResult | ValidPluginManifestResult;

export type { Action as PluginManifestV0ActionInput, Page as PluginManifestV0PageInput, PluginManifestV0Input };
