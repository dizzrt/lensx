import type * as Monaco from 'monaco-editor';

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
  worker.addEventListener('message', () => markEditorWorkerReady?.(), { once: true });
  return worker;
};

export const loadMonaco = async (): Promise<typeof Monaco> => {
  if (monacoPromise !== undefined) return monacoPromise;
  const environment = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: () => Worker };
  };
  primedEditorWorker = createEditorWorker();
  environment.MonacoEnvironment = {
    getWorker: () => {
      const worker = primedEditorWorker ?? createEditorWorker();
      primedEditorWorker = undefined;
      return worker;
    },
  };
  monacoPromise = import('monaco-editor/editor/editor.api.js').then((monaco) => {
    for (const id of ['json', 'yaml', 'toml', 'xml']) {
      if (!monaco.languages.getLanguages().some((language) => language.id === id)) monaco.languages.register({ id });
    }
    return monaco;
  });
  return monacoPromise;
};
