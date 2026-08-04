import '@/app/private';
import '@/app/plugins/registration';
import '@/app/plugins/registration/desktop';
import '@/app/plugins/installation';
import '@/app/plugins/installation/desktop';
import '@/app/plugins/resource';
import '@/app/plugins/resource/desktop';
import type { PluginRegistrationChangedEvent } from '@/app/plugins/registration/types';
import type { PluginResourceEntry } from '@/app/plugins/resource/types';
import '@tauri-apps/api/core';
import '../../../../tools/plugin-package-format/index.ts';
import '../../../../src-tauri/src/plugin_resource_service.rs';

export { publicValue } from '@fixture/public';

export type LeakedRegistrationEvent = PluginRegistrationChangedEvent;
export type LeakedPluginResourceEntry = PluginResourceEntry;
