import { Typography } from '@douyinfe/semi-ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface PageErrorBoundaryState {
  hasError: boolean;
}

interface PageErrorBoundaryImplementationProps {
  children: ReactNode;
  description: string;
  title: string;
}

class PageErrorBoundaryImplementation extends Component<PageErrorBoundaryImplementationProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): PageErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('The active Host page failed to render.', error, errorInfo);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        aria-labelledby="active-page-error-title"
        className="active-page-error flex flex-col items-center justify-center gap-2 p-6 text-center"
        role="alert"
      >
        <Typography.Title heading={3} id="active-page-error-title">
          {this.props.title}
        </Typography.Title>
        <Typography.Paragraph type="tertiary">{this.props.description}</Typography.Paragraph>
      </div>
    );
  }
}

interface PageErrorBoundaryProps {
  children: ReactNode;
}

export const PageErrorBoundary = ({ children }: PageErrorBoundaryProps) => {
  const { t } = useTranslation();

  return (
    <PageErrorBoundaryImplementation
      description={t('launcher.page.errorDescription')}
      title={t('launcher.page.errorTitle')}
    >
      {children}
    </PageErrorBoundaryImplementation>
  );
};
