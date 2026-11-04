import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Child WebView continuity drift: ${message}`);
};
const section = (source: string, start: string, end: string): string => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) fail(`missing production boundary ${start} -> ${end}`);
  return source.slice(from, to);
};
const includes = (source: string, markers: readonly string[], boundary: string) => {
  for (const marker of markers) if (!source.includes(marker)) fail(`${boundary} omits ${marker}`);
};

const service = read('src-tauri/src/plugin_child_webview_service.rs');
includes(
  section(service, 'struct RegistryState<H>', '#[derive(Clone, Debug)]'),
  [
    'instances: BTreeMap<PluginChildWebviewAttempt, CurrentEntry<H>>',
    'surfaces: BTreeMap<String, PluginChildWebviewAttempt>',
    'reserved_surfaces: BTreeMap<String, PluginChildWebviewAttempt>',
  ],
  'instance and surface ownership indexes',
);
includes(
  section(service, 'pub(crate) fn bind_creation_reservation(', '    fn main_owner('),
  [
    'pending.owner == owner && monotonic_now_ms() < pending.deadline',
    'state.reserved_surfaces.get(&owner.window_label) != Some(&attempt)',
    'state.surfaces.contains_key(&owner.window_label)',
    'derive_data_store_identifier(attempt, &identity)',
    'state.surfaces.insert(owner.window_label.clone(), attempt)',
    'state.instances.insert(',
  ],
  'bounded one-instance-per-surface creation',
);
includes(
  service,
  [
    'fn concurrent_reservations_publish_at_most_one_current_attempt(',
    'fn each_attempt_and_resource_generation_gets_a_distinct_private_data_store(',
    'fn stale_callbacks_cannot_operate_a_replacement_webview(',
    'fn three_same_plugin_instances_own_distinct_surfaces_sessions_and_cleanup(',
    'fn migration_is_source_bound_single_use_and_retires_the_old_owner(',
  ],
  'native isolation/continuity regressions',
);

const lifecycle = read('src/app/plugins/runtime/lifecycle-controller.ts');
const transfer = section(lifecycle, '    async transfer(', '    failCurrent:');
includes(
  transfer,
  [
    'attempts.get(attemptKey)',
    'record?.attempt.isOwner(expectedOwner)',
    'surfaces.get(targetSurfaceId) !== record.attempt',
    'revision: expectedOwner.revision + 1',
    'record.releaseRuntime = releaseRuntime',
    'surfaces.set(targetSurfaceId, record.attempt)',
    'await record.attempt.releasePresentation()',
  ],
  'same-instance presentation transfer',
);
if (/\.terminate\(|\.fail\(|\.start\(/u.test(transfer))
  fail('presentation transfer restarts or terminates its runtime');
const navigation = section(read('src/app/navigation/service.ts'), '  stageTransfer(', '  settleTransfer(');
includes(
  navigation,
  [
    'this.#instances.get(attemptId)',
    'instance.activation?.terminal !== false',
    'destination.current !== instance',
    'destination.current = instance',
    'instance.surfaceId = destinationId',
  ],
  'same activation and Page transfer',
);
if (/new PageActivationAttempt|\.dispose\(|#clearActivation\(/u.test(navigation))
  fail('navigation transfer replaces activation identity');

const navigationTests = read('tests/plugin-page-navigation-ui.test.tsx');
includes(
  navigationTests,
  [
    'keeps one current Runtime across shortcut activation refresh and replaces it only after a real close',
    'expect(reopenedSlot).not.toBe(slot)',
    'pluginChildWebviewPresentationController.create).toHaveBeenCalledTimes(2)',
  ],
  'main close/reopen continuity',
);
includes(
  read('tests/plugin-runtime-resolver.test.ts'),
  [
    'invalidates retry, cross-Page, old generation, and same-version replacement',
    'pins metadata admission before resource resolution and keeps Manager generation independent of provisional scope',
  ],
  'resource generation continuity',
);
includes(
  read('tests/plugin-runtime-slot.test.tsx'),
  [
    'explicit retry terminates the failed attempt and creates one fresh presentation',
    'recomputes physical bounds and scale on the same current presentation',
  ],
  'attempt continuity',
);
includes(
  read('tests/app-shell-navigation.test.tsx'),
  [
    'routes Host reload and root teardown through the Runtime terminal coordinator',
    'actual App teardown terminates every retained runtime, including surfaces absent from main navigation',
  ],
  'application teardown',
);
includes(
  read('tests/plugin-detached-window-composition.test.tsx'),
  [
    'restores the same component Runtime before/after navigation staging without reload',
    'expect(instance.attempt).toBe(originalAttempt)',
    'expect(activation?.current()).toEqual(originalActivation)',
    'expect(f.controller.create).toHaveBeenCalledTimes(1)',
    'detaches A1, opens same-plugin A2 in main, and delivers caller Action/close only to A1',
    'late distinct operation IDs cannot refreeze or move an already restored original',
  ],
  'production component transfer/rollback regressions',
);

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
includes(
  slot,
  ["instanceRegistry?.forSurface('main', activePage)", 'retainedOnMount.current?.state'],
  'retained presentation adoption',
);
for (const path of ['src/app/plugins/runtime/PluginRuntimeSlot.tsx', 'src/app/plugins/runtime/instance-registry.ts']) {
  if (/preload|runtimePool|backgroundRuntime/u.test(read(path)))
    fail(`${path} introduces a preload, pool, or background Runtime path`);
}
console.log(
  'Checked per-surface continuity, same-instance transfer/rollback, isolated sibling runtimes, and fresh terminal retries.',
);
