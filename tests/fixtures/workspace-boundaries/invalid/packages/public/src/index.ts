import '@/app/plugins/resource';
import '@/app/plugins/resource/desktop';
import type { PluginResourceEntry } from '@/app/plugins/resource/types';
import '../../../src-tauri/src/plugin_resource_contract.rs';

export const publicValue = 'public';
export type LeakedPluginResourceEntry = PluginResourceEntry;
