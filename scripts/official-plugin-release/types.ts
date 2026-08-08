export const OFFICIAL_RELEASE_SCHEMA_VERSION = 1 as const;

export interface OfficialReleaseDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface OfficialPluginMember {
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly packageName: string;
  readonly pluginId: string;
  readonly relativePath: string;
  readonly rootDir: string;
  readonly slug: string;
  readonly version: string;
}

export type SemverBump = 'major' | 'minor' | 'patch';

export interface ParsedChangeset {
  readonly bumps: ReadonlyMap<string, SemverBump>;
  readonly id: string;
  readonly summary: string;
}

export interface OfficialPluginPlanEntry {
  readonly package_name: string;
  readonly plugin_id: string;
  readonly slug: string;
  readonly version: string;
}

export interface OfficialPluginReleasePlanEntry extends OfficialPluginPlanEntry {
  readonly bump: SemverBump;
  readonly changesets: readonly string[];
}

export interface OfficialPluginReleasePlan {
  readonly base_commit: string;
  readonly changed_paths: readonly string[];
  readonly head_commit: string;
  readonly infrastructure_changed: boolean;
  readonly noop: boolean;
  readonly release: readonly OfficialPluginReleasePlanEntry[];
  readonly schema_version: typeof OFFICIAL_RELEASE_SCHEMA_VERSION;
  readonly validate: readonly OfficialPluginPlanEntry[];
}

export const diagnostic = (code: string, path: string, message: string): OfficialReleaseDiagnostic => ({
  code,
  message,
  path: path.replaceAll('\\', '/').replace(/^\.\//u, ''),
});

export const compareDiagnostics = (left: OfficialReleaseDiagnostic, right: OfficialReleaseDiagnostic): number =>
  left.path.localeCompare(right.path) ||
  left.code.localeCompare(right.code) ||
  left.message.localeCompare(right.message);

export const formatOfficialReleaseDiagnostic = (item: OfficialReleaseDiagnostic): string =>
  `[${item.code}] ${item.path}: ${item.message}`;
