import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';
import fixtureManifest from '../fixtures/frame-aware-webview-navigation/cases.json';

const rootDir = join(import.meta.dirname, '..');
const fixtureRoot = join(rootDir, 'fixtures/frame-aware-webview-navigation');
const cases = fixtureManifest.cases;

describe('frame-aware WebView navigation fixtures', () => {
  test('cover the required main, descendant, navigation, popup, download, and bootstrap cases', () => {
    expect(fixtureManifest.fixture_version).toBe('0.1.0');
    expect(new Set(cases.map(({ case_id }) => case_id)).size).toBe(cases.length);
    expect(cases).toHaveLength(15);
    expect(new Set(cases.map(({ frame_class }) => frame_class))).toEqual(new Set(['main', 'descendant']));
    expect(new Set(cases.map(({ operation }) => operation))).toEqual(
      new Set(['observe_bootstrap', 'invoke', 'self_navigation', 'popup', 'targeted_context', 'download']),
    );
    expect(new Set(cases.map(({ target_ref }) => target_ref))).toEqual(
      new Set([
        'none',
        'active_plugin_entry',
        'active_plugin_entry_other_fragment',
        'host_app',
        'external_https',
        'cross_plugin_entry',
        'stale_plugin_entry',
        'dangerous_file',
        'dangerous_javascript',
        'dangerous_data',
        'dangerous_blob',
        'download_payload',
      ]),
    );
  });

  test('keeps expected authorization and bootstrap outcomes explicit and fail closed', () => {
    const host = cases.find(({ case_id }) => case_id === 'host-main-bootstrap');
    const plugin = cases.find(({ case_id }) => case_id === 'exact-plugin-entry');
    expect(host).toMatchObject({
      frame_class: 'main',
      expected_navigation_decision: 'allow_main_app',
      expected_bootstrap: 'available',
    });
    expect(plugin).toMatchObject({
      frame_class: 'descendant',
      expected_navigation_decision: 'allow_active_plugin_document',
      expected_bootstrap: 'absent',
    });
    for (const fixture of cases.filter(({ frame_class }) => frame_class === 'descendant')) {
      expect(fixture.expected_bootstrap, fixture.case_id).toBe('absent');
      expect(fixture.expected_handler_hits, fixture.case_id).toBe(0);
    }
    for (const fixture of cases.filter(({ operation }) =>
      ['self_navigation', 'popup', 'targeted_context', 'download'].includes(operation),
    )) {
      expect(fixture.expected_navigation_decision, fixture.case_id).toBe('deny');
    }
  });

  test('generates self-contained documents with an immediate bounded bootstrap probe', () => {
    for (const fixture of cases) {
      const document = readFileSync(join(fixtureRoot, 'documents', fixture.document), 'utf8');
      expect(document, fixture.case_id).toContain(`const fixture = {"case_id":"${fixture.case_id}"`);
      expect(document, fixture.case_id).toContain("report('document_start')");
      expect(document, fixture.case_id).toContain("const namespace = 'lensx.frame-aware-webview-harness'");
      expect(document, fixture.case_id).not.toContain('lensx-plugin://');
      expect(document, fixture.case_id).not.toContain('https://');
      expect(document, fixture.case_id).not.toMatch(/\/(?:Users|home)\//);
    }
  });

  test('keeps fixture-only wiring outside production composition', () => {
    const appSource = readFileSync(join(rootDir, 'src/App.tsx'), 'utf8');
    const tauriSource = readFileSync(join(rootDir, 'src-tauri/src/lib.rs'), 'utf8');
    expect(appSource).not.toContain('frame-aware-webview-navigation');
    expect(tauriSource).not.toContain('frame_aware_webview_harness_probe');
    expect(tauriSource).not.toContain('frame-aware-webview-navigation');
  });
});
