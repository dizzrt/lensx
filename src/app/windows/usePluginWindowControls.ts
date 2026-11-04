import { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginRuntimeInstanceRegistry } from '../plugins/runtime/instance-registry';
import { reportHostWindowFailure } from './diagnostics';
import type {
  HostWindowOperation,
  HostWindowPort,
  PluginWindowNativeState,
  PluginWindowRecoveryTicket,
} from './host-window-protocol';

interface WindowControlsInput {
  readonly enabled: boolean;
  readonly port: HostWindowPort;
  readonly instances: PluginRuntimeInstanceRegistry;
  readonly transferPending: boolean;
  readonly reconcile: () => Promise<void>;
}
const ticketKey = (ticket: PluginWindowRecoveryTicket) => `${ticket.attemptId}\0${ticket.transferToken}`;

/** Main-document UI ownership only. Native admission and retained tickets remain authoritative. */
export const usePluginWindowControls = (input: WindowControlsInput) => {
  const current = useRef(input);
  current.current = input;
  const [native, setNative] = useState<PluginWindowNativeState>();
  const [pendingRecovery, setPendingRecovery] = useState<ReadonlyMap<string, 'recovering' | 'closing'>>(new Map());
  const live = useRef(false);
  const epoch = useRef(0);
  const readSequence = useRef(0);
  const recoveryRequests = useRef(new Map<string, object>());
  const nativeRef = useRef(native);
  nativeRef.current = native;

  const refresh = useCallback(async () => {
    if (!live.current || !input.enabled) return;
    const capturedEpoch = epoch.current;
    const sequence = ++readSequence.current;
    try {
      const next = await input.port.readPluginWindowState();
      if (!live.current || epoch.current !== capturedEpoch || sequence !== readSequence.current) return;
      nativeRef.current = next;
      setNative(next);
      if (
        next.admissionFailure &&
        current.current.instances.forSurface('main')?.presentation?.attemptId === next.admissionFailure
      )
        reportHostWindowFailure('detach');
    } catch (error) {
      if (live.current && epoch.current === capturedEpoch && sequence === readSequence.current) {
        reportHostWindowFailure('state_read', error);
      }
    }
  }, [input.enabled, input.port]);

  useEffect(() => {
    live.current = true;
    const capturedEpoch = ++epoch.current;
    if (!input.enabled)
      return () => {
        live.current = false;
        epoch.current++;
      };
    let removeNativeHints: (() => void) | undefined;
    void input.port
      .listenPluginWindowState(() => {
        void refresh();
      })
      .then((release) => {
        if (!live.current || epoch.current !== capturedEpoch) release();
        else removeNativeHints = release;
      })
      .catch(() => undefined);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    void refresh();
    return () => {
      live.current = false;
      epoch.current++;
      readSequence.current++;
      removeNativeHints?.();
      recoveryRequests.current.clear();
      window.removeEventListener('focus', onFocus);
    };
  }, [input.enabled, input.port, refresh]);
  const busy = input.transferPending || (native?.pendingAttempts.length ?? 0) > 0 || (native?.recovery.length ?? 0) > 0;
  const recover = useCallback(
    async (ticket: PluginWindowRecoveryTicket, close: boolean) => {
      const latest = current.current;
      const key = ticketKey(ticket);
      const retained = nativeRef.current?.recovery.find((item) => ticketKey(item.ticket) === key);
      if (
        !live.current ||
        !retained ||
        (!close && (retained.status !== 'recovery_required' || recoveryRequests.current.has(key)))
      )
        return;
      const request = {};
      const capturedEpoch = epoch.current;
      // A close supersedes local retry UI ownership but does not wait for that retry.
      recoveryRequests.current.set(key, request);
      setPendingRecovery((previous) => new Map(previous).set(key, close ? 'closing' : 'recovering'));
      try {
        await (close ? latest.port.closeRecovery(ticket) : latest.port.retryRecovery(ticket));
        if (!live.current || epoch.current !== capturedEpoch || recoveryRequests.current.get(key) !== request) return;
        await latest.reconcile();
      } catch (error) {
        if (live.current && epoch.current === capturedEpoch && recoveryRequests.current.get(key) === request)
          reportHostWindowFailure(close ? 'close' : 'recover', error);
      } finally {
        if (live.current && epoch.current === capturedEpoch && recoveryRequests.current.get(key) === request) {
          await refresh();
          if (live.current && epoch.current === capturedEpoch && recoveryRequests.current.get(key) === request) {
            recoveryRequests.current.delete(key);
            setPendingRecovery((previous) => {
              const next = new Map(previous);
              next.delete(key);
              return next;
            });
          }
        }
      }
    },
    [refresh],
  );
  const quit = useCallback(async () => {
    const capturedEpoch = epoch.current;
    try {
      if (!(await current.current.port.quitPluginWindows())) throw new Error('Quit unavailable');
    } catch (error) {
      if (live.current && capturedEpoch === epoch.current) reportHostWindowFailure('quit', error);
    }
  }, []);
  const observeOperation = useCallback(
    (operation: HostWindowOperation, accepted: boolean) => {
      if (!live.current) return;
      if (
        accepted &&
        operation.kind === 'settle_transfer' &&
        operation.outcome === 'restored' &&
        current.current.instances.forSurface('main')?.presentation?.attemptId === operation.attempt_id
      )
        reportHostWindowFailure('detach');
      void refresh();
    },
    [refresh],
  );
  return {
    observeOperation,
    refresh,
    quit,
    interactionFrozen: busy,
    recovery:
      native?.recovery.map((item) => ({
        ...item,
        status: pendingRecovery.get(ticketKey(item.ticket)) ?? item.status,
        closePending: pendingRecovery.get(ticketKey(item.ticket)) === 'closing',
      })) ?? [],
    retry: (ticket: PluginWindowRecoveryTicket) => recover(ticket, false),
    close: (ticket: PluginWindowRecoveryTicket) => recover(ticket, true),
  };
};
export type PluginWindowControls = ReturnType<typeof usePluginWindowControls>;
