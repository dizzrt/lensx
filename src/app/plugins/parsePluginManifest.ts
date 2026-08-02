import {
  type InvalidPluginManifestValidationResult,
  normalizePluginManifest,
  type PluginHostVersions,
  type PluginManifestNormalizationResult,
  validatePluginManifest,
} from '@lensx/plugin-contract';

export const parsePluginManifest = (
  input: unknown,
  currentVersions: PluginHostVersions,
): InvalidPluginManifestValidationResult | PluginManifestNormalizationResult => {
  const validation = validatePluginManifest(input);
  return validation.status === 'invalid' ? validation : normalizePluginManifest(validation, currentVersions);
};
