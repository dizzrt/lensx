import { PageRegistry } from './catalog';
import { AppNavigationService } from './service';

export const HOST_SETTINGS_PAGE = Object.freeze({
  owner_id: 'lensx.core',
  page_id: 'settings',
  enabled: true,
  title: Object.freeze({ 'en-US': 'Settings', 'zh-CN': '设置' }),
  route: '/settings',
});

export const productionPageRegistry = new PageRegistry([HOST_SETTINGS_PAGE]);
export const productionHostPageCatalog = productionPageRegistry;
export const productionAppNavigationService = new AppNavigationService(productionPageRegistry);
