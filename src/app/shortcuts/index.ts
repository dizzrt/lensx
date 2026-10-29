export { createDesktopShortcutService, desktopShortcutService, unavailableShortcutService } from './desktop';
export {
  isReservedShortcut,
  normalizeShortcut,
  normalizeShortcutConfiguration,
  parseShortcutSnapshot,
  replaceActionShortcut,
  replaceShortcut,
  SHORTCUT_MODIFIERS,
  shortcutEntries,
  shortcutFromKeyEvent,
  shortcutIdentity,
} from './model';
export { createShortcutRecordingPreview, type ShortcutRecordingPreview } from './recording';
export * from './types';
