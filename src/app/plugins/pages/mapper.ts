import type { LocalizedPageText, PageDescriptor, PageProviderBatch, PluginPagePresentation } from '../../navigation';
import type { RegisteredPluginRegistrationDetail } from '../registration/types';

const cloneLocalizedText = (text: LocalizedPageText): LocalizedPageText =>
  Object.freeze({
    'en-US': text['en-US'],
    ...(text['zh-CN'] ? { 'zh-CN': text['zh-CN'] } : {}),
  });

const clonePresentation = (presentation: PluginPagePresentation): PluginPagePresentation =>
  Object.freeze({
    initial_size: Object.freeze({
      width: presentation.initial_size.width,
      height: presentation.initial_size.height,
    }),
    resizable: presentation.resizable,
  });

export const mapPluginRegistrationToPageProviderBatch = (
  detail: RegisteredPluginRegistrationDetail,
): PageProviderBatch | undefined => {
  if (!detail.enabled || !detail.compatibility.lensx || !detail.compatibility.host_api) {
    return undefined;
  }

  const ownerId = detail.manifest.plugin_id;
  const pages: readonly PageDescriptor[] = Object.freeze(
    detail.manifest.contributes.pages.map((page) =>
      Object.freeze({
        owner_id: ownerId,
        page_id: page.id,
        title: cloneLocalizedText(page.title),
        route: page.route,
        presentation: clonePresentation(page.presentation),
        ...(page.parent_page_id
          ? {
              parent: Object.freeze({
                owner_id: ownerId,
                page_id: page.parent_page_id,
              }),
            }
          : {}),
        available: true,
      }),
    ),
  );

  return Object.freeze({
    provider: Object.freeze({
      kind: 'plugin' as const,
      owner_id: ownerId,
      display_name: cloneLocalizedText(detail.manifest.display.name),
    }),
    pages,
  });
};
