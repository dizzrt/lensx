import { Icon } from '@douyinfe/semi-ui';
import type { ReactNode } from 'react';
import type { PageContextOwnerIcon as PageContextOwnerIconPresentation } from './pageContext';

interface PageContextOwnerIconProps {
  readonly icon?: PageContextOwnerIconPresentation;
}

const ownerSvgByToken: Readonly<Record<string, ReactNode>> = Object.freeze({
  'lensx-owner': (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M5.5 5.5v13h6M13.2 8.1l5.3 7.8m0-7.8-5.3 7.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  ),
});

const ownerFallbackSvg = (
  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
    <path d="m12 3.8 7 4v8.4l-7 4-7-4V7.8l7-4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
    <path d="m8.5 9.8 3.5 2 3.5-2M12 11.8v4.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
  </svg>
);

export const PageContextOwnerIcon = ({ icon }: PageContextOwnerIconProps) => {
  const resolvedSvg = icon?.kind === 'host' ? ownerSvgByToken[icon.token] : undefined;

  return (
    <Icon
      aria-hidden="true"
      className="page-context-owner-icon"
      data-owner-icon-token={resolvedSvg ? icon?.token : 'owner-fallback'}
      size="default"
      svg={resolvedSvg ?? ownerFallbackSvg}
    />
  );
};
