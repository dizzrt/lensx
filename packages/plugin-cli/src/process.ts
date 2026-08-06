import { spawn } from 'node:child_process';

export interface ChildProcessOutput {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
}

export const runBoundedProcess = async (input: {
  readonly command: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly json: boolean;
  readonly maximumCaptureBytes?: number;
  readonly writeStdout?: (value: string) => void;
  readonly writeStderr?: (value: string) => void;
}): Promise<ChildProcessOutput> => {
  const maximum = input.maximumCaptureBytes ?? 64 * 1024;
  const child = spawn(input.command, input.arguments, {
    cwd: input.cwd,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let capturedBytes = 0;
  let truncated = false;
  const consume = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
    const text = chunk.toString('utf8');
    if (!input.json) {
      (stream === 'stdout' ? input.writeStdout : input.writeStderr)?.(text);
      return;
    }
    const available = Math.max(0, maximum - capturedBytes);
    const bounded = Buffer.from(text).subarray(0, available).toString('utf8');
    capturedBytes += Buffer.byteLength(bounded);
    if (Buffer.byteLength(text) > available) truncated = true;
    if (stream === 'stdout') stdout += bounded;
    else stderr += bounded;
  };
  child.stdout.on('data', (chunk: Buffer) => consume(chunk, 'stdout'));
  child.stderr.on('data', (chunk: Buffer) => consume(chunk, 'stderr'));
  return await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr, truncated }));
  });
};
