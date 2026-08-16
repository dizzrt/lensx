import { describe, expect, test } from '@rstest/core';

import {
  assertConfigLensColdOpenEvidencePrivacy,
  CONFIG_LENS_COLD_OPEN_STAGES,
  nearestRankPercentile,
  summarizeConfigLensColdOpenSamples,
  validateConfigLensColdOpenEvidence,
} from '../scripts/config-lens-cold-open-metrics.ts';

const cleanup = Object.freeze({
  bridge_authority_absent: true as const,
  resource_authority_absent: true as const,
  sessions_absent: true as const,
  webviews_absent: true as const,
  workers_absent: true as const,
});
const sample = (offset: number) => ({
  stage_ms: Object.fromEntries(
    CONFIG_LENS_COLD_OPEN_STAGES.map((stage, index) => [stage, index + 1 + offset]),
  ) as Record<(typeof CONFIG_LENS_COLD_OPEN_STAGES)[number], number>,
  terminal_cleanup: cleanup,
});
const samples = () => ({
  release_like: Array.from({ length: 20 }, (_, index) => sample(index)),
  development_snapshot: Array.from({ length: 20 }, (_, index) => sample(index + 10)),
  same_attempt_restore: Array.from({ length: 40 }, (_, index) => ({ restore_ms: index + 1 })),
  heartbeat_gaps_ms: Array.from({ length: 80 }, (_, index) => 16 + (index % 3)),
  asset_sizes: {
    dist_bytes: 4_500_000,
    html_referenced_css_bytes: 900,
    html_referenced_javascript_bytes: 100_000,
    package_bytes: 1_100_000,
  },
});

describe('ConfigLens cold-open metric evidence', () => {
  test('uses nearest-rank percentiles and summarizes all closed profiles without per-sample identity', () => {
    expect(
      nearestRankPercentile(
        Array.from({ length: 20 }, (_, index) => index + 1),
        0.95,
      ),
    ).toBe(19);
    const evidence = summarizeConfigLensColdOpenSamples(samples());
    expect(Object.keys(evidence.profiles.release_like.stage_ms)).toEqual(CONFIG_LENS_COLD_OPEN_STAGES);
    expect(evidence.profiles.release_like.sample_count).toBe(20);
    expect(evidence.profiles.development_snapshot.sample_count).toBe(20);
    expect(evidence.profiles.same_attempt_restore).toMatchObject({
      sample_count: 40,
      stage_ms: { restore: { p50: 20, p95: 38, max: 40 } },
    });
    expect(validateConfigLensColdOpenEvidence(evidence)).toBe(true);
    expect(() => assertConfigLensColdOpenEvidencePrivacy(JSON.stringify(evidence))).not.toThrow();
  });

  test('fails closed on missing stages, wrong percentiles, insufficient samples, unknown fields, and privacy violations', () => {
    const valid = summarizeConfigLensColdOpenSamples(samples());
    const { worker: _worker, ...missingWorker } = valid.profiles.release_like.stage_ms;
    expect(
      validateConfigLensColdOpenEvidence({
        ...valid,
        profiles: { ...valid.profiles, release_like: { ...valid.profiles.release_like, stage_ms: missingWorker } },
      }),
    ).toBe(false);
    expect(
      validateConfigLensColdOpenEvidence({
        ...valid,
        profiles: {
          ...valid.profiles,
          release_like: {
            ...valid.profiles.release_like,
            stage_ms: { ...valid.profiles.release_like.stage_ms, resolve: { p50: 3, p95: 2, max: 4 } },
          },
        },
      }),
    ).toBe(false);
    expect(() => summarizeConfigLensColdOpenSamples({ ...samples(), release_like: [sample(0)] })).toThrow(/count/u);
    expect(() => assertConfigLensColdOpenEvidencePrivacy(JSON.stringify({ ...valid, sample_id: 'sample-1' }))).toThrow(
      /unknown/u,
    );
    expect(() =>
      assertConfigLensColdOpenEvidencePrivacy(JSON.stringify(valid).replace('macos', 'file:/private/x')),
    ).toThrow();
    expect(() => nearestRankPercentile([], 0.95)).toThrow(/invalid/u);
  });
});
