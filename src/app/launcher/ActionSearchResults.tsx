import { Typography } from '@douyinfe/semi-ui';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionTile } from './ActionTile';
import type { LauncherActionSearchResult } from './actions';
import { useActionTileTooltip } from './useActionTileTooltip';

interface ActionSearchResultsProps {
  readonly listboxId: string;
  readonly results: readonly LauncherActionSearchResult[];
  readonly selectedActionId?: string;
  readonly pendingActionId?: string;
  readonly onActivate: (actionId: string) => void;
  readonly visibleError?: string;
  readonly isInputFocused?: boolean;
  readonly locale?: string;
}

export const getLauncherActionOptionId = (actionId: string) => `launcher-action-option-${actionId}`;

export const ActionSearchResults = ({
  listboxId,
  results,
  selectedActionId,
  pendingActionId,
  onActivate,
  visibleError,
  isInputFocused = false,
  locale,
}: ActionSearchResultsProps) => {
  const { t } = useTranslation();
  const headingId = `${listboxId}-heading`;
  const instanceId = useId();
  const tooltip = useActionTileTooltip(
    isInputFocused && selectedActionId ? `${instanceId}-${selectedActionId}` : undefined,
  );

  return (
    <section aria-labelledby={headingId} className="launcher-search-section flex min-h-0 flex-1 flex-col gap-3">
      <Typography.Title className="launcher-section-title" heading={2} id={headingId}>
        {t('launcher.search.resultsLabel')}
      </Typography.Title>
      {results.length > 0 ? (
        <div
          aria-labelledby={headingId}
          className="launcher-results grid min-h-0 grid-cols-4 gap-2"
          id={listboxId}
          role="listbox"
        >
          {results.map((result) => (
            <ActionTile
              action={result}
              isPending={pendingActionId === result.action_id}
              isSelected={selectedActionId === result.action_id}
              key={result.action_id}
              instanceId={`${instanceId}-${result.action_id}`}
              locale={locale}
              mainButtonId={getLauncherActionOptionId(result.action_id)}
              onActivate={onActivate}
              option
              tooltip={tooltip}
            />
          ))}
        </div>
      ) : (
        <Typography.Text className="launcher-search-empty flex flex-1 items-center justify-center" type="tertiary">
          {t('launcher.search.noResults')}
        </Typography.Text>
      )}
      {visibleError ? (
        <Typography.Text className="launcher-search-error" role="alert" type="danger">
          {visibleError}
        </Typography.Text>
      ) : null}
    </section>
  );
};
