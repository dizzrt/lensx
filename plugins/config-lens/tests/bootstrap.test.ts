import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from '@rstest/core';

const root = resolve(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('ConfigLens early bootstrap', () => {
  test('connects one public SDK client before lazy UI and Monaco composition', () => {
    const source = read('src/main.tsx');
    const client = source.indexOf('createPluginSdk({');
    const context = source.indexOf('await currentClient.initialize()');
    const mount = source.indexOf("import('./mount.js')");
    const monaco = source.indexOf('loadMonaco()');
    expect(client).toBeGreaterThanOrEqual(0);
    expect(context).toBeGreaterThan(client);
    expect(mount).toBeGreaterThan(context);
    expect(monaco).toBeGreaterThan(context);
    expect(source.match(/createPluginSdk\(/gu)).toHaveLength(1);
    expect(source).toContain('Promise.all');
    expect(source).toContain('onRetry: () => void start()');
  });

  test('keeps normal pre-context startup visually empty and first-interactive evidence payload-free', () => {
    const html = read('index.html');
    const shell = html.slice(html.indexOf('<section'), html.indexOf('</section>'));
    expect(shell).toContain('aria-busy="true"');
    expect(shell).toContain('config-lens-startup-retry');
    expect(shell).toContain('hidden');
    expect(shell).not.toMatch(/>\s*ConfigLens\s*</u);
    expect(shell).not.toContain('role="progressbar"');
    expect(shell).not.toContain('config-lens-startup__progress');
    expect(html).not.toMatch(/Loading|Retry|正在|重试/u);
    const startupStyles = read('src/startup.css');
    const visibleShell = startupStyles.indexOf('.config-lens-startup {');
    const hiddenShell = startupStyles.indexOf('.config-lens-startup[hidden] {');
    expect(visibleShell).toBeGreaterThanOrEqual(0);
    expect(hiddenShell).toBeGreaterThan(visibleShell);
    expect(startupStyles.slice(hiddenShell)).toMatch(/display:\s*none/u);
    expect(startupStyles).not.toContain('config-lens-startup__progress');
    expect(startupStyles).not.toContain('@keyframes');
    const signal = read('src/first-interactive.ts');
    expect(signal).toContain('new Event(CONFIG_LENS_FIRST_INTERACTIVE_EVENT)');
    expect(signal).not.toContain('CustomEvent');
  });
});
