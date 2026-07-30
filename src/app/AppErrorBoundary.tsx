import { Button, Typography } from '@douyinfe/semi-ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ErrorBoundaryState {
  hasError: boolean;
}

interface ErrorBoundaryImplementationProps {
  children: ReactNode;
  description: string;
  onReload: () => void;
  reloadLabel: string;
  title: string;
}

class ErrorBoundaryImplementation extends Component<ErrorBoundaryImplementationProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('The lensX application subtree failed to render.', error, errorInfo);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        aria-labelledby="app-error-title"
        className="min-h-screen flex items-center justify-center p-8 text-center"
        role="alert"
      >
        <div className="max-w-lg flex flex-col items-center gap-4">
          <Typography.Title heading={1} id="app-error-title">
            {this.props.title}
          </Typography.Title>
          <Typography.Paragraph>{this.props.description}</Typography.Paragraph>
          <Button onClick={this.props.onReload} theme="solid" type="primary">
            {this.props.reloadLabel}
          </Button>
        </div>
      </main>
    );
  }
}

interface AppErrorBoundaryProps {
  children: ReactNode;
  onReload?: () => void;
}

const reloadCurrentWindow = () => {
  window.location.reload();
};

export const AppErrorBoundary = ({ children, onReload = reloadCurrentWindow }: AppErrorBoundaryProps) => {
  const { t } = useTranslation();

  return (
    <ErrorBoundaryImplementation
      description={t('error.description')}
      onReload={onReload}
      reloadLabel={t('error.reload')}
      title={t('error.title')}
    >
      {children}
    </ErrorBoundaryImplementation>
  );
};
