import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, rs, test } from '@rstest/core';
import { CONFIG_LENS_STAGE_CATALOG } from '../plugins/config-lens/src/startup-stages.ts';
import { PLUGIN_COLD_OPEN_STAGES } from '../scripts/config-lens-cold-open-metrics.ts';
import {
  attachPluginRuntimeStageObserver,
  PLUGIN_RUNTIME_STAGE_CATALOG,
  recordPluginRuntimeStage,
} from '../src/app/plugins/runtime/stageMetrics.ts';

describe('closed plugin Runtime stage catalog', () => {
  test('keeps Host, ConfigLens, evidence, and Rust catalogs identical', () => {
    expect(PLUGIN_RUNTIME_STAGE_CATALOG).toEqual(PLUGIN_COLD_OPEN_STAGES);
    expect(CONFIG_LENS_STAGE_CATALOG).toEqual(PLUGIN_COLD_OPEN_STAGES);
    const rust = readFileSync(join(process.cwd(), 'src-tauri/src/plugin_runtime_stage.rs'), 'utf8');
    for (const stage of PLUGIN_COLD_OPEN_STAGES) expect(rust).toContain(`"${stage}"`);
  });

  test('defaults to no-op, permits one bounded observer, and drops invalid durations', () => {
    expect(() => recordPluginRuntimeStage('resolve', 1)).not.toThrow();
    const observer = rs.fn();
    const release = attachPluginRuntimeStageObserver(observer);
    expect(release).toBeDefined();
    expect(attachPluginRuntimeStageObserver(rs.fn())).toBeUndefined();
    recordPluginRuntimeStage('bridge', 3);
    recordPluginRuntimeStage('sdk', -1);
    recordPluginRuntimeStage('sdk', 60_001);
    expect(observer).toHaveBeenCalledOnce();
    expect(observer).toHaveBeenCalledWith({ stage: 'bridge', durationMs: 3 });
    release?.();
  });
});
