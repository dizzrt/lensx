import type { PluginRuntimeContext } from '@lensx/plugin-sdk';

export const runtimeContext = (
  locale: PluginRuntimeContext['locale'] = 'en-US',
  theme: PluginRuntimeContext['theme'] = 'light',
): PluginRuntimeContext =>
  Object.freeze({
    capabilities: Object.freeze([]),
    hostApiVersion: '0.2.0',
    locale,
    theme,
  });
