import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface WebviewBridgeCorpus {
  readonly corpus_version: string;
  readonly carrier_version: string;
  readonly valid: readonly unknown[];
  readonly invalid: readonly unknown[];
}

export const webviewBridgeCorpus = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../fixtures/plugin-webview-bridge/closed-frames.json'), 'utf8'),
) as WebviewBridgeCorpus;
