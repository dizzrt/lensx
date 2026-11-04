import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const resource = read('src-tauri/src/plugin_resource_service.rs');
const child = read('src-tauri/src/plugin_child_webview_service.rs');
const library = read('src-tauri/src/lib.rs');
const presentation = read('src-tauri/src/plugin_child_webview_presentation.rs');

for (const marker of [
  'struct RuntimeResourceAuthority',
  'attempt_id: String',
  'webview_label: String',
  'binding: ScopeBinding',
  'leases: HashMap<String, RuntimeResourceAuthority>',
  'reservations: HashMap<String, ResourceCreationReservation>',
  'reserve_entry_for_attempt(',
  'release_creation_reservation(',
  'scopes.expire(resource_now_ms())',
  'scopes.used_sources.contains(webview_label)',
  'scopes.reservations.remove(attempt_id)',
  'scopes.retire_if_unheld(&binding)',
  'activate_runtime_source(',
  'revoke_runtime_source(',
  'handle_request_from_source(',
  'source_is_current(',
  'context.webview_label().to_owned()',
  'current.resource_generation != binding.resource_generation',
]) {
  if (!resource.includes(marker)) failures.push(`Resource Service is missing ${marker}.`);
}
for (const marker of [
  'trait PluginChildWebviewResourceAuthority',
  '.activate(',
  '.revoke(&attempt.opaque_id())',
  'handle.destroy()',
]) {
  if (!child.includes(marker)) failures.push(`Child WebView lifecycle is missing ${marker}.`);
}
const revoke = child.indexOf('.revoke(&attempt.opaque_id())');
const teardown = child.indexOf('pub(crate) fn compare_current_teardown(');
const teardownRevoke = child.indexOf('self.revoke_current_resource_authority(attempt);', teardown);
const destroy = child.indexOf('handle.destroy()', teardown);
if (revoke < 0 || teardown < 0 || teardownRevoke < 0 || destroy < 0 || teardownRevoke > destroy) {
  failures.push('resource authority is not revoked before native destroy.');
}
if (
  !library.includes('service.attach_resource_authority(authority)') ||
  !/attach_plugin_resource_authority\(\s*plugin_child_webview_service\.as_ref\(\),\s*plugin_resource_service,\s*\)/u.test(
    library,
  )
) {
  failures.push('application composition does not bind Resource Service to Child WebView lifecycle.');
}

const reserveAttempt = presentation.indexOf('.reserve_creation_for_entry(');
const reserveResources = presentation.indexOf('.reserve_entry_for_attempt(');
const bindAttempt = presentation.indexOf('.bind_creation_reservation(');
if (reserveAttempt < 0 || reserveResources <= reserveAttempt || bindAttempt <= reserveResources) {
  failures.push('native creation must allocate a trusted attempt before reserving resources and binding the instance.');
}
if (resource.includes('runtime_authority: Mutex<Option<RuntimeResourceAuthority>>')) {
  failures.push('resource authority must retain independent source leases, not a global singleton.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Generation-bound Resource Service and actual Child WebView source binding passed.');
