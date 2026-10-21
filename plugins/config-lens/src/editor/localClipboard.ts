import type { Uri } from 'monaco-editor';

// Monaco 0.56.0's BrowserClipboardService pre-arms a system clipboard write on
// every WebKit gesture. ConfigLens uses only document-local service memory;
// ordinary copy/cut/paste remain the browser's native textarea operations.
const textByType = new Map<string, string>();
let findText = '';
export const localClipboard = {
  triggerPaste: (): undefined => undefined,
  writeText: async (text: string, type = ''): Promise<void> => {
    textByType.set(type, text);
  },
  readText: async (type = ''): Promise<string> => textByType.get(type) ?? '',
  writeFindText: async (text: string): Promise<void> => {
    findText = text;
  },
  readFindText: async (): Promise<string> => findText,
  readResources: async (): Promise<readonly Uri[]> => [],
  clearInternalState: (): void => {
    textByType.clear();
    findText = '';
  },
};
