import { Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const App = () => {
  const { t } = useTranslation();

  return (
    <main aria-labelledby="app-title" className="min-h-screen flex items-center justify-center p-8 text-center">
      <div className="max-w-xl flex flex-col items-center gap-3">
        <Typography.Title heading={1} id="app-title">
          {t('app.name')}
        </Typography.Title>
        <Typography.Paragraph>{t('app.description')}</Typography.Paragraph>
      </div>
    </main>
  );
};

export default App;
