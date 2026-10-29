export type ShortcutModifier = 'cmd' | 'ctrl' | 'option' | 'shift';

export interface ShortcutChord {
  readonly kind: 'chord';
  readonly modifiers: readonly ShortcutModifier[];
  readonly key: string;
}

export interface ShortcutDoubleTap {
  readonly kind: 'modifier_double_tap';
  readonly modifier: ShortcutModifier;
}

export type ShortcutTrigger = ShortcutChord | ShortcutDoubleTap;

export interface ShortcutConfiguration {
  readonly version: 2;
  readonly revision: number;
  readonly launcher: ShortcutTrigger;
  readonly actions: Readonly<Record<string, ShortcutTrigger>>;
}

export type ShortcutStatus =
  | 'active'
  | 'permission_required'
  | 'target_unavailable'
  | 'registration_failed'
  | 'monitor_unavailable'
  | 'degraded';

export interface ShortcutSnapshot {
  readonly configuration: ShortcutConfiguration;
  readonly bindings: readonly { readonly target: string; readonly status: ShortcutStatus }[];
  readonly recovery_degraded: boolean;
  readonly diagnostics: readonly string[];
  readonly key_labels?: Readonly<Record<string, string>>;
  readonly launcher_migration?: {
    readonly chord: ShortcutChord;
    readonly double_tap: ShortcutDoubleTap;
  };
}

export interface ShortcutRecordingLease {
  readonly lease_id: string;
  readonly expires_at: number;
}

export interface ShortcutRecordingEvent {
  readonly lease_id: string;
  readonly trigger: ShortcutTrigger | null;
  readonly cancelled: boolean;
}

export type ShortcutErrorCode =
  | 'invalid_configuration'
  | 'reserved_shortcut'
  | 'duplicate_shortcut'
  | 'duplicate_action'
  | 'launcher_choice_required'
  | 'revision_conflict'
  | 'registration_failed'
  | 'storage_failed'
  | 'degraded'
  | 'recording_unavailable'
  | 'unavailable'
  | 'invalid_response';

export class ShortcutError extends Error {
  constructor(
    readonly code: ShortcutErrorCode,
    readonly conflicting_target?: string,
    readonly snapshot?: ShortcutSnapshot,
  ) {
    super('Shortcut operation could not be completed.');
    this.name = 'ShortcutError';
  }
}

/** Host-private boundary. Plugins receive semantic activations only. */
export interface ShortcutService {
  read(): Promise<ShortcutSnapshot>;
  write(
    expectedRevision: number,
    configuration: ShortcutConfiguration,
    options?: ShortcutWriteOptions,
  ): Promise<ShortcutSnapshot>;
  subscribe(listener: (snapshot: ShortcutSnapshot) => void): Promise<() => void>;
  beginRecording(): Promise<ShortcutRecordingLease>;
  renewRecording(leaseId: string): Promise<ShortcutRecordingLease>;
  endRecording(leaseId: string): Promise<void>;
  subscribeRecording(listener: (event: ShortcutRecordingEvent) => void): Promise<() => void>;
  requestMonitorPermission(): Promise<ShortcutSnapshot>;
  updateTargets(actionIds: readonly string[]): Promise<ShortcutSnapshot>;
}

export interface ShortcutWriteOptions {
  readonly resolveLauncherMigration?: boolean;
}

export const defaultShortcutConfiguration = (revision = 0): ShortcutConfiguration => ({
  version: 2,
  revision,
  launcher: { kind: 'chord', modifiers: ['ctrl', 'shift'], key: 'Space' },
  actions: {},
});
