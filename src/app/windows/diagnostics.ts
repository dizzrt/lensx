type HostWindowStage =
  | 'main_surface'
  | 'main_navigation'
  | 'activation'
  | 'state_read'
  | 'detach'
  | 'recover'
  | 'close'
  | 'quit'
  | 'shell_subscription'
  | 'shell_geometry';

const reported = new Set<string>();
const presentationOperations = new Set([
  'stale_surface_intent',
  'validate_source',
  'validate_binding',
  'coordinator_lock',
  'work_area',
  'current_size',
  'current_resizable',
  'set_resizable_guard',
  'set_wide_min_size',
  'set_wide_max_size',
  'set_size',
  'set_target_min_size',
  'set_target_max_size',
  'set_target_resizable',
  'ensure_rounded_corners',
  'rollback',
]);

/** Development diagnostics contain only known stages and operations, never raw native errors. */
export const reportHostWindowFailure = (stage: HostWindowStage, error?: unknown) => {
  if (!import.meta.env.DEV || reported.size >= 32) return;
  const operation = error && typeof error === 'object' && 'operation' in error ? error.operation : undefined;
  const detail = typeof operation === 'string' && presentationOperations.has(operation) ? operation : 'unavailable';
  const key = `${stage}/${detail}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.debug('[lensX/host-window]', key);
};
