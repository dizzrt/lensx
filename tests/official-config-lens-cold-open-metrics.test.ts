import { describe, expect, test } from '@rstest/core';

import {
  assertConfigLensColdOpenEvidencePrivacy,
  CONFIG_LENS_COLD_OPEN_STAGES,
  summarizeConfigLensColdOpenSamples,
  validateConfigLensColdOpenEvidence,
} from '../scripts/config-lens-cold-open-metrics.ts';

const sample = (offset: number) => ({
  stage_ms: Object.fromEntries(
    CONFIG_LENS_COLD_OPEN_STAGES.map((stage, index) => [stage, index + 1 + offset]),
  ) as Record<(typeof CONFIG_LENS_COLD_OPEN_STAGES)[number], number>,
  first_interactive_ms: 100 + offset,
  heartbeat_gaps_ms: [16, 17 + offset],
  heartbeat_interval_ms: 16,
});

describe('ConfigLens cold-open metric evidence', () => {
  test('summarizes every required segment and a responsive Host heartbeat without content fields', () => {
    const evidence = summarizeConfigLensColdOpenSamples([sample(0), sample(1), sample(2)]);
    expect(Object.keys(evidence.stage_ms)).toEqual(CONFIG_LENS_COLD_OPEN_STAGES);
    expect(evidence.first_interactive_ms).toEqual({ p50: 101, p95: 102, max: 102 });
    expect(evidence.host_heartbeat).toEqual({
      interval_ms: 16,
      sample_count: 6,
      p95_gap_ms: 19,
      max_gap_ms: 19,
      responsive: true,
    });
    expect(validateConfigLensColdOpenEvidence(evidence)).toBe(true);
    expect(() => assertConfigLensColdOpenEvidencePrivacy(JSON.stringify(evidence))).not.toThrow();
  });

  test('fails closed on missing stages, inconsistent timing, heartbeat drift, or sensitive evidence', () => {
    const valid = summarizeConfigLensColdOpenSamples([sample(0), sample(1), sample(2)]);
    const { worker: _worker, ...missingWorker } = valid.stage_ms;
    expect(validateConfigLensColdOpenEvidence({ ...valid, stage_ms: missingWorker })).toBe(false);
    expect(validateConfigLensColdOpenEvidence({ ...valid, first_interactive_ms: { p50: 3, p95: 2, max: 4 } })).toBe(
      false,
    );
    expect(() =>
      summarizeConfigLensColdOpenSamples([sample(0), sample(1), { ...sample(2), heartbeat_interval_ms: 20 }]),
    ).toThrow(/heartbeat interval/u);
    expect(() => assertConfigLensColdOpenEvidencePrivacy(JSON.stringify({ ...valid, user_content: 'secret' }))).toThrow(
      /unknown/u,
    );
    expect(() => assertConfigLensColdOpenEvidencePrivacy(JSON.stringify({ ...valid, token: 'private' }))).toThrow(
      /unknown/u,
    );
  });
});
