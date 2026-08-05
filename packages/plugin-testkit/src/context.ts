import { PLUGIN_HOST_API_VERSION, type PluginRuntimeContext } from '@lensx/plugin-contract';

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

export type InvalidPluginRuntimeContextFixtureKind =
  | 'duplicate-capability'
  | 'trusted-field'
  | 'unknown-capability'
  | 'unsorted-capability';

export const createInvalidPluginRuntimeContextFixture = (kind: InvalidPluginRuntimeContextFixtureKind): unknown => {
  const context = createPluginRuntimeContextFixture();
  if (kind === 'duplicate-capability') return { ...context, capabilities: ['storage.get', 'storage.get'] };
  if (kind === 'unknown-capability') return { ...context, capabilities: ['system.open_external'] };
  if (kind === 'unsorted-capability') return { ...context, capabilities: ['storage.get', 'actions.open'] };
  return { ...context, pluginId: 'com.untrusted.plugin' };
};
