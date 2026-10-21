// Narrow imports from the reviewed Monaco 0.56.0 package. These entry points
// deliberately exclude the full editor and language services.
declare module 'monaco-editor/nls/lang/zh-cn.js';
declare module 'monaco-editor/editor/contrib/find/browser/findController.js';
declare module 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
declare module 'monaco-editor/editor/contrib/hover/browser/hoverContribution.js';
declare module 'monaco-editor/editor/contrib/gotoError/browser/gotoError.js';

declare module 'monaco-editor/languages/features/json/tokenization.js' {
  export function createTokenizationSupport(supportComments: boolean): import('monaco-editor').languages.TokensProvider;
}

declare module 'monaco-editor/languages/definitions/yaml/yaml.js' {
  export const conf: import('monaco-editor').languages.LanguageConfiguration;
  export const language: import('monaco-editor').languages.IMonarchLanguage;
}

declare module 'monaco-editor/languages/definitions/xml/xml.js' {
  export const conf: import('monaco-editor').languages.LanguageConfiguration;
  export const language: import('monaco-editor').languages.IMonarchLanguage;
}

declare module 'monaco-editor/nls.js' {
  export function localize(index: number, fallback: string): string;
}

declare module 'monaco-editor/editor/standalone/browser/standaloneServices.js' {
  export const StandaloneServices: {
    get(identifier: object): unknown;
    initialize(overrides: import('monaco-editor').editor.IEditorOverrideServices): unknown;
  };
}

declare module 'monaco-editor/editor/common/services/editorWorker.js' {
  export const IEditorWorkerService: object;
}
