import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const failures: string[] = [];
const adapter = read('src-tauri/src/plugin_child_webview_adapter.rs');
const harness = read('src-tauri/examples/plugin_child_webview_slot_harness.rs');
const evidence = JSON.parse(read('fixtures/plugin-child-webview-slot/evidence/macos.json')) as Record<string, unknown>;

for (const marker of [
  'create_plugin_child_webview_slot_probe',
  'scale_factor()',
  'set_size(LogicalSize::new(900.0, 700.0))',
  'set_bounds(Rect',
  'set_focus()',
  'firstResponder()',
  'insertText:replacementRange:',
  'setMarkedText:selectedRange:replacementRange:',
  '.hide()',
  "window.__TAURI_INTERNALS__.invoke('plugin_child_webview_slot_overlay_probe')",
]) {
  if (!adapter.includes(marker)) failures.push(`native slot adapter is missing ${marker}.`);
}
for (const marker of [
  'prepareSlotInputProbe',
  'reportSlotInputProbe',
  'compositionstart',
  'compositionupdate',
  'compositionend',
]) {
  if (!harness.includes(marker)) failures.push(`native slot harness is missing ${marker}.`);
}

const exactEvidence: Record<string, unknown> = {
  created: true,
  retina_scale_factor: 2,
  retina_bounds_scale_correct: true,
  resize_converged: true,
  host_overlay_visible_after_child_hidden: true,
  keyboard_focus_reached_plugin_input: true,
  keyboard_input_observed: true,
  ime_composition_observed: true,
  destroyed: true,
};
if (JSON.stringify(evidence) !== JSON.stringify(exactEvidence)) {
  failures.push('committed macOS native slot evidence is incomplete.');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Child WebView real macOS Retina, resize, overlay, keyboard, and IME evidence passed.');
