import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/editor/contrib/gotoError/browser/gotoError.js';
import type { editor, IDisposable } from 'monaco-editor';
import { localize } from 'monaco-editor/nls.js';

// This package-owned NLS entry is fixed by the document's first context.
const selectAllLabel = localize(80, 'Select All');
export const registerSelectAllMenu = (instance: editor.IStandaloneCodeEditor): IDisposable =>
  instance.addAction({
    id: 'config-lens.selectAll',
    label: selectAllLabel,
    contextMenuGroupId: '9_select',
    contextMenuOrder: 1,
    run: (target) => {
      // Standalone's menu focus no longer identifies an active editor. Bind
      // this menu to its owner and delegate selection to Monaco's core command.
      target.focus();
      target.trigger('config-lens-menu', 'editor.action.selectAll', undefined);
    },
  });
