import { Icon } from '@douyinfe/semi-ui';

export const PinIcon = ({ filled = false }: { readonly filled?: boolean }) => (
  <Icon
    aria-hidden="true"
    size="default"
    svg={
      <svg aria-hidden="true" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24">
        <path
          d="m8 4 8 0-1 5 3 3v1H6v-1l3-3-1-5Zm4 9v7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    }
  />
);

export const CloseIcon = () => (
  <Icon
    aria-hidden="true"
    size="default"
    svg={
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    }
  />
);
