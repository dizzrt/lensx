import '@/app/private';
import '@/app/plugins/registration';
import '@/app/plugins/registration/desktop';
import '@/app/plugins/installation';
import '@/app/plugins/installation/desktop';
import type { PluginRegistrationSnapshot } from '@/app/plugins/registration/types';
import '@/styles/internal.less';
import '@tauri-apps/api/core';
import '../../../../src/app/desktop.ts';
import '../../../../tools/plugin-package-format/index.ts';
import '../../../../packages/public/src/index.ts';
import '@fixture/public/src/index.ts';

export { publicValue } from '@fixture/public';

export type LeakedRegistrationSnapshot = PluginRegistrationSnapshot;
