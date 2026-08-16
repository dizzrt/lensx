export const CONFIG_LENS_STAGE_CATALOG = [
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
export type ConfigLensStage = (typeof CONFIG_LENS_STAGE_CATALOG)[number];
export type ConfigLensStageObserver = (stage: ConfigLensStage, durationMs: number) => void;

const pageStarted = performance.now();
let observer: ConfigLensStageObserver | undefined;

type EvidenceStageSink = (stage: ConfigLensStage, durationMs: number) => void;
const evidenceStageSink = (): EvidenceStageSink | undefined => {
  const candidate = (
    globalThis as typeof globalThis & {
      __LENSX_PLUGIN_EVIDENCE_STAGE__?: unknown;
    }
  ).__LENSX_PLUGIN_EVIDENCE_STAGE__;
  return typeof candidate === 'function' ? (candidate as EvidenceStageSink) : undefined;
};

export const attachConfigLensStageObserver = (next: ConfigLensStageObserver): (() => void) | undefined => {
  if (observer !== undefined) return undefined;
  observer = next;
  return () => {
    if (observer === next) observer = undefined;
  };
};
export const recordConfigLensStage = (stage: ConfigLensStage, durationMs: number): void => {
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 60_000) return;
  observer?.(stage, durationMs);
  evidenceStageSink()?.(stage, durationMs);
};
export const recordConfigLensStageFromPageStart = (stage: ConfigLensStage): void => {
  recordConfigLensStage(stage, performance.now() - pageStarted);
};
