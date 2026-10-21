import type { PluginRuntimeContext } from '@lensx/plugin-sdk';
import type * as Monaco from 'monaco-editor';

import { localClipboard } from './localClipboard.js';

let monacoPromise: Promise<typeof Monaco> | undefined;
let editorWorkerReady: Promise<void> | undefined;
let markEditorWorkerReady: (() => void) | undefined;
const editorWorkers = new Set<Worker>();
let primedEditorWorker: Worker | undefined;

const readiness = (): Promise<void> => {
  if (editorWorkerReady === undefined) {
    editorWorkerReady = new Promise<void>((resolve) => {
      markEditorWorkerReady = resolve;
    });
  }
  return editorWorkerReady;
};

export const waitForEditorWorkerReady = (): Promise<void> => readiness();

export const disposeMonacoWorkers = (): void => {
  localClipboard.clearInternalState();
  for (const worker of editorWorkers) worker.terminate();
  editorWorkers.clear();
  editorWorkerReady = undefined;
  markEditorWorkerReady = undefined;
  primedEditorWorker = undefined;
};

const createEditorWorker = (): Worker => {
  const worker = new Worker(new URL('./editor.worker.ts', import.meta.url), {
    name: 'config-lens-editor',
    type: 'module',
  });
  editorWorkers.add(worker);
  void readiness();
  worker.addEventListener(
    'message',
    () => {
      if (editorWorkers.has(worker)) markEditorWorkerReady?.();
    },
    { once: true },
  );
  return worker;
};

const initialize = async (locale: PluginRuntimeContext['locale']): Promise<typeof Monaco> => {
  const nls = globalThis as typeof globalThis & {
    _VSCODE_NLS_LANGUAGE?: string;
    _VSCODE_NLS_MESSAGES?: string[];
  };
  nls._VSCODE_NLS_LANGUAGE = locale === 'zh-CN' ? 'zh-cn' : 'en';
  if (locale === 'zh-CN') {
    await import('monaco-editor/nls/lang/zh-cn.js');
  } else {
    nls._VSCODE_NLS_MESSAGES = undefined;
  }
  // Monaco 0.56.0 initializes singleton services at the first language API
  // call, before editor.create overrides could apply. Install the reviewed
  // memory-only clipboard service before registration or model construction.
  // No Monaco runtime import may execute before the document's NLS is ready.
  const [monaco, json, yaml, xml, toml, , { StandaloneServices }] = await Promise.all([
    import('monaco-editor/editor/editor.api.js'),
    import('monaco-editor/languages/features/json/tokenization.js'),
    import('monaco-editor/languages/definitions/yaml/yaml.js'),
    import('monaco-editor/languages/definitions/xml/xml.js'),
    import('./toml.js'),
    import('./contributions.js'),
    import('monaco-editor/editor/standalone/browser/standaloneServices.js'),
  ]);
  StandaloneServices.initialize({ clipboardService: localClipboard });
  for (const id of ['json', 'yaml', 'toml', 'xml']) {
    if (!monaco.languages.getLanguages().some((language) => language.id === id)) monaco.languages.register({ id });
  }
  monaco.languages.setTokensProvider('json', json.createTokenizationSupport(false));
  monaco.languages.setLanguageConfiguration('json', {
    brackets: [
      ['{', '}'],
      ['[', ']'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}', notIn: ['string'] },
      { open: '[', close: ']', notIn: ['string'] },
      { open: '"', close: '"', notIn: ['string'] },
    ],
  });
  for (const [id, definition] of [
    ['yaml', yaml],
    ['xml', xml],
    ['toml', toml],
  ] as const) {
    monaco.languages.setLanguageConfiguration(id, definition.conf);
    monaco.languages.setMonarchTokensProvider(id, definition.language);
  }
  return monaco;
};

export const loadMonaco = (locale: PluginRuntimeContext['locale']): Promise<typeof Monaco> => {
  const environment = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: () => Worker };
  };
  // A same-document SDK retry retains the initialized module/NLS graph but
  // recreates its terminated Workers. The first context remains authoritative.
  if (editorWorkers.size === 0) primedEditorWorker = createEditorWorker();
  environment.MonacoEnvironment = {
    getWorker: () => {
      const worker = primedEditorWorker ?? createEditorWorker();
      primedEditorWorker = undefined;
      return worker;
    },
  };
  monacoPromise ??= initialize(locale);
  return monacoPromise;
};
