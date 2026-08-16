export const CONFIG_LENS_COLD_OPEN_EVIDENCE_VERSION = '0.1.0' as const;

export const CONFIG_LENS_COLD_OPEN_STAGES = [
  'resolve',
  'create',
  'navigation',
  'load',
  'bridge',
  'sdk',
  'bundle',
  'editor',
  'worker',
] as const;

export type ConfigLensColdOpenStage = (typeof CONFIG_LENS_COLD_OPEN_STAGES)[number];

export interface ConfigLensDurationSummary {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

export interface ConfigLensColdOpenEvidence {
  readonly evidence_version: typeof CONFIG_LENS_COLD_OPEN_EVIDENCE_VERSION;
  readonly measurement_scope: 'automated-cold-create';
  readonly sample_count: number;
  readonly stage_ms: Readonly<Record<ConfigLensColdOpenStage, ConfigLensDurationSummary>>;
  readonly first_interactive_ms: ConfigLensDurationSummary;
  readonly host_heartbeat: {
    readonly interval_ms: number;
    readonly sample_count: number;
    readonly p95_gap_ms: number;
    readonly max_gap_ms: number;
    readonly responsive: true;
  };
  readonly privacy: {
    readonly user_content_recorded: false;
    readonly host_private_token_recorded: false;
  };
}

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

const boundedDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 60_000;

const validSummary = (value: unknown): value is ConfigLensDurationSummary => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const summary = value as Record<string, unknown>;
  return (
    exactKeys(summary, ['p50', 'p95', 'max']) &&
    boundedDuration(summary.p50) &&
    boundedDuration(summary.p95) &&
    boundedDuration(summary.max) &&
    summary.p50 <= summary.p95 &&
    summary.p95 <= summary.max
  );
};

const percentile = (values: readonly number[], proportion: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)] ?? 0;
};

const summarize = (values: readonly number[]): ConfigLensDurationSummary =>
  Object.freeze({ p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: Math.max(...values) });

export interface ConfigLensColdOpenSample {
  readonly stage_ms: Readonly<Record<ConfigLensColdOpenStage, number>>;
  readonly first_interactive_ms: number;
  readonly heartbeat_gaps_ms: readonly number[];
  readonly heartbeat_interval_ms: number;
}

export const summarizeConfigLensColdOpenSamples = (
  samples: readonly ConfigLensColdOpenSample[],
): ConfigLensColdOpenEvidence => {
  if (samples.length < 3 || samples.length > 100) throw new TypeError('Cold-open sample count is out of bounds.');
  const heartbeatIntervals = new Set(samples.map(({ heartbeat_interval_ms }) => heartbeat_interval_ms));
  if (heartbeatIntervals.size !== 1) throw new TypeError('Host heartbeat interval drifted across samples.');
  const heartbeatInterval = samples[0]?.heartbeat_interval_ms;
  if (!boundedDuration(heartbeatInterval) || heartbeatInterval === 0) {
    throw new TypeError('Host heartbeat interval is invalid.');
  }
  const heartbeatGaps = samples.flatMap(({ heartbeat_gaps_ms }) => [...heartbeat_gaps_ms]);
  if (heartbeatGaps.length < samples.length || heartbeatGaps.some((value) => !boundedDuration(value))) {
    throw new TypeError('Host heartbeat samples are incomplete or invalid.');
  }
  for (const sample of samples) {
    if (!boundedDuration(sample.first_interactive_ms)) throw new TypeError('First-interactive duration is invalid.');
    const segmentTotal = CONFIG_LENS_COLD_OPEN_STAGES.reduce((total, stage) => {
      const duration = sample.stage_ms[stage];
      if (!boundedDuration(duration)) throw new TypeError(`Cold-open stage ${stage} is invalid.`);
      return total + duration;
    }, 0);
    if (sample.first_interactive_ms < segmentTotal) {
      throw new TypeError('First-interactive duration cannot precede its cold-open segments.');
    }
  }
  const p95Gap = percentile(heartbeatGaps, 0.95);
  const maxGap = Math.max(...heartbeatGaps);
  const stage_ms = Object.fromEntries(
    CONFIG_LENS_COLD_OPEN_STAGES.map((stage) => [stage, summarize(samples.map((sample) => sample.stage_ms[stage]))]),
  ) as Record<ConfigLensColdOpenStage, ConfigLensDurationSummary>;
  return Object.freeze({
    evidence_version: CONFIG_LENS_COLD_OPEN_EVIDENCE_VERSION,
    measurement_scope: 'automated-cold-create',
    sample_count: samples.length,
    stage_ms: Object.freeze(stage_ms),
    first_interactive_ms: summarize(samples.map(({ first_interactive_ms }) => first_interactive_ms)),
    host_heartbeat: Object.freeze({
      interval_ms: heartbeatInterval,
      sample_count: heartbeatGaps.length,
      p95_gap_ms: p95Gap,
      max_gap_ms: maxGap,
      responsive: true as const,
    }),
    privacy: Object.freeze({ user_content_recorded: false as const, host_private_token_recorded: false as const }),
  });
};

export const validateConfigLensColdOpenEvidence = (value: unknown): value is ConfigLensColdOpenEvidence => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  if (
    !exactKeys(evidence, [
      'evidence_version',
      'measurement_scope',
      'sample_count',
      'stage_ms',
      'first_interactive_ms',
      'host_heartbeat',
      'privacy',
    ]) ||
    evidence.evidence_version !== CONFIG_LENS_COLD_OPEN_EVIDENCE_VERSION ||
    evidence.measurement_scope !== 'automated-cold-create' ||
    !Number.isInteger(evidence.sample_count) ||
    (evidence.sample_count as number) < 3 ||
    (evidence.sample_count as number) > 100 ||
    !validSummary(evidence.first_interactive_ms)
  ) {
    return false;
  }
  if (evidence.stage_ms === null || typeof evidence.stage_ms !== 'object' || Array.isArray(evidence.stage_ms))
    return false;
  const stages = evidence.stage_ms as Record<string, unknown>;
  if (
    !exactKeys(stages, CONFIG_LENS_COLD_OPEN_STAGES) ||
    CONFIG_LENS_COLD_OPEN_STAGES.some((stage) => !validSummary(stages[stage]))
  ) {
    return false;
  }
  if (
    evidence.host_heartbeat === null ||
    typeof evidence.host_heartbeat !== 'object' ||
    Array.isArray(evidence.host_heartbeat)
  ) {
    return false;
  }
  const heartbeat = evidence.host_heartbeat as Record<string, unknown>;
  if (
    !exactKeys(heartbeat, ['interval_ms', 'sample_count', 'p95_gap_ms', 'max_gap_ms', 'responsive']) ||
    !boundedDuration(heartbeat.interval_ms) ||
    heartbeat.interval_ms === 0 ||
    !Number.isInteger(heartbeat.sample_count) ||
    (heartbeat.sample_count as number) < (evidence.sample_count as number) ||
    !boundedDuration(heartbeat.p95_gap_ms) ||
    !boundedDuration(heartbeat.max_gap_ms) ||
    (heartbeat.p95_gap_ms as number) > (heartbeat.max_gap_ms as number) ||
    heartbeat.responsive !== true
  ) {
    return false;
  }
  if (evidence.privacy === null || typeof evidence.privacy !== 'object' || Array.isArray(evidence.privacy))
    return false;
  const privacy = evidence.privacy as Record<string, unknown>;
  return (
    exactKeys(privacy, ['user_content_recorded', 'host_private_token_recorded']) &&
    privacy.user_content_recorded === false &&
    privacy.host_private_token_recorded === false
  );
};

export const assertConfigLensColdOpenEvidencePrivacy = (source: string): void => {
  let evidence: unknown;
  try {
    evidence = JSON.parse(source) as unknown;
  } catch {
    throw new TypeError('ConfigLens cold-open evidence is not canonical JSON.');
  }
  if (!validateConfigLensColdOpenEvidence(evidence)) {
    throw new TypeError('ConfigLens cold-open evidence contains unknown or invalid fields.');
  }
  const stringValues = JSON.stringify(evidence).match(/"(?:[^"\\]|\\.)*"/gu) ?? [];
  if (
    stringValues.some((value) =>
      /(?:https?:|file:|lensx-plugin:|\/Users\/|\/private\/|entry_id|plugin_id|page_id|origin|freshness|nonce|payload|stack|raw error)/iu.test(
        value,
      ),
    )
  ) {
    throw new TypeError(
      'ConfigLens cold-open evidence contains a forbidden identity, authority, path, or content field.',
    );
  }
};
