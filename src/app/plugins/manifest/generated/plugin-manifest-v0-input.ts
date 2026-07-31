/* eslint-disable */
/**
 * Generated from schemas/plugin/manifest.schema.json.
 * Do not edit directly; run `pnpm run generate:plugin-manifest-types`.
 */

export type PluginId = string;
export type Semver = string;
export type PackagePath = string;
export type PackageHtmlPath = string;
export type PermissionId = string;
export type LocalId = string;
export type InternalRoute = string;

/**
 * Author-controlled static manifest input for an external lensX plugin.
 */
export interface PluginManifestV0Input {
  manifest_version: '1.0.0-dev';
  plugin_id: PluginId;
  version: Semver;
  display: Display;
  publisher: Publisher;
  compatibility: Compatibility;
  runtime: Runtime;
  requested_permissions?: PermissionRequest[];
  contributes: Contributes;
}
export interface Display {
  name: LocalizedText;
  description?: LocalizedText;
  icon?: Asset;
}
export interface LocalizedText {
  'en-US': string;
  'zh-CN'?: string;
}
export interface Asset {
  kind: 'asset';
  path: PackagePath;
}
export interface Publisher {
  author: string;
  homepage: string;
  repository: string;
}
export interface Compatibility {
  lensx: VersionRange;
  host_api: VersionRange;
}
export interface VersionRange {
  min_version: Semver;
  max_version_exclusive: Semver;
}
export interface Runtime {
  kind: 'iframe';
  entry: PackageHtmlPath;
}
export interface PermissionRequest {
  permission_id: PermissionId;
  reason: LocalizedText;
}
export interface Contributes {
  /**
   * @minItems 1
   */
  pages: [Page, ...Page[]];
  actions?: Action[];
  launcher?: Launcher;
}
export interface Page {
  id: LocalId;
  title: LocalizedText;
  route: InternalRoute;
  parent_page_id?: LocalId;
  icon?: Asset;
  required_permissions?: PermissionId[];
}
export interface Action {
  id: LocalId;
  title: LocalizedText;
  description?: LocalizedText;
  default_keywords?: LocalizedKeywords;
  icon?: Asset;
  target: ActionTarget;
}
export interface LocalizedKeywords {
  'en-US'?: string[];
  'zh-CN'?: string[];
}
export interface ActionTarget {
  kind: 'page';
  page_id: LocalId;
}
export interface Launcher {
  default_action_id: LocalId;
}
