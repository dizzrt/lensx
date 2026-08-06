import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@rstest/core';

const publicPackages = ['plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit'];
const privateNames = [
  'PluginDataManagement',
  'ClearPluginData',
  'clear_plugin_data',
  'plugin_data_management',
  'PLUGIN_DATA_MANAGEMENT_CONTRACT_VERSION',
];

describe('plugin data management workspace and package boundary', () => {
  test.each(publicPackages)('%s has no management export, command, or declaration leak', (packageName) => {
    const packageRoot = resolve(import.meta.dirname, '..', 'packages', packageName);
    const metadata = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');
    const publicIndex = readFileSync(resolve(packageRoot, 'src/index.ts'), 'utf8');
    for (const privateName of privateNames) {
      expect(`${metadata}\n${publicIndex}`).not.toContain(privateName);
    }
  });

  test('adapter and service remain under the private root application', () => {
    const root = resolve(import.meta.dirname, '..');
    const adapter = readFileSync(resolve(root, 'src/app/plugins/data-management/desktop.ts'), 'utf8');
    const service = readFileSync(resolve(root, 'src/app/plugins/data-management/service.ts'), 'utf8');
    expect(adapter).toContain("from '@tauri-apps/api/core'");
    expect(service).toContain('expected_revision');
    expect(`${adapter}\n${service}`).not.toContain("from '@lensx/plugin-sdk'");
  });
});
