import { normalizePluginManifest, type PluginManifestInput } from '../src/index.js';

declare const rawManifest: PluginManifestInput;

// @ts-expect-error A raw Manifest is not a successful validation result.
normalizePluginManifest(rawManifest, { lensx: '0.1.0', host_api: '0.1.0' });
