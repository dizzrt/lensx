import { diagnostic, invalidResult, type LanguageResult } from './protocol.js';

export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const MAX_INPUT_LINES = 100_000;
export const OPERATION_DEADLINE_MS = 5_000;

const encoder = new TextEncoder();

export interface InputBudget {
  readonly bytes: number;
  readonly lines: number;
}

export const measureInput = (source: string): InputBudget => {
  let lines = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) lines += 1;
  }
  return { bytes: encoder.encode(source).byteLength, lines };
};

export const preflightInput = (requestId: number, source: string): LanguageResult | undefined => {
  const budget = measureInput(source);
  if (budget.bytes > MAX_INPUT_BYTES) {
    return invalidResult(
      requestId,
      diagnostic('input.bytes-limit', 'diagnostic.inputBytesLimit', 0, 0, { maximum: MAX_INPUT_BYTES }),
      'limit',
    );
  }
  if (budget.lines > MAX_INPUT_LINES) {
    return invalidResult(
      requestId,
      diagnostic('input.lines-limit', 'diagnostic.inputLinesLimit', 0, 0, { maximum: MAX_INPUT_LINES }),
      'limit',
    );
  }
  return undefined;
};
