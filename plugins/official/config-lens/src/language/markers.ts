import type { editor } from 'monaco-editor';

import type { SafeDiagnostic } from './protocol.js';

export interface MarkerRangeModel {
  readonly getPositionAt: (offset: number) => { readonly lineNumber: number; readonly column: number };
  readonly getValueLength: () => number;
}

export const diagnosticToMarker = (
  model: MarkerRangeModel,
  diagnostic: SafeDiagnostic,
  message: string,
): editor.IMarkerData => {
  const maximum = model.getValueLength();
  const startOffset = Math.min(maximum, Math.max(0, diagnostic.offset));
  const endOffset = Math.min(maximum, Math.max(startOffset, startOffset + Math.max(1, diagnostic.length)));
  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);
  return {
    severity: diagnostic.severity === 'error' ? 8 : 4,
    message,
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
};
