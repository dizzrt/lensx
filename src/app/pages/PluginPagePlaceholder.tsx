import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

export interface PluginPagePlaceholderProps {
  readonly pageTitle: string;
}

export const PluginPagePlaceholder = ({ pageTitle }: PluginPagePlaceholderProps) => {
  const { t } = useTranslation();

  return (
    <section
      aria-label={pageTitle}
      className="plugin-page-placeholder min-h-0 flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center"
    >
      <Typography.Title className="plugin-page-placeholder-title" heading={4}>
        {pageTitle}
      </Typography.Title>
      <Typography.Text type="tertiary">{t('launcher.page.pluginRuntimeUnavailable')}</Typography.Text>
    </section>
  );
};
