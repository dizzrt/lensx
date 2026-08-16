import {
  type NormalizedPluginManifest,
  normalizePluginManifest,
  PLUGIN_HOST_API_VERSION,
  type PluginHostVersions,
  type PluginManifestNormalizationResult,
  validatePluginManifest,
} from '@lensx/plugin-contract';

import { PLUGIN_PACKAGE_CHECKSUMS_PATH, PLUGIN_PACKAGE_MANIFEST_PATH } from './constants.js';
import { packageDiagnostic } from './diagnostics.js';
import type { PluginPackageDiagnostic, PluginPackageFileFact } from './types.js';

export const DEFAULT_PLUGIN_HOST_VERSIONS: PluginHostVersions = Object.freeze({
  lensx: '0.1.0',
  host_api: PLUGIN_HOST_API_VERSION,
});

const manifestResourcePaths = (manifest: NormalizedPluginManifest): readonly { path: string; pointer: string }[] => [
  { path: manifest.runtime.entry, pointer: '/runtime/entry' },
  ...(manifest.display.icon === undefined ? [] : [{ path: manifest.display.icon.path, pointer: '/display/icon/path' }]),
  ...manifest.contributes.pages.flatMap((page, index) =>
    page.icon === undefined ? [] : [{ path: page.icon.path, pointer: `/contributes/pages/${index}/icon/path` }],
  ),
  ...manifest.contributes.actions.flatMap((action, index) =>
    action.icon === undefined ? [] : [{ path: action.icon.path, pointer: `/contributes/actions/${index}/icon/path` }],
  ),
];

export const validatePackageManifest = (
  manifestBytes: Uint8Array,
  files: readonly PluginPackageFileFact[],
  currentVersions: PluginHostVersions = DEFAULT_PLUGIN_HOST_VERSIONS,
):
  | { readonly normalized: PluginManifestNormalizationResult; readonly diagnostics: readonly [] }
  | { readonly incompatible: true; readonly diagnostics: readonly PluginPackageDiagnostic[] }
  | { readonly diagnostics: readonly PluginPackageDiagnostic[] } => {
  let input: unknown;
  try {
    input = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as unknown;
  } catch {
    return { diagnostics: [packageDiagnostic('manifest_invalid', PLUGIN_PACKAGE_MANIFEST_PATH)] };
  }
  const validation = validatePluginManifest(input);
  if (validation.status === 'incompatible') {
    return {
      incompatible: true,
      diagnostics: validation.diagnostics.map((diagnostic) =>
        packageDiagnostic('manifest_incompatible', diagnostic.path),
      ),
    };
  }
  if (validation.status !== 'valid') {
    return {
      diagnostics: validation.diagnostics.map((diagnostic) => packageDiagnostic('manifest_invalid', diagnostic.path)),
    };
  }
  const normalized = normalizePluginManifest(validation, currentVersions);
  const paths = new Set(files.map((file) => file.path));
  const diagnostics = manifestResourcePaths(normalized.manifest).flatMap(({ path, pointer }) =>
    !paths.has(path) || path === PLUGIN_PACKAGE_MANIFEST_PATH || path === PLUGIN_PACKAGE_CHECKSUMS_PATH
      ? [packageDiagnostic('resource_missing', pointer)]
      : [],
  );
  return diagnostics.length > 0 ? { diagnostics } : { normalized, diagnostics: [] };
};
