import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@rstest/core';

const publicPackages = ['plugin-contract', 'plugin-sdk', 'plugin-ui', 'plugin-testkit'];
const privateNames = [
  'plugin_replacement_contract',
  'PluginReplacementDesktopAdapter',
  'PluginReplacementService',
  'preparation_token',
  'prepare_local_plugin_replacement',
  'commit_local_plugin_replacement',
];

describe('plugin replacement workspace boundary', () => {
  test.each(publicPackages)('%s has no replacement export or Host-private implementation', (packageName) => {
    const packageRoot = resolve(import.meta.dirname, '..', 'packages', packageName);
    const metadata = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');
    const publicIndex = readFileSync(resolve(packageRoot, 'src/index.ts'), 'utf8');
    for (const privateName of privateNames) {
      expect(`${metadata}\n${publicIndex}`).not.toContain(privateName);
    }
  });

  test('private adapter and service remain under the root Host package', () => {
    const root = resolve(import.meta.dirname, '..');
    const adapter = readFileSync(resolve(root, 'src/app/plugins/replacement/desktop.ts'), 'utf8');
    const service = readFileSync(resolve(root, 'src/app/plugins/replacement/service.ts'), 'utf8');
    expect(adapter).toContain("from '@tauri-apps/api/core'");
    expect(service).toContain('quiesceProvider');
    expect(JSON.stringify({ adapter, service })).not.toContain("export * from '@lensx/plugin-contract'");
  });
});
