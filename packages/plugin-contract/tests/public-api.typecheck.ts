import {
  type HostApiMethod,
  type HostApiRequestInput,
  normalizePluginManifest,
  type PluginManifestInput,
  type PluginRuntimeContext,
  validateHostApiRequest,
} from '../src/index.js';

declare const rawManifest: PluginManifestInput;

// @ts-expect-error A raw Manifest is not a successful validation result.
normalizePluginManifest(rawManifest, { lensx: '0.1.0', host_api: '0.1.0' });

declare const method: HostApiMethod;
declare const request: HostApiRequestInput;
declare const context: PluginRuntimeContext;
void method;
void context.capabilities;
validateHostApiRequest(request);
