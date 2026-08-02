import { Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import type { LauncherActionHostIcon } from './actions';
import { HostActionIcon } from './HostActionIcon';
import { PinIcon } from './LauncherIcons';

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
  readonly pinAction?: {
    readonly disabled?: boolean;
    readonly label: string;
    readonly pinned: boolean;
    readonly pending?: boolean;
    readonly onActivate: (actionId: string) => void;
  };
}

export const ActionTile = ({
  action,
  isPending = false,
  isSelected = false,
  mainButtonId,
  onActivate,
  option = false,
  pinAction,
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
    {pinAction ? (
      <Tooltip content={pinAction.label} position="top">
        <Button
          aria-label={pinAction.label}
          className="launcher-action-pin"
          disabled={pinAction.disabled || pinAction.pending}
          icon={<PinIcon filled={pinAction.pinned} />}
          loading={pinAction.pending}
          onClick={() => pinAction.onActivate(action.action_id)}
          theme="borderless"
          type="tertiary"
        />
      </Tooltip>
    ) : null}
  </div>
);
