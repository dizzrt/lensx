import {
  normalizePluginManifest,
  PLUGIN_HOST_API_VERSION,
  PLUGIN_MANIFEST_VERSION,
  type PluginManifestInput,
  validatePluginManifest,
} from '@lensx/plugin-contract';
import rawManifestSchema from '@lensx/plugin-contract/manifest.schema.json' with { type: 'json' };
import manifestSchema from '@lensx/plugin-contract/schema';

import manifestJson from './manifest.json' with { type: 'json' };

const manifestInput = manifestJson as PluginManifestInput;
const validation = validatePluginManifest(manifestInput);
if (validation.status === 'invalid') {
  throw new TypeError(`Example Manifest is invalid: ${JSON.stringify(validation.diagnostics)}`);
}

const result = normalizePluginManifest(validation, {
  lensx: '0.1.0',
  host_api: PLUGIN_HOST_API_VERSION,
});
if (
  PLUGIN_MANIFEST_VERSION !== '0.1.0' ||
  result.status !== 'compatible' ||
  manifestSchema.$id !== rawManifestSchema.$id
) {
  throw new TypeError('Packed Contract package did not expose a coherent 0.1.0 contract.');
}

export const exampleResult = `${result.manifest.plugin_id}:${result.status}`;
