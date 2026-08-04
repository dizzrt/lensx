import '@/app/private';
import '@/app/plugins/registration';
import '@/app/plugins/registration/desktop';
import '@/app/plugins/installation';
import '@/app/plugins/installation/desktop';
import type { PluginRegistrationChangedEvent } from '@/app/plugins/registration/types';
import '@tauri-apps/api/core';
import '../../../../tools/plugin-package-format/index.ts';

export { publicValue } from '@fixture/public';

export type LeakedRegistrationEvent = PluginRegistrationChangedEvent;
