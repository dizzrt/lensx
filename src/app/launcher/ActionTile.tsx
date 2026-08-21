import { Button, Typography } from '@douyinfe/semi-ui';
import type { LauncherActionHostIcon } from './actions';
import { HostActionIcon } from './HostActionIcon';

export interface ActionTileModel {
  readonly action_id: string;
  readonly title: string;
  readonly description?: string;
  readonly icon?: LauncherActionHostIcon;
}

interface ActionTileProps {
  readonly action: ActionTileModel;
  readonly isPending?: boolean;
  readonly isSelected?: boolean;
  readonly mainButtonId?: string;
  readonly onActivate: (actionId: string) => void;
  readonly option?: boolean;
}

export const ActionTile = ({
  action,
  isPending = false,
  isSelected = false,
  mainButtonId,
  onActivate,
  option = false,
}: ActionTileProps) => (
  <div
    className="launcher-action-tile flex min-w-0 items-stretch"
    data-pending={isPending || undefined}
    data-selected={isSelected || undefined}
  >
    <Button
      aria-busy={isPending || undefined}
      aria-selected={option ? isSelected : undefined}
      className="launcher-action-main min-w-0 flex-1"
      disabled={isPending}
      id={mainButtonId}
      onClick={() => onActivate(action.action_id)}
      onPointerDown={option ? (event) => event.preventDefault() : undefined}
      role={option ? 'option' : undefined}
      tabIndex={option ? -1 : undefined}
      theme="borderless"
      type="tertiary"
    >
      <span className="launcher-action-content min-w-0 flex flex-1 flex-col items-center justify-center gap-1">
        <HostActionIcon icon={action.icon} />
        <span className="launcher-action-text w-full min-w-0 text-center">
          <Typography.Text className="launcher-action-title" ellipsis strong>
            {action.title}
          </Typography.Text>
        </span>
      </span>
    </Button>
  </div>
);
