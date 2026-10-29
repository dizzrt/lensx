import { describe, expect, rs, test } from '@rstest/core';
import {
  createDesktopShortcutService,
  createShortcutRecordingPreview,
  defaultShortcutConfiguration,
  normalizeShortcut,
  normalizeShortcutConfiguration,
  parseShortcutSnapshot,
  replaceActionShortcut,
  replaceShortcut,
  ShortcutError,
  shortcutFromKeyEvent,
} from '../src/app/shortcuts';
import policy from '../src/app/shortcuts/policy.json';
import sharedConfigurations from './fixtures/launcher-shortcuts/configurations.json';
import sharedTriggers from './fixtures/launcher-shortcuts/triggers.json';

const chord = { kind: 'chord' as const, modifiers: ['cmd' as const, 'shift' as const], key: 'KeyK' };
const snapshot = () => ({
  configuration: defaultShortcutConfiguration(),
  bindings: [{ target: 'launcher', status: 'active' }],
  recovery_degraded: false,
  diagnostics: [],
});

describe('shortcut policy and typed desktop boundary', () => {
  test('tracks transient chord presses without turning partial display into a saved trigger', () => {
    const preview = createShortcutRecordingPreview();
    const base = { key: 'Control', code: 'ControlLeft', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    expect(preview.update(base, true)).toEqual({ modifiers: ['ctrl'], keys: [] });
    const partial = preview.update({ ...base, key: 'Shift', code: 'ShiftLeft', shiftKey: true }, true);
    expect(partial).toEqual({ modifiers: ['ctrl', 'shift'], keys: [] });
    expect(() => normalizeShortcut(partial)).toThrow(ShortcutError);
    expect(preview.update({ ...base, key: 'k', code: 'KeyK', shiftKey: true }, true)).toEqual({
      modifiers: ['ctrl', 'shift'],
      keys: ['KeyK'],
    });
    expect(preview.update({ ...base, key: 'k', code: 'KeyK', shiftKey: true }, false)).toEqual(partial);
    expect(preview.update({ ...base, key: 'Shift', code: 'ShiftLeft' }, false)).toEqual({
      modifiers: ['ctrl'],
      keys: [],
    });
    expect(preview.update({ ...base, ctrlKey: false }, false)).toBeUndefined();
    preview.update({ ...base, key: 'k', code: 'KeyK' }, true);
    expect(preview.update({ ...base, key: 'j', code: 'KeyJ' }, true)).toEqual({
      modifiers: ['ctrl'],
      keys: ['KeyK', 'KeyJ'],
    });
    preview.reset();
    expect(preview.update({ ...base, key: 'Process', code: 'KeyK', isComposing: true }, true)).toBeUndefined();
    expect(preview.update({ ...base, ctrlKey: false }, false)).toBeUndefined();
  });
  test('consumes the same current configuration and legacy migration projections as Rust', () => {
    for (const entry of sharedConfigurations.valid) {
      expect(normalizeShortcutConfiguration(entry.configuration)).toEqual(entry.configuration);
      const launcherMigration = 'launcher_migration' in entry ? entry.launcher_migration : undefined;
      const parsed = parseShortcutSnapshot({
        configuration: entry.configuration,
        bindings: [
          { target: 'launcher', status: launcherMigration ? 'degraded' : 'active' },
          ...Object.keys(entry.configuration.actions).map((target) => ({ target, status: 'active' })),
        ],
        recovery_degraded: Boolean(launcherMigration),
        diagnostics: [],
        ...(launcherMigration ? { launcher_migration: launcherMigration } : {}),
      });
      expect(parsed.configuration).toEqual(entry.configuration);
      if (entry.legacy) expect(() => normalizeShortcutConfiguration(entry.input)).toThrow(ShortcutError);
      else expect(normalizeShortcutConfiguration(entry.input)).toEqual(entry.configuration);
    }
    for (const invalid of sharedConfigurations.invalid)
      expect(() => normalizeShortcutConfiguration(invalid)).toThrow(ShortcutError);
  });
  test('shares canonical and invalid boundary fixtures with Rust', () => {
    for (const { input, canonical } of sharedTriggers.valid) expect(normalizeShortcut(input)).toEqual(canonical);
    for (const trigger of sharedTriggers.invalid) {
      expect(() =>
        normalizeShortcutConfiguration({ ...defaultShortcutConfiguration(), actions: { 'dev.example.open': trigger } }),
      ).toThrow(ShortcutError);
    }
  });
  test('canonicalizes aliases and modifier order, preserving self edits as no-ops', () => {
    expect(normalizeShortcut({ kind: 'chord', modifiers: ['Shift', 'Command', 'cmd'], key: 'k' })).toEqual(chord);
    expect(normalizeShortcut({ kind: 'modifier_double_tap', modifier: 'MetaRight' })).toEqual({
      kind: 'modifier_double_tap',
      modifier: 'cmd',
    });
    const configuration = replaceShortcut(defaultShortcutConfiguration(), 'dev.example.open', chord);
    expect(replaceShortcut(configuration, 'dev.example.open', chord)).toEqual(configuration);
  });
  test('unavailable actions still occupy triggers, launcher and action double taps share one identity', () => {
    const configuration = replaceShortcut(defaultShortcutConfiguration(), 'dev.removed.open', chord);
    expect(() => replaceShortcut(configuration, 'dev.example.open', chord)).toThrow(ShortcutError);
    try {
      replaceShortcut(configuration, 'dev.example.open', chord);
    } catch (error) {
      expect(error).toMatchObject({ code: 'duplicate_shortcut', conflicting_target: 'dev.removed.open' });
    }
    const withDoubleTap = replaceShortcut(configuration, 'launcher', {
      kind: 'modifier_double_tap',
      modifier: 'cmd',
    });
    expect(() =>
      replaceShortcut(withDoubleTap, 'dev.example.open', { kind: 'modifier_double_tap', modifier: 'cmd' }),
    ).toThrow(ShortcutError);
    expect(() => replaceShortcut(configuration, 'launcher', null)).toThrow(ShortcutError);
  });
  test('switches the single launcher kind without retaining an inactive hidden binding', () => {
    const configuration = replaceShortcut(defaultShortcutConfiguration(), 'launcher', {
      kind: 'modifier_double_tap',
      modifier: 'ctrl',
    });
    expect(configuration).toEqual({
      version: 2,
      revision: 0,
      launcher: { kind: 'modifier_double_tap', modifier: 'ctrl' },
      actions: {},
    });
    expect(replaceShortcut(configuration, 'launcher', chord).launcher).toEqual(chord);
    expect(() => normalizeShortcutConfiguration({ ...configuration, version: 1 })).toThrow(ShortcutError);
    expect(() => normalizeShortcutConfiguration({ ...configuration, launcher: { chord, double_tap: null } })).toThrow(
      ShortcutError,
    );
  });
  test('atomically reassigns a row and rejects an occupied or concurrently removed Action', () => {
    const configuration = replaceActionShortcut(defaultShortcutConfiguration(), undefined, 'dev.first.open', chord);
    const moved = replaceActionShortcut(configuration, 'dev.first.open', 'dev.second.open', chord);
    expect(moved.actions).toEqual({ 'dev.second.open': chord });
    expect(configuration.actions).toEqual({ 'dev.first.open': chord });
    expect(() =>
      replaceActionShortcut(moved, undefined, 'dev.second.open', { kind: 'modifier_double_tap', modifier: 'option' }),
    ).toThrow(ShortcutError);
    try {
      replaceActionShortcut(moved, undefined, 'dev.second.open', chord);
    } catch (error) {
      expect(error).toMatchObject({ code: 'duplicate_action', conflicting_target: 'dev.second.open' });
    }
    expect(() => replaceActionShortcut(moved, 'dev.first.open', 'dev.third.open', chord)).toThrow(ShortcutError);
    expect(() => replaceActionShortcut(moved, undefined, 'dev.third.open', chord)).toThrow(ShortcutError);
  });
  test('rejects every shared reserved chord, unsupported and extra input before invoking Rust', () => {
    for (const reserved of policy.reservedChords) {
      expect(() =>
        normalizeShortcutConfiguration({
          ...defaultShortcutConfiguration(),
          actions: { 'dev.example.open': { kind: 'chord', ...reserved } },
        }),
      ).toThrow(ShortcutError);
    }
    for (const trigger of [
      { kind: 'chord', modifiers: [], key: 'a' },
      { kind: 'chord', modifiers: ['shift'], key: 'a' },
      { kind: 'chord', modifiers: ['cmd'], key: 'CapsLock' },
      { kind: 'chord', modifiers: ['fn'], key: 'K' },
      { kind: 'modifier_double_tap', modifier: 'fn' },
      { kind: 'chord', modifiers: ['cmd', '__proto__'], key: 'K' },
      { kind: 'chord', modifiers: ['cmd'], key: 'constructor' },
      { ...chord, source: 'shortcut' },
    ])
      expect(() => normalizeShortcut(trigger)).toThrow(ShortcutError);
    expect(() =>
      normalizeShortcutConfiguration({ ...defaultShortcutConfiguration(), revision: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(ShortcutError);
  });
  test('recording follows semantic keys and also protects physical aliases, IME and repetition', () => {
    const event = { key: 'k', code: 'KeyK', metaKey: true, shiftKey: true, ctrlKey: false, altKey: false };
    expect(shortcutFromKeyEvent(event)).toEqual(chord);
    expect(shortcutFromKeyEvent({ ...event, key: 'a', code: 'KeyQ', metaKey: false, ctrlKey: true })).toEqual({
      kind: 'chord',
      modifiers: ['ctrl', 'shift'],
      key: 'KeyQ',
    });
    expect(shortcutFromKeyEvent({ ...event, isComposing: true })).toBeNull();
    expect(shortcutFromKeyEvent({ ...event, repeat: true })).toBeNull();
    expect(shortcutFromKeyEvent({ ...event, keyCode: 229 })).toBeNull();
    expect(() => shortcutFromKeyEvent({ ...event, key: 'q', code: 'KeyK', shiftKey: false })).toThrow(ShortcutError);
    expect(() => shortcutFromKeyEvent({ ...event, key: 'k', code: 'KeyQ', shiftKey: false })).toThrow(ShortcutError);
  });
  test('validates and freezes confirmed state and safely maps raw native failures', async () => {
    const confirmed = parseShortcutSnapshot(snapshot());
    expect(confirmed.configuration.launcher.kind).toBe('chord');
    if (confirmed.configuration.launcher.kind === 'chord')
      expect(Object.isFrozen(confirmed.configuration.launcher.modifiers)).toBe(true);
    expect(parseShortcutSnapshot({ ...snapshot(), key_labels: { KeyQ: 'A', 'cmd:KeyQ': 'Q' } }).key_labels).toEqual({
      KeyQ: 'A',
      'cmd:KeyQ': 'Q',
    });
    expect(() => parseShortcutSnapshot({ ...snapshot(), key_labels: { KeyQ: '\n' } })).toThrow(ShortcutError);
    expect(() => parseShortcutSnapshot({ ...snapshot(), bindings: [] })).toThrow(ShortcutError);
    expect(() => parseShortcutSnapshot({ ...snapshot(), diagnostics: ['/private/path'] })).toThrow(ShortcutError);
    const invoke = rs.fn(async () => {
      throw {
        code: 'conflicting_trigger',
        conflicting_target: 'dev.other.open',
        snapshot: snapshot(),
        raw: '/private/path',
      };
    });
    const service = createDesktopShortcutService(invoke, async () => () => undefined);
    await expect(service.write(0, defaultShortcutConfiguration())).rejects.toMatchObject({
      code: 'duplicate_shortcut',
      conflicting_target: 'dev.other.open',
      message: 'Shortcut operation could not be completed.',
    });
    expect(invoke).toHaveBeenCalledWith('write_launcher_shortcuts', {
      expectedRevision: 0,
      configuration: defaultShortcutConfiguration(),
    });
  });
  test('preserves both legacy choices as explicit inactive migration facts and resolves only on request', async () => {
    const initial = snapshot();
    const migration = {
      chord: initial.configuration.launcher,
      double_tap: { kind: 'modifier_double_tap', modifier: 'cmd' },
    };
    const pending = {
      ...initial,
      bindings: [{ target: 'launcher', status: 'degraded' }],
      recovery_degraded: true,
      launcher_migration: migration,
    };
    const validated = parseShortcutSnapshot(pending);
    expect(validated.launcher_migration).toEqual(migration);
    expect(Object.isFrozen(validated.launcher_migration)).toBe(true);
    expect(() => parseShortcutSnapshot({ ...pending, recovery_degraded: false })).toThrow(ShortcutError);
    expect(() => parseShortcutSnapshot({ ...pending, bindings: [{ target: 'launcher', status: 'active' }] })).toThrow(
      ShortcutError,
    );
    expect(() => parseShortcutSnapshot({ ...pending, launcher_migration: { ...migration, other: chord } })).toThrow(
      ShortcutError,
    );
    expect(() =>
      parseShortcutSnapshot({
        ...pending,
        configuration: { ...initial.configuration, actions: { 'dev.other.open': migration.double_tap } },
      }),
    ).toThrow(ShortcutError);
    const invoke = rs.fn(async () => initial);
    const service = createDesktopShortcutService(invoke, async () => () => undefined);
    await service.write(0, initial.configuration, { resolveLauncherMigration: true });
    expect(invoke).toHaveBeenCalledWith('write_launcher_shortcuts', {
      expectedRevision: 0,
      configuration: initial.configuration,
      resolveLauncherMigration: true,
    });
  });
  test('routes main-only recording leases and ignores malformed or stale-shaped event payloads', async () => {
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    const invoke = rs.fn(async (command: string) =>
      command.includes('recording') ? { lease_id: 'lease_1', expires_at: 30000 } : snapshot(),
    );
    const service = createDesktopShortcutService(invoke, async (event, handler) => {
      listeners.set(event, handler);
      return () => listeners.delete(event);
    });
    const candidate = rs.fn();
    const unsubscribe = await service.subscribeRecording(candidate);
    listeners.get('launcher-shortcut-recording')?.({
      payload: { lease_id: 'lease_1', trigger: chord, cancelled: false },
    });
    expect(candidate).toHaveBeenCalledTimes(1);
    listeners.get('launcher-shortcut-recording')?.({
      payload: { lease_id: 'lease_1', trigger: chord, cancelled: false, extra: true },
    });
    expect(candidate).toHaveBeenCalledTimes(1);
    await expect(service.beginRecording()).resolves.toEqual({ lease_id: 'lease_1', expires_at: 30000 });
    await service.renewRecording('lease_1');
    await service.endRecording('lease_1');
    expect(invoke).toHaveBeenCalledWith('renew_launcher_shortcut_recording', { leaseId: 'lease_1' });
    expect(invoke).toHaveBeenCalledWith('end_launcher_shortcut_recording', { leaseId: 'lease_1' });
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
