import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import evidenceSchema from '../tools/frame-aware-webview-harness/evidence.schema.json' with { type: 'json' };

const validateEvidence = new Ajv2020({ allErrors: true, strict: true }).compile(evidenceSchema);
const evidenceFiles = process.argv.slice(2);
const failures: string[] = [];

for (const [index, evidenceFile] of evidenceFiles.entries()) {
  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(evidenceFile, 'utf8'));
  } catch {
    failures.push(`evidence ${index + 1}: unreadable or invalid JSON`);
    continue;
  }
  if (!validateEvidence(evidence)) {
    const diagnostics = (validateEvidence.errors ?? [])
      .map(({ instancePath, keyword }) => `${instancePath || '/'}:${keyword}`)
      .sort()
      .join(', ');
    failures.push(`evidence ${index + 1}: schema rejected${diagnostics ? ` (${diagnostics})` : ''}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Frame-aware WebView evidence validation failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
}

console.log(
  evidenceFiles.length === 0
    ? 'Frame-aware WebView evidence schema compiled.'
    : `Validated ${evidenceFiles.length} frame-aware WebView evidence file(s).`,
);
