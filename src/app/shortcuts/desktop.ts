import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { normalizeShortcut, normalizeShortcutConfiguration, parseShortcutSnapshot } from './model';
import {
  ShortcutError,
  type ShortcutErrorCode,
  type ShortcutRecordingLease,
  type ShortcutService,
  type ShortcutSnapshot,
} from './types';

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Listen = (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
const codes = new Set<ShortcutErrorCode>([
  'invalid_configuration',
  'reserved_shortcut',
  'duplicate_shortcut',
  'duplicate_action',
  'launcher_choice_required',
  'revision_conflict',
  'registration_failed',
  'storage_failed',
  'degraded',
  'recording_unavailable',
  'unavailable',
  'invalid_response',
]);
const aliases: Readonly<Record<string, ShortcutErrorCode>> = {
  invalid_trigger: 'invalid_configuration',
  reserved_trigger: 'reserved_shortcut',
  conflicting_trigger: 'duplicate_shortcut',
  unregistration_failed: 'registration_failed',
  storage_unavailable: 'storage_failed',
};
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const parseLease = (value: unknown): ShortcutRecordingLease => {
  if (
    !object(value) ||
    Object.keys(value).length !== 2 ||
    typeof value.lease_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(value.lease_id) ||
    typeof value.expires_at !== 'number' ||
    !Number.isFinite(value.expires_at)
  ) {
    throw new ShortcutError('invalid_response');
  }
  return Object.freeze({ lease_id: value.lease_id, expires_at: value.expires_at });
};

export const createDesktopShortcutService = (
  invokeCommand: Invoke = invoke,
  listenEvent: Listen = listen,
): ShortcutService => {
  const call = async (command: string, args?: Record<string, unknown>) => {
    try {
      return await invokeCommand(command, args);
    } catch (error) {
      if (error instanceof ShortcutError) throw error;
      const code = object(error) && typeof error.code === 'string' ? (aliases[error.code] ?? error.code) : undefined;
      if (object(error) && codes.has(code as ShortcutErrorCode)) {
        let snapshot: ShortcutSnapshot | undefined;
        try {
          if (error.snapshot !== undefined) snapshot = parseShortcutSnapshot(error.snapshot);
        } catch {
          /* Ignore unconfirmed error data. */
        }
        const conflictingTarget =
          typeof error.conflicting_target === 'string' && /^[a-zA-Z0-9_.-]{1,256}$/.test(error.conflicting_target)
            ? error.conflicting_target
            : undefined;
        throw new ShortcutError(code as ShortcutErrorCode, conflictingTarget, snapshot);
      }
      throw new ShortcutError('unavailable');
    }
  };
  return Object.freeze({
    read: async () => parseShortcutSnapshot(await call('read_launcher_shortcuts')),
    write: async (expectedRevision, configuration, options) =>
      parseShortcutSnapshot(
        await call('write_launcher_shortcuts', {
          expectedRevision,
          configuration: normalizeShortcutConfiguration(configuration),
          ...(options?.resolveLauncherMigration === true ? { resolveLauncherMigration: true } : {}),
        }),
      ),
    subscribe: (listener) =>
      listenEvent('launcher-shortcuts-changed', ({ payload }) => {
        try {
          listener(parseShortcutSnapshot(payload));
        } catch {
          /* Unvalidated events cannot replace confirmed state. */
        }
      }),
    beginRecording: async () => parseLease(await call('begin_launcher_shortcut_recording')),
    renewRecording: async (leaseId) => {
      const lease = parseLease(await call('renew_launcher_shortcut_recording', { leaseId }));
      if (lease.lease_id !== leaseId) throw new ShortcutError('invalid_response');
      return lease;
    },
    endRecording: async (leaseId) => {
      await call('end_launcher_shortcut_recording', { leaseId });
    },
    subscribeRecording: (listener) =>
      listenEvent('launcher-shortcut-recording', ({ payload }) => {
        if (
          !object(payload) ||
          Object.keys(payload).length !== 3 ||
          typeof payload.lease_id !== 'string' ||
          typeof payload.cancelled !== 'boolean'
        )
          return;
        try {
          listener(
            Object.freeze({
              lease_id: payload.lease_id,
              cancelled: payload.cancelled,
              trigger: payload.trigger === null ? null : normalizeShortcut(payload.trigger),
            }),
          );
        } catch {
          /* Ignore malformed candidates. */
        }
      }),
    requestMonitorPermission: async () =>
      parseShortcutSnapshot(await call('request_launcher_shortcut_monitor_permission')),
    updateTargets: async (actionIds) =>
      parseShortcutSnapshot(await call('update_launcher_shortcut_targets', { actionIds })),
  } satisfies ShortcutService);
};

export const desktopShortcutService = createDesktopShortcutService();

/** A browser preview does not pretend to persist or register native bindings. */
export const unavailableShortcutService: ShortcutService = {
  read: async () => {
    throw new ShortcutError('unavailable');
  },
  write: async () => {
    throw new ShortcutError('unavailable');
  },
  subscribe: async () => () => undefined,
  beginRecording: async () => {
    throw new ShortcutError('recording_unavailable');
  },
  renewRecording: async () => {
    throw new ShortcutError('recording_unavailable');
  },
  endRecording: async () => undefined,
  subscribeRecording: async () => () => undefined,
  requestMonitorPermission: async () => {
    throw new ShortcutError('unavailable');
  },
  updateTargets: async () => {
    throw new ShortcutError('unavailable');
  },
};
