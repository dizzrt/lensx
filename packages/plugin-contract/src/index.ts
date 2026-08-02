export { PLUGIN_HOST_API_VERSION, PLUGIN_MANIFEST_VERSION } from './constants.js';
export type {
  InvalidPluginManifestValidationResult,
  ManifestLocale,
  NormalizedPluginManifest,
  PluginHostVersions,
  PluginManifestActionInput,
  PluginManifestCompatibility,
  PluginManifestCompatibilityStatus,
  PluginManifestDiagnostic,
  PluginManifestInput,
  PluginManifestNormalizationResult,
  PluginManifestPageInput,
  PluginManifestValidationResult,
  ValidatedPluginManifest,
} from './types.js';
export {
  normalizePluginManifest,
  resolvePluginManifestText,
  sortPluginManifestDiagnostics,
  validatePluginManifest,
} from './validate.js';
