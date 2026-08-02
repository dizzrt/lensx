import { Button, Typography } from '@douyinfe/semi-ui';
import { CloseIcon } from '../launcher/LauncherIcons';
import { PageContextOwnerIcon } from './PageContextOwnerIcon';
import type { PageContext } from './pageContext';

interface PageContextBarProps {
  readonly closeLabel: string;
  readonly context: PageContext;
  readonly onClose: () => void;
}

export const PageContextBar = ({ closeLabel, context, onClose }: PageContextBarProps) => (
  <section
    aria-label={`${context.owner_name}: ${context.action_name}`}
    className="page-context-slot min-w-0 flex flex-1 items-center"
  >
    <div className="page-context-control min-w-0 inline-flex items-stretch">
      <div className="page-context-owner-segment min-w-0 flex items-center gap-2" data-page-context-segment="owner">
        <PageContextOwnerIcon icon={context.owner_icon} />
        <Typography.Text className="page-context-owner-text" ellipsis strong>
          {context.owner_name}
        </Typography.Text>
      </div>
      <div className="page-context-action-segment min-w-0 flex items-center" data-page-context-segment="action">
        <Typography.Text className="page-context-action-text" ellipsis>
          {context.action_name}
        </Typography.Text>
        <Button
          aria-label={closeLabel}
          className="page-context-close"
          data-launcher-drag-exclude="true"
          icon={<CloseIcon />}
          onClick={onClose}
          theme="borderless"
          type="tertiary"
        />
      </div>
    </div>
  </section>
);
