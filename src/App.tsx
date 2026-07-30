import { Input, Typography } from '@douyinfe/semi-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { desktopLauncherActivationSource, type LauncherActivationSource } from './app/launcher/activation';
import { useLauncherActivation } from './app/launcher/useLauncherActivation';

interface AppProps {
  activationSource?: LauncherActivationSource;
}

const App = ({ activationSource = desktopLauncherActivationSource }: AppProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const focusLauncherInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    focusLauncherInput();
  }, [focusLauncherInput]);

  useLauncherActivation(activationSource, focusLauncherInput);

  return (
    <main aria-labelledby="app-title" className="min-h-screen flex items-center justify-center p-3">
      <section aria-describedby="app-description" className="launcher-surface w-full flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-4">
          <Typography.Title className="launcher-title" heading={1} id="app-title">
            {t('app.name')}
          </Typography.Title>
          <Typography.Text className="launcher-description" id="app-description" type="tertiary">
            {t('app.description')}
          </Typography.Text>
        </div>
        <Input
          aria-label={t('launcher.inputLabel')}
          autoComplete="off"
          onChange={setQuery}
          placeholder={t('launcher.inputPlaceholder')}
          ref={inputRef}
          size="large"
          value={query}
        />
      </section>
    </main>
  );
};

export default App;
