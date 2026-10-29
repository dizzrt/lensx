import { isValidLauncherActionId } from '../launcher/actions';
import policy from './policy.json';
import {
  type ShortcutChord,
  type ShortcutConfiguration,
  ShortcutError,
  type ShortcutModifier,
  type ShortcutSnapshot,
  type ShortcutStatus,
  type ShortcutTrigger,
} from './types';

export const SHORTCUT_MODIFIERS = policy.modifiers as ShortcutModifier[];
const modifierAliases: Readonly<Record<string, string>> = policy.modifierAliases;
const keyAliases: Readonly<Record<string, string>> = policy.keyAliases;
const alias = (aliases: Readonly<Record<string, string>>, key: string): string | undefined =>
  Object.hasOwn(aliases, key.toLowerCase()) ? aliases[key.toLowerCase()] : undefined;
const statuses = new Set<ShortcutStatus>([
  'active',
  'permission_required',
  'target_unavailable',
  'registration_failed',
  'monitor_unavailable',
  'degraded',
]);

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const modifier = (value: unknown): ShortcutModifier | undefined =>
  typeof value === 'string' ? (alias(modifierAliases, value) as ShortcutModifier | undefined) : undefined;

export const normalizeShortcut = (value: unknown): ShortcutTrigger => {
  if (!record(value)) throw new ShortcutError('invalid_configuration');
  if (value.kind === 'modifier_double_tap' && exact(value, ['kind', 'modifier'])) {
    const normalized = modifier(value.modifier);
    if (normalized) return Object.freeze({ kind: value.kind, modifier: normalized });
  }
  if (
    value.kind === 'chord' &&
    exact(value, ['kind', 'modifiers', 'key']) &&
    Array.isArray(value.modifiers) &&
    value.modifiers.length <= 16
  ) {
    const mapped = value.modifiers.map(modifier);
    const modifiers = SHORTCUT_MODIFIERS.filter((entry) => mapped.includes(entry));
    const key = typeof value.key === 'string' ? alias(keyAliases, value.key) : undefined;
    if (key && mapped.every(Boolean) && modifiers.some((entry) => entry !== 'shift')) {
      return Object.freeze({ kind: value.kind, modifiers: Object.freeze(modifiers), key });
    }
  }
  throw new ShortcutError('invalid_configuration');
};

export const shortcutIdentity = (trigger: ShortcutTrigger) =>
  trigger.kind === 'chord' ? `${trigger.modifiers.join('+')}:${trigger.key}` : `double:${trigger.modifier}`;

const reserved = new Set(policy.reservedChords.map((chord) => `${chord.modifiers.join('+')}:${chord.key}`));
export const isReservedShortcut = (trigger: ShortcutTrigger) => reserved.has(shortcutIdentity(trigger));

export const shortcutEntries = (configuration: ShortcutConfiguration): readonly [string, ShortcutTrigger][] => [
  ['launcher', configuration.launcher],
  ...Object.entries(configuration.actions),
];

export const normalizeShortcutConfiguration = (value: unknown): ShortcutConfiguration => {
  if (
    !record(value) ||
    !exact(value, ['version', 'revision', 'launcher', 'actions']) ||
    value.version !== 2 ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !record(value.actions) ||
    Object.keys(value.actions).length > 1024
  ) {
    throw new ShortcutError('invalid_configuration');
  }
  const launcher = normalizeShortcut(value.launcher);
  const actions: Record<string, ShortcutTrigger> = {};
  for (const [id, trigger] of Object.entries(value.actions)) {
    if (!isValidLauncherActionId(id, id.slice(0, id.lastIndexOf('.'))))
      throw new ShortcutError('invalid_configuration');
    actions[id] = normalizeShortcut(trigger);
  }
  const configuration: ShortcutConfiguration = Object.freeze({
    version: 2,
    revision: value.revision as number,
    launcher,
    actions: Object.freeze(actions),
  });
  const used = new Map<string, string>();
  for (const [target, trigger] of shortcutEntries(configuration)) {
    if (isReservedShortcut(trigger)) throw new ShortcutError('reserved_shortcut');
    const identity = shortcutIdentity(trigger);
    const conflict = used.get(identity);
    if (conflict) throw new ShortcutError('duplicate_shortcut', conflict);
    used.set(identity, target);
  }
  return configuration;
};

export const parseShortcutSnapshot = (value: unknown): ShortcutSnapshot => {
  if (
    !record(value) ||
    !exact(value, [
      'configuration',
      'bindings',
      'recovery_degraded',
      'diagnostics',
      ...(Object.hasOwn(value, 'key_labels') ? ['key_labels'] : []),
      ...(Object.hasOwn(value, 'launcher_migration') ? ['launcher_migration'] : []),
    ]) ||
    !Array.isArray(value.bindings) ||
    typeof value.recovery_degraded !== 'boolean' ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every((code) => typeof code === 'string' && /^[a-z_]{1,80}$/.test(code))
  ) {
    throw new ShortcutError('invalid_response');
  }
  const configuration = normalizeShortcutConfiguration(value.configuration);
  let launcherMigration: ShortcutSnapshot['launcher_migration'];
  if (Object.hasOwn(value, 'launcher_migration')) {
    if (!record(value.launcher_migration) || !exact(value.launcher_migration, ['chord', 'double_tap']))
      throw new ShortcutError('invalid_response');
    const chord = normalizeShortcut(value.launcher_migration.chord);
    const doubleTap = normalizeShortcut(value.launcher_migration.double_tap);
    if (
      chord.kind !== 'chord' ||
      doubleTap.kind !== 'modifier_double_tap' ||
      shortcutIdentity(chord) !== shortcutIdentity(configuration.launcher) ||
      !value.recovery_degraded
    )
      throw new ShortcutError('invalid_response');
    // Both legacy choices must still satisfy the shared reserved/uniqueness policy.
    normalizeShortcutConfiguration({ ...configuration, launcher: doubleTap });
    launcherMigration = Object.freeze({ chord, double_tap: doubleTap });
  }
  let keyLabels: Readonly<Record<string, string>> | undefined;
  if (Object.hasOwn(value, 'key_labels')) {
    if (
      !record(value.key_labels) ||
      Object.entries(value.key_labels).some(
        ([key, label]) =>
          !policy.keys.includes(key.replace(/^cmd:/, '')) ||
          typeof label !== 'string' ||
          label.length === 0 ||
          label.length > 16 ||
          Array.from(label).some((character) => {
            const code = character.charCodeAt(0);
            return code < 32 || (code >= 127 && code <= 159);
          }),
      )
    )
      throw new ShortcutError('invalid_response');
    keyLabels = Object.freeze({ ...value.key_labels }) as Readonly<Record<string, string>>;
  }
  const targets = new Set(shortcutEntries(configuration).map(([target]) => target));
  const bindings = value.bindings.map((binding) => {
    if (
      !record(binding) ||
      !exact(binding, ['target', 'status']) ||
      typeof binding.target !== 'string' ||
      !targets.delete(binding.target) ||
      !statuses.has(binding.status as ShortcutStatus)
    )
      throw new ShortcutError('invalid_response');
    return Object.freeze({ target: binding.target, status: binding.status as ShortcutStatus });
  });
  if (targets.size) throw new ShortcutError('invalid_response');
  if (launcherMigration && !bindings.some(({ target, status }) => target === 'launcher' && status === 'degraded'))
    throw new ShortcutError('invalid_response');
  return Object.freeze({
    configuration,
    bindings: Object.freeze(bindings),
    recovery_degraded: value.recovery_degraded,
    diagnostics: Object.freeze([...value.diagnostics]) as readonly string[],
    ...(keyLabels ? { key_labels: keyLabels } : {}),
    ...(launcherMigration ? { launcher_migration: launcherMigration } : {}),
  });
};

export const replaceShortcut = (
  configuration: ShortcutConfiguration,
  target: string,
  trigger: ShortcutTrigger | null,
): ShortcutConfiguration => {
  if (trigger) {
    const identity = shortcutIdentity(normalizeShortcut(trigger));
    const conflicting = shortcutEntries(configuration).find(
      ([entryTarget, entryTrigger]) => entryTarget !== target && shortcutIdentity(entryTrigger) === identity,
    );
    if (conflicting) throw new ShortcutError('duplicate_shortcut', conflicting[0]);
  }
  const actions = { ...configuration.actions };
  let launcher = configuration.launcher;
  if (target === 'launcher') {
    if (!trigger) throw new ShortcutError('invalid_configuration');
    launcher = trigger;
  } else if (trigger) actions[target] = trigger;
  else delete actions[target];
  return normalizeShortcutConfiguration({ ...configuration, launcher, actions });
};

/** Reassign an Action row atomically without overwriting another configured Action. */
export const replaceActionShortcut = (
  configuration: ShortcutConfiguration,
  previousActionId: string | undefined,
  actionId: string,
  trigger: ShortcutTrigger,
): ShortcutConfiguration => {
  if (previousActionId !== undefined && !Object.hasOwn(configuration.actions, previousActionId))
    throw new ShortcutError('revision_conflict');
  if (actionId !== previousActionId && Object.hasOwn(configuration.actions, actionId))
    throw new ShortcutError('duplicate_action', actionId);
  const actions = { ...configuration.actions };
  if (previousActionId !== undefined) delete actions[previousActionId];
  return replaceShortcut({ ...configuration, actions }, actionId, trigger);
};

export interface ShortcutKeyEvent {
  readonly key: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
}

/** Register the physical code while protecting both physical and current-layout reserved semantics. */
export const shortcutFromKeyEvent = (event: ShortcutKeyEvent): ShortcutChord | null => {
  if (event.isComposing || event.keyCode === 229 || event.repeat || modifier(event.key)) return null;
  const modifiers = SHORTCUT_MODIFIERS.filter(
    (entry) => ({ cmd: event.metaKey, ctrl: event.ctrlKey, option: event.altKey, shift: event.shiftKey })[entry],
  );
  const key = alias(keyAliases, event.code);
  const trigger = normalizeShortcut({ kind: 'chord', modifiers, key }) as ShortcutChord;
  const semantic = alias(keyAliases, event.key);
  if (isReservedShortcut(trigger) || (semantic && isReservedShortcut({ ...trigger, key: semantic })))
    throw new ShortcutError('reserved_shortcut');
  return trigger;
};
