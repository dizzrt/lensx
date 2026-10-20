import { Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { useEffect, useId } from 'react';
import type { LauncherActionHostIcon } from './actions';
import { HostActionIcon } from './HostActionIcon';
import { useActionTileTitleFit } from './useActionTileTitleFit';
import type { ActionTileTooltipController } from './useActionTileTooltip';

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
  readonly instanceId?: string;
  readonly locale?: string;
  readonly onActivate: (actionId: string) => void;
  readonly option?: boolean;
  readonly tooltip?: ActionTileTooltipController;
}

export const ActionTile = ({
  action,
  isPending = false,
  isSelected = false,
  mainButtonId,
  instanceId,
  locale,
  onActivate,
  option = false,
  tooltip,
}: ActionTileProps) => {
  const generatedId = useId();
  const id = instanceId ?? generatedId;
  const tooltipId = `${id}-title-tooltip`;
  const { containerRef, measureRef, fontSize, isTruncated } = useActionTileTitleFit(action.title, locale);
  const isTooltipVisible = Boolean(tooltip && tooltip.activeId === id && isTruncated);
  const release = tooltip?.release;
  useEffect(() => () => release?.(id), [id, release]);

  const tile = (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover arbitration includes disabled buttons without adding another focus target.
    <div
      aria-describedby={undefined}
      className="launcher-action-tile flex min-w-0 items-stretch"
      data-pending={isPending || undefined}
      data-selected={isSelected || undefined}
      onMouseEnter={() => tooltip?.enter(id)}
      onMouseLeave={() => tooltip?.leave(id)}
      tabIndex={-1}
    >
      <Button
        aria-busy={isPending || undefined}
        aria-describedby={isTooltipVisible ? tooltipId : undefined}
        aria-label={action.title}
        aria-selected={option ? isSelected : undefined}
        className="launcher-action-main min-w-0 flex-1"
        disabled={isPending}
        id={mainButtonId}
        onClick={() => onActivate(action.action_id)}
        onBlur={option ? undefined : () => tooltip?.blur(id)}
        onFocus={option ? undefined : () => tooltip?.focus(id)}
        onKeyDown={
          option
            ? undefined
            : (event) => {
                if (
                  event.key === 'Escape' &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229 &&
                  isTooltipVisible
                ) {
                  event.preventDefault();
                  tooltip?.dismiss();
                }
              }
        }
        onPointerDown={option ? (event) => event.preventDefault() : undefined}
        role={option ? 'option' : undefined}
        tabIndex={option ? -1 : undefined}
        theme="borderless"
        type="tertiary"
      >
        <span className="launcher-action-content min-w-0 flex flex-1 flex-col items-center justify-center gap-1">
          <HostActionIcon icon={action.icon} />
          <span className="launcher-action-text w-full min-w-0 text-center" ref={containerRef}>
            <Typography.Text className="launcher-action-title" strong style={{ fontSize }}>
              {action.title}
            </Typography.Text>
          </span>
        </span>
      </Button>
      <span aria-hidden="true" className="launcher-action-title launcher-action-title-measure" ref={measureRef}>
        {action.title}
      </span>
    </div>
  );

  return tooltip ? (
    <Tooltip
      autoAdjustOverflow
      className="launcher-action-tooltip"
      closeOnEsc={false}
      content={
        // biome-ignore lint/a11y/noStaticElementInteractions: the non-interactive tooltip preserves pointer reading without adding a control.
        <div
          className="launcher-action-tooltip-content"
          onMouseEnter={() => tooltip.enter(id)}
          onMouseLeave={() => tooltip.leave(id)}
        >
          {action.title}
        </div>
      }
      disableArrowKeyDown
      disableFocusListener
      getPopupContainer={() => document.body}
      guardFocus={false}
      margin={8}
      motion={false}
      position="top"
      returnFocusOnClose={false}
      showArrow={false}
      trigger="custom"
      visible={isTooltipVisible}
      wrapperId={tooltipId}
    >
      {tile}
    </Tooltip>
  ) : (
    tile
  );
};
