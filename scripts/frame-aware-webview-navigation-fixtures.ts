import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = join(import.meta.dirname, '..');
const fixtureRoot = join(rootDir, 'fixtures/frame-aware-webview-navigation');
const writeMode = process.argv.includes('--write');

type FrameClass = 'main' | 'descendant';
type FixtureOperation = 'observe_bootstrap' | 'invoke' | 'self_navigation' | 'popup' | 'targeted_context' | 'download';
type TargetRef =
  | 'none'
  | 'active_plugin_entry'
  | 'active_plugin_entry_other_fragment'
  | 'host_app'
  | 'external_https'
  | 'cross_plugin_entry'
  | 'stale_plugin_entry'
  | 'dangerous_file'
  | 'dangerous_javascript'
  | 'dangerous_data'
  | 'dangerous_blob'
  | 'download_payload';
type NavigationDecision = 'allow_main_app' | 'allow_active_plugin_document' | 'deny' | 'not_applicable';
type BootstrapExpectation = 'available' | 'absent';

interface FixtureCase {
  readonly case_id: string;
  readonly document: string;
  readonly frame_class: FrameClass;
  readonly operation: FixtureOperation;
  readonly target_ref: TargetRef;
  readonly expected_navigation_decision: NavigationDecision;
  readonly expected_bootstrap: BootstrapExpectation;
  readonly expected_handler_hits: 0;
}

const fixtureCases: readonly FixtureCase[] = [
  {
    case_id: 'host-main-bootstrap',
    document: 'host-main-bootstrap.html',
    frame_class: 'main',
    operation: 'observe_bootstrap',
    target_ref: 'host_app',
    expected_navigation_decision: 'allow_main_app',
    expected_bootstrap: 'available',
    expected_handler_hits: 0,
  },
  {
    case_id: 'exact-plugin-entry',
    document: 'exact-plugin-entry.html',
    frame_class: 'descendant',
    operation: 'observe_bootstrap',
    target_ref: 'active_plugin_entry',
    expected_navigation_decision: 'allow_active_plugin_document',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
  {
    case_id: 'descendant-invoke-attempt',
    document: 'descendant-invoke-attempt.html',
    frame_class: 'descendant',
    operation: 'invoke',
    target_ref: 'none',
    expected_navigation_decision: 'not_applicable',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
  {
    case_id: 'different-fragment',
    document: 'different-fragment.html',
    frame_class: 'descendant',
    operation: 'self_navigation',
    target_ref: 'active_plugin_entry_other_fragment',
    expected_navigation_decision: 'deny',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
  {
    case_id: 'host-self-navigation',
    document: 'host-self-navigation.html',
    frame_class: 'descendant',
    operation: 'self_navigation',
    target_ref: 'host_app',
    expected_navigation_decision: 'deny',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
  {
    case_id: 'external-self-navigation',
    document: 'external-self-navigation.html',
    frame_class: 'descendant',
    operation: 'self_navigation',
    target_ref: 'external_https',
    expected_navigation_decision: 'deny',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
  {
    case_id: 'cross-plugin-self-navigation',
    document: 'cross-plugin-self-navigation.html',
    frame_class: 'descendant',
    operation: 'self_navigation',
    target_ref: 'cross_plugin_entry',
    expected_navigation_decision: 'deny',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
  {
    case_id: 'stale-self-navigation',
    document: 'stale-self-navigation.html',
    frame_class: 'descendant',
    operation: 'self_navigation',
    target_ref: 'stale_plugin_entry',
    expected_navigation_decision: 'deny',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
  ...(['dangerous_file', 'dangerous_javascript', 'dangerous_data', 'dangerous_blob'] as const).map(
    (targetRef): FixtureCase => ({
      case_id: `${targetRef.replace('_', '-')}-self-navigation`,
      document: `${targetRef.replace('_', '-')}-self-navigation.html`,
      frame_class: 'descendant',
      operation: 'self_navigation',
      target_ref: targetRef,
      expected_navigation_decision: 'deny',
      expected_bootstrap: 'absent',
      expected_handler_hits: 0,
    }),
  ),
  {
    case_id: 'popup-navigation',
    document: 'popup-navigation.html',
    frame_class: 'descendant',
    operation: 'popup',
    target_ref: 'external_https',
    expected_navigation_decision: 'deny',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
  {
    case_id: 'targeted-context-navigation',
    document: 'targeted-context-navigation.html',
    frame_class: 'descendant',
    operation: 'targeted_context',
    target_ref: 'external_https',
    expected_navigation_decision: 'deny',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
  {
    case_id: 'download-navigation',
    document: 'download-navigation.html',
    frame_class: 'descendant',
    operation: 'download',
    target_ref: 'download_payload',
    expected_navigation_decision: 'deny',
    expected_bootstrap: 'absent',
    expected_handler_hits: 0,
  },
] as const;

const escapeInlineJson = (value: unknown): string => JSON.stringify(value).replaceAll('<', '\\u003c');

const renderDocument = (fixture: FixtureCase): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${fixture.case_id}</title>
    <script>
      (() => {
        'use strict';
        const fixture = ${escapeInlineJson({
          case_id: fixture.case_id,
          frame_class: fixture.frame_class,
          operation: fixture.operation,
          target_ref: fixture.target_ref,
        })};
        const namespace = 'lensx.frame-aware-webview-harness';
        const internals = window.__TAURI_INTERNALS__;
        const surface = Object.freeze({
          is_tauri: window.isTauri === true,
          internals: typeof internals === 'object' && internals !== null,
          metadata: typeof internals === 'object' && internals !== null && 'metadata' in internals,
          invoke: typeof internals?.invoke === 'function',
          ipc: typeof internals?.postMessage === 'function',
        });
        const report = (event, outcome = 'observed') => {
          const record = Object.freeze({ namespace, case_id: fixture.case_id, event, outcome, surface });
          if (typeof window.__LENSX_FRAME_AWARE_WEBVIEW_HARNESS_REPORT__ === 'function') {
            window.__LENSX_FRAME_AWARE_WEBVIEW_HARNESS_REPORT__(record);
          }
          if (window.parent !== window) window.parent.postMessage(record, '*');
        };
        const runTargetOperation = (target) => {
          report('operation_started');
          if (fixture.operation === 'self_navigation') {
            const link = document.createElement('a');
            link.href = target;
            link.target = '_self';
            link.textContent = 'navigate fixture';
            document.body.append(link);
            link.click();
          }
          else if (fixture.operation === 'popup') window.open(target, '_blank', 'noopener');
          else if (fixture.operation === 'targeted_context') window.open(target, 'lensx-harness-target');
          else if (fixture.operation === 'download') {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob(['frame-aware WebView download fixture'], { type: 'text/plain' }));
            link.download = 'frame-aware-webview-fixture.txt';
            link.textContent = 'download fixture';
            document.body.append(link);
            link.click();
          }
        };
        window.addEventListener('message', (event) => {
          const command = event.data;
          if (
            typeof command !== 'object' ||
            command === null ||
            command.namespace !== namespace + '.command' ||
            command.case_id !== fixture.case_id ||
            command.target_ref !== fixture.target_ref
          ) return;
          if (command.action === 'probe_current') {
            report('operation_settled', 'retained');
            return;
          }
          if (command.action !== 'run_target' || typeof command.target !== 'string') return;
          runTargetOperation(command.target);
        });
        report('document_start');
        if (fixture.operation === 'invoke') {
          if (typeof internals?.invoke !== 'function') report('invoke_finished', 'unavailable');
          else {
            Promise.resolve(internals.invoke('frame_aware_webview_harness_probe', {})).then(
              () => report('invoke_finished', 'resolved'),
              () => report('invoke_finished', 'rejected'),
            );
          }
        }
      })();
    </script>
  </head>
  <body><main>frame-aware WebView fixture: ${fixture.case_id}</main></body>
</html>
`;

const outputs = new Map<string, Buffer>();
outputs.set(
  'cases.json',
  Buffer.from(`${JSON.stringify({ fixture_version: '0.1.0', cases: fixtureCases }, null, 2)}\n`, 'utf8'),
);
for (const fixture of fixtureCases) {
  outputs.set(`documents/${fixture.document}`, Buffer.from(renderDocument(fixture), 'utf8'));
}

const listFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory() && relative(fixtureRoot, absolutePath) === 'evidence') return [];
    return entry.isDirectory() ? listFiles(absolutePath) : [relative(fixtureRoot, absolutePath)];
  });
};

const drift: string[] = [];
for (const [relativePath, bytes] of outputs) {
  const absolutePath = join(fixtureRoot, relativePath);
  if (writeMode) {
    mkdirSync(join(absolutePath, '..'), { recursive: true });
    writeFileSync(absolutePath, bytes);
  } else if (!existsSync(absolutePath) || !readFileSync(absolutePath).equals(bytes)) {
    drift.push(relativePath);
  }
}
for (const relativePath of listFiles(fixtureRoot)) {
  if (!outputs.has(relativePath)) drift.push(relativePath);
}

if (drift.length > 0) {
  throw new Error(
    `Frame-aware WebView navigation fixtures drifted: ${drift.sort().join(', ')}. Review the change, then run pnpm run generate -- frame-aware-webview-navigation-fixtures --write.`,
  );
}

console.log(`${writeMode ? 'Generated' : 'Checked'} ${fixtureCases.length} frame-aware WebView fixtures.`);
