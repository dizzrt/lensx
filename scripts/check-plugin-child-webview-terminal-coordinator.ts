import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Child WebView terminal coordinator drift: ${message}`);
};
const section = (source: string, start: string, end: string): string => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) fail(`missing production boundary ${start} -> ${end}`);
  return source.slice(from, to);
};
const ordered = (source: string, markers: readonly string[], boundary: string) => {
  let previous = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, previous + 1);
    if (next < 0) fail(`${boundary} omits or reorders ${marker}`);
    previous = next;
  }
};

const lifecycle = read('src/app/plugins/runtime/lifecycle-controller.ts');
const terminal = section(
  lifecycle,
  'const terminate = (reason: PluginRuntimeTerminalReason)',
  '\n      const attempt:',
);
ordered(
  terminal,
  [
    'if (terminal) return terminal',
    "phase = 'terminating'",
    'cancelHealthy?.()',
    'cancellables.splice(0)',
    'subscriptions.splice(0)',
    'await releasePresentation()',
    'const release = record.releaseRuntime',
    'record.releaseRuntime = undefined',
    'await release(reason)',
    "phase = 'disposed'",
    'attempts.delete(key)',
  ],
  'instance terminal operation',
);
if (!terminal.includes('if (surfaces.get(terminalSurface) === attempt) surfaces.delete(terminalSurface)')) {
  fail('terminal cleanup can remove a replacement surface binding');
}
if (!lifecycle.includes("await terminate('failure')")) fail('failure bypasses the terminal operation');
const terminateAll = section(lifecycle, 'const terminateAll = async', '\n  const service:');
ordered(
  terminateAll,
  ['startVersions.set(surfaceId, version + 1)', 'attempts.values()', 'attempt.terminate(reason)'],
  'all-instance teardown',
);

const instances = read('src/app/plugins/runtime/instance-registry.ts');
if (!instances.includes('attempt.bindRuntime((reason) => this.#releaseNative(binding, reason))')) {
  fail('runtime teardown is not bound to the centrally retained native instance');
}
const nativeRelease = section(instances, 'async #releaseNative(', '\n  /** Detached Page replacement');
ordered(
  nativeRelease,
  ['const presentation = binding.presentation', 'this.closeNative(presentation.attemptId, reason, presentation.owner)'],
  'current native owner cleanup',
);
if (!nativeRelease.includes('if (binding.presentation === presentation) binding.presentation = undefined')) {
  fail('late cleanup can erase a renewed native binding');
}

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
for (const trigger of [
  "terminate('navigation')",
  "fail('runtime_unavailable')",
  'binding.attempt.fail(readiness.failureCode)',
  'subscribeInvalidation',
]) {
  if (!slot.includes(trigger)) fail(`React coordinator omits ${trigger}`);
}
const app = read('src/App.tsx');
for (const trigger of [
  "terminateAll('host_reload')",
  "terminateAll('app_teardown')",
  'hostWindowPort.replaceInstance(attemptId, owner)',
  'hostWindowPort.closeInstance(attemptId)',
]) {
  if (!app.includes(trigger)) fail(`App instance coordinator omits ${trigger}`);
}

const rustService = read('src-tauri/src/plugin_child_webview_service.rs');
const compare = section(
  rustService,
  'pub(crate) fn compare_current_teardown(',
  'pub(crate) fn compare_owned_teardown(',
);
if (!compare.includes('self.teardown(attempt, None, false)')) fail('compare-attempt cleanup bypasses common teardown');
const teardown = section(rustService, '    fn teardown(', '    pub(crate) fn teardown_surface(');
ordered(
  teardown,
  [
    'state.instances.get_mut(&attempt)',
    'current.teardown_running',
    'current.presentation_epoch.revoke()',
    'current.session.dispose()',
    'current.rpc.terminate(true)',
    'self.apply_rpc_effects(context, effects)',
    'self.revoke_current_resource_authority(attempt)',
    'handle.destroy()',
    'let mut state = self.lock_state()',
    'if result.is_err()',
    'current.teardown_running = false',
    'return Err(())',
    'state.instances.remove(&attempt)',
    'state.surfaces.retain(|_, bound| *bound != attempt)',
    'state.reserved_surfaces.retain(|_, bound| *bound != attempt)',
  ],
  'native revoke-before-destroy and confirmed removal',
);
const allNative = section(rustService, '    fn teardown_attempts(', '    pub(crate) fn teardown_all(');
ordered(
  allNative,
  [
    'for attempt in &attempts',
    'self.disconnect_current(',
    'for attempt in attempts',
    'self.compare_current_teardown(attempt)',
  ],
  'native all-instance termination',
);
if (!rustService.includes('self.teardown_attempts(self.prepare_shutdown())'))
  fail('shutdown does not revoke all admission before teardown');
const exit = section(read('src-tauri/src/lib.rs'), 'if matches!(event, tauri::RunEvent::Exit)', '\n#[cfg(test)]');
ordered(
  exit,
  ['service.teardown_all()', 'host.close_subscriptions()', 'shutdown_plugin_detached_windows(app)'],
  'process exit cleanup',
);

const slotTests = read('tests/plugin-runtime-slot.test.tsx');
for (const evidence of [
  'converges disable, replacement, upgrade, and development invalidation on terminal teardown',
  'explicit retry terminates the failed attempt and creates one fresh presentation',
]) {
  if (!slotTests.includes(evidence)) fail(`terminal trigger evidence omits ${evidence}`);
}
const lifecycleTests = read('tests/plugin-runtime-lifecycle-controller.test.ts');
for (const evidence of [
  'uses one idempotent ordered terminal operation and makes stale callbacks inert',
  'releases a presentation lease without terminating its Runtime and tears down all instances exactly once',
  'matching invalidation fans out across surfaces while preserving unrelated entries and newer generations',
]) {
  if (!lifecycleTests.includes(evidence)) fail(`instance terminal evidence omits ${evidence}`);
}
for (const evidence of [
  'failed_native_destroy_keeps_current_for_retry',
  'quit_preparation_revokes_all_instances_before_native_destruction_and_blocks_new_admission',
]) {
  if (!rustService.includes(`fn ${evidence}(`)) fail(`native terminal evidence omits ${evidence}`);
}
console.log(
  'Checked per-instance terminal ordering, current-owner cleanup, retained destroy retry, and all-instance reload/exit.',
);
