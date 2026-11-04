import { Spin, Typography } from '@douyinfe/semi-ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppProviders } from '../AppProviders';
import { useAppLocale } from '../i18n/locale';
import { physicalBoundsFromDomRect } from '../plugins/runtime/pluginChildWebviewSlot';
import { useAppTheme } from '../theme/theme';
import { reportHostWindowFailure } from './diagnostics';
import { desktopHostWindowPort, type HostWindowPort, type HostWindowSnapshot } from './host-window-protocol';

const ShellContent = ({ initial, port }: { initial: HostWindowSnapshot; port: HostWindowPort }) => {
  const [snapshot, setSnapshot] = useState(initial);
  const [failed, setFailed] = useState(false);
  const latest = useRef(initial);
  const rendered = useRef(initial);
  const syncGeometry = useRef<(() => void) | undefined>(undefined);
  const slot = useRef<HTMLDivElement>(null);
  const slotRevision = useRef(0n);
  const { t } = useTranslation();
  const { setLocale } = useAppLocale();
  const { setThemeMode } = useAppTheme();
  useEffect(() => {
    setLocale(snapshot.locale);
    setThemeMode(snapshot.theme);
  }, [snapshot.locale, snapshot.theme, setLocale, setThemeMode]);
  useLayoutEffect(() => {
    rendered.current = snapshot;
    syncGeometry.current?.();
  }, [snapshot]);
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    let running = false;
    let queued = false;
    let lastAcceptedGeometry: string | undefined;
    let lastAcceptedPhase: HostWindowSnapshot['phase'] | undefined;
    const matchesShell = (next: HostWindowSnapshot) =>
      next.shell_epoch === initial.shell_epoch && next.owner.windowLabel === initial.owner.windowLabel;
    const accept = (next: HostWindowSnapshot) => {
      if (!active || !matchesShell(next) || BigInt(next.revision) <= BigInt(latest.current.revision)) return;
      latest.current = next;
      setSnapshot(next);
      setFailed(false);
    };
    const report = async () => {
      queued = true;
      if (running || !active) return;
      running = true;
      try {
        while (active && queued && slot.current) {
          queued = false;
          const observed = rendered.current;
          // A newer snapshot may arrive before React commits its updated chrome and slot.
          if (observed !== latest.current || observed.phase === 'closing' || observed.phase === 'recovery_required')
            continue;
          try {
            const scale = window.devicePixelRatio;
            const bounds = physicalBoundsFromDomRect(slot.current.getBoundingClientRect(), scale);
            const key = JSON.stringify([observed.revision, scale, bounds.x, bounds.y, bounds.width, bounds.height]);
            if (key === lastAcceptedGeometry) continue;
            const accepted =
              observed.phase === 'preparing' && lastAcceptedPhase !== 'preparing'
                ? await port.ready(observed, scale, bounds)
                : await port.updateSlot(observed, ++slotRevision.current, scale, bounds);
            if (!active) return;
            if (accepted) {
              lastAcceptedGeometry = key;
              lastAcceptedPhase = observed.phase;
              if (latest.current === observed) setFailed(false);
            } else if (latest.current === observed) {
              reportHostWindowFailure('shell_geometry');
            }
          } catch (error) {
            if (active && latest.current === observed) {
              reportHostWindowFailure('shell_geometry', error);
              setFailed(true);
            }
          }
        }
      } finally {
        running = false;
      }
    };
    const sync = () => {
      void report();
    };
    const subscribe = async () => {
      const release = await port.listenSnapshots(accept);
      if (!active) {
        release();
        return;
      }
      unlisten = release;
      const confirmed = await port.subscribeShell(initial.shell_epoch);
      if (!active) return;
      if (!matchesShell(confirmed)) throw new Error('Shell subscription is unavailable.');
      accept(confirmed);
      // The handshake can confirm exactly the bootstrap revision without causing a render.
      // Install the reporter and explicitly send that first geometry only after native subscription.
      syncGeometry.current = sync;
      observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(sync);
      if (slot.current) observer?.observe(slot.current);
      window.addEventListener('resize', sync);
      sync();
    };
    void subscribe().catch((error: unknown) => {
      if (active) {
        active = false;
        unlisten?.();
        unlisten = undefined;
        reportHostWindowFailure('shell_subscription', error);
        setFailed(true);
      }
    });
    return () => {
      active = false;
      if (syncGeometry.current === sync) syncGeometry.current = undefined;
      observer?.disconnect();
      window.removeEventListener('resize', sync);
      unlisten?.();
    };
  }, [initial.shell_epoch, initial.owner.windowLabel, port]);
  const failure = failed || snapshot.error_code !== null;
  return (
    <main
      className="plugin-runtime-container detached-host-shell h-screen w-full"
      data-host-window-mode="detached"
      data-shell-phase={snapshot.phase}
      aria-label={snapshot.page.title}
      aria-busy={snapshot.phase === 'preparing'}
    >
      <div
        ref={slot}
        aria-hidden="true"
        className="plugin-runtime-slot detached-host-slot h-full min-h-0"
        data-plugin-runtime-slot="true"
      />
      {failure ? (
        <div className="plugin-runtime-feedback absolute inset-0" role="alert">
          <Typography.Text>{t('launcher.page.pluginWindowFailureTitle')}</Typography.Text>
          <Typography.Text type="secondary">{t('launcher.page.pluginWindowFailureDescription')}</Typography.Text>
        </div>
      ) : snapshot.phase === 'preparing' ? (
        <div className="plugin-runtime-loading" role="status">
          <Spin size="large" />
          <Typography.Text type="secondary">{t('launcher.page.pluginRuntimeLoading')}</Typography.Text>
        </div>
      ) : null}
    </main>
  );
};

export const DetachedHostShell = ({
  snapshot,
  port = desktopHostWindowPort,
}: {
  snapshot: HostWindowSnapshot;
  port?: HostWindowPort;
}) => (
  <AppProviders initialLocale={snapshot.locale} initialThemeMode={snapshot.theme}>
    <ShellContent key={snapshot.shell_epoch} initial={snapshot} port={port} />
  </AppProviders>
);
