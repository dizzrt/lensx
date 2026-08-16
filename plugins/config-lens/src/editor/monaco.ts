import type * as Monaco from 'monaco-editor';

let monacoPromise: Promise<typeof Monaco> | undefined;

export const loadMonaco = async (): Promise<typeof Monaco> => {
  if (monacoPromise !== undefined) return monacoPromise;
  const environment = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: () => Worker };
  };
  environment.MonacoEnvironment = {
    getWorker: () =>
      new Worker(new URL('./editor.worker.ts', import.meta.url), { name: 'config-lens-editor', type: 'module' }),
  };
  monacoPromise = import('monaco-editor/editor/editor.api.js').then((monaco) => {
    for (const id of ['json', 'yaml', 'toml', 'xml']) {
      if (!monaco.languages.getLanguages().some((language) => language.id === id)) monaco.languages.register({ id });
    }
    return monaco;
  });
  return monacoPromise;
};
