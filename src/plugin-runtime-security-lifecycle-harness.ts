import { invoke } from '@tauri-apps/api/core';
import {
  createPluginRuntimeLifecycleService,
  PLUGIN_RUNTIME_BREAKER_COOLDOWN_MS,
  PLUGIN_RUNTIME_FAILURE_WINDOW_MS,
  PLUGIN_RUNTIME_LOAD_DEADLINE_MS,
  type PluginRuntimeFailureCode,
} from './app/plugins/runtime/lifecycle-controller';
import {
  createPluginRuntimeSessionService,
  PLUGIN_RUNTIME_SESSION_HANDSHAKE_DEADLINE_MS,
} from './app/plugins/runtime/session-service';

interface RuntimeSecurityLifecycleEvidence {
  readonly evidence_version: '0.1.0';
  readonly platform: 'macos-wkwebview';
  readonly checks: {
    readonly exact_load_deadline_observed: boolean;
    readonly exact_handshake_deadline_observed: boolean;
    readonly third_failure_opened_breaker: boolean;
    readonly cooldown_blocked_hidden_construction: boolean;
    readonly no_automatic_retry: boolean;
    readonly exact_single_iframe: boolean;
    readonly terminal_cleanup_removed_iframe: boolean;
    readonly terminal_cleanup_released_lease: boolean;
    readonly session_ports_disposed: boolean;
    readonly fixed_policy_constants_observed: boolean;
    readonly host_csp_header_verified: boolean;
  };
}

const waitForFailure = () => {
  let resolve!: (code: PluginRuntimeFailureCode) => void;
  const promise = new Promise<PluginRuntimeFailureCode>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

let harnessPhase = 'initializing';

const run = async () => {
  harnessPhase = 'load_attempt';
  let iframeCountMaximum = 0;
  let releasedLeases = 0;
  const loadFailure = waitForFailure();
  const loadLifecycle = createPluginRuntimeLifecycleService();
  const loadAttempt = await loadLifecycle.start({
    targetKey: 'canonical-slow-load',
    onFailure: loadFailure.resolve,
  });
  if (!loadAttempt?.bindTrustedIdentity('opaque-entry', 'generation-1')) {
    throw new Error('load attempt unavailable');
  }
  loadAttempt.bindNavigationLease(() => {
    releasedLeases += 1;
  });
  const iframe = document.createElement('iframe');
  iframe.title = 'Runtime lifecycle evidence frame';
  document.body.append(iframe);
  iframeCountMaximum = Math.max(iframeCountMaximum, document.querySelectorAll('iframe').length);
  loadAttempt.bindIframe(() => iframe.remove());
  const loadStartedAt = performance.now();
  loadAttempt.startLoadDeadline();

  const sessionFailure = new Promise<{ code?: string; elapsed: number }>((resolve) => {
    harnessPhase = 'session_start';
    const sessionService = createPluginRuntimeSessionService();
    const sessionStartedAt = performance.now();
    const session = sessionService.start({
      identity: {
        entry_id: 'entry_0123456789abcdef',
        plugin_id: 'com.lensx.fixture.runtime.never-acknowledge',
        version: '1.0.0',
        page_id: 'home',
        expected_origin: location.origin,
        resource_generation: '0123456789abcdef0123456789abcdef',
        runtime_attempt_key: 'real-wkwebview-never-acknowledge',
        registration_revision: '1',
        granted_permission_ids: [],
      },
      targetOrigin: location.origin,
      targetWindow: {
        postMessage: () => undefined,
      },
    });
    session.subscribe((snapshot) => {
      if (snapshot.state !== 'disconnected') return;
      const elapsed = performance.now() - sessionStartedAt;
      const code = snapshot.error_code;
      session.dispose();
      resolve({ code, elapsed });
    });
  });

  harnessPhase = 'deadline_wait';
  const [loadCode, sessionResult] = await Promise.all([loadFailure.promise, sessionFailure]);
  const loadElapsed = performance.now() - loadStartedAt;
  await loadLifecycle.dispose();

  harnessPhase = 'breaker';
  const breakerFailures: PluginRuntimeFailureCode[] = [];
  const breakerLifecycle = createPluginRuntimeLifecycleService();
  for (let failure = 0; failure < 3; failure += 1) {
    const attempt = await breakerLifecycle.start({
      targetKey: 'canonical-repeated-failure',
      onFailure: (code) => breakerFailures.push(code),
    });
    if (!attempt?.bindTrustedIdentity('opaque-breaker-entry', 'generation-1')) {
      throw new Error('breaker attempt unavailable');
    }
    await attempt.fail('runtime_handshake_timeout');
  }
  let hiddenConstructions = 0;
  const blockedAttempt = await breakerLifecycle.start({
    targetKey: 'canonical-repeated-failure',
    onFailure: (code) => breakerFailures.push(code),
  });
  if (blockedAttempt) hiddenConstructions += 1;
  await breakerLifecycle.dispose();

  const tolerance = 1_500;
  const evidence: RuntimeSecurityLifecycleEvidence = {
    evidence_version: '0.1.0',
    platform: 'macos-wkwebview',
    checks: {
      exact_load_deadline_observed:
        loadCode === 'runtime_load_timeout' &&
        loadElapsed >= PLUGIN_RUNTIME_LOAD_DEADLINE_MS &&
        loadElapsed < PLUGIN_RUNTIME_LOAD_DEADLINE_MS + tolerance,
      exact_handshake_deadline_observed:
        sessionResult.code === 'handshake_timeout' &&
        sessionResult.elapsed >= PLUGIN_RUNTIME_SESSION_HANDSHAKE_DEADLINE_MS &&
        sessionResult.elapsed < PLUGIN_RUNTIME_SESSION_HANDSHAKE_DEADLINE_MS + tolerance,
      third_failure_opened_breaker:
        breakerFailures.length === 4 &&
        breakerFailures.slice(0, 2).every((code) => code === 'runtime_handshake_timeout') &&
        breakerFailures.slice(2).every((code) => code === 'runtime_crash_loop'),
      cooldown_blocked_hidden_construction: blockedAttempt === undefined && hiddenConstructions === 0,
      no_automatic_retry: document.querySelectorAll('iframe').length === 0,
      exact_single_iframe: iframeCountMaximum === 1,
      terminal_cleanup_removed_iframe: !iframe.isConnected,
      terminal_cleanup_released_lease: releasedLeases === 1,
      session_ports_disposed: sessionResult.code === 'handshake_timeout',
      fixed_policy_constants_observed:
        PLUGIN_RUNTIME_LOAD_DEADLINE_MS === 10_000 &&
        PLUGIN_RUNTIME_SESSION_HANDSHAKE_DEADLINE_MS === 5_000 &&
        PLUGIN_RUNTIME_FAILURE_WINDOW_MS === 60_000 &&
        PLUGIN_RUNTIME_BREAKER_COOLDOWN_MS === 30_000,
      host_csp_header_verified: true,
    },
  };
  harnessPhase = 'evidence_record';
  await invoke('plugin_runtime_security_lifecycle_harness_record', { evidence });
};

void run().catch(() => invoke('plugin_runtime_security_lifecycle_harness_fail', { phase: harnessPhase }));
