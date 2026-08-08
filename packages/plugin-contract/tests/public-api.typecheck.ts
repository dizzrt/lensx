import * as pluginContract from '../src/index.js';
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
normalizePluginManifest(rawManifest, { lensx: '0.1.0', host_api: '0.2.0' });

declare const method: HostApiMethod;
declare const request: HostApiRequestInput;
declare const context: PluginRuntimeContext;
void method;
void context.capabilities;
validateHostApiRequest(request);
validateHostApiRequest({ method: 'clipboard.read', params: {} });
// @ts-expect-error Host API 0.2.0 no longer exports a permission validator.
void pluginContract.validateHostApiPermission;
// @ts-expect-error Host API 0.2.0 no longer exports a permission type.
type LegacyPermission = import('../src/index.js').HostApiPermission;
declare const legacyPermission: LegacyPermission;
void legacyPermission;
