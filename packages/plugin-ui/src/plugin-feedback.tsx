import { Button, Spin } from '@douyinfe/semi-ui';
import type { ReactNode } from 'react';

import { usePluginUiMessages } from './locale.js';

interface PluginFeedbackBaseProps {
  readonly className?: string;
  readonly description?: ReactNode;
  readonly title?: ReactNode;
}

export interface PluginFeedbackLoadingProps extends PluginFeedbackBaseProps {
  readonly kind: 'loading';
}

export interface PluginFeedbackEmptyProps extends PluginFeedbackBaseProps {
  readonly kind: 'empty';
}

export interface PluginFeedbackErrorProps extends PluginFeedbackBaseProps {
  readonly kind: 'error';
  readonly onRecovery?: () => void;
  readonly recoveryLabel?: ReactNode;
}

export type PluginFeedbackProps = PluginFeedbackLoadingProps | PluginFeedbackEmptyProps | PluginFeedbackErrorProps;

const stateMark = {
  loading: '…',
  empty: '○',
  error: '!',
} as const;

export const PluginFeedback = (props: PluginFeedbackProps) => {
  const messages = usePluginUiMessages();
  const defaults = {
    loading: { description: messages.loadingDescription, title: messages.loadingTitle },
    empty: { description: messages.emptyDescription, title: messages.emptyTitle },
    error: { description: messages.errorDescription, title: messages.errorTitle },
  } as const;
  const title = props.title ?? defaults[props.kind].title;
  const description = props.description ?? defaults[props.kind].description;
  const isLoading = props.kind === 'loading';
  const classes = ['lensx-plugin-feedback', `lensx-plugin-feedback--${props.kind}`, props.className]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      aria-busy={isLoading || undefined}
      aria-live={props.kind === 'error' ? 'assertive' : 'polite'}
      className={classes}
      data-kind={props.kind}
      role={props.kind === 'error' ? 'alert' : 'status'}
    >
      <div aria-hidden="true" className="lensx-plugin-feedback__mark">
        {isLoading ? <Spin size="large" spinning /> : stateMark[props.kind]}
      </div>
      <h2 className="lensx-plugin-feedback__title">{title}</h2>
      <div className="lensx-plugin-feedback__description">{description}</div>
      {props.kind === 'error' && props.onRecovery !== undefined ? (
        <Button className="lensx-plugin-feedback__recovery" htmlType="button" onClick={props.onRecovery} type="danger">
          {props.recoveryLabel ?? messages.retry}
        </Button>
      ) : null}
    </section>
  );
};
