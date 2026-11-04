import { Typography } from '@douyinfe/semi-ui';
import { type ComponentType, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppProviders } from '../AppProviders';
import { DetachedHostShell } from './DetachedHostShell';
import {
  type HostWindowBootstrap as BootstrapMode,
  desktopHostWindowPort,
  type HostWindowPort,
} from './host-window-protocol';

const loadMain = () => import('../AppBootstrap').then(({ AppBootstrap }) => ({ default: AppBootstrap }));
const FailureFeedback = () => {
  const { t } = useTranslation();
  return (
    <section className="plugin-runtime-feedback" role="alert">
      <Typography.Text>{t('launcher.page.pluginRuntimeFailureTitle')}</Typography.Text>
    </section>
  );
};

/** Only native source-derived bootstrap mode can load the main application module. */
export const HostWindowBootstrap = ({
  port = desktopHostWindowPort,
  loadMainApplication = loadMain,
}: {
  port?: HostWindowPort;
  loadMainApplication?: () => Promise<{ default: ComponentType }>;
}) => {
  const request = useRef<Promise<BootstrapMode> | undefined>(undefined);
  const [mode, setMode] = useState<BootstrapMode>();
  const [failed, setFailed] = useState(false);
  const Main = useMemo(() => lazy(loadMainApplication), [loadMainApplication]);
  useEffect(() => {
    let current = true;
    request.current ??= port.bootstrap();
    const timer = setTimeout(() => {
      if (current) setFailed(true);
      current = false;
    }, 10_000);
    void request.current.then(
      (value) => {
        if (current) setMode(value);
        clearTimeout(timer);
      },
      () => {
        if (current) setFailed(true);
        clearTimeout(timer);
      },
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [port]);
  if (failed)
    return (
      <AppProviders>
        <FailureFeedback />
      </AppProviders>
    );
  if (!mode) return null;
  if (mode.mode === 'detached') return <DetachedHostShell snapshot={mode.snapshot} port={port} />;
  return (
    <Suspense fallback={null}>
      <Main />
    </Suspense>
  );
};
