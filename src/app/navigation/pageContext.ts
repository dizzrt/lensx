import type { LauncherActionDescriptor, LauncherActionLocale } from '../launcher/actions/types';
import { resolveLauncherActionMetadata } from '../launcher/actions/validation';
import type { ActivePage, LocalizedPageText, PageResolution } from './types';

export interface PageContext {
  readonly action_name: string;
  readonly owner_icon?: PageContextOwnerIcon;
  readonly owner_name: string;
  readonly page_title: string;
}

export type PageContextOwnerIcon =
  | { readonly kind: 'host'; readonly token: string }
  | { readonly kind: 'plugin'; readonly token: 'generic-provider' };

export interface PageContextResolverInput {
  readonly activePage: ActivePage;
  readonly hostOwnerName: string;
  readonly locale: LauncherActionLocale;
  readonly resolution: PageResolution;
  readonly snapshot: readonly LauncherActionDescriptor[];
}

export const resolveLocalizedPageText = (text: LocalizedPageText, locale: LauncherActionLocale) =>
  text[locale] ?? text['en-US'];

export const resolvePageContext = ({
  activePage,
  hostOwnerName,
  locale,
  resolution,
  snapshot,
}: PageContextResolverInput): PageContext => {
  const openingAction = snapshot.find(({ action_id: actionId }) => actionId === activePage.opened_by_action_id);
  const pageTitle = resolveLocalizedPageText(resolution.page.title, locale);
  const isHost = resolution.provider.kind === 'host';
  return Object.freeze({
    owner_name: isHost ? hostOwnerName : resolveLocalizedPageText(resolution.provider.display_name, locale),
    owner_icon: Object.freeze(
      isHost
        ? { kind: 'host' as const, token: 'lensx-owner' as const }
        : { kind: 'plugin' as const, token: 'generic-provider' as const },
    ),
    action_name: openingAction ? resolveLauncherActionMetadata(openingAction, locale).title : pageTitle,
    page_title: pageTitle,
  });
};
