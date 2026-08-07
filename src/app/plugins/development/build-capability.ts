declare const __LENSX_PLUGIN_DEVELOPMENT_MODE__: boolean;

export const PLUGIN_DEVELOPMENT_MODE_BUILD_CAPABILITY =
  typeof __LENSX_PLUGIN_DEVELOPMENT_MODE__ === 'boolean' && __LENSX_PLUGIN_DEVELOPMENT_MODE__;

export const hasPluginDevelopmentModeCapability = (nativeSupported: boolean): boolean =>
  PLUGIN_DEVELOPMENT_MODE_BUILD_CAPABILITY && nativeSupported;
