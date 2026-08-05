export interface PluginRuntimeSessionMessageEvent {
  readonly data: unknown;
}

export interface PluginRuntimeSessionMessagePort {
  onmessage: ((event: PluginRuntimeSessionMessageEvent) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage: (value: unknown) => void;
  start: () => void;
  close: () => void;
}

export interface PluginRuntimeSessionMessageChannel {
  readonly port1: PluginRuntimeSessionMessagePort;
  readonly port2: PluginRuntimeSessionMessagePort;
}

export interface PluginRuntimeSessionTargetWindow {
  postMessage: (message: unknown, targetOrigin: string, transfer: readonly Transferable[]) => void;
}

export interface PluginRuntimeSessionAdapters {
  readonly createNonce: () => string;
  readonly createMessageChannel: () => PluginRuntimeSessionMessageChannel;
}

export type PluginRuntimeRandomFill = (bytes: Uint8Array<ArrayBuffer>) => void;

export const createCryptographicPluginRuntimeNonce = (
  fillRandom: PluginRuntimeRandomFill = (bytes) => {
    globalThis.crypto.getRandomValues(bytes);
  },
): string => {
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const browserPluginRuntimeSessionAdapters: PluginRuntimeSessionAdapters = Object.freeze({
  createNonce: () => createCryptographicPluginRuntimeNonce(),
  createMessageChannel: () => {
    const channel = new MessageChannel();
    return {
      port1: channel.port1 as unknown as PluginRuntimeSessionMessagePort,
      port2: channel.port2 as unknown as PluginRuntimeSessionMessagePort,
    };
  },
});
