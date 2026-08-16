import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const resource = read('src-tauri/src/plugin_resource_service.rs');
const child = read('src-tauri/src/plugin_child_webview_service.rs');
const library = read('src-tauri/src/lib.rs');

for (const marker of [
  'struct RuntimeResourceAuthority',
  'attempt_id: String',
  'webview_label: String',
  'binding: ScopeBinding',
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
if (!library.includes('.attach_resource_authority(plugin_resource_service)')) {
  failures.push('application composition does not bind Resource Service to Child WebView lifecycle.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Generation-bound Resource Service and actual Child WebView source binding passed.');
