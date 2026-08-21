import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const fail = (message: string): never => {
  throw new Error(`Plugin Runtime slot drift: ${message}`);
};

const app = read('src/App.tsx');
if (!app.includes('<PluginRuntimeSlot')) fail('App does not render the native presentation slot');
if (app.includes('<PluginRuntimeFrame')) fail('App still renders the DOM iframe Runtime');
if (
  !app.includes('const pageLayout =') ||
  !app.includes("pageResolution?.provider.kind === 'plugin'") ||
  !app.includes("? 'plugin-edge-to-edge'") ||
  !app.includes('data-page-layout={pageLayout}')
) {
  fail('App does not derive the edge-to-edge Page body layout from plugin provider kind');
}
for (const hostChrome of ['<PageContextBar', 'pageTitle={pageContext.page_title}', 'closeActivePage']) {
  if (!app.includes(hostChrome)) fail(`Host-owned Page chrome omits ${hostChrome}`);
}

const styles = read('src/styles/global.less');
const block = (selector: string): string => {
  const start = styles.indexOf(selector);
  if (start < 0) fail(`Host styles omit ${selector}`);
  const open = styles.indexOf('{', start);
  if (open < 0) fail(`Host styles do not open ${selector}`);
  const end = styles.indexOf('\n}', open);
  if (end < 0) fail(`Host styles do not close ${selector}`);
  return styles.slice(start, end);
};
const pluginBody = block('.launcher-body[data-page-layout="plugin-edge-to-edge"]');
for (const declaration of ['padding-inline: 0', 'padding-bottom: 0', 'gap: 0']) {
  if (!pluginBody.includes(declaration)) fail(`plugin Page body omits ${declaration}`);
}
const runtimeContainerStyles = block('.plugin-runtime-container');
if (runtimeContainerStyles.includes('border-radius')) fail('Runtime container still adds an inner radius');
if (!block('.launcher-surface').includes('border-radius: 18px'))
  fail('outer Launcher surface lost its clipping radius');
for (const retainedLayout of ['gap-3', 'px-4', 'pb-4']) {
  if (!app.includes(`launcher-body min-h-0 flex flex-1 flex-col ${retainedLayout}`) && !app.includes(retainedLayout)) {
    fail(`non-plugin Page body lost ${retainedLayout}`);
  }
}

const slot = read('src/app/plugins/runtime/PluginRuntimeSlot.tsx');
for (const forbidden of ['<iframe', 'contentWindow', 'MessageChannel', 'navigationAdapter=', 'sessionService=']) {
  if (slot.includes(forbidden)) fail(`native slot contains retired DOM transport ${forbidden}`);
}
for (const required of [
  'data-plugin-runtime-slot="true"',
  "t('launcher.page.pluginRuntimeLoading')",
  "t('launcher.page.pluginRuntimeRetry')",
  'role="alert"',
  'presentationController.create',
  'binding.attempt.bindPresentation',
]) {
  if (!slot.includes(required)) fail(`native slot omits ${required}`);
}

const presentation = read('src/app/plugins/runtime/pluginChildWebviewPresentation.ts');
const createStart = presentation.indexOf('async create({');
const updateStart = presentation.indexOf('    updateSlot(', createStart);
if (createStart < 0 || updateStart < 0) fail('presentation create section is missing');
const createSection = presentation.slice(createStart, updateStart);
for (const forbidden of ['entry_url', 'expected_origin', 'webview_label', 'data_store_identifier', 'webview_config']) {
  if (createSection.includes(forbidden)) fail(`React create request exposes Host-private ${forbidden}`);
}
for (const safeIdentity of ['entry_id', 'plugin_id', 'version', 'page_id', 'expected_revision']) {
  if (!createSection.includes(safeIdentity)) fail(`React create request omits safe identity ${safeIdentity}`);
}

const rustPresentation = read('src-tauri/src/plugin_child_webview_presentation.rs');
for (const required of [
  'read_resource_projection(',
  'resolve_entry(&ResolvePluginResourceEntryRequest',
  'reserve_current_with_derived_label',
  'prepare_current_creation',
  'create_plugin_child_webview(',
  'service.attach_current',
  'service.compare_current_teardown',
]) {
  if (!rustPresentation.includes(required)) fail(`Rust presentation path omits ${required}`);
}

const lib = read('src-tauri/src/lib.rs');
for (const command of [
  'plugin_child_webview_presentation::create_plugin_child_webview_presentation',
  'plugin_child_webview_presentation::destroy_plugin_child_webview_presentation',
]) {
  if (!lib.includes(command)) fail(`Tauri invoke handler omits ${command}`);
}

const uiTests = read('tests/plugin-page-navigation-ui.test.tsx');
for (const evidence of [
  'opens the isolated Runtime after the StrictMode setup-cleanup-setup replay',
  'keeps one current Runtime across shortcut activation refresh and replaces it only after a real close',
  "document.querySelector('iframe')).toBeNull()",
]) {
  if (!uiTests.includes(evidence)) fail(`UI integration evidence omits ${evidence}`);
}

console.log('Checked Host-owned Page chrome and the single native Plugin Runtime presentation slot boundary.');
