import type { PluginSurfaceProjectionService } from '../surfaces';
import { createPluginDevelopmentDesktopAdapter } from './desktop';
import { createPluginDevelopmentService } from './service';
import type { PluginDevelopmentService } from './types';

export const createProductionPluginDevelopmentService = (
  surfaceProjection: PluginSurfaceProjectionService,
): PluginDevelopmentService =>
  createPluginDevelopmentService({
    adapter: createPluginDevelopmentDesktopAdapter(),
    surfaceProjection,
  });
