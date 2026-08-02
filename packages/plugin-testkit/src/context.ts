import { PLUGIN_HOST_API_VERSION } from '@lensx/plugin-contract';
import type { PluginRuntimeContext } from '@lensx/plugin-sdk';

export type PluginRuntimeContextFixtureOverrides = Partial<
  Pick<PluginRuntimeContext, 'hostApiVersion' | 'locale' | 'theme' | 'capabilities'>
>;

export const createPluginRuntimeContextFixture = (
  overrides: PluginRuntimeContextFixtureOverrides = {},
): PluginRuntimeContext =>
  Object.freeze({
    capabilities: Object.freeze([...(overrides.capabilities ?? [])]),
    hostApiVersion: overrides.hostApiVersion ?? PLUGIN_HOST_API_VERSION,
    locale: overrides.locale ?? 'en-US',
    theme: overrides.theme ?? 'light',
  });
