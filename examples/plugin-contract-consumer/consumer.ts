import {
  HOST_API_METHOD_CATALOG,
  normalizePluginManifest,
  PLUGIN_HOST_API_VERSION,
  PLUGIN_MANIFEST_VERSION,
  type PluginManifestInput,
  type PluginRuntimeContextInput,
  validateHostApiError,
  validateHostApiEvent,
  validateHostApiMethod,
  validateHostApiRequest,
  validateHostApiResult,
  validatePluginManifest,
  validatePluginRuntimeContext,
} from '@lensx/plugin-contract';
import rawHostApiSchema from '@lensx/plugin-contract/host-api.schema.json' with { type: 'json' };
import hostApiSchema from '@lensx/plugin-contract/host-api-schema';
import rawManifestSchema from '@lensx/plugin-contract/manifest.schema.json' with { type: 'json' };
import manifestSchema from '@lensx/plugin-contract/schema';

import manifestJson from './manifest.json' with { type: 'json' };

const manifestInput = manifestJson as PluginManifestInput;
const runtimeContext: PluginRuntimeContextInput = {
  capabilities: ['runtime.get_context'],
  hostApiVersion: PLUGIN_HOST_API_VERSION,
  locale: 'en-US',
  theme: 'light',
};
const validation = validatePluginManifest(manifestInput);
if (validation.status !== 'valid') {
  throw new TypeError(`Example Manifest is not current: ${JSON.stringify(validation.diagnostics)}`);
}

const result = normalizePluginManifest(validation, {
  lensx: '0.1.0',
  host_api: PLUGIN_HOST_API_VERSION,
});
if (
  PLUGIN_MANIFEST_VERSION !== '0.3.0' ||
  result.status !== 'compatible' ||
  manifestSchema.$id !== rawManifestSchema.$id ||
  hostApiSchema.$id !== rawHostApiSchema.$id ||
  HOST_API_METHOD_CATALOG.length !== 8 ||
  validateHostApiMethod('runtime.get_context').status !== 'valid' ||
  validatePluginRuntimeContext(runtimeContext).status !== 'valid' ||
  validateHostApiRequest({ method: 'runtime.get_context', params: {} }).status !== 'valid' ||
  validateHostApiResult({ method: 'runtime.get_context', result: runtimeContext }).status !== 'valid' ||
  validateHostApiEvent({ event: 'runtime.context_changed', payload: runtimeContext }).status !== 'valid' ||
  validateHostApiError({ code: 'unavailable', message: 'The capability is unavailable.' }).status !== 'valid'
) {
  throw new TypeError('Packed Contract package did not expose a coherent Manifest 0.3.0 / Host API 0.2.0 contract.');
}

export const exampleResult = `${result.manifest.plugin_id}:${result.status}`;
