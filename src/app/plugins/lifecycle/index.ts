export type { PluginLifecycleInvoke } from './desktop';
export { createPluginLifecycleDesktopAdapter, desktopPluginLifecycleAdapter } from './desktop';
export { parsePluginLifecycleError, parsePluginLifecycleResult } from './parse';
export type { ProductionPluginLifecycleComposition } from './production';
export { createProductionPluginLifecycleComposition } from './production';
export type {
  PluginLifecycleService,
  PluginLifecycleServiceDependencies,
  PluginLifecycleServiceErrorCode,
  PluginSetEnabledInput,
  PluginUninstallInput,
} from './service';
export { createPluginLifecycleService, PluginLifecycleServiceError } from './service';
export type {
  PluginLifecycleCleanupConclusion,
  PluginLifecycleDataPolicy,
  PluginLifecycleDesktopAdapter,
  PluginLifecycleErrorCode,
  PluginLifecycleErrorPayload,
  PluginLifecycleOperation,
  PluginLifecycleOutcome,
  PluginLifecycleResult,
  SetPluginEnabledRequest,
  SetPluginEnabledResult,
  UninstallPluginRequest,
  UninstallPluginResult,
} from './types';
export {
  PLUGIN_LIFECYCLE_CONTRACT_VERSION,
  PluginLifecycleError,
  SET_PLUGIN_ENABLED_COMMAND,
  UNINSTALL_PLUGIN_COMMAND,
} from './types';
