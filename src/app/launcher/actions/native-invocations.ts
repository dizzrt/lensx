import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { desktopShortcutService } from '../../shortcuts';
import type { LauncherActionService } from './service';

export interface NativeActionInvocation {
  readonly invocation_id: number;
  readonly binding_revision: number;
  readonly action_id: string;
}

export interface NativeActionInvocationPort {
  readonly listen: (receive: (payload: unknown) => void, failed: () => void) => Promise<() => void>;
  readonly ready: (ready: boolean) => Promise<readonly NativeActionInvocation[]>;
  readonly claim: (invocationId: number) => Promise<boolean>;
  readonly isCurrent?: (invocation: NativeActionInvocation) => Promise<boolean>;
}

const parseInvocation = (payload: unknown): NativeActionInvocation | undefined => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const value = payload as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3 ||
    !Number.isSafeInteger(value.invocation_id) ||
    Number(value.invocation_id) <= 0 ||
    !Number.isSafeInteger(value.binding_revision) ||
    Number(value.binding_revision) < 0 ||
    typeof value.action_id !== 'string' ||
    value.action_id.length > 255
  )
    return undefined;
  return Object.freeze({
    invocation_id: value.invocation_id as number,
    binding_revision: value.binding_revision as number,
    action_id: value.action_id,
  });
};

export const desktopNativeActionInvocationPort: NativeActionInvocationPort = Object.freeze({
  async listen(receive: (payload: unknown) => void, failed: () => void) {
    const detach = await listen<unknown>('launcher-shortcut-invocation', ({ payload }) => receive(payload));
    try {
      const detachFailure = await listen('launcher-shortcut-failed', () => failed());
      return () => {
        detach();
        detachFailure();
      };
    } catch (error) {
      detach();
      throw error;
    }
  },
  ready: (ready: boolean) => invoke<readonly NativeActionInvocation[]>('set_launcher_shortcut_host_ready', { ready }),
  async isCurrent(invocation: NativeActionInvocation) {
    const snapshot = await desktopShortcutService.read();
    return (
      snapshot.configuration.revision === invocation.binding_revision &&
      snapshot.bindings.some((binding) => binding.target === invocation.action_id && binding.status === 'active')
    );
  },
  claim: (invocationId: number) =>
    invoke<boolean>('ack_launcher_shortcut_invocation', { invocationId, outcome: 'accepted' }),
});

/** Listener precedes the ready handshake; duplicate handshake/events share one native claim. */
export const startNativeActionInvocations = async (
  actions: LauncherActionService,
  onFailure: () => void,
  port: NativeActionInvocationPort = desktopNativeActionInvocationPort,
  signal?: AbortSignal,
): Promise<() => void> => {
  let disposed = false;
  let detach: (() => void) | undefined;
  let ready = false;
  let draining = false;
  let activeId: number | undefined;
  const pending = new Map<number, NativeActionInvocation>();
  const drain = async () => {
    if (draining || !ready || disposed) return;
    draining = true;
    try {
      while (!disposed && pending.size > 0) {
        const id = Math.min(...pending.keys());
        const event = pending.get(id);
        if (!event) break;
        pending.delete(id);
        activeId = id;
        try {
          if (!(await port.claim(id)) || disposed) continue;
          const descriptor = actions.registry.snapshot().find((action) => action.action_id === event.action_id);
          if (!descriptor?.enabled || !actions.dispatcher.dispatchShortcut) {
            onFailure();
            continue;
          }
          const result = await actions.dispatcher.dispatchShortcut(
            event.action_id,
            () => !disposed && (port.isCurrent?.(event) ?? true),
          );
          if (!disposed && !result.ok) onFailure();
        } catch {
          if (!disposed) onFailure();
        } finally {
          activeId = undefined;
        }
      }
    } finally {
      draining = false;
    }
  };
  const receive = (payload: unknown) => {
    const event = parseInvocation(payload);
    if (disposed || !event || pending.has(event.invocation_id) || activeId === event.invocation_id) return;
    if (pending.size >= 32) {
      onFailure();
      return;
    }
    pending.set(event.invocation_id, event);
    void drain();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    detach?.();
    pending.clear();
    void port.ready(false).catch(() => undefined);
  };
  if (signal?.aborted) {
    dispose();
    return dispose;
  }
  signal?.addEventListener('abort', dispose, { once: true });
  try {
    detach = await port.listen(receive, () => {
      if (!disposed) onFailure();
    });
    if (disposed) {
      detach();
      return dispose;
    }
    const initial = await port.ready(true);
    if (disposed) {
      void port.ready(false).catch(() => undefined);
      return dispose;
    }
    for (const item of initial) receive(item);
    ready = true;
    void drain();
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
};
