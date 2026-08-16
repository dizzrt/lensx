// biome-ignore lint/style/useConst: Rspack requires assignment to this injected runtime variable.
declare let __webpack_public_path__: string;

__webpack_public_path__ = new URL('../../../', globalThis.location.href).href;
await import('monaco-editor/editor/editor.worker.js');
globalThis.postMessage({ type: 'lensx.config-lens.editor-worker-ready' });

export {};
