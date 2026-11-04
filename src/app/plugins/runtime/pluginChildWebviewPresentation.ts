import { invoke } from '@tauri-apps/api/core';

import { isValidIsolatedPluginRuntimeEntryUrl } from './helpers';

import {
  MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
  type PluginChildWebviewOwner,
  parsePluginChildWebviewOwner,
  serializePluginChildWebviewOwner,
} from './pluginChildWebviewOwner';

import {
  createPluginChildWebviewSlotController,
  PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION,
  type PluginChildWebviewPhysicalBounds,
  type PluginChildWebviewSlotController,
} from './pluginChildWebviewSlot';

export const PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION = '0.3.0' as const;
export const CREATE_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND = 'create_plugin_child_webview_presentation' as const;
export const READ_PLUGIN_CHILD_WEBVIEW_ADMISSION_COMMAND = 'read_plugin_child_webview_admission' as const;
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
  readonly owner?: PluginChildWebviewOwner;
  readonly scaleFactor: number;
  readonly physicalBounds: PluginChildWebviewPhysicalBounds;
  readonly presentationRevision: bigint;
}

export interface PluginChildWebviewPresentationBinding {
  readonly attemptId: `attempt_${string}`;
  readonly owner: PluginChildWebviewOwner;
  readonly entryUrl: string;
  readonly resourceGeneration: string;
}

export interface PluginChildWebviewAdmission {
  readonly entryId: string;
  readonly revision: string;
  readonly generation: string;
}

export const validPluginResourceGeneration = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/u.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n;

export const readPluginChildWebviewAdmission = async (
  identity: PluginChildWebviewPresentationIdentity,
  owner: PluginChildWebviewOwner = MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
  invokeCommand: PresentationInvoke = invoke,
): Promise<PluginChildWebviewAdmission> => {
  const response = exactRecord(
    await invokeCommand(READ_PLUGIN_CHILD_WEBVIEW_ADMISSION_COMMAND, {
      request: {
        contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
        ...serializePluginChildWebviewOwner(owner),
        identity: {
          entry_id: identity.entryId,
          plugin_id: identity.pluginId,
          version: identity.version,
          page_id: identity.pageId,
          expected_revision: identity.expectedRevision,
        },
      },
    }),
    ['contract_version', 'entry_id', 'revision', 'resource_generation'],
  );
  if (
    response?.contract_version !== PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION ||
    response.entry_id !== identity.entryId ||
    response.revision !== identity.expectedRevision ||
    !validPluginResourceGeneration(response.resource_generation)
  ) {
    throw new TypeError('Plugin Child WebView admission response is invalid.');
  }
  return Object.freeze({
    entryId: response.entry_id as string,
    revision: response.revision as string,
    generation: response.resource_generation,
  });
};

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

/** A superseded presentation command carries no terminal Session outcome. */
export const isStalePluginPresentationWrite = (error: unknown, operation: 'visibility' | 'slot'): boolean => {
  const response = exactRecord(error, ['contract_version', 'code', 'message']);
  if (!response || typeof response.message !== 'string') return false;
  if (operation === 'slot') {
    return (
      response.contract_version === PLUGIN_CHILD_WEBVIEW_SLOT_CONTRACT_VERSION &&
      (response.code === 'stale_attempt' || response.code === 'stale_revision')
    );
  }
  return (
    response.contract_version === PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION &&
    response.code === 'stale_attempt'
  );
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
      owner = MAIN_PLUGIN_CHILD_WEBVIEW_OWNER,
      scaleFactor,
      physicalBounds,
      presentationRevision,
    }: CreatePluginChildWebviewPresentationInput) {
      if (presentationRevision <= 0n) throw new TypeError('Plugin Child WebView presentation revision is invalid.');
      const rawResponse = await invokeCommand(CREATE_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND, {
        request: {
          contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
          ...serializePluginChildWebviewOwner(owner),
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
      });
      const response = exactRecord(rawResponse, [
        'contract_version',
        'attempt_id',
        'window_label',
        'ownership_revision',
        'entry_url',
        'resource_generation',
      ]);
      if (
        response?.contract_version !== PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION ||
        typeof response.attempt_id !== 'string' ||
        !ATTEMPT_PATTERN.test(response.attempt_id) ||
        response.window_label !== owner.windowLabel ||
        response.ownership_revision !== owner.ownershipRevision.toString() ||
        typeof response.entry_url !== 'string' ||
        !isValidIsolatedPluginRuntimeEntryUrl(response.entry_url) ||
        !validPluginResourceGeneration(response.resource_generation)
      ) {
        // A malformed metadata field must not orphan a native instance whose exact
        // attempt and requested owner were otherwise returned by the trusted command.
        const candidate =
          rawResponse !== null && typeof rawResponse === 'object' && !Array.isArray(rawResponse)
            ? (rawResponse as Record<string, unknown>)
            : undefined;
        if (
          candidate?.contract_version === PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION &&
          typeof candidate.attempt_id === 'string' &&
          ATTEMPT_PATTERN.test(candidate.attempt_id) &&
          candidate.window_label === owner.windowLabel &&
          candidate.ownership_revision === owner.ownershipRevision.toString()
        ) {
          await invokeCommand(DESTROY_PLUGIN_CHILD_WEBVIEW_PRESENTATION_COMMAND, {
            request: {
              contract_version: PLUGIN_CHILD_WEBVIEW_PRESENTATION_CONTRACT_VERSION,
              attempt_id: candidate.attempt_id,
              ...serializePluginChildWebviewOwner(owner),
            },
          }).catch(() => undefined);
        }
        throw new TypeError('Plugin Child WebView presentation response is invalid.');
      }
      return Object.freeze({
        attemptId: response.attempt_id as `attempt_${string}`,
        owner: parsePluginChildWebviewOwner(response.window_label, response.ownership_revision),
        entryUrl: response.entry_url,
        resourceGeneration: response.resource_generation,
      });
    },
    updateSlot(
      binding: PluginChildWebviewPresentationBinding,
      scaleFactor: number,
      physicalBounds: PluginChildWebviewPhysicalBounds,
      presentationRevision: bigint,
    ) {
      return slotController.update({
        attemptId: binding.attemptId,
        owner: binding.owner,
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
            ...serializePluginChildWebviewOwner(binding.owner),
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
            ...serializePluginChildWebviewOwner(binding.owner),
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
            ...serializePluginChildWebviewOwner(binding.owner),
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
              ...serializePluginChildWebviewOwner(binding.owner),
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
