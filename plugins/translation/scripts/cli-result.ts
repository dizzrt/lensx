import { Buffer } from 'node:buffer';

interface CliProcessResult {
  readonly error?: { readonly code?: string; readonly name?: string };
  readonly signal: string | null;
  readonly status: number | null;
  readonly stdout?: string | null;
  readonly stderr?: string | null;
}

type ArtifactCommand = 'validate' | 'pack' | 'inspect';

const outputSummary = (output: string | null | undefined): string => {
  if (output === undefined || output === null || output.trim() === '') return '<empty>';
  const limit = 4096;
  if (Buffer.byteLength(output, 'utf8') <= limit) return output;
  const marker = '\n<truncated>';
  const budget = limit - Buffer.byteLength(marker, 'utf8');
  let summary = '';
  let bytes = 0;
  for (const character of output) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > budget) break;
    summary += character;
    bytes += size;
  }
  return summary + marker;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Classify the completed invocation without starting processes or reading artifacts. */
export const parseCliResult = (command: ArtifactCommand, processResult: CliProcessResult): Record<string, unknown> => {
  const fail: (reason: string) => never = (reason) => {
    throw new Error(
      `lensx-plugin ${command}: ${reason}\nstdout: ${outputSummary(processResult.stdout)}\nstderr: ${outputSummary(processResult.stderr)}`,
    );
  };
  if (processResult.error !== undefined) {
    fail(`startup failure (${processResult.error.code || processResult.error.name || 'Error'})`);
  }
  if (processResult.signal !== null) fail(`terminated by signal ${processResult.signal}`);
  if (processResult.status === null) fail('process ended without an exit status or signal (status=null)');
  if (processResult.status !== 0) fail(`exited with status ${processResult.status}`);
  if (processResult.stdout === undefined || processResult.stdout === null || processResult.stdout.trim() === '') {
    fail('output protocol error: empty stdout (exit status 0)');
  }
  let output: unknown;
  try {
    output = JSON.parse(processResult.stdout);
  } catch {
    fail('output protocol error: invalid JSON (exit status 0)');
  }
  if (
    !isRecord(output) ||
    output.schema_version !== '1' ||
    output.command !== command ||
    !isRecord(output.result) ||
    !Array.isArray(output.diagnostics)
  ) {
    fail('output protocol error: invalid result envelope (exit status 0)');
  }
  const expectedStatus = command === 'pack' ? 'success' : 'compatible';
  if (output.status !== expectedStatus)
    fail(`output protocol error: expected status ${expectedStatus} (exit status 0)`);
  return output.result;
};
