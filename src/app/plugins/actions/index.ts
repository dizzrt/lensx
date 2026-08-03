export type { PluginActionPageAvailability, PluginActionPageOpener, PluginActionPageTarget } from './mapper';
export { mapPluginActionsToLauncherRegistrations } from './mapper';
export type {
  PluginActionProjectionDependencies,
  PluginActionProjectionDiagnostic,
  PluginActionProjectionDiagnosticCode,
  PluginActionProjectionRegistry,
  PluginActionProjectionService,
} from './projection';
export {
  createPluginActionProjectionForLauncherService,
  createPluginActionProjectionService,
} from './projection';
