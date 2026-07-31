import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import type { LauncherActionSearchResult } from './actions';

interface ActionSearchResultsProps {
  readonly listboxId: string;
  readonly results: readonly LauncherActionSearchResult[];
  readonly selectedActionId?: string;
  readonly pendingActionId?: string;
  readonly onActivate: (actionId: string) => void;
}

export const getLauncherActionOptionId = (actionId: string) => `launcher-action-option-${actionId}`;

export const ActionSearchResults = ({
  listboxId,
  results,
  selectedActionId,
  pendingActionId,
  onActivate,
}: ActionSearchResultsProps) => {
  const { t } = useTranslation();

  return (
    <div
      aria-label={t('launcher.search.resultsLabel')}
      className="launcher-results flex flex-col"
      id={listboxId}
      role="listbox"
    >
      {results.map((result) => {
        const isPending = pendingActionId === result.action_id;
        const isSelected = selectedActionId === result.action_id;

        return (
          <button
            aria-busy={isPending || undefined}
            aria-selected={isSelected}
            className="launcher-result flex w-full items-center gap-3 text-left"
            data-pending={isPending || undefined}
            data-selected={isSelected || undefined}
            id={getLauncherActionOptionId(result.action_id)}
            key={result.action_id}
            onClick={() => onActivate(result.action_id)}
            onPointerDown={(event) => event.preventDefault()}
            role="option"
            tabIndex={-1}
            type="button"
          >
            <span className="min-w-0 flex-1">
              <Typography.Text className="launcher-result-title" strong>
                {result.title}
              </Typography.Text>
              {result.description ? (
                <Typography.Text className="launcher-result-description" ellipsis type="tertiary">
                  {result.description}
                </Typography.Text>
              ) : null}
            </span>
            {isPending ? (
              <Typography.Text className="launcher-result-pending" type="tertiary">
                {t('launcher.search.pendingShort')}
              </Typography.Text>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
