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
): PluginRuntimeSessionService => {
  let active: PluginRuntimeSession | undefined;

  const service: PluginRuntimeSessionService = Object.freeze({
    start(input: StartPluginRuntimeSessionInput) {
      const { identity: identityInput, targetWindow, targetOrigin } = input;
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
        safeClose(channel.port1);
        safeClose(channel.port2);
      };
      const transitionDisconnected = (code: PluginRuntimeSessionErrorCode) => {
        if (state === 'disconnected' || state === 'disposed') return;
        state = 'disconnected';
        pendingNonce = undefined;
        lease = undefined;
        errorCode = code;
        closePorts();
        publish();
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
        state = 'ready';
        lease = Object.freeze({ identity, port: channel.port1 });
        publish();
      };
      channel.port1.onmessageerror = () => transitionDisconnected('port_disconnected');
      try {
        channel.port1.start();
        targetWindow.postMessage(bootstrap, targetOrigin, [channel.port2 as unknown as Transferable]);
      } catch {
        transitionDisconnected('bootstrap_failed');
        throw new PluginRuntimeSessionError('bootstrap_failed');
      }
      active = session;
      return session;
    },
    current: () => active,
    disconnect: () => active?.disconnect(),
    dispose: () => active?.dispose(),
  });
  return service;
};
