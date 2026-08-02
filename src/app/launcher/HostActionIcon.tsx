import { Icon } from '@douyinfe/semi-ui';
import type { ReactNode } from 'react';
import type { LauncherActionHostIcon } from './actions';

interface HostActionIconProps {
  readonly icon?: LauncherActionHostIcon;
}

const iconSvgByToken: Readonly<Record<string, ReactNode>> = Object.freeze({
  'hide-launcher': (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M3.5 12s3-5 8.5-5c2.2 0 4 .8 5.4 1.8M20.5 12s-3 5-8.5 5c-2.2 0-4-.8-5.4-1.8M4 4l16 16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  ),
  settings: (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m19 13.6 1.2 1-.9 1.7-1.5-.4a7 7 0 0 1-1.8 1.8l.4 1.5-1.7.9-1-1.2a7 7 0 0 1-2.5 0l-1 1.2-1.7-.9.4-1.5A7 7 0 0 1 7 15.9l-1.5.4-.9-1.7 1.2-1a7 7 0 0 1 0-2.5l-1.2-1 .9-1.7 1.5.4A7 7 0 0 1 8.8 7l-.4-1.5 1.7-.9 1 1.2a7 7 0 0 1 2.5 0l1-1.2 1.7.9-.4 1.5a7 7 0 0 1 1.8 1.8l1.5-.4.9 1.7-1.2 1a7 7 0 0 1 0 2.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  ),
});

const fallbackSvg = (
  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
    <path d="M7 7h10v10H7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
    <path
      d="m9.5 12 1.7 1.7 3.6-3.7"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  </svg>
);

export const HostActionIcon = ({ icon }: HostActionIconProps) => {
  const resolvedSvg = icon ? iconSvgByToken[icon.token] : undefined;
  const token = resolvedSvg ? icon?.token : 'action-fallback';

  return (
    <Icon
      aria-hidden="true"
      className="launcher-action-icon"
      data-icon-token={token}
      size="large"
      svg={resolvedSvg ?? fallbackSvg}
    />
  );
};
