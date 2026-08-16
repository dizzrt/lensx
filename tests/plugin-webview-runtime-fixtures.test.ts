import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

import { inspectPluginPackage } from '../packages/plugin-cli/dist/src/package-format/index.js';

const root = join(import.meta.dirname, '..');
const fixtureRoot = join(root, 'fixtures/plugin-webview-runtime');
const expectations = JSON.parse(readFileSync(join(fixtureRoot, 'expectations.json'), 'utf8')) as {
  readonly fixture_version: string;
  readonly packages: readonly {
    readonly kind: 'normal' | 'malicious';
    readonly file: string;
    readonly coverage: readonly string[];
    readonly expected: { readonly status: string; readonly manifest: { readonly runtime: { readonly kind: string } } };
  }[];
};

describe('Plugin WebView Runtime package fixtures', () => {
  test('keeps only current compatible top-level WebView packages', async () => {
    expect(expectations.fixture_version).toBe('0.3.0');
    expect(expectations.packages.map(({ kind }) => kind)).toEqual(['normal', 'malicious']);
    for (const fixture of expectations.packages) {
      const inspection = await inspectPluginPackage(readFileSync(join(fixtureRoot, fixture.file)));
      expect(inspection).toEqual(fixture.expected);
      expect(inspection.status).toBe('compatible');
      expect(fixture.expected.manifest.runtime.kind).toBe('webview');
    }
  });

  test('separates ordinary Web capabilities from the native escape corpus', () => {
    expect(expectations.packages.find(({ kind }) => kind === 'normal')?.coverage).toEqual([
      'top_level_document',
      'public_webview_bridge',
      'host_route_fragment',
      'dedicated_worker',
      'origin_storage',
    ]);
    expect(expectations.packages.find(({ kind }) => kind === 'malicious')?.coverage).toEqual([
      'generic_tauri_envelopes',
      'native_command_escape',
      'global_event_escape',
      'window_authority_escape',
      'webview_authority_escape',
      'malformed_bridge_carrier',
    ]);
  });
});
