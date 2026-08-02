import { type ReactNode, useId } from 'react';

import { usePluginUiMessages } from './locale.js';

export interface PluginPageProps {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly description?: ReactNode;
  readonly title: ReactNode;
}

export const PluginPage = ({ actions, children, className, description, title }: PluginPageProps) => {
  const headingId = useId();
  const messages = usePluginUiMessages();
  const classes = ['lensx-plugin-page', className].filter(Boolean).join(' ');

  return (
    <main aria-labelledby={headingId} className={classes}>
      <header className="lensx-plugin-page__header">
        <div className="lensx-plugin-page__heading-group">
          <h1 className="lensx-plugin-page__title" id={headingId}>
            {title}
          </h1>
          {description === undefined || description === null ? null : (
            <div className="lensx-plugin-page__description">{description}</div>
          )}
        </div>
        {actions === undefined || actions === null ? null : (
          <fieldset aria-label={messages.pageActions} className="lensx-plugin-page__actions">
            {actions}
          </fieldset>
        )}
      </header>
      <div className="lensx-plugin-page__content">{children}</div>
    </main>
  );
};
