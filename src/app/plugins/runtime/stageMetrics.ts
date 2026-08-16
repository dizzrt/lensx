export const PLUGIN_RUNTIME_STAGE_CATALOG = [
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

export type PluginRuntimeStage = (typeof PLUGIN_RUNTIME_STAGE_CATALOG)[number];
export interface PluginRuntimeStageObservation {
  readonly stage: PluginRuntimeStage;
  readonly durationMs: number;
}
export type PluginRuntimeStageObserver = (observation: PluginRuntimeStageObservation) => void;

let observer: PluginRuntimeStageObserver | undefined;

export const attachPluginRuntimeStageObserver = (next: PluginRuntimeStageObserver): (() => void) | undefined => {
  if (observer !== undefined) return undefined;
  observer = next;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (observer === next) observer = undefined;
  };
};

export const recordPluginRuntimeStage = (stage: PluginRuntimeStage, durationMs: number): void => {
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 60_000) return;
  observer?.(Object.freeze({ stage, durationMs }));
};
