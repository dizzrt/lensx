import { SHORTCUT_MODIFIERS, type ShortcutKeyEvent } from './model';
import policy from './policy.json';
import type { ShortcutModifier } from './types';

/** Transient display state only; incomplete presses are never persisted as triggers. */
export interface ShortcutRecordingPreview {
  readonly modifiers: readonly ShortcutModifier[];
  readonly keys: readonly string[];
}

export const createShortcutRecordingPreview = () => {
  const keys = new Set<string>();
  const aliases: Readonly<Record<string, string>> = policy.keyAliases;
  return {
    reset: () => keys.clear(),
    update(event: ShortcutKeyEvent, pressed: boolean): ShortcutRecordingPreview | undefined {
      if (event.isComposing || event.keyCode === 229) return undefined;
      const code = event.code.toLowerCase();
      const key = Object.hasOwn(aliases, code) ? aliases[code] : undefined;
      if (key) {
        if (pressed) keys.add(key);
        else keys.delete(key);
      }
      const modifiers = SHORTCUT_MODIFIERS.filter(
        (modifier) =>
          ({ cmd: event.metaKey, ctrl: event.ctrlKey, option: event.altKey, shift: event.shiftKey })[modifier],
      );
      return modifiers.length || keys.size
        ? Object.freeze({ modifiers: Object.freeze(modifiers), keys: Object.freeze([...keys]) })
        : undefined;
    },
  };
};
