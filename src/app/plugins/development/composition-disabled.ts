import type { PluginSurfaceProjectionService } from '../surfaces';

export const createProductionPluginDevelopmentService = (
  surfaceProjection: PluginSurfaceProjectionService,
): undefined => {
  void surfaceProjection;
  return undefined;
};
