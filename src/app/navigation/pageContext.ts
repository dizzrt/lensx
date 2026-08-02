import type { LauncherActionDescriptor, LauncherActionLocale } from '../launcher/actions/types';
import { resolveLauncherActionMetadata } from '../launcher/actions/validation';
import type { ActivePage } from './types';

export interface PageContext {
  readonly action_name: string;
  readonly owner_name: string;
}

export interface PageContextResolverInput {
  readonly activePage: ActivePage;
  readonly hostOwnerName: string;
  readonly locale: LauncherActionLocale;
  readonly pageTitleFallback: string;
  readonly snapshot: readonly LauncherActionDescriptor[];
}

export const resolvePageContext = ({
  activePage,
  hostOwnerName,
  locale,
  pageTitleFallback,
  snapshot,
}: PageContextResolverInput): PageContext => {
  const openingAction = snapshot.find(({ action_id: actionId }) => actionId === activePage.opened_by_action_id);
  return Object.freeze({
    owner_name: activePage.owner_id === 'lensx.core' ? hostOwnerName : activePage.owner_id,
    action_name: openingAction ? resolveLauncherActionMetadata(openingAction, locale).title : pageTitleFallback,
  });
};
