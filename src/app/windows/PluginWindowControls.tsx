import { Button, Typography } from '@douyinfe/semi-ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { PluginWindowControls } from './usePluginWindowControls';

export const PluginWindowRecoveryControls = ({ controls }: { controls: PluginWindowControls }) => {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const ticketIdentity = controls.recovery
    .map((item) => `${item.ticket.attemptId}/${item.ticket.transferToken}`)
    .join(',');
  useEffect(() => {
    if (ticketIdentity) heading.current?.focus({ preventScroll: true });
  }, [ticketIdentity]);
  if (!controls.recovery.length) return null;
  return (
    <section
      className="flex flex-col gap-2 px-4 pb-3"
      aria-label={t('launcher.pluginWindow.recoveryTitle')}
      data-plugin-window-recovery="true"
    >
      <h2 ref={heading} tabIndex={-1} className="m-0 text-base">
        {t('launcher.pluginWindow.recoveryTitle')}
      </h2>
      <Typography.Text>{t('launcher.pluginWindow.recoveryDescription')}</Typography.Text>
      {controls.recovery.map((item) => (
        <div
          key={`${item.ticket.attemptId}/${item.ticket.transferToken}`}
          className="flex flex-wrap items-center gap-2"
        >
          <span role="status">{t(`launcher.pluginWindow.recoveryState.${item.status}`)}</span>
          <Button disabled={item.status !== 'recovery_required'} onClick={() => void controls.retry(item.ticket)}>
            {t('launcher.pluginWindow.retryRecovery')}
          </Button>
          <Button disabled={item.closePending} onClick={() => void controls.close(item.ticket)}>
            {t('launcher.pluginWindow.closeInstance')}
          </Button>
        </div>
      ))}
      <Button className="self-start" onClick={() => void controls.quit()}>
        {t('launcher.pluginWindow.quit')}
      </Button>
    </section>
  );
};
