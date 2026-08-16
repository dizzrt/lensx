import { invoke } from '@tauri-apps/api/core';

import {
  createPluginChildWebviewSlotController,
  type PluginChildWebviewPhysicalBounds,
  type PluginChildWebviewSlotController,
} from './pluginChildWebviewSlot';

export const PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION = '0.2.0' as const;
export const CREATE_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND = 'create_plugin_child_webview_presentation' as const;
export const DESTROY_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND = 'destroy_plugin_child_webview_presentation' as const;
export const READ_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND = 'read_plugin_child_webview_presentation' as const;
export const WAIT_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND = 'wait_plugin_child_webview_presentation' as const;
export const SET_PLUGIN_CHILD_WEBVIEW_PRESENTATION_VISIBILITY_COMMAND =
  'set_plugin_child_webview_presentation_visibility' as const;

export interface PluginChildWebviewPresentationIdentity {
  readonly entryId: string;
  readonly pluginId: string;
  readonly version: string;
  readonly pageId: string;
  readonly expectedRevision: string;
}

export interface CreatePluginChildWebviewPresentationInput {
  readonly identity: PluginChildWebviewPresentationIdentity;
  readonly scaleFactor: number;
  readonly physicalBounds: PluginChildWebviewPhysicalBounds;
  readonly presentationRevision: bigint;
}

export interface PluginChildWebviewPresentationBinding {
  readonly attemptId: `attempt_${string}`;
}

export type PluginChildWebviewPresentationReadiness =
  | { readonly status: 'loading' }
  | { readonly status: 'ready' }
  | {
      readonly status: 'failed';
      readonly failureCode:
        | 'runtime_load_timeout'
        | 'runtime_handshake_timeout'
        | 'runtime_session_disconnected'
        | 'runtime_unavailable';
    };

export interface PluginChildWebviewPresentationController {
  readonly create: (input: CreatePluginChildWebviewPresentationInput) => Promise<PluginChildWebviewPresentationBinding>;
  readonly updateSlot: (
    binding: PluginChildWebviewPresentationBinding,
    scaleFactor: number,
    physicalBounds: PluginChildWebviewPhysicalBounds,
    presentationRevision: bigint,
  ) => Promise<void>;
  readonly readReadiness: (
    binding: PluginChildWebviewPresentationBinding,
  ) => Promise<PluginChildWebviewPresentationReadiness>;
  readonly waitReadiness: (
    binding: PluginChildWebviewPresentationBinding,
  ) => Promise<Exclude<PluginChildWebviewPresentationReadiness, { readonly status: 'loading' }>>;
  readonly setVisible: (binding: PluginChildWebviewPresentationBinding, visible: boolean) => Promise<void>;
  readonly destroy: (binding: PluginChildWebviewPresentationBinding) => Promise<boolean>;
}

type PresentationInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const ATTEMPT_PATTERN = /^attempt_[0-9a-f]{16}$/u;
const FAILURE_CODES = new Set([
  'runtime_load_timeout',
  'runtime_handshake_timeout',
  'runtime_session_disconnected',
  'runtime_unavailable',
]);
const exactRecord = (value: unknown, keys: readonly string[]): Record<string, unknown> | undefined => {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const parseTerminalReadiness = (
  response: Record<string, unknown> | undefined,
): Exclude<PluginChildWebviewPresentationReadiness, { readonly status: 'loading' }> => {
  if (response?.contract_version !== PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION) {
    throw new TypeError('Plugin Child WebView presentation readiness response is invalid.');
  }
  if (response.readiness === 'ready' && response.failure_code === null) return { status: 'ready' };
  if (
    response.readiness === 'failed' &&
    typeof response.failure_code === 'string' &&
    FAILURE_CODES.has(response.failure_code)
  ) {
    return {
      status: 'failed',
      failureCode: response.failure_code as Extract<
        PluginChildWebviewPresentationReadiness,
        { status: 'failed' }
      >['failureCode'],
    };
  }
  throw new TypeError('Plugin Child WebView presentation readiness response is invalid.');
};

export const createPluginChildWebviewPresentationController = (
  invokeCommand: PresentationInvoke = invoke,
  slotController: PluginChildWebviewSlotController = createPluginChildWebviewSlotController(invokeCommand),
): PluginChildWebviewPresentationController =>
  Object.freeze({
    async create({
      identity,
      scaleFactor,
      physicalBounds,
      presentationRevision,
    }: CreatePluginChildWebviewPresentationInput) {
      if (presentationRevision <= 0n) throw new TypeError('Plugin Child WebView presentation revision is invalid.');
      const response = exactRecord(
        await invokeCommand(CREATE_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND, {
          request: {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            window_label: 'main',
            surface_mode: 'page',
            scale_factor: scaleFactor,
            physical_bounds: physicalBounds,
            presentation_revision: presentationRevision.toString(),
            identity: {
              entry_id: identity.entryId,
              plugin_id: identity.pluginId,
              version: identity.version,
              page_id: identity.pageId,
              expected_revision: identity.expectedRevision,
            },
          },
        }),
        ['contract_version', 'attempt_id'],
      );
      if (
        response?.contract_version !== PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION ||
        typeof response.attempt_id !== 'string' ||
        !ATTEMPT_PATTERN.test(response.attempt_id)
      ) {
        throw new TypeError('Plugin Child WebView presentation response is invalid.');
      }
      return Object.freeze({ attemptId: response.attempt_id as `attempt_${string}` });
    },
    updateSlot(
      binding: PluginChildWebviewPresentationBinding,
      scaleFactor: number,
      physicalBounds: PluginChildWebviewPhysicalBounds,
      presentationRevision: bigint,
    ) {
      return slotController.update({
        attemptId: binding.attemptId,
        scaleFactor,
        physicalBounds,
        presentationRevision,
      });
    },
    async readReadiness(
      binding: PluginChildWebviewPresentationBinding,
    ): Promise<PluginChildWebviewPresentationReadiness> {
      const response = exactRecord(
        await invokeCommand(READ_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND, {
          request: {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            attempt_id: binding.attemptId,
          },
        }),
        ['contract_version', 'attempt_id', 'readiness', 'failure_code'],
      );
      if (
        response?.contract_version !== PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION ||
        response.attempt_id !== binding.attemptId
      ) {
        throw new TypeError('Plugin Child WebView presentation readiness response is invalid.');
      }
      if (response.readiness === 'loading' && response.failure_code === null) return { status: 'loading' };
      if (response.readiness === 'ready' && response.failure_code === null) return { status: 'ready' };
      if (
        response.readiness === 'failed' &&
        typeof response.failure_code === 'string' &&
        FAILURE_CODES.has(response.failure_code)
      ) {
        return {
          status: 'failed',
          failureCode: response.failure_code as Extract<
            PluginChildWebviewPresentationReadiness,
            { status: 'failed' }
          >['failureCode'],
        };
      }
      throw new TypeError('Plugin Child WebView presentation readiness response is invalid.');
    },
    async waitReadiness(binding: PluginChildWebviewPresentationBinding) {
      const response = exactRecord(
        await invokeCommand(WAIT_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND, {
          request: {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            attempt_id: binding.attemptId,
          },
        }),
        ['contract_version', 'readiness', 'failure_code'],
      );
      return parseTerminalReadiness(response);
    },
    async setVisible(binding: PluginChildWebviewPresentationBinding, visible: boolean) {
      const response = exactRecord(
        await invokeCommand(SET_PLUGIN_CHILD_WEBVIEW_PRESENTATION_VISIBILITY_COMMAND, {
          request: {
            contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
            attempt_id: binding.attemptId,
            visible,
          },
        }),
        ['contract_version', 'attempt_id', 'visible'],
      );
      if (
        response?.contract_version !== PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION ||
        response.attempt_id !== binding.attemptId ||
        response.visible !== visible
      ) {
        throw new TypeError('Plugin Child WebView presentation visibility response is invalid.');
      }
    },
    async destroy(binding: PluginChildWebviewPresentationBinding) {
      try {
        const response = exactRecord(
          await invokeCommand(DESTROY_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND, {
            request: {
              contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
              attempt_id: binding.attemptId,
            },
          }),
          ['contract_version', 'destroyed'],
        );
        return (
          response?.contract_version === PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION &&
          response.destroyed === true
        );
      } catch {
        return false;
      }
    },
  });

export const desktopPluginChildWebviewPresentationController = createPluginChildWebviewPresentationController();
