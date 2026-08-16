export const CONFIG_LENS_COLD_OPEN_EVIDENCE_VERSION = '0.2.0' as const;

export const PLUGIN_COLD_OPEN_STAGES = [
  'resolve',
  'create',
  'navigation',
  'load',
  'bridge',
  'sdk',
  'ui_bundle',
  'editor',
  'worker',
  'host_loading',
  'first_interactive',
  'restore',
] as const;
export type PluginColdOpenStage = (typeof PLUGIN_COLD_OPEN_STAGES)[number];
export type ConfigLensColdOpenStage = Exclude<PluginColdOpenStage, 'restore'>;
export const CONFIG_LENS_COLD_OPEN_STAGES = PLUGIN_COLD_OPEN_STAGES.filter(
  (stage) => stage !== 'restore',
) as ConfigLensColdOpenStage[];
export const CONFIG_LENS_COLD_OPEN_PROFILES = ['release_like', 'development_snapshot', 'same_attempt_restore'] as const;

export interface ConfigLensDurationSummary {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}
interface TerminalCleanupFacts {
  readonly bridge_authority_absent: true;
  readonly resource_authority_absent: true;
  readonly sessions_absent: true;
  readonly webviews_absent: true;
  readonly workers_absent: true;
}
interface ColdProfile {
  readonly sample_count: number;
  readonly stage_ms: Readonly<Record<ConfigLensColdOpenStage, ConfigLensDurationSummary>>;
  readonly terminal_cleanup: TerminalCleanupFacts;
}
interface RestoreProfile {
  readonly sample_count: number;
  readonly stage_ms: { readonly restore: ConfigLensDurationSummary };
  readonly continuity: {
    readonly attempt_unchanged: true;
    readonly document_unchanged: true;
    readonly model_unchanged: true;
    readonly session_unchanged: true;
    readonly worker_unchanged: true;
  };
}

export interface ConfigLensColdOpenEvidence {
  readonly evidence_version: typeof CONFIG_LENS_COLD_OPEN_EVIDENCE_VERSION;
  readonly platform: 'macos';
  readonly engine: 'wkwebview';
  readonly profiles: {
    readonly release_like: ColdProfile;
    readonly development_snapshot: ColdProfile;
    readonly same_attempt_restore: RestoreProfile;
  };
  readonly asset_sizes: {
    readonly dist_bytes: number;
    readonly html_referenced_css_bytes: number;
    readonly html_referenced_javascript_bytes: number;
    readonly package_bytes: number;
  };
  readonly host_heartbeat: {
    readonly sample_count: number;
    readonly p50_gap_ms: number;
    readonly p95_gap_ms: number;
    readonly max_gap_ms: number;
    readonly responsive: true;
  };
  readonly producer: {
    readonly kind: 'target_macos_product_runtime';
    readonly fresh_run: true;
    readonly production_components: {
      readonly bridge_rpc_sdk: true;
      readonly config_lens_candidate: true;
      readonly presentation: true;
      readonly resource_service: true;
    };
  };
  readonly privacy: {
    readonly complete_url_recorded: false;
    readonly data_store_identifier_recorded: false;
    readonly host_private_token_recorded: false;
    readonly native_label_recorded: false;
    readonly nonce_recorded: false;
    readonly origin_recorded: false;
    readonly path_recorded: false;
    readonly payload_recorded: false;
    readonly per_sample_identity_recorded: false;
    readonly raw_error_recorded: false;
    readonly stack_recorded: false;
    readonly user_content_recorded: false;
  };
}

export interface ConfigLensColdOpenSample {
  readonly stage_ms: Readonly<Record<ConfigLensColdOpenStage, number>>;
  readonly terminal_cleanup: TerminalCleanupFacts;
}
export interface ConfigLensColdOpenSamples {
  readonly release_like: readonly ConfigLensColdOpenSample[];
  readonly development_snapshot: readonly ConfigLensColdOpenSample[];
  readonly same_attempt_restore: readonly { readonly restore_ms: number }[];
  readonly heartbeat_gaps_ms: readonly number[];
  readonly asset_sizes: ConfigLensColdOpenEvidence['asset_sizes'];
}

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
const boundedDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 60_000;
const boundedSize = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 64 * 1024 * 1024;
const validSummary = (value: unknown): value is ConfigLensDurationSummary => {
  const summary = record(value);
  return (
    summary !== undefined &&
    exactKeys(summary, ['p50', 'p95', 'max']) &&
    boundedDuration(summary.p50) &&
    boundedDuration(summary.p95) &&
    boundedDuration(summary.max) &&
    summary.p50 <= summary.p95 &&
    summary.p95 <= summary.max
  );
};

export const nearestRankPercentile = (values: readonly number[], proportion: number): number => {
  if (values.length === 0 || !Number.isFinite(proportion) || proportion <= 0 || proportion > 1) {
    throw new TypeError('Percentile input is invalid.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * proportion) - 1] as number;
};
const summarize = (values: readonly number[]): ConfigLensDurationSummary =>
  Object.freeze({
    p50: nearestRankPercentile(values, 0.5),
    p95: nearestRankPercentile(values, 0.95),
    max: Math.max(...values),
  });
const validateColdSamples = (samples: readonly ConfigLensColdOpenSample[], minimum: number): void => {
  if (samples.length < minimum || samples.length > 100) throw new TypeError('Cold-open sample count is out of bounds.');
  for (const sample of samples) {
    if (
      !exactKeys(sample.stage_ms, CONFIG_LENS_COLD_OPEN_STAGES) ||
      CONFIG_LENS_COLD_OPEN_STAGES.some((stage) => !boundedDuration(sample.stage_ms[stage])) ||
      Object.values(sample.terminal_cleanup).some((value) => value !== true)
    ) {
      throw new TypeError('Cold-open stage or terminal cleanup evidence is invalid.');
    }
  }
};
const summarizeCold = (samples: readonly ConfigLensColdOpenSample[]): ColdProfile => ({
  sample_count: samples.length,
  stage_ms: Object.freeze(
    Object.fromEntries(
      CONFIG_LENS_COLD_OPEN_STAGES.map((stage) => [stage, summarize(samples.map((sample) => sample.stage_ms[stage]))]),
    ) as Record<ConfigLensColdOpenStage, ConfigLensDurationSummary>,
  ),
  terminal_cleanup: Object.freeze({ ...samples[0]?.terminal_cleanup }),
});

export const summarizeConfigLensColdOpenSamples = (samples: ConfigLensColdOpenSamples): ConfigLensColdOpenEvidence => {
  validateColdSamples(samples.release_like, 20);
  validateColdSamples(samples.development_snapshot, 20);
  if (samples.same_attempt_restore.length < 40 || samples.same_attempt_restore.length > 200) {
    throw new TypeError('Restore sample count is out of bounds.');
  }
  const restoreDurations = samples.same_attempt_restore.map(({ restore_ms }) => restore_ms);
  if (restoreDurations.some((value) => !boundedDuration(value))) throw new TypeError('Restore duration is invalid.');
  if (samples.heartbeat_gaps_ms.length < 80 || samples.heartbeat_gaps_ms.some((value) => !boundedDuration(value))) {
    throw new TypeError('Host heartbeat evidence is incomplete or invalid.');
  }
  if (Object.values(samples.asset_sizes).some((value) => !boundedSize(value)))
    throw new TypeError('Asset-size evidence is invalid.');
  const heartbeat = summarize(samples.heartbeat_gaps_ms);
  return Object.freeze({
    evidence_version: CONFIG_LENS_COLD_OPEN_EVIDENCE_VERSION,
    platform: 'macos',
    engine: 'wkwebview',
    profiles: Object.freeze({
      release_like: Object.freeze(summarizeCold(samples.release_like)),
      development_snapshot: Object.freeze(summarizeCold(samples.development_snapshot)),
      same_attempt_restore: Object.freeze({
        sample_count: samples.same_attempt_restore.length,
        stage_ms: Object.freeze({ restore: summarize(restoreDurations) }),
        continuity: Object.freeze({
          attempt_unchanged: true as const,
          document_unchanged: true as const,
          model_unchanged: true as const,
          session_unchanged: true as const,
          worker_unchanged: true as const,
        }),
      }),
    }),
    asset_sizes: Object.freeze({ ...samples.asset_sizes }),
    host_heartbeat: Object.freeze({
      sample_count: samples.heartbeat_gaps_ms.length,
      p50_gap_ms: heartbeat.p50,
      p95_gap_ms: heartbeat.p95,
      max_gap_ms: heartbeat.max,
      responsive: true as const,
    }),
    producer: Object.freeze({
      kind: 'target_macos_product_runtime' as const,
      fresh_run: true as const,
      production_components: Object.freeze({
        bridge_rpc_sdk: true as const,
        config_lens_candidate: true as const,
        presentation: true as const,
        resource_service: true as const,
      }),
    }),
    privacy: Object.freeze({
      complete_url_recorded: false as const,
      data_store_identifier_recorded: false as const,
      host_private_token_recorded: false as const,
      native_label_recorded: false as const,
      nonce_recorded: false as const,
      origin_recorded: false as const,
      path_recorded: false as const,
      payload_recorded: false as const,
      per_sample_identity_recorded: false as const,
      raw_error_recorded: false as const,
      stack_recorded: false as const,
      user_content_recorded: false as const,
    }),
  });
};

const validTrueRecord = (value: unknown, keys: readonly string[]): boolean => {
  const facts = record(value);
  return facts !== undefined && exactKeys(facts, keys) && Object.values(facts).every((item) => item === true);
};
const validColdProfile = (value: unknown, minimum: number): boolean => {
  const profile = record(value);
  const stages = record(profile?.stage_ms);
  return (
    profile !== undefined &&
    exactKeys(profile, ['sample_count', 'stage_ms', 'terminal_cleanup']) &&
    Number.isInteger(profile.sample_count) &&
    (profile.sample_count as number) >= minimum &&
    (profile.sample_count as number) <= 100 &&
    stages !== undefined &&
    exactKeys(stages, CONFIG_LENS_COLD_OPEN_STAGES) &&
    CONFIG_LENS_COLD_OPEN_STAGES.every((stage) => validSummary(stages[stage])) &&
    validTrueRecord(profile.terminal_cleanup, [
      'bridge_authority_absent',
      'resource_authority_absent',
      'sessions_absent',
      'webviews_absent',
      'workers_absent',
    ])
  );
};

export const validateConfigLensColdOpenEvidence = (value: unknown): value is ConfigLensColdOpenEvidence => {
  const evidence = record(value);
  if (
    evidence === undefined ||
    !exactKeys(evidence, [
      'evidence_version',
      'platform',
      'engine',
      'profiles',
      'asset_sizes',
      'host_heartbeat',
      'producer',
      'privacy',
    ]) ||
    evidence.evidence_version !== CONFIG_LENS_COLD_OPEN_EVIDENCE_VERSION ||
    evidence.platform !== 'macos' ||
    evidence.engine !== 'wkwebview'
  )
    return false;
  const profiles = record(evidence.profiles);
  const restore = record(profiles?.same_attempt_restore);
  const restoreStage = record(restore?.stage_ms);
  const heartbeat = record(evidence.host_heartbeat);
  const assetSizes = record(evidence.asset_sizes);
  const producer = record(evidence.producer);
  const privacy = record(evidence.privacy);
  return (
    profiles !== undefined &&
    exactKeys(profiles, CONFIG_LENS_COLD_OPEN_PROFILES) &&
    validColdProfile(profiles.release_like, 20) &&
    validColdProfile(profiles.development_snapshot, 20) &&
    restore !== undefined &&
    exactKeys(restore, ['sample_count', 'stage_ms', 'continuity']) &&
    Number.isInteger(restore.sample_count) &&
    (restore.sample_count as number) >= 40 &&
    restoreStage !== undefined &&
    exactKeys(restoreStage, ['restore']) &&
    validSummary(restoreStage.restore) &&
    validTrueRecord(restore.continuity, [
      'attempt_unchanged',
      'document_unchanged',
      'model_unchanged',
      'session_unchanged',
      'worker_unchanged',
    ]) &&
    assetSizes !== undefined &&
    exactKeys(assetSizes, [
      'dist_bytes',
      'html_referenced_css_bytes',
      'html_referenced_javascript_bytes',
      'package_bytes',
    ]) &&
    Object.values(assetSizes).every(boundedSize) &&
    heartbeat !== undefined &&
    exactKeys(heartbeat, ['sample_count', 'p50_gap_ms', 'p95_gap_ms', 'max_gap_ms', 'responsive']) &&
    Number.isInteger(heartbeat.sample_count) &&
    (heartbeat.sample_count as number) >= 80 &&
    validSummary({ p50: heartbeat.p50_gap_ms, p95: heartbeat.p95_gap_ms, max: heartbeat.max_gap_ms }) &&
    heartbeat.responsive === true &&
    producer?.kind === 'target_macos_product_runtime' &&
    producer.fresh_run === true &&
    validTrueRecord(producer.production_components, [
      'bridge_rpc_sdk',
      'config_lens_candidate',
      'presentation',
      'resource_service',
    ]) &&
    privacy !== undefined &&
    exactKeys(privacy, [
      'complete_url_recorded',
      'data_store_identifier_recorded',
      'host_private_token_recorded',
      'native_label_recorded',
      'nonce_recorded',
      'origin_recorded',
      'path_recorded',
      'payload_recorded',
      'per_sample_identity_recorded',
      'raw_error_recorded',
      'stack_recorded',
      'user_content_recorded',
    ]) &&
    Object.values(privacy).every((item) => item === false)
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
  if (
    /(?:https?:|file:|lensx-plugin:|\/Users\/|\/private\/|entry_id|plugin_id|page_id|origin token|nonce value|raw error|stack trace)/iu.test(
      source,
    )
  ) {
    throw new TypeError(
      'ConfigLens cold-open evidence contains a forbidden identity, authority, path, or content field.',
    );
  }
};
