import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';

import { inspectPluginPackage } from '../tools/plugin-package-format';

interface FixtureExpectation {
  readonly kind:
    | 'normal'
    | 'malicious'
    | 'slow-load'
    | 'never-acknowledge'
    | 'unexpected-disconnect'
    | 'repeated-failure'
    | 'host-reload'
    | 'replacement';
  readonly file: string;
  readonly coverage: readonly string[];
  readonly expected: {
    readonly status: string;
    readonly facts: { readonly files: readonly { readonly path: string }[] };
  };
}

const root = join(import.meta.dirname, '..');
const fixtureRoot = join(root, 'fixtures/plugin-iframe-runtime');
const expectations = JSON.parse(readFileSync(join(fixtureRoot, 'expectations.json'), 'utf8')) as {
  readonly fixture_version: string;
  readonly packages: readonly FixtureExpectation[];
};

describe('plugin iframe Runtime package fixtures', () => {
  test('keeps compatible security and lifecycle packages', async () => {
    expect(expectations.fixture_version).toBe('0.1.0');
    expect(expectations.packages.map(({ kind }) => kind)).toEqual([
      'normal',
      'malicious',
      'slow-load',
      'never-acknowledge',
      'unexpected-disconnect',
      'repeated-failure',
      'host-reload',
      'replacement',
    ]);
    for (const fixture of expectations.packages) {
      const inspection = await inspectPluginPackage(readFileSync(join(fixtureRoot, fixture.file)));
      expect(inspection).toEqual(fixture.expected);
      expect(inspection.status).toBe('compatible');
    }
  });

  test('covers each terminal lifecycle scenario with Host-owned control points', () => {
    for (const kind of [
      'slow-load',
      'never-acknowledge',
      'unexpected-disconnect',
      'repeated-failure',
      'host-reload',
      'replacement',
    ] as const) {
      const fixture = expectations.packages.find((candidate) => candidate.kind === kind);
      expect(fixture?.coverage).toEqual([kind.replaceAll('-', '_'), 'host_owned_deadline', 'unified_terminal_cleanup']);
      expect(fixture?.expected.facts.files.map(({ path }) => path)).toEqual(
        expect.arrayContaining(['dist/index.html', 'dist/early-runtime-probe.js', 'dist/scenario.js']),
      );
    }
  });

  test('covers the executable resource graph and Host-derived route input', () => {
    const fixture = expectations.packages.find(({ kind }) => kind === 'normal');
    expect(fixture?.coverage).toEqual([
      'html',
      'css',
      'image',
      'classic_script',
      'es_module',
      'module_graph',
      'host_route_fragment',
      'origin_serialization',
      'same_key_storage',
      'parent_frame_isolation',
      'private_session_bootstrap_consumer',
      'single_use_nonce',
      'message_port_transfer',
    ]);
    expect(fixture?.expected.facts.files.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'dist/index.html',
        'dist/styles.css',
        'dist/image.svg',
        'dist/classic.js',
        'dist/module.js',
        'dist/module-dependency.js',
      ]),
    );
  });

  test('covers direct Host access, navigation escape, and sensitive browser capability attempts', () => {
    const coverage = expectations.packages.find(({ kind }) => kind === 'malicious')?.coverage ?? [];
    expect(coverage).toEqual(
      expect.arrayContaining([
        'tauri_internals',
        'tauri_api_import',
        'parent_dom',
        'host_storage',
        'frame_element',
        'host_path_mismatch',
        'filesystem',
        'cross_scope_navigation',
        'cross_origin_navigation',
        'cross_generation_resource',
        'cross_generation_storage',
        'cross_generation_navigation',
        'top_navigation',
        'popup',
        'download',
        'form',
        'clipboard',
        'camera',
        'microphone',
        'geolocation',
        'fullscreen',
        'dangerous_scheme',
        'cross_plugin_session_forgery',
        'old_generation_session_replay',
        'wrong_origin_bootstrap',
        'csp_remote_script',
        'csp_inline_script',
        'csp_eval',
        'csp_connect',
        'csp_worker',
        'csp_frame',
        'csp_object',
        'csp_base',
        'csp_form',
        'csp_data',
        'csp_blob',
      ]),
    );
  });
});
