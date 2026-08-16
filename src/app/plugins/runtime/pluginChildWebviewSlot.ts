import { invoke } from '@tauri-apps/api/core';

export const PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION = '0.1.0' as const;
export const UPDATE_PLUGIN_CHILD_WEBVIEW_SLOT_COMMAND = 'update_plugin_child_webview_slot' as const;

export interface PluginChildWebviewPhysicalBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PluginChildWebviewSlotUpdate {
  readonly attemptId: `attempt_${string}`;
  readonly scaleFactor: number;
  readonly physicalBounds: PluginChildWebviewPhysicalBounds;
  readonly presentationRevision: bigint;
}

export interface PluginChildWebviewSlotController {
  update: (update: PluginChildWebviewSlotUpdate) => Promise<void>;
}

export interface LatestPluginChildWebviewSlotUpdateQueue {
  readonly enqueue: (update: PluginChildWebviewSlotUpdate) => void;
  readonly drain: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

type SlotInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;

export const createLatestPluginChildWebviewSlotUpdateQueue = (
  send: (update: PluginChildWebviewSlotUpdate) => Promise<void>,
  onFailure: () => void,
): LatestPluginChildWebviewSlotUpdateQueue => {
  let pending: PluginChildWebviewSlotUpdate | undefined;
  let running: Promise<void> | undefined;
  let accepting = true;

  const start = () => {
    if (running !== undefined || pending === undefined) return;
    running = (async () => {
      while (pending !== undefined) {
        const update = pending;
        pending = undefined;
        try {
          await send(update);
        } catch {
          pending = undefined;
          accepting = false;
          onFailure();
          return;
        }
      }
    })().finally(() => {
      running = undefined;
    });
  };

  const drain = async () => {
    while (running !== undefined) await running;
  };

  return Object.freeze({
    enqueue(update: PluginChildWebviewSlotUpdate) {
      if (!accepting) return;
      pending = update;
      start();
    },
    drain,
    async stop() {
      accepting = false;
      await drain();
    },
  });
};

export const physicalBoundsFromDomRect = (
  rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>,
  scaleFactor: number,
): PluginChildWebviewPhysicalBounds => {
  if (
    !finitePositive(scaleFactor) ||
    ![rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height].every(Number.isFinite) ||
    rect.left < 0 ||
    rect.top < 0 ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new TypeError('Plugin Child WebView slot geometry is invalid.');
  }
  const x = Math.floor(rect.left * scaleFactor);
  const y = Math.floor(rect.top * scaleFactor);
  const right = Math.ceil(rect.right * scaleFactor);
  const bottom = Math.ceil(rect.bottom * scaleFactor);
  return Object.freeze({ x, y, width: right - x, height: bottom - y });
};

const validResponse = (value: unknown, revision: string): boolean => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record.contract_version === PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION &&
    record.accepted_revision === revision
  );
};

export const createPluginChildWebviewSlotController = (
  invokeCommand: SlotInvoke = invoke,
): PluginChildWebviewSlotController => ({
  update: async ({ attemptId, scaleFactor, physicalBounds, presentationRevision }) => {
    if (presentationRevision <= 0n) throw new TypeError('Plugin Child WebView slot revision is invalid.');
    const revision = presentationRevision.toString();
    const response = await invokeCommand(UPDATE_PLUGIN_CHILD_WEBVIEW_SLOT_COMMAND, {
      request: {
        contract_version: PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION,
        attempt_id: attemptId,
        window_label: 'main',
        surface_mode: 'page',
        scale_factor: scaleFactor,
        physical_bounds: physicalBounds,
        presentation_revision: revision,
      },
    });
    if (!validResponse(response, revision)) {
      throw new TypeError('Plugin Child WebView slot response is invalid.');
    }
  },
});

export const desktopPluginChildWebviewSlotController = createPluginChildWebviewSlotController();
