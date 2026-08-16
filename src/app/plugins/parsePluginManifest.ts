import {
  type IncompatiblePluginManifestValidationResult,
  type InvalidPluginManifestValidationResult,
  normalizePluginManifest,
  type PluginHostVersions,
  type PluginManifestNormalizationResult,
  validatePluginManifest,
} from '@lensx/plugin-contract';

export const parsePluginManifest = (
  input: unknown,
  currentVersions: PluginHostVersions,
):
  | InvalidPluginManifestValidationResult
  | IncompatiblePluginManifestValidationResult
  | PluginManifestNormalizationResult => {
  const validation = validatePluginManifest(input);
  return validation.status === 'valid' ? normalizePluginManifest(validation, currentVersions) : validation;
};
