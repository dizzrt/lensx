import { invoke } from '@tauri-apps/api/core';

export type ShortcutBindingView = {
  id: string;
  shortcut: string;
  action_id: string;
  enabled: boolean;
};

export const getDefaultShortcutBindings = async (): Promise<ShortcutBindingView[]> => {
  return invoke<ShortcutBindingView[]>('get_default_shortcut_bindings');
};
