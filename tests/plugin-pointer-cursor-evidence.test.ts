import { describe, expect, test } from '@rstest/core';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  type AppKitCursorOracleEvidence,
  assertPointerCursorEvidencePrivacy,
  decidePointerCursorAttribution,
  type NativeCursorClassification,
  POINTER_CURSOR_HOST_CONTROL_CASE_ID,
  POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID,
  POINTER_CURSOR_SNAPSHOT_OFFSETS_MS,
  type PointerCursorCaseEvidence,
  type PointerCursorEvidenceCaseId,
  summarizeAppKitCursorOracle,
  summarizePointerCursorCase,
  validateAppKitCursorOracleEvidence,
  validateHostParticipationControlPair,
  validateHostParticipationControlSet,
  validatePointerCursorCaseEvidence,
} from '../scripts/plugin-pointer-cursor-evidence.ts';
import pointerSchema from '../tools/plugin-pointer-cursor-harness/evidence.schema.json' with { type: 'json' };

const caseEvidence = (
  caseId: PointerCursorEvidenceCaseId,
  repetition: number,
  textCursor: NativeCursorClassification = 'ibeam',
): PointerCursorCaseEvidence => {
  const production = [
    'production-config-lens',
    POINTER_CURSOR_HOST_CONTROL_CASE_ID,
    POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID,
  ].includes(caseId);
  const seeded = caseId === POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID;
  const isolated = caseId === POINTER_CURSOR_HOST_CONTROL_CASE_ID;
  const hostEstablishmentMoves = caseId === 'production-config-lens' ? 1 : 0;
  const hostSteadyMoves = caseId === 'production-config-lens' ? 1 : seeded ? 2 : 0;
  const childEstablishmentMoves = production ? 3 : 0;
  const childSteadyMoves = production ? 18 : 0;
  return {
    case_id: caseId,
    repetition,
    environment: {
      macos_version: '15.6',
      webkit_version: '620.3.7',
      tauri_version: '2.11.5',
      wry_version: '0.55.1',
      device_scale_factor: 2,
      viewport_width: 800,
      viewport_height: 600,
    },
    execution_mode: 'operator_approved_quiescent_desktop',
    operator_approved: true,
    public_core_graphics_event_source: true,
    post_event_access: true,
    local_event_monitor: true,
    monitor_removed: true,
    content_view_flipped: true,
    container_kind: ['top-level-monaco', 'top-level-plain-text'].includes(caseId)
      ? 'top_level_wkwebview'
      : caseId === 'generic-child-text'
        ? 'pure_native_window_single_child'
        : 'production_host_child',
    host_participation_mode: seeded
      ? 'seeded'
      : isolated
        ? 'isolated'
        : caseId === 'production-config-lens'
          ? 'normal'
          : 'not_applicable',
    host_isolation_mechanism: isolated || seeded ? 'public_webview_visibility' : 'none',
    host_move_delivery_count: hostEstablishmentMoves + hostSteadyMoves,
    child_move_delivery_count: childEstablishmentMoves + childSteadyMoves,
    host_establishment_move_delivery_count: hostEstablishmentMoves,
    child_establishment_move_delivery_count: childEstablishmentMoves,
    host_steady_state_move_delivery_count: hostSteadyMoves,
    child_steady_state_move_delivery_count: childSteadyMoves,
    host_restored: true,
    host_restored_before_steady_state: seeded,
    pre_steady_state_main_run_loop_heartbeat: seeded,
    establishment: {
      maximum_event_count: 12,
      required_consecutive_ibeam: 3,
      established: true,
      first_ibeam_elapsed_ms: 35,
      established_elapsed_ms: 105,
      samples: Array.from({ length: 3 }, (_, index) => ({
        sequence: index + 1,
        semantic_region: 'editor_text' as const,
        computed_cursor: 'text' as const,
        native_cursor: 'ibeam' as const,
        event_delivered: true,
        main_run_loop_heartbeat: true,
        document_identity: 'document_current',
        editor_identity: ['generic-child-text', 'top-level-plain-text'].includes(caseId)
          ? 'not_applicable'
          : 'editor_current',
        child_identity: ['top-level-monaco', 'top-level-plain-text'].includes(caseId)
          ? 'not_applicable'
          : 'child_current',
        session_identity: production ? 'session_current' : 'not_applicable',
        presentation_attempt: production ? 'attempt_current' : 'harness_current',
        bounds_revision: 1,
        elapsed_ms: (index + 1) * 35,
      })),
    },
    temporary_profile: true,
    graceful_shutdown: true,
    pointer_restored: true,
    samples: Array.from({ length: 18 }, (_, index) => {
      const boundary = index >= 12;
      return {
        sequence: index + 1,
        semantic_region: boundary ? ('gutter' as const) : ('editor_text' as const),
        computed_cursor: boundary ? 'default' : 'text',
        event_delivered: true,
        main_run_loop_heartbeat: true,
        native_cursor_snapshots: POINTER_CURSOR_SNAPSHOT_OFFSETS_MS.map((offset_ms) => ({
          offset_ms,
          native_cursor: boundary ? ('arrow' as const) : textCursor,
        })),
        document_identity: 'document_current',
        editor_identity: ['generic-child-text', 'top-level-plain-text'].includes(caseId)
          ? 'not_applicable'
          : 'editor_current',
        child_identity: ['top-level-monaco', 'top-level-plain-text'].includes(caseId)
          ? 'not_applicable'
          : 'child_current',
        session_identity: production ? 'session_current' : 'not_applicable',
        presentation_attempt: production ? 'attempt_current' : 'harness_current',
        bounds_revision: 1,
        elapsed_ms: index * 20,
      };
    }),
  };
};

const summary = (caseId: PointerCursorEvidenceCaseId, cursor: NativeCursorClassification = 'ibeam') =>
  summarizePointerCursorCase(caseId, [caseEvidence(caseId, 1, cursor), caseEvidence(caseId, 2, cursor)]);

const oracleEvidence = (repetition: number): AppKitCursorOracleEvidence => ({
  case_id: 'appkit-oracle',
  repetition,
  macos_version: '15.6',
  execution_mode: 'operator_approved_quiescent_desktop',
  operator_approved: true,
  public_core_graphics_event_source: true,
  post_event_access: true,
  local_event_monitor: true,
  temporary_profile: true,
  graceful_shutdown: true,
  pointer_restored: true,
  monitor_removed: true,
  cursor_rects_removed: true,
  samples: [
    ['text', 'ibeam'],
    ['arrow', 'arrow'],
    ['link', 'pointing_hand'],
    ['column_resize', 'resize_horizontal'],
    ['row_resize', 'resize_vertical'],
  ].map(([semantic_region, expected_cursor], index) => ({
    sequence: index + 1,
    semantic_region: semantic_region as AppKitCursorOracleEvidence['samples'][number]['semantic_region'],
    expected_cursor: expected_cursor as AppKitCursorOracleEvidence['samples'][number]['expected_cursor'],
    native_cursor: expected_cursor as NativeCursorClassification,
    event_delivered: true,
    elapsed_ms: index * 20,
  })),
});

const stableOracle = summarizeAppKitCursorOracle([oracleEvidence(1), oracleEvidence(2)]);
const stableHostControl = summary(POINTER_CURSOR_HOST_CONTROL_CASE_ID);
const stableHostSeededControl = summary(POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID);
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(pointerSchema);

describe('plugin pointer cursor evidence', () => {
  test('keeps the JSON schema aligned with the 0.7.0 bounded evidence contract', () => {
    const cases = (
      ['top-level-plain-text', 'top-level-monaco', 'generic-child-text', 'production-config-lens'] as const
    ).flatMap((caseId) => [caseEvidence(caseId, 1), caseEvidence(caseId, 2)]);
    expect(
      validateSchema({
        evidence_version: '0.7.0',
        attribution: 'blocked_not_reproduced',
        oracle: [oracleEvidence(1), oracleEvidence(2)],
        cases,
        host_participation_controls: [
          caseEvidence(POINTER_CURSOR_HOST_CONTROL_CASE_ID, 1),
          caseEvidence(POINTER_CURSOR_HOST_CONTROL_CASE_ID, 2),
        ],
        host_seeded_controls: [
          caseEvidence(POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID, 1),
          caseEvidence(POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID, 2),
        ],
      }),
    ).toBe(true);
  });

  test('fails closed when the D0 AppKit oracle misses delivery, cursor identity, or cleanup', () => {
    const valid = oracleEvidence(1);
    expect(validateAppKitCursorOracleEvidence(valid)).toBe(true);
    expect(stableOracle).toMatchObject({ stable: true, event_delivery_failure_count: 0, cursor_mismatch_count: 0 });
    expect(
      summarizeAppKitCursorOracle([
        valid,
        {
          ...oracleEvidence(2),
          samples: oracleEvidence(2).samples.map((sample, index) =>
            index === 0 ? { ...sample, event_delivered: false } : sample,
          ),
        },
      ]),
    ).toMatchObject({ stable: false, event_delivery_failure_count: 1 });
    expect(
      summarizeAppKitCursorOracle([
        valid,
        {
          ...oracleEvidence(2),
          samples: oracleEvidence(2).samples.map((sample) => ({ ...sample, native_cursor: 'arrow' })),
        },
      ]),
    ).toMatchObject({ stable: false, cursor_mismatch_count: 4 });
    expect(summarizeAppKitCursorOracle([valid, { ...oracleEvidence(2), monitor_removed: false }])).toMatchObject({
      stable: false,
      cleanup_failure_count: 1,
    });
  });

  test('accepts repeated bounded sequences and rejects identity or native-classification drift', () => {
    const valid = caseEvidence('production-config-lens', 1);
    expect(validatePointerCursorCaseEvidence(valid)).toBe(true);
    expect(
      summarizePointerCursorCase('production-config-lens', [valid, caseEvidence('production-config-lens', 2)]),
    ).toMatchObject({ stable: true, default_arrow_fallback_count: 0, legal_transition_count: 12 });

    const samples = [...valid.samples];
    const current = samples[4];
    if (current === undefined) throw new Error('bounded fixture sample missing');
    samples[4] = { ...current, editor_identity: 'editor_recreated' };
    expect(validatePointerCursorCaseEvidence({ ...valid, samples })).toBe(false);
    const unknown = caseEvidence('production-config-lens', 2);
    expect(
      summarizePointerCursorCase('production-config-lens', [
        valid,
        {
          ...unknown,
          samples: unknown.samples.map((item) => ({
            ...item,
            native_cursor_snapshots: item.native_cursor_snapshots.map((snapshot) => ({
              ...snapshot,
              native_cursor: 'unknown' as const,
            })),
          })),
        },
      ]),
    ).toMatchObject({ stable: false, native_classification_failure_count: 54 });
    expect(() => summarizePointerCursorCase('production-config-lens', [valid])).toThrow(/repeated/u);
    expect(() =>
      summarizePointerCursorCase('production-config-lens', [
        valid,
        {
          ...caseEvidence('production-config-lens', 2),
          environment: { ...valid.environment, macos_version: '16.0' },
        },
      ]),
    ).toThrow(/environment/u);
    expect(
      summarizePointerCursorCase('production-config-lens', [
        valid,
        {
          ...caseEvidence('production-config-lens', 2),
          samples: caseEvidence('production-config-lens', 2).samples.map((item) =>
            item.semantic_region === 'editor_text'
              ? {
                  ...item,
                  native_cursor_snapshots: item.native_cursor_snapshots.map((snapshot) => ({
                    ...snapshot,
                    native_cursor: 'arrow' as const,
                  })),
                }
              : item,
          ),
        },
      ]),
    ).toMatchObject({ stable: false, default_arrow_fallback_count: 36 });
    expect(
      summarizePointerCursorCase('production-config-lens', [
        {
          ...valid,
          samples: valid.samples.map((item) =>
            item.semantic_region === 'editor_text'
              ? item
              : {
                  ...item,
                  native_cursor_snapshots: item.native_cursor_snapshots.map((snapshot) => ({
                    ...snapshot,
                    native_cursor: 'ibeam' as const,
                  })),
                },
          ),
        },
        {
          ...caseEvidence('production-config-lens', 2),
          samples: caseEvidence('production-config-lens', 2).samples.map((item) =>
            item.semantic_region === 'editor_text'
              ? item
              : {
                  ...item,
                  native_cursor_snapshots: item.native_cursor_snapshots.map((snapshot) => ({
                    ...snapshot,
                    native_cursor: 'ibeam' as const,
                  })),
                },
          ),
        },
      ]),
    ).toMatchObject({ stable: false, legal_transition_count: 0 });
  });

  test('separates establishment from steady-state and fails closed on heartbeat or snapshot drift', () => {
    const valid = caseEvidence('production-config-lens', 1);
    const missedHeartbeatSample = valid.samples[4];
    if (missedHeartbeatSample === undefined) throw new Error('bounded steady-state sample missing');
    const heartbeatSamples = [...valid.samples];
    heartbeatSamples[4] = {
      ...missedHeartbeatSample,
      main_run_loop_heartbeat: false,
      native_cursor_snapshots: [],
    };
    const missedHeartbeat = { ...valid, samples: heartbeatSamples };
    expect(validatePointerCursorCaseEvidence(missedHeartbeat)).toBe(true);
    const heartbeatSummary = summarizePointerCursorCase('production-config-lens', [
      missedHeartbeat,
      caseEvidence('production-config-lens', 2),
    ]);
    expect(heartbeatSummary).toMatchObject({ stable: false, heartbeat_failure_count: 1 });

    const wrongOffsets = [...valid.samples];
    wrongOffsets[4] = {
      ...missedHeartbeatSample,
      native_cursor_snapshots: missedHeartbeatSample.native_cursor_snapshots.map((snapshot, index) =>
        index === 0 ? { ...snapshot, offset_ms: 20 as const } : snapshot,
      ),
    };
    expect(validatePointerCursorCaseEvidence({ ...valid, samples: wrongOffsets })).toBe(false);

    const establishmentTemplate = valid.establishment.samples[0];
    if (establishmentTemplate === undefined) throw new Error('bounded establishment sample missing');
    const establishmentFailed: PointerCursorCaseEvidence = {
      ...valid,
      establishment: {
        ...valid.establishment,
        established: false,
        first_ibeam_elapsed_ms: null,
        established_elapsed_ms: null,
        samples: Array.from({ length: 12 }, (_, index) => ({
          ...establishmentTemplate,
          sequence: index + 1,
          native_cursor: 'arrow' as const,
          elapsed_ms: (index + 1) * 35,
        })),
      },
      samples: [],
    };
    expect(validatePointerCursorCaseEvidence(establishmentFailed)).toBe(true);
    const establishmentSummary = summarizePointerCursorCase('production-config-lens', [
      establishmentFailed,
      { ...establishmentFailed, repetition: 2 },
    ]);
    const seededEstablishmentFailed = (repetition: number): PointerCursorCaseEvidence => ({
      ...caseEvidence(POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID, repetition),
      establishment: establishmentFailed.establishment,
      samples: [],
      host_move_delivery_count: 0,
      child_move_delivery_count: 12,
      host_establishment_move_delivery_count: 0,
      child_establishment_move_delivery_count: 12,
      host_steady_state_move_delivery_count: 0,
      child_steady_state_move_delivery_count: 0,
      host_restored_before_steady_state: false,
      pre_steady_state_main_run_loop_heartbeat: false,
    });
    expect(establishmentSummary).toMatchObject({ stable: false, establishment_success_count: 0 });

    const stableD1 = summary('top-level-plain-text');
    const stableA = summary('top-level-monaco');
    const stableB = summary('generic-child-text');
    expect(
      decidePointerCursorAttribution(
        stableOracle,
        {
          'top-level-plain-text': stableD1,
          'top-level-monaco': stableA,
          'generic-child-text': stableB,
          'production-config-lens': heartbeatSummary,
        },
        stableHostControl,
        stableHostSeededControl,
      ),
    ).toBe('blocked_heartbeat_failed');
    expect(
      decidePointerCursorAttribution(
        stableOracle,
        {
          'top-level-plain-text': stableD1,
          'top-level-monaco': stableA,
          'generic-child-text': stableB,
          'production-config-lens': establishmentSummary,
        },
        stableHostControl,
        summarizePointerCursorCase(POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID, [
          seededEstablishmentFailed(1),
          seededEstablishmentFailed(2),
        ]),
      ),
    ).toBe('blocked_establishment_failed');
  });

  test('requires the Host isolation control to retain the same production Child and bounded delivery', () => {
    const normal = caseEvidence('production-config-lens', 1);
    const isolated = caseEvidence(POINTER_CURSOR_HOST_CONTROL_CASE_ID, 1);
    const seeded = caseEvidence(POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID, 1);
    expect(validateHostParticipationControlPair(normal, isolated)).toBe(true);
    expect(validateHostParticipationControlSet(normal, isolated, seeded)).toBe(true);
    expect(validatePointerCursorCaseEvidence({ ...seeded, host_restored_before_steady_state: false })).toBe(false);
    expect(validatePointerCursorCaseEvidence({ ...seeded, container_kind: 'top_level_wkwebview' })).toBe(false);
    expect(
      validateHostParticipationControlPair(normal, {
        ...isolated,
        child_move_delivery_count: 0,
        child_establishment_move_delivery_count: 0,
        child_steady_state_move_delivery_count: 0,
      }),
    ).toBe(true);
    expect(validateHostParticipationControlPair(normal, { ...isolated, child_move_delivery_count: 257 })).toBe(false);
    const first = isolated.establishment.samples[0];
    if (first === undefined) throw new Error('bounded Host control establishment sample missing');
    expect(
      validateHostParticipationControlPair(normal, {
        ...isolated,
        establishment: {
          ...isolated.establishment,
          samples: [{ ...first, child_identity: 'child_replaced' }, ...isolated.establishment.samples.slice(1)],
        },
      }),
    ).toBe(false);
  });

  test('implements the exclusive attribution decision table and blocks stable or ambiguous production results', () => {
    const stableD1 = summary('top-level-plain-text');
    const stableA = summary('top-level-monaco');
    const stableB = summary('generic-child-text');
    const stableC = summary('production-config-lens');
    const failedD1 = summary('top-level-plain-text', 'arrow');
    const failedA = summary('top-level-monaco', 'arrow');
    const failedB = summary('generic-child-text', 'arrow');
    const failedC = summary('production-config-lens', 'arrow');
    const failedHostControl = summary(POINTER_CURSOR_HOST_CONTROL_CASE_ID, 'arrow');
    const failedHostSeededControl = summary(POINTER_CURSOR_HOST_SEEDED_CONTROL_CASE_ID, 'arrow');
    expect(
      decidePointerCursorAttribution(
        stableOracle,
        {
          'top-level-plain-text': failedD1,
          'top-level-monaco': failedA,
          'generic-child-text': failedB,
          'production-config-lens': failedC,
        },
        stableHostControl,
        failedHostSeededControl,
      ),
    ).toBe('shared_wkwebview_webkit');
    expect(
      decidePointerCursorAttribution(
        stableOracle,
        {
          'top-level-plain-text': stableD1,
          'top-level-monaco': failedA,
          'generic-child-text': stableB,
          'production-config-lens': failedC,
        },
        stableHostControl,
        failedHostSeededControl,
      ),
    ).toBe('monaco_specific_content');
    expect(
      decidePointerCursorAttribution(
        stableOracle,
        {
          'top-level-plain-text': stableD1,
          'top-level-monaco': stableA,
          'generic-child-text': failedB,
          'production-config-lens': failedC,
        },
        stableHostControl,
        failedHostSeededControl,
      ),
    ).toBe('generic_child_wkwebview_wry');
    expect(
      decidePointerCursorAttribution(
        stableOracle,
        {
          'top-level-plain-text': stableD1,
          'top-level-monaco': stableA,
          'generic-child-text': stableB,
          'production-config-lens': failedC,
        },
        stableHostControl,
        failedHostSeededControl,
      ),
    ).toBe('lensx_host_child_sibling');
    expect(
      decidePointerCursorAttribution(
        stableOracle,
        {
          'top-level-plain-text': stableD1,
          'top-level-monaco': stableA,
          'generic-child-text': stableB,
          'production-config-lens': failedC,
        },
        failedHostControl,
        failedHostSeededControl,
      ),
    ).toBe('blocked_ambiguous');
    expect(
      decidePointerCursorAttribution(
        stableOracle,
        {
          'top-level-plain-text': stableD1,
          'top-level-monaco': stableA,
          'generic-child-text': stableB,
          'production-config-lens': stableC,
        },
        stableHostControl,
        stableHostSeededControl,
      ),
    ).toBe('blocked_not_reproduced');
    expect(
      decidePointerCursorAttribution(
        stableOracle,
        {
          'top-level-plain-text': stableD1,
          'top-level-monaco': failedA,
          'generic-child-text': failedB,
          'production-config-lens': failedC,
        },
        stableHostControl,
        failedHostSeededControl,
      ),
    ).toBe('blocked_ambiguous');
    expect(
      decidePointerCursorAttribution(
        { ...stableOracle, stable: false },
        {
          'top-level-plain-text': stableD1,
          'top-level-monaco': stableA,
          'generic-child-text': stableB,
          'production-config-lens': failedC,
        },
        stableHostControl,
        failedHostSeededControl,
      ),
    ).toBe('blocked_oracle_invalid');
  });

  test('rejects DOM-only/manual evidence and privacy-sensitive content', () => {
    const run = caseEvidence('top-level-monaco', 1);
    expect(validatePointerCursorCaseEvidence({ ...run, samples: [] })).toBe(false);
    expect(() => assertPointerCursorEvidencePrivacy(JSON.stringify(run))).not.toThrow();
    expect(() => assertPointerCursorEvidencePrivacy(`${JSON.stringify(run)} /Users/example/config.json`)).toThrow();
    expect(() => assertPointerCursorEvidencePrivacy(`${JSON.stringify(run)} raw_dom`)).toThrow();
  });
});
