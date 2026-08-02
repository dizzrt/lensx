import { PLUGIN_HOST_API_VERSION } from '@lensx/plugin-contract';

export const PLUGIN_SDK_VERSION = '0.1.0' as const;
export const PLUGIN_SDK_SUPPORTED_HOST_API_RANGE = `>=${PLUGIN_HOST_API_VERSION} <0.2.0` as const;

export const DEFAULT_PLUGIN_SDK_TIMEOUT_MS = 10_000;
