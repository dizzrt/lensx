import { Typography } from '@douyinfe/semi-ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionTile } from './ActionTile';
import type { LauncherActionDescriptor, LauncherActionLocale } from './actions';
import { resolveLauncherActionMetadata } from './actions';
import { type ActionTileTooltipController, useActionTileTooltip } from './useActionTileTooltip';

interface LauncherHomeProps {
  readonly locale: LauncherActionLocale;
  readonly onActivate: (actionId: string) => void;
  readonly pendingActionId?: string;
  readonly pinnedActions: readonly LauncherActionDescriptor[];
  readonly recentActions: readonly LauncherActionDescriptor[];
}

interface CollectionRowProps {
  readonly actions: readonly LauncherActionDescriptor[];
  readonly emptyMessage: string;
  readonly locale: LauncherActionLocale;
  readonly onActivate: (actionId: string) => void;
  readonly pendingActionId?: string;
  readonly title: string;
  readonly trailing?: string;
  readonly instancePrefix: string;
  readonly tooltip: ActionTileTooltipController;
}

const CollectionRow = ({
  actions,
  emptyMessage,
  locale,
  onActivate,
  pendingActionId,
  title,
  trailing,
  instancePrefix,
  tooltip,
}: CollectionRowProps) => {
  return (
    <section aria-label={title} className="launcher-collection flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Typography.Text strong>{title}</Typography.Text>
        {trailing ? (
          <Typography.Text aria-hidden="true" className="launcher-all-placeholder" type="tertiary">
            {trailing}
          </Typography.Text>
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div className="launcher-collection-track min-h-0 flex-1 gap-2">
          {actions.map((descriptor) => {
            const metadata = resolveLauncherActionMetadata(descriptor, locale);
            return (
              <ActionTile
                action={{ action_id: descriptor.action_id, ...metadata }}
                isPending={pendingActionId === descriptor.action_id}
                key={descriptor.action_id}
                instanceId={`${instancePrefix}-${descriptor.action_id}`}
                locale={locale}
                onActivate={onActivate}
                tooltip={tooltip}
              />
            );
          })}
        </div>
      ) : (
        <Typography.Text className="launcher-collection-empty flex flex-1 items-center px-3" type="tertiary">
          {emptyMessage}
        </Typography.Text>
      )}
    </section>
  );
};

export const LauncherHome = ({
  locale,
  onActivate,
  pendingActionId,
  pinnedActions,
  recentActions,
}: LauncherHomeProps) => {
  const { t } = useTranslation();
  const instanceId = useId();
  const tooltip = useActionTileTooltip(undefined, true);
  return (
    <div className="launcher-home flex min-h-0 flex-1 flex-col gap-3">
      <CollectionRow
        actions={recentActions}
        emptyMessage={t('launcher.home.recentEmpty')}
        locale={locale}
        instancePrefix={`${instanceId}-recent`}
        tooltip={tooltip}
        onActivate={onActivate}
        pendingActionId={pendingActionId}
        title={t('launcher.home.recentTitle')}
      />
      <CollectionRow
        actions={pinnedActions}
        emptyMessage={t('launcher.home.pinnedEmpty')}
        locale={locale}
        instancePrefix={`${instanceId}-pinned`}
        tooltip={tooltip}
        onActivate={onActivate}
        pendingActionId={pendingActionId}
        title={t('launcher.home.pinnedTitle')}
        trailing={t('launcher.home.allPlaceholder')}
      />
    </div>
  );
};
