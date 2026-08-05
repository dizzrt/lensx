import type { PluginRuntimeAttempt } from './lifecycle-controller';
import { browserPluginRuntimeScheduler, type PluginRuntimeScheduler } from './scheduler';
import {
  browserPluginRuntimeSessionAdapters,
  type PluginRuntimeSessionAdapters,
  type PluginRuntimeSessionMessagePort,
  type PluginRuntimeSessionTargetWindow,
} from './session-adapters';
import {
  createPluginRuntimeSessionBootstrap,
  freezePluginRuntimeSessionIdentity,
  PluginRuntimeSessionError,
  type PluginRuntimeSessionErrorCode,
  type PluginRuntimeSessionIdentity,
  type PluginRuntimeSessionIdentityInput,
  type PluginRuntimeSessionState,
  parsePluginRuntimeSessionReadyAcknowledgement,
} from './session-contract';

export const PLUGIN_RUNTIME_SESSION_HANDSHAKE_DEADLINE_MS = 5_000;

export interface PluginRuntimeHostPortLease {
  readonly identity: PluginRuntimeSessionIdentity;
  readonly port: PluginRuntimeSessionMessagePort;
}

export interface PluginRuntimeSessionSnapshot {
  readonly state: PluginRuntimeSessionState;
  readonly identity: PluginRuntimeSessionIdentity;
  readonly lease?: PluginRuntimeHostPortLease;
  readonly error_code?: PluginRuntimeSessionErrorCode;
}

export interface PluginRuntimeSession {
  readonly snapshot: () => PluginRuntimeSessionSnapshot;
  readonly subscribe: (listener: (snapshot: PluginRuntimeSessionSnapshot) => void) => () => void;
  readonly disconnect: () => void;
  readonly dispose: () => void;
}

export interface StartPluginRuntimeSessionInput {
  readonly identity: PluginRuntimeSessionIdentityInput;
  readonly targetWindow: PluginRuntimeSessionTargetWindow;
  readonly targetOrigin: string;
  readonly owningAttempt?: Pick<PluginRuntimeAttempt, 'isCurrent' | 'fail'>;
  readonly consumeReadyLease?: (lease: PluginRuntimeHostPortLease) => () => void;
}

export interface PluginRuntimeSessionService {
  readonly start: (input: StartPluginRuntimeSessionInput) => PluginRuntimeSession;
  readonly current: () => PluginRuntimeSession | undefined;
  readonly disconnect: () => void;
  readonly dispose: () => void;
}

const safeClose = (port: PluginRuntimeSessionMessagePort) => {
  port.onmessage = null;
  port.onmessageerror = null;
  try {
    port.close();
  } catch {
    // A transferred or already-closed Port is safe to forget.
  }
};

export const createPluginRuntimeSessionService = (
  adapters: PluginRuntimeSessionAdapters = browserPluginRuntimeSessionAdapters,
  scheduler: PluginRuntimeScheduler = browserPluginRuntimeScheduler,
): PluginRuntimeSessionService => {
  let active: PluginRuntimeSession | undefined;

  const service: PluginRuntimeSessionService = Object.freeze({
    start(input: StartPluginRuntimeSessionInput) {
      const { identity: identityInput, targetWindow, targetOrigin, owningAttempt, consumeReadyLease } = input;
      active?.dispose();
      const identity = freezePluginRuntimeSessionIdentity(identityInput);
      if (targetOrigin !== identity.expected_origin) {
        throw new PluginRuntimeSessionError('invalid_identity');
      }
      const nonce = adapters.createNonce();
      const bootstrap = createPluginRuntimeSessionBootstrap(nonce);
      const channel = adapters.createMessageChannel();
      const listeners = new Set<(snapshot: PluginRuntimeSessionSnapshot) => void>();
      let state: PluginRuntimeSessionState = 'awaiting_handshake';
      let pendingNonce: string | undefined = nonce;
      let errorCode: PluginRuntimeSessionErrorCode | undefined;
      let lease: PluginRuntimeHostPortLease | undefined;
      let handshakeTimer: unknown;
      let leaseCleanup: (() => void) | undefined;

      const snapshot = (): PluginRuntimeSessionSnapshot =>
        Object.freeze({
          state,
          identity,
          ...(lease ? { lease } : {}),
          ...(errorCode ? { error_code: errorCode } : {}),
        });
      const publish = () => {
        const value = snapshot();
        for (const listener of listeners) listener(value);
      };
      const closePorts = () => {
        const cleanup = leaseCleanup;
        leaseCleanup = undefined;
        try {
          cleanup?.();
        } catch {
          // Lease consumer cleanup cannot expose a private failure.
        }
        safeClose(channel.port1);
        safeClose(channel.port2);
      };
      const clearHandshakeDeadline = () => {
        if (handshakeTimer !== undefined) scheduler.clearTimeout(handshakeTimer);
        handshakeTimer = undefined;
      };
      const transitionDisconnected = (code: PluginRuntimeSessionErrorCode, notifyOwner = true) => {
        if (state === 'disconnected' || state === 'disposed') return;
        state = 'disconnected';
        clearHandshakeDeadline();
        pendingNonce = undefined;
        lease = undefined;
        errorCode = code;
        closePorts();
        publish();
        if (notifyOwner && owningAttempt?.isCurrent()) {
          void owningAttempt.fail(
            code === 'handshake_timeout'
              ? 'runtime_handshake_timeout'
              : code === 'port_disconnected'
                ? 'runtime_session_disconnected'
                : 'runtime_unavailable',
          );
        }
      };

      const session: PluginRuntimeSession = Object.freeze({
        snapshot,
        subscribe(listener: (snapshot: PluginRuntimeSessionSnapshot) => void) {
          listeners.add(listener);
          listener(snapshot());
          return () => listeners.delete(listener);
        },
        disconnect: () => transitionDisconnected('port_disconnected'),
        dispose() {
          if (state === 'disposed') return;
          state = 'disposed';
          clearHandshakeDeadline();
          pendingNonce = undefined;
          lease = undefined;
          errorCode = undefined;
          closePorts();
          publish();
          listeners.clear();
          if (active === session) active = undefined;
        },
      });

      channel.port1.onmessage = ({ data }) => {
        if (owningAttempt && !owningAttempt.isCurrent()) {
          session.dispose();
          return;
        }
        if (state !== 'awaiting_handshake' || pendingNonce === undefined) {
          transitionDisconnected('invalid_acknowledgement');
          return;
        }
        try {
          const acknowledgement = parsePluginRuntimeSessionReadyAcknowledgement(data);
          if (acknowledgement.nonce !== pendingNonce) {
            throw new PluginRuntimeSessionError('invalid_acknowledgement');
          }
        } catch {
          transitionDisconnected('invalid_acknowledgement');
          return;
        }
        pendingNonce = undefined;
        clearHandshakeDeadline();
        lease = Object.freeze({ identity, port: channel.port1 });
        if (consumeReadyLease) {
          channel.port1.onmessage = null;
          channel.port1.onmessageerror = null;
          try {
            leaseCleanup = consumeReadyLease(lease);
          } catch {
            transitionDisconnected('port_disconnected');
            return;
          }
        }
        state = 'ready';
        publish();
      };
      channel.port1.onmessageerror = () => transitionDisconnected('port_disconnected');
      try {
        channel.port1.start();
        targetWindow.postMessage(bootstrap, targetOrigin, [channel.port2 as unknown as Transferable]);
      } catch {
        transitionDisconnected('bootstrap_failed', false);
        throw new PluginRuntimeSessionError('bootstrap_failed');
      }
      handshakeTimer = scheduler.setTimeout(() => {
        if (state === 'awaiting_handshake' && (!owningAttempt || owningAttempt.isCurrent())) {
          transitionDisconnected('handshake_timeout');
        }
      }, PLUGIN_RUNTIME_SESSION_HANDSHAKE_DEADLINE_MS);
      active = session;
      return session;
    },
    current: () => active,
    disconnect: () => active?.disconnect(),
    dispose: () => active?.dispose(),
  });
  return service;
};
