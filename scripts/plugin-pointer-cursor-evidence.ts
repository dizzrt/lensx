export const POINTER_CURSOR_EVIDENCE_VERSION = '0.7.0' as const;
export const POINTER_CURSOR_ESTABLISHMENT_MAXIMUM_EVENTS = 12 as const;
export const POINTER_CURSOR_REQUIRED_CONSECUTIVE_IBEAM = 3 as const;
export const POINTER_CURSOR_SNAPSHOT_OFFSETS_MS = [5, 20, 35] as const;

export const POINTER_CURSOR_CASE_IDS = [
  'top-level-plain-text',
  'top-level-monaco',
  'generic-child-text',
  'production-config-lens',
] as const;
export const POINTER_CURSOR_HOST_CONTROL_CASE_ID = 'production-config-lens-host-isolated' as const;
export const POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID = 'production-config-lens-host-seeded' as const;

export type PointerCursorCaseId = (typeof POINTER_CURSOR_CASE_IDS)[number];
export type PointerCursorEvidenceCaseId =
  | PointerCursorCaseId
  | typeof POINTER_CURSOR_HOST_CONTROL_CASE_ID
  | typeof POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID;
export type PointerSemanticRegion =
  | 'editor_text'
  | 'gutter'
  | 'scrollbar'
  | 'footer_control'
  | 'link'
  | 'overlay'
  | 'native_resize_edge';
export type NativeCursorClassification =
  | 'ibeam'
  | 'arrow'
  | 'pointing_hand'
  | 'resize_horizontal'
  | 'resize_vertical'
  | 'unknown';

export interface PointerTrajectoryPoint {
  readonly sequence: number;
  readonly region: PointerSemanticRegion;
  readonly x: number;
  readonly y: number;
}

export interface PointerCursorEnvironment {
  readonly macos_version: string;
  readonly webkit_version: string;
  readonly tauri_version: string;
  readonly wry_version: string;
  readonly device_scale_factor: number;
  readonly viewport_width: number;
  readonly viewport_height: number;
}

export interface PointerCursorSample {
  readonly sequence: number;
  readonly semantic_region: PointerSemanticRegion;
  readonly computed_cursor: string;
  readonly event_delivered: boolean;
  readonly main_run_loop_heartbeat: boolean;
  readonly native_cursor_snapshots: readonly PointerNativeCursorSnapshot[];
  readonly document_identity: string;
  readonly editor_identity: string;
  readonly child_identity: string;
  readonly session_identity: string;
  readonly presentation_attempt: string;
  readonly bounds_revision: number;
  readonly elapsed_ms: number;
}

export interface PointerNativeCursorSnapshot {
  readonly offset_ms: (typeof POINTER_CURSOR_SNAPSHOT_OFFSETS_MS)[number];
  readonly native_cursor: NativeCursorClassification;
}

export interface PointerCursorEstablishmentSample {
  readonly sequence: number;
  readonly semantic_region: 'editor_text';
  readonly computed_cursor: 'text';
  readonly native_cursor: NativeCursorClassification;
  readonly event_delivered: boolean;
  readonly main_run_loop_heartbeat: boolean;
  readonly document_identity: string;
  readonly editor_identity: string;
  readonly child_identity: string;
  readonly session_identity: string;
  readonly presentation_attempt: string;
  readonly bounds_revision: number;
  readonly elapsed_ms: number;
}

export interface PointerCursorEstablishment {
  readonly maximum_event_count: typeof POINTER_CURSOR_ESTABLISHMENT_MAXIMUM_EVENTS;
  readonly required_consecutive_ibeam: typeof POINTER_CURSOR_REQUIRED_CONSECUTIVE_IBEAM;
  readonly established: boolean;
  readonly first_ibeam_elapsed_ms: number | null;
  readonly established_elapsed_ms: number | null;
  readonly samples: readonly PointerCursorEstablishmentSample[];
}

export interface PointerCursorCaseEvidence {
  readonly case_id: PointerCursorEvidenceCaseId;
  readonly repetition: number;
  readonly environment: PointerCursorEnvironment;
  readonly execution_mode: 'dedicated_session' | 'operator_approved_quiescent_desktop';
  readonly operator_approved: true;
  readonly public_core_graphics_event_source: true;
  readonly post_event_access: true;
  readonly local_event_monitor: true;
  readonly monitor_removed: true;
  readonly content_view_flipped: boolean;
  readonly container_kind: 'top_level_wkwebview' | 'pure_native_window_single_child' | 'production_host_child';
  readonly host_participation_mode: 'not_applicable' | 'normal' | 'isolated' | 'seeded';
  readonly host_isolation_mechanism: 'none' | 'public_webview_visibility';
  readonly host_move_delivery_count: number;
  readonly child_move_delivery_count: number;
  readonly host_establishment_move_delivery_count: number;
  readonly child_establishment_move_delivery_count: number;
  readonly host_steady_state_move_delivery_count: number;
  readonly child_steady_state_move_delivery_count: number;
  readonly host_restored: true;
  readonly host_restored_before_steady_state: boolean;
  readonly pre_steady_state_main_run_loop_heartbeat: boolean;
  readonly establishment: PointerCursorEstablishment;
  readonly temporary_profile: true;
  readonly graceful_shutdown: true;
  readonly pointer_restored: true;
  readonly samples: readonly PointerCursorSample[];
}

export interface PointerCursorCaseSummary {
  readonly case_id: PointerCursorEvidenceCaseId;
  readonly repetitions: number;
  readonly establishment_success_count: number;
  readonly heartbeat_failure_count: number;
  readonly text_event_count: number;
  readonly text_snapshot_count: number;
  readonly default_arrow_fallback_count: number;
  readonly native_classification_failure_count: number;
  readonly event_delivery_failure_count: number;
  readonly legal_transition_count: number;
  readonly host_move_delivery_count: number;
  readonly child_move_delivery_count: number;
  readonly stable: boolean;
}

export type PointerCursorAttribution =
  | 'shared_wkwebview_webkit'
  | 'monaco_specific_content'
  | 'generic_child_wkwebview_wry'
  | 'lensx_host_child_sibling'
  | 'blocked_oracle_invalid'
  | 'blocked_heartbeat_failed'
  | 'blocked_establishment_failed'
  | 'blocked_not_reproduced'
  | 'blocked_ambiguous';

export interface AppKitCursorOracleSample {
  readonly sequence: number;
  readonly semantic_region: 'text' | 'arrow' | 'link' | 'column_resize' | 'row_resize';
  readonly expected_cursor: Exclude<NativeCursorClassification, 'unknown'>;
  readonly native_cursor: NativeCursorClassification;
  readonly event_delivered: boolean;
  readonly elapsed_ms: number;
}

export interface AppKitCursorOracleEvidence {
  readonly case_id: 'appkit-oracle';
  readonly repetition: number;
  readonly macos_version: string;
  readonly execution_mode: 'dedicated_session' | 'operator_approved_quiescent_desktop';
  readonly operator_approved: true;
  readonly public_core_graphics_event_source: boolean;
  readonly post_event_access: boolean;
  readonly local_event_monitor: boolean;
  readonly temporary_profile: true;
  readonly graceful_shutdown: boolean;
  readonly pointer_restored: boolean;
  readonly monitor_removed: boolean;
  readonly cursor_rects_removed: boolean;
  readonly samples: readonly AppKitCursorOracleSample[];
}

export interface AppKitCursorOracleSummary {
  readonly repetitions: number;
  readonly event_delivery_failure_count: number;
  readonly cursor_mismatch_count: number;
  readonly cleanup_failure_count: number;
  readonly stable: boolean;
}

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join('\n') === [...keys].sort().join('\n');

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundedIdentity = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9_.:-]{0,63}$/u.test(value);

const boundedVersion = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[0-9A-Za-z.+_-]+$/u.test(value);

const finiteBetween = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;

const isSemanticRegion = (value: unknown): value is PointerSemanticRegion =>
  ['editor_text', 'gutter', 'scrollbar', 'footer_control', 'link', 'overlay', 'native_resize_edge'].includes(
    value as PointerSemanticRegion,
  );

const isNativeCursor = (value: unknown): value is NativeCursorClassification =>
  ['ibeam', 'arrow', 'pointing_hand', 'resize_horizontal', 'resize_vertical', 'unknown'].includes(
    value as NativeCursorClassification,
  );

const validateEnvironment = (value: unknown): value is PointerCursorEnvironment => {
  if (!record(value)) return false;
  if (
    !exactKeys(value, [
      'macos_version',
      'webkit_version',
      'tauri_version',
      'wry_version',
      'device_scale_factor',
      'viewport_width',
      'viewport_height',
    ])
  ) {
    return false;
  }
  return (
    boundedVersion(value.macos_version) &&
    boundedVersion(value.webkit_version) &&
    boundedVersion(value.tauri_version) &&
    boundedVersion(value.wry_version) &&
    finiteBetween(value.device_scale_factor, 1, 8) &&
    finiteBetween(value.viewport_width, 320, 4096) &&
    finiteBetween(value.viewport_height, 240, 2160)
  );
};

const validateSample = (value: unknown): value is PointerCursorSample => {
  if (!record(value)) return false;
  if (
    !exactKeys(value, [
      'sequence',
      'semantic_region',
      'computed_cursor',
      'event_delivered',
      'main_run_loop_heartbeat',
      'native_cursor_snapshots',
      'document_identity',
      'editor_identity',
      'child_identity',
      'session_identity',
      'presentation_attempt',
      'bounds_revision',
      'elapsed_ms',
    ])
  ) {
    return false;
  }
  return (
    Number.isSafeInteger(value.sequence) &&
    finiteBetween(value.sequence, 1, 256) &&
    isSemanticRegion(value.semantic_region) &&
    typeof value.computed_cursor === 'string' &&
    value.computed_cursor.length > 0 &&
    value.computed_cursor.length <= 32 &&
    /^[a-z-]+$/u.test(value.computed_cursor) &&
    typeof value.event_delivered === 'boolean' &&
    typeof value.main_run_loop_heartbeat === 'boolean' &&
    Array.isArray(value.native_cursor_snapshots) &&
    ((value.main_run_loop_heartbeat && value.native_cursor_snapshots.length === 3) ||
      (!value.main_run_loop_heartbeat && value.native_cursor_snapshots.length === 0)) &&
    value.native_cursor_snapshots.every(
      (snapshot, index) =>
        record(snapshot) &&
        exactKeys(snapshot, ['offset_ms', 'native_cursor']) &&
        snapshot.offset_ms === POINTER_CURSOR_SNAPSHOT_OFFSETS_MS[index] &&
        isNativeCursor(snapshot.native_cursor),
    ) &&
    boundedIdentity(value.document_identity) &&
    boundedIdentity(value.editor_identity) &&
    boundedIdentity(value.child_identity) &&
    boundedIdentity(value.session_identity) &&
    boundedIdentity(value.presentation_attempt) &&
    Number.isSafeInteger(value.bounds_revision) &&
    finiteBetween(value.bounds_revision, 1, Number.MAX_SAFE_INTEGER) &&
    finiteBetween(value.elapsed_ms, 0, 60_000)
  );
};

const validateEstablishmentSample = (value: unknown): value is PointerCursorEstablishmentSample => {
  if (!record(value)) return false;
  return (
    exactKeys(value, [
      'sequence',
      'semantic_region',
      'computed_cursor',
      'native_cursor',
      'event_delivered',
      'main_run_loop_heartbeat',
      'document_identity',
      'editor_identity',
      'child_identity',
      'session_identity',
      'presentation_attempt',
      'bounds_revision',
      'elapsed_ms',
    ]) &&
    Number.isSafeInteger(value.sequence) &&
    finiteBetween(value.sequence, 1, POINTER_CURSOR_ESTABLISHMENT_MAXIMUM_EVENTS) &&
    value.semantic_region === 'editor_text' &&
    value.computed_cursor === 'text' &&
    isNativeCursor(value.native_cursor) &&
    typeof value.event_delivered === 'boolean' &&
    typeof value.main_run_loop_heartbeat === 'boolean' &&
    boundedIdentity(value.document_identity) &&
    boundedIdentity(value.editor_identity) &&
    boundedIdentity(value.child_identity) &&
    boundedIdentity(value.session_identity) &&
    boundedIdentity(value.presentation_attempt) &&
    Number.isSafeInteger(value.bounds_revision) &&
    finiteBetween(value.bounds_revision, 1, Number.MAX_SAFE_INTEGER) &&
    finiteBetween(value.elapsed_ms, 0, 60_000)
  );
};

const validateEstablishment = (value: unknown): value is PointerCursorEstablishment => {
  if (
    !record(value) ||
    !exactKeys(value, [
      'maximum_event_count',
      'required_consecutive_ibeam',
      'established',
      'first_ibeam_elapsed_ms',
      'established_elapsed_ms',
      'samples',
    ]) ||
    value.maximum_event_count !== POINTER_CURSOR_ESTABLISHMENT_MAXIMUM_EVENTS ||
    value.required_consecutive_ibeam !== POINTER_CURSOR_REQUIRED_CONSECUTIVE_IBEAM ||
    typeof value.established !== 'boolean' ||
    (value.first_ibeam_elapsed_ms !== null && !finiteBetween(value.first_ibeam_elapsed_ms, 0, 60_000)) ||
    (value.established_elapsed_ms !== null && !finiteBetween(value.established_elapsed_ms, 0, 60_000)) ||
    !Array.isArray(value.samples) ||
    value.samples.length < 1 ||
    value.samples.length > POINTER_CURSOR_ESTABLISHMENT_MAXIMUM_EVENTS ||
    !value.samples.every(validateEstablishmentSample)
  ) {
    return false;
  }
  const samples = value.samples as readonly PointerCursorEstablishmentSample[];
  if (samples.some((sample, index) => sample.sequence !== index + 1)) return false;
  let consecutiveIbeam = 0;
  let firstIbeamElapsed: number | null = null;
  let establishedElapsed: number | null = null;
  for (const sample of samples) {
    const validIbeam = sample.event_delivered && sample.main_run_loop_heartbeat && sample.native_cursor === 'ibeam';
    if (validIbeam) {
      firstIbeamElapsed ??= sample.elapsed_ms;
      consecutiveIbeam += 1;
      if (consecutiveIbeam === POINTER_CURSOR_REQUIRED_CONSECUTIVE_IBEAM) {
        establishedElapsed = sample.elapsed_ms;
        break;
      }
    } else {
      consecutiveIbeam = 0;
    }
  }
  return (
    value.established === (establishedElapsed !== null) &&
    value.first_ibeam_elapsed_ms === firstIbeamElapsed &&
    value.established_elapsed_ms === establishedElapsed &&
    (!value.established || samples.at(-1)?.elapsed_ms === establishedElapsed) &&
    (value.established || samples.length === POINTER_CURSOR_ESTABLISHMENT_MAXIMUM_EVENTS)
  );
};

export const validatePointerCursorCaseEvidence = (value: unknown): value is PointerCursorCaseEvidence => {
  if (!record(value)) return false;
  const seededEstablished = record(value.establishment) && value.establishment.established === true;
  if (
    !exactKeys(value, [
      'case_id',
      'repetition',
      'environment',
      'execution_mode',
      'operator_approved',
      'public_core_graphics_event_source',
      'post_event_access',
      'local_event_monitor',
      'monitor_removed',
      'content_view_flipped',
      'container_kind',
      'host_participation_mode',
      'host_isolation_mechanism',
      'host_move_delivery_count',
      'child_move_delivery_count',
      'host_establishment_move_delivery_count',
      'child_establishment_move_delivery_count',
      'host_steady_state_move_delivery_count',
      'child_steady_state_move_delivery_count',
      'host_restored',
      'host_restored_before_steady_state',
      'pre_steady_state_main_run_loop_heartbeat',
      'establishment',
      'temporary_profile',
      'graceful_shutdown',
      'pointer_restored',
      'samples',
    ]) ||
    ![
      ...POINTER_CURSOR_CASE_IDS,
      POINTER_CURSOR_HOST_CONTROL_CASE_ID,
      POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID,
    ].includes(value.case_id as PointerCursorEvidenceCaseId) ||
    !Number.isSafeInteger(value.repetition) ||
    !finiteBetween(value.repetition, 1, 10) ||
    !validateEnvironment(value.environment) ||
    !['dedicated_session', 'operator_approved_quiescent_desktop'].includes(value.execution_mode as string) ||
    value.operator_approved !== true ||
    value.public_core_graphics_event_source !== true ||
    value.post_event_access !== true ||
    value.local_event_monitor !== true ||
    value.monitor_removed !== true ||
    typeof value.content_view_flipped !== 'boolean' ||
    !['top_level_wkwebview', 'pure_native_window_single_child', 'production_host_child'].includes(
      value.container_kind as string,
    ) ||
    !['not_applicable', 'normal', 'isolated', 'seeded'].includes(value.host_participation_mode as string) ||
    !['none', 'public_webview_visibility'].includes(value.host_isolation_mechanism as string) ||
    !Number.isSafeInteger(value.host_move_delivery_count) ||
    !finiteBetween(value.host_move_delivery_count, 0, 256) ||
    !Number.isSafeInteger(value.child_move_delivery_count) ||
    !finiteBetween(value.child_move_delivery_count, 0, 256) ||
    !Number.isSafeInteger(value.host_establishment_move_delivery_count) ||
    !finiteBetween(value.host_establishment_move_delivery_count, 0, 256) ||
    !Number.isSafeInteger(value.child_establishment_move_delivery_count) ||
    !finiteBetween(value.child_establishment_move_delivery_count, 0, 256) ||
    !Number.isSafeInteger(value.host_steady_state_move_delivery_count) ||
    !finiteBetween(value.host_steady_state_move_delivery_count, 0, 256) ||
    !Number.isSafeInteger(value.child_steady_state_move_delivery_count) ||
    !finiteBetween(value.child_steady_state_move_delivery_count, 0, 256) ||
    value.host_move_delivery_count !==
      value.host_establishment_move_delivery_count + value.host_steady_state_move_delivery_count ||
    value.child_move_delivery_count !==
      value.child_establishment_move_delivery_count + value.child_steady_state_move_delivery_count ||
    value.host_restored !== true ||
    typeof value.host_restored_before_steady_state !== 'boolean' ||
    typeof value.pre_steady_state_main_run_loop_heartbeat !== 'boolean' ||
    !validateEstablishment(value.establishment) ||
    value.temporary_profile !== true ||
    value.graceful_shutdown !== true ||
    value.pointer_restored !== true ||
    !Array.isArray(value.samples) ||
    ((value.establishment as PointerCursorEstablishment).established
      ? value.samples.length !== 18
      : value.samples.length !== 0) ||
    value.samples.length > 256 ||
    !value.samples.every(validateSample)
  ) {
    return false;
  }
  if (
    (value.case_id === POINTER_CURSOR_HOST_CONTROL_CASE_ID &&
      (value.host_participation_mode !== 'isolated' ||
        value.host_isolation_mechanism !== 'public_webview_visibility' ||
        value.container_kind !== 'production_host_child')) ||
    (value.case_id === POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID &&
      (value.host_participation_mode !== 'seeded' ||
        value.host_isolation_mechanism !== 'public_webview_visibility' ||
        value.container_kind !== 'production_host_child' ||
        (seededEstablished &&
          (value.host_restored_before_steady_state !== true ||
            value.pre_steady_state_main_run_loop_heartbeat !== true ||
            value.host_steady_state_move_delivery_count < 1)) ||
        (!seededEstablished &&
          (value.host_restored_before_steady_state !== false ||
            value.pre_steady_state_main_run_loop_heartbeat !== false ||
            value.host_steady_state_move_delivery_count !== 0 ||
            value.child_steady_state_move_delivery_count !== 0)))) ||
    (value.case_id === 'production-config-lens' &&
      (value.host_participation_mode !== 'normal' ||
        value.host_isolation_mechanism !== 'none' ||
        value.container_kind !== 'production_host_child')) ||
    (['top-level-plain-text', 'top-level-monaco'].includes(value.case_id as string) &&
      value.container_kind !== 'top_level_wkwebview') ||
    (value.case_id === 'generic-child-text' && value.container_kind !== 'pure_native_window_single_child') ||
    (![
      'production-config-lens',
      POINTER_CURSOR_HOST_CONTROL_CASE_ID,
      POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID,
    ].includes(value.case_id as string) &&
      (value.host_participation_mode !== 'not_applicable' ||
        value.host_isolation_mechanism !== 'none' ||
        value.host_move_delivery_count !== 0 ||
        value.child_move_delivery_count !== 0 ||
        value.host_establishment_move_delivery_count !== 0 ||
        value.child_establishment_move_delivery_count !== 0 ||
        value.host_steady_state_move_delivery_count !== 0 ||
        value.child_steady_state_move_delivery_count !== 0))
  ) {
    return false;
  }
  const samples = value.samples as readonly PointerCursorSample[];
  if (samples.some((sample, index) => sample.sequence !== index + 1)) return false;
  const establishment = value.establishment as PointerCursorEstablishment;
  const first = establishment.samples[0];
  if (first === undefined) return false;
  return [...establishment.samples, ...samples].every(
    (sample) =>
      sample.document_identity === first.document_identity &&
      sample.editor_identity === first.editor_identity &&
      sample.child_identity === first.child_identity &&
      sample.session_identity === first.session_identity &&
      sample.presentation_attempt === first.presentation_attempt &&
      sample.bounds_revision === first.bounds_revision,
  );
};

const ORACLE_EXPECTATIONS = [
  ['text', 'ibeam'],
  ['arrow', 'arrow'],
  ['link', 'pointing_hand'],
  ['column_resize', 'resize_horizontal'],
  ['row_resize', 'resize_vertical'],
] as const;

export const validateAppKitCursorOracleEvidence = (value: unknown): value is AppKitCursorOracleEvidence => {
  if (!record(value)) return false;
  if (
    !exactKeys(value, [
      'case_id',
      'repetition',
      'macos_version',
      'execution_mode',
      'operator_approved',
      'public_core_graphics_event_source',
      'post_event_access',
      'local_event_monitor',
      'temporary_profile',
      'graceful_shutdown',
      'pointer_restored',
      'monitor_removed',
      'cursor_rects_removed',
      'samples',
    ]) ||
    value.case_id !== 'appkit-oracle' ||
    !Number.isSafeInteger(value.repetition) ||
    !finiteBetween(value.repetition, 1, 10) ||
    !boundedVersion(value.macos_version) ||
    !['dedicated_session', 'operator_approved_quiescent_desktop'].includes(value.execution_mode as string) ||
    value.operator_approved !== true ||
    typeof value.public_core_graphics_event_source !== 'boolean' ||
    typeof value.post_event_access !== 'boolean' ||
    typeof value.local_event_monitor !== 'boolean' ||
    value.temporary_profile !== true ||
    typeof value.graceful_shutdown !== 'boolean' ||
    typeof value.pointer_restored !== 'boolean' ||
    typeof value.monitor_removed !== 'boolean' ||
    typeof value.cursor_rects_removed !== 'boolean' ||
    !Array.isArray(value.samples) ||
    value.samples.length !== ORACLE_EXPECTATIONS.length
  ) {
    return false;
  }
  return value.samples.every((sample, index) => {
    if (!record(sample)) return false;
    const expected = ORACLE_EXPECTATIONS[index];
    return (
      expected !== undefined &&
      exactKeys(sample, [
        'sequence',
        'semantic_region',
        'expected_cursor',
        'native_cursor',
        'event_delivered',
        'elapsed_ms',
      ]) &&
      sample.sequence === index + 1 &&
      sample.semantic_region === expected[0] &&
      sample.expected_cursor === expected[1] &&
      isNativeCursor(sample.native_cursor) &&
      typeof sample.event_delivered === 'boolean' &&
      finiteBetween(sample.elapsed_ms, 0, 60_000)
    );
  });
};

export const summarizeAppKitCursorOracle = (runs: readonly AppKitCursorOracleEvidence[]): AppKitCursorOracleSummary => {
  if (runs.length < 2 || runs.length > 10 || runs.some((run) => !validateAppKitCursorOracleEvidence(run))) {
    throw new Error('AppKit cursor oracle evidence is missing, malformed, or not repeated.');
  }
  if (runs.some((run, index) => run.repetition !== index + 1)) {
    throw new Error('AppKit cursor oracle repetition order drifted.');
  }
  const environment = `${runs[0]?.macos_version}:${runs[0]?.execution_mode}`;
  if (runs.some((run) => `${run.macos_version}:${run.execution_mode}` !== environment)) {
    throw new Error('AppKit cursor oracle environment drifted between repetitions.');
  }
  const samples = runs.flatMap((run) => run.samples);
  const eventDeliveryFailures = samples.filter((sample) => !sample.event_delivered).length;
  const cursorMismatches = samples.filter((sample) => sample.native_cursor !== sample.expected_cursor).length;
  const cleanupFailures = runs.filter(
    (run) =>
      !run.public_core_graphics_event_source ||
      !run.post_event_access ||
      !run.local_event_monitor ||
      !run.graceful_shutdown ||
      !run.pointer_restored ||
      !run.monitor_removed ||
      !run.cursor_rects_removed,
  ).length;
  return {
    repetitions: runs.length,
    event_delivery_failure_count: eventDeliveryFailures,
    cursor_mismatch_count: cursorMismatches,
    cleanup_failure_count: cleanupFailures,
    stable: eventDeliveryFailures === 0 && cursorMismatches === 0 && cleanupFailures === 0,
  };
};

export const summarizePointerCursorCase = (
  caseId: PointerCursorEvidenceCaseId,
  runs: readonly PointerCursorCaseEvidence[],
): PointerCursorCaseSummary => {
  if (runs.length < 2 || runs.length > 10 || runs.some((run) => !validatePointerCursorCaseEvidence(run))) {
    throw new Error(`${caseId}: cursor evidence is missing, malformed, or not repeated.`);
  }
  if (runs.some((run, index) => run.case_id !== caseId || run.repetition !== index + 1)) {
    throw new Error(`${caseId}: cursor evidence case or repetition order drifted.`);
  }
  const environment = JSON.stringify(runs[0]?.environment);
  if (runs.some((run) => JSON.stringify(run.environment) !== environment)) {
    throw new Error(
      `${caseId}: cursor evidence environment drifted between repetitions: ${JSON.stringify(
        runs.map((run) => run.environment),
      )}`,
    );
  }
  const establishmentSamples = runs.flatMap((run) => run.establishment.samples);
  const samples = runs.flatMap((run) => run.samples);
  const textSamples = samples.filter(({ semantic_region, computed_cursor }) => {
    if (semantic_region !== 'editor_text') return false;
    if (computed_cursor !== 'text') throw new Error(`${caseId}: editor text semantic cursor drifted.`);
    return true;
  });
  const textSnapshots = textSamples.flatMap(({ native_cursor_snapshots }) => native_cursor_snapshots);
  const allSnapshots = samples.flatMap(({ native_cursor_snapshots }) => native_cursor_snapshots);
  const fallbackCount = textSnapshots.filter(({ native_cursor }) => native_cursor === 'arrow').length;
  const classificationFailures = [
    ...establishmentSamples.map(({ native_cursor }) => native_cursor),
    ...allSnapshots.map(({ native_cursor }) => native_cursor),
  ].filter((nativeCursor) => nativeCursor === 'unknown').length;
  const eventDeliveryFailures = [...establishmentSamples, ...samples].filter(
    ({ event_delivered }) => !event_delivered,
  ).length;
  const heartbeatFailures = [...establishmentSamples, ...samples].filter(
    ({ main_run_loop_heartbeat }) => !main_run_loop_heartbeat,
  ).length;
  const legalTransitions = samples.filter(
    ({ native_cursor_snapshots, semantic_region }) =>
      semantic_region !== 'editor_text' && native_cursor_snapshots.at(-1)?.native_cursor !== 'ibeam',
  ).length;
  return {
    case_id: caseId,
    repetitions: runs.length,
    establishment_success_count: runs.filter(({ establishment }) => establishment.established).length,
    heartbeat_failure_count: heartbeatFailures,
    text_event_count: textSamples.length,
    text_snapshot_count: textSnapshots.length,
    default_arrow_fallback_count: fallbackCount,
    native_classification_failure_count: classificationFailures,
    event_delivery_failure_count: eventDeliveryFailures,
    legal_transition_count: legalTransitions,
    host_move_delivery_count: runs.reduce((total, run) => total + run.host_move_delivery_count, 0),
    child_move_delivery_count: runs.reduce((total, run) => total + run.child_move_delivery_count, 0),
    stable:
      runs.every(({ establishment }) => establishment.established) &&
      heartbeatFailures === 0 &&
      textSamples.length >= 24 &&
      textSnapshots.length === textSamples.length * POINTER_CURSOR_SNAPSHOT_OFFSETS_MS.length &&
      fallbackCount === 0 &&
      classificationFailures === 0 &&
      eventDeliveryFailures === 0 &&
      legalTransitions >= 6,
  };
};

export const validateHostParticipationControlPair = (
  normal: PointerCursorCaseEvidence,
  isolated: PointerCursorCaseEvidence,
): boolean => {
  if (
    !validatePointerCursorCaseEvidence(normal) ||
    !validatePointerCursorCaseEvidence(isolated) ||
    normal.case_id !== 'production-config-lens' ||
    isolated.case_id !== POINTER_CURSOR_HOST_CONTROL_CASE_ID ||
    normal.repetition !== isolated.repetition ||
    JSON.stringify(normal.environment) !== JSON.stringify(isolated.environment)
  ) {
    return false;
  }
  const normalIdentity = normal.establishment.samples[0];
  const isolatedIdentity = isolated.establishment.samples[0];
  return (
    normalIdentity !== undefined &&
    isolatedIdentity !== undefined &&
    normalIdentity.document_identity === isolatedIdentity.document_identity &&
    normalIdentity.editor_identity === isolatedIdentity.editor_identity &&
    normalIdentity.child_identity === isolatedIdentity.child_identity &&
    normalIdentity.session_identity === isolatedIdentity.session_identity &&
    normalIdentity.presentation_attempt === isolatedIdentity.presentation_attempt &&
    normalIdentity.bounds_revision === isolatedIdentity.bounds_revision
  );
};

export const validateHostParticipationControlSet = (
  normal: PointerCursorCaseEvidence,
  isolated: PointerCursorCaseEvidence,
  seeded: PointerCursorCaseEvidence,
): boolean => {
  if (
    !validateHostParticipationControlPair(normal, isolated) ||
    !validatePointerCursorCaseEvidence(seeded) ||
    seeded.case_id !== POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID ||
    normal.repetition !== seeded.repetition ||
    JSON.stringify(normal.environment) !== JSON.stringify(seeded.environment)
  ) {
    return false;
  }
  const normalIdentity = normal.establishment.samples[0];
  const seededIdentity = seeded.establishment.samples[0];
  return (
    normalIdentity !== undefined &&
    seededIdentity !== undefined &&
    normalIdentity.document_identity === seededIdentity.document_identity &&
    normalIdentity.editor_identity === seededIdentity.editor_identity &&
    normalIdentity.child_identity === seededIdentity.child_identity &&
    normalIdentity.session_identity === seededIdentity.session_identity &&
    normalIdentity.presentation_attempt === seededIdentity.presentation_attempt &&
    normalIdentity.bounds_revision === seededIdentity.bounds_revision
  );
};

export const decidePointerCursorAttribution = (
  oracle: AppKitCursorOracleSummary,
  summaries: Readonly<Record<PointerCursorCaseId, PointerCursorCaseSummary>>,
  hostControl: PointerCursorCaseSummary,
  hostSeededControl: PointerCursorCaseSummary,
): PointerCursorAttribution => {
  if (!oracle.stable) return 'blocked_oracle_invalid';
  const requiredSummaries = [...Object.values(summaries), hostControl, hostSeededControl];
  if (requiredSummaries.some(({ heartbeat_failure_count }) => heartbeat_failure_count > 0)) {
    return 'blocked_heartbeat_failed';
  }
  const establishmentRequired = [
    summaries['top-level-plain-text'],
    summaries['top-level-monaco'],
    summaries['generic-child-text'],
    hostControl,
    hostSeededControl,
  ];
  if (
    establishmentRequired.some(
      ({ establishment_success_count, repetitions }) => establishment_success_count !== repetitions,
    )
  ) {
    return 'blocked_establishment_failed';
  }
  const caseD1Stable = summaries['top-level-plain-text'].stable;
  const caseAStable = summaries['top-level-monaco'].stable;
  const caseBStable = summaries['generic-child-text'].stable;
  const caseCStable = hostSeededControl.stable;
  if (!caseD1Stable && !caseAStable && !caseBStable && !caseCStable) return 'shared_wkwebview_webkit';
  if (caseD1Stable && !caseAStable && caseBStable && !caseCStable) return 'monaco_specific_content';
  if (caseD1Stable && caseAStable && !caseBStable && !caseCStable) return 'generic_child_wkwebview_wry';
  if (caseD1Stable && caseAStable && caseBStable && !caseCStable && hostControl.stable) {
    return 'lensx_host_child_sibling';
  }
  if (caseCStable) return 'blocked_not_reproduced';
  return 'blocked_ambiguous';
};

export const assertPointerCursorEvidencePrivacy = (source: string): void => {
  if (source.length > 512 * 1024) throw new Error('cursor evidence exceeds its bounded size.');
  if (
    /(?:https?:|file:|\/Users\/|raw_(?:dom|frame|payload)|desktop_frame|plugin_input|user_content|nonce|freshness)/iu.test(
      source,
    )
  ) {
    throw new Error('cursor evidence contains forbidden user, desktop, origin, or authority content.');
  }
};
