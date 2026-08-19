import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@rstest/core';
import { assertMacosAccessoryPolicy, inspectMacosAccessoryPolicy } from '../scripts/check-macos-accessory-launcher.ts';
import { validateMacosAccessoryEvidence } from '../scripts/macos-accessory-launcher-evidence.ts';

const digest = 'a'.repeat(64);
const truths = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, true]));
const validEvidence = () => ({
  evidence_version: '0.1.0',
  platform: 'macos',
  macos_version: '15.6',
  source_digest: digest,
  revisions: { tauri: '2.11.5', tao: '0.35.3', wry: '0.55.1' },
  bundle_metadata: truths(['ls_ui_element', 'launch_services_start', 'packaged_app']),
  product: {
    evidence_version: '0.1.0',
    platform: 'macos',
    bundle_runtime: truths([
      'runtime_accessory',
      'dock_tile_absent',
      'ordinary_menu_bar_absent',
      'recovery_shortcut_registered',
      'hidden_process_alive',
    ]),
    window_policy: truths([
      'complete_main_window',
      'can_join_all_spaces',
      'full_screen_auxiliary',
      'above_normal_level',
      'always_on_top',
      'non_fullscreen',
      'single_native_window',
    ]),
    ordinary_space: truths([
      'production_global_shortcut_action',
      'visible',
      'focused',
      'on_active_space',
      'occlusion_visible',
    ]),
    fullscreen_space: truths([
      'sacrifice_activated_before_restore',
      'production_global_shortcut_action',
      'visible',
      'focused',
      'on_active_space',
      'occlusion_visible',
      'above_fullscreen_content',
    ]),
    repeated_toggle: {
      repetitions: 3,
      ...truths(['exact_hide_show_pairs', 'single_native_window', 'recovery_shortcut_still_registered']),
    },
    local_shortcuts: truths([
      'cmd_w_key_equivalent_dispatched',
      'cmd_w_reused_hide_action',
      'cmd_w_process_alive',
      'restored_after_cmd_w',
      'other_foreground_cmd_w_ignored',
      'other_foreground_cmd_q_ignored',
      'cmd_q_key_equivalent_dispatched',
      'cmd_q_exit_requested',
    ]),
    cleanup: truths(['bounded_execution', 'graceful_exit_requested', 'raw_paths_omitted']),
  },
  sacrifice: {
    evidence_version: '0.1.0',
    ...truths(['process_alive', 'ordinary_ready', 'fullscreen_ready', 'fullscreen_preserved', 'graceful_cleanup']),
  },
  plugin_child: truths([
    'cmd_w_native_window_hidden',
    'cmd_w_process_alive',
    'global_shortcut_native_window_restored',
    'same_child_webview_restored',
    'same_runtime_attempt_restored',
    'same_session_restored',
    'monaco_model_not_reloaded',
    'worker_not_recreated',
    'page_close_destroyed_attempt',
    'zero_native_bridge_resource_authority',
  ]),
  gate: truths([
    'current_source_digest',
    'packaged_product_executed',
    'product_process_exited',
    'setup_failure_covered_by_deterministic_tests',
    'static_results_not_substituted',
    'temporary_state_isolated',
    'bounded_timeouts',
    'graceful_cleanup',
  ]),
});

describe('macOS Accessory Launcher policy and product evidence', () => {
  test('keeps bundle, Window, Host authority, and shortcut policy aligned', () => {
    const facts = inspectMacosAccessoryPolicy();
    expect(() => assertMacosAccessoryPolicy(facts)).not.toThrow();
    expect(Object.values(facts).every(Boolean)).toBe(true);
  });

  test('accepts only complete current packaged-product evidence', () => {
    expect(() => validateMacosAccessoryEvidence(validEvidence(), digest)).not.toThrow();

    const simulatedOnly = structuredClone(validEvidence());
    simulatedOnly.gate.packaged_product_executed = false;
    expect(() => validateMacosAccessoryEvidence(simulatedOnly, digest)).toThrow();

    const stale = structuredClone(validEvidence());
    stale.source_digest = 'b'.repeat(64);
    expect(() => validateMacosAccessoryEvidence(stale, digest)).toThrow(/stale/u);

    const shortcutFailure = structuredClone(validEvidence());
    shortcutFailure.product.local_shortcuts.cmd_q_exit_requested = false;
    expect(() => validateMacosAccessoryEvidence(shortcutFailure, digest)).toThrow();
  });

  test('keeps the aggregate gate connected to policy, Rust, Child, docs, and real evidence', () => {
    const packageJson = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const focused = packageJson.scripts['check:macos-accessory-launcher'];
    expect(focused).toContain('check-macos-accessory-launcher.ts');
    expect(focused).toContain('macos-accessory-launcher.test.ts');
    expect(focused).toContain('cargo test');
    expect(focused).toContain('check:plugin-child-webview-window-lifecycle');
    expect(focused).toContain('check:macos-accessory-launcher-docs');
    expect(focused).toContain('macos-accessory-launcher-evidence.ts');
    expect(packageJson.scripts['evidence:macos-accessory-launcher']).toContain('--run --write');
  });
});
