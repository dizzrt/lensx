import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertConfigLensColdOpenEvidencePrivacy,
  validateConfigLensColdOpenEvidence,
} from './config-lens-cold-open-metrics.ts';

const root = join(import.meta.dirname, '..');
const path = join(root, 'fixtures/official-config-lens/evidence/macos/cold-open.json');
const source = readFileSync(path, 'utf8');
assertConfigLensColdOpenEvidencePrivacy(source);
if (!validateConfigLensColdOpenEvidence(JSON.parse(source))) {
  throw new Error('ConfigLens cold-open stage and Host heartbeat evidence is invalid or incomplete.');
}
console.log('Checked content-free ConfigLens cold-open stages and Host heartbeat evidence.');
