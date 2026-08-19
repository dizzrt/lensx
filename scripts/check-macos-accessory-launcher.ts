import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
const readText = (path: string): string => readFileSync(join(root, path), 'utf8');

export interface MacosAccessoryPolicyFacts {
  readonly ls_ui_element: boolean;
  readonly visible_on_all_workspaces: boolean;
  readonly always_on_top: boolean;
  readonly non_fullscreen: boolean;
  readonly initial_650x320: boolean;
  readonly hard_size_envelope_preserved: boolean;
  readonly unsupported_skip_taskbar_absent: boolean;
  readonly runtime_accessory_only: boolean;
  readonly fullscreen_auxiliary_merged: boolean;
  readonly no_frontend_or_plugin_setter: boolean;
  readonly cmd_w_and_cmd_q_not_global: boolean;
}

export const inspectMacosAccessoryPolicy = (): MacosAccessoryPolicyFacts => {
  const info = readText('src-tauri/Info.plist');
  const configSource = readText('src-tauri/tauri.conf.json');
  const config = JSON.parse(configSource) as {
    app: { windows: Array<Record<string, unknown>> };
  };
  const main = config.app.windows.find((window) => window.label === 'main');
  if (!main) throw new Error('macOS accessory policy failed: main Window configuration is missing.');
  const macos = readText('src-tauri/src/macos_launcher.rs');
  const launcher = readText('src-tauri/src/launcher_window.rs');
  const globalShortcutSection = launcher.slice(
    launcher.indexOf('pub fn global_shortcut_plugin'),
    launcher.indexOf('trait ShortcutRegistrar'),
  );
  const facts: MacosAccessoryPolicyFacts = {
    ls_ui_element: /<key>LSUIElement<\/key>\s*<true\/>/u.test(info),
    visible_on_all_workspaces: main.visibleOnAllWorkspaces === true,
    always_on_top: main.alwaysOnTop === true,
    non_fullscreen: main.fullscreen === false,
    initial_650x320: main.width === 650 && main.height === 320,
    hard_size_envelope_preserved:
      main.minWidth === 320 && main.minHeight === 180 && main.maxWidth === 4096 && main.maxHeight === 4096,
    unsupported_skip_taskbar_absent: !configSource.includes('skipTaskbar'),
    runtime_accessory_only:
      macos.includes('app.set_activation_policy(tauri::ActivationPolicy::Accessory)') &&
      !macos.includes('tauri::ActivationPolicy::Regular') &&
      !macos.includes('tauri::ActivationPolicy::Prohibited'),
    fullscreen_auxiliary_merged:
      macos.includes('const CAN_JOIN_ALL_SPACES: usize = 1 << 0') &&
      macos.includes('const FULL_SCREEN_AUXILIARY: usize = 1 << 8') &&
      macos.includes('previous | CAN_JOIN_ALL_SPACES | FULL_SCREEN_AUXILIARY'),
    no_frontend_or_plugin_setter:
      !readText('src-tauri/src/lib.rs').includes('macos_launcher::activate_macos_accessory_application,') &&
      !readText('src-tauri/src/lib.rs').includes('setup_macos_launcher_window_collection,'),
    cmd_w_and_cmd_q_not_global:
      !globalShortcutSection.includes('Cmd+W') &&
      !globalShortcutSection.includes('Cmd+Q') &&
      globalShortcutSection.includes('default_shortcut()'),
  };
  return facts;
};

export const assertMacosAccessoryPolicy = (facts = inspectMacosAccessoryPolicy()): void => {
  const failed = Object.entries(facts)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (failed.length > 0) {
    throw new Error(`macOS accessory policy failed: ${failed.join(', ')}.`);
  }
};

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  assertMacosAccessoryPolicy();
  console.log('Verified macOS Accessory bundle, Window, shortcut, and Host-private policy.');
}
