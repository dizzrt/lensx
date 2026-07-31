import { HostPageCatalog } from './catalog';
import { AppNavigationService } from './service';

export const HOST_SETTINGS_PAGE = Object.freeze({
  owner_id: 'lensx.core',
  page_id: 'settings',
  enabled: true,
});

export const productionHostPageCatalog = new HostPageCatalog([HOST_SETTINGS_PAGE]);
export const productionAppNavigationService = new AppNavigationService(productionHostPageCatalog);
